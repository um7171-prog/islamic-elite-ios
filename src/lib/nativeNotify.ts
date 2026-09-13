/**
 * Single shared native (Capacitor iOS/Android) local-notification pipeline.
 *
 * Every feature (prayers, calendar events, athkar) goes through
 * `scheduleNativeGroup()`, which always performs:
 *   checkPermissions → requestPermissions (when needed) → schedule (one by one)
 *   → getPending (verification)
 *
 * Nothing is reported as scheduled unless its id came back from getPending().
 * Each group owns an exclusive id range and only ever cancels its own ids —
 * `cancelAll()` is never used.
 */

export const NOTIF_RANGES = {
  prayer: { min: 10000, max: 19999, cap: 42 },
  events: { min: 20000, max: 29999, cap: 12 },
  athkar: { min: 30000, max: 30999, cap: 6 },
  // Dedicated test range. Production prayer/event/athkar rebuilds never touch it.
  test: { min: 900000, max: 900099, cap: 1 },
} as const;

export type NotifGroup = keyof typeof NOTIF_RANGES;

export function isNativeApp(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (globalThis as any).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}


interface NativeIOSPlugin {
  ensurePermission(): Promise<{ granted: boolean }>;
  scheduleGroup(options: { minId: number; maxId: number; items: Array<Record<string, unknown>> }): Promise<{ acceptedIds: number[]; verifiedIds: number[]; errors: string[] }>;
  pendingGroup(options: { minId: number; maxId: number }): Promise<{ ids: number[] }>;
  cancelGroup(options: { minId: number; maxId: number }): Promise<void>;
}

let nativeIOSPlugin: NativeIOSPlugin | null = null;
async function iosPlugin(): Promise<NativeIOSPlugin> {
  if (nativeIOSPlugin) return nativeIOSPlugin;
  const { registerPlugin } = await import("@capacitor/core");
  nativeIOSPlugin = registerPlugin<NativeIOSPlugin>("NativeNotification");
  return nativeIOSPlugin;
}

function isIOSNative(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (globalThis as any).Capacitor;
    return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios";
  } catch { return false; }
}

async function plugin() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

export interface NativeNotifItem {
  id: number;
  title: string;
  body: string;
  /** Local Date — used as-is, never converted to UTC. */
  at: Date;
  /** iOS bundled .caf filename, or "default". */
  sound?: string;
  extra?: Record<string, unknown>;
  channelId?: string;
}

export interface GroupResult {
  group: NotifGroup;
  granted: boolean;
  requested: number;
  scheduled: number;
  /** ids verified inside getPending() */
  verifiedIds: number[];
  pendingCount: number;
  errors: string[];
  reason?: "not-native" | "denied" | "empty";
}

// Deep iPhone scheduler fix.
//
// The real-device 90-second test proved that LocalNotifications.schedule() is
// healthy. The failure was in the full pipeline: a GLOBAL queue plus up to 24
// one-by-one bridge calls made prayer scheduling exceed the diagnostic timeout;
// events and athkar then waited behind that unfinished prayer job and timed out
// too. Keep one queue, but make each group fast by scheduling in small chunks.

let nativeGroupQueue: Promise<void> = Promise.resolve();

function timeout<T>(promise: Promise<T>, label: string, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label}:timeout:${ms}`)), ms);
    }),
  ]);
}

function enqueueNativeGroup<T>(operation: () => Promise<T>): Promise<T> {
  const run = nativeGroupQueue.then(operation, operation);
  nativeGroupQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function ensurePermission(): Promise<boolean> {
  const LN = await plugin();
  let res = await timeout(LN.checkPermissions(), "checkPermissions", 6000);
  if (res.display !== "granted" && res.display !== "denied") {
    res = await timeout(LN.requestPermissions(), "requestPermissions", 12000);
  }
  return res.display === "granted";
}

/** Pending ids currently owned by a group. */
export async function pendingIdsFor(group: NotifGroup): Promise<number[]> {
  if (!isNativeApp()) return [];
  try {
    const { min, max } = NOTIF_RANGES[group];
    if (isIOSNative()) {
      const native = await iosPlugin();
      const res = await timeout(native.pendingGroup({ minId: min, maxId: max }), `nativePending:${group}`, 8000);
      return res.ids || [];
    }
    const LN = await plugin();
    const res = await timeout(LN.getPending(), `getPending:${group}`, 8000);
    return (res.notifications || [])
      .map((n) => Number(n.id))
      .filter((id) => id >= min && id <= max);
  } catch (error) {
    console.error(`[notify:${group}] getPending failed`, error);
    return [];
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/**
 * Shared native scheduling function.
 *
 * iOS fix: use small BATCHES (max 6) instead of one bridge call per item.
 * - Prayer: capped at 42 items to keep the total app queue below iOS's 64-request limit.
 * - Events: max 12 => at most 2 calls.
 * - Athkar: max 6 => 1 call.
 *
 * If a custom sound makes a chunk fail, the SAME chunk is retried once with
 * the default iPhone sound. This preserves delivery rather than blocking the
 * entire scheduler because of a .caf issue.
 */
export async function scheduleNativeGroup(
  group: NotifGroup,
  items: NativeNotifItem[],
): Promise<GroupResult> {
  return enqueueNativeGroup(async () => {
    const { min, max, cap } = NOTIF_RANGES[group];
    const errors: string[] = [];
    const base: GroupResult = {
      group,
      granted: false,
      requested: items.length,
      scheduled: 0,
      verifiedIds: [],
      pendingCount: 0,
      errors,
    };
    if (!isNativeApp()) return { ...base, reason: "not-native" };

    const now = Date.now();
    const valid = items
      .filter(
        (i) =>
          i.at instanceof Date &&
          !Number.isNaN(i.at.getTime()) &&
          i.at.getTime() > now + 5000 &&
          Number.isInteger(i.id) &&
          i.id >= min &&
          i.id <= max,
      )
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, cap);

    if (isIOSNative()) {
      const native = await iosPlugin();
      const permission = await timeout(native.ensurePermission(), "nativePermission", 15000);
      if (!permission.granted) return { ...base, reason: "denied" };
      // Always call the iOS group rebuild, even when the new list is empty.
      // This intentionally clears stale pending notifications owned by that range.
      const result = await timeout(native.scheduleGroup({
        minId: min, maxId: max,
        items: valid.map((item) => ({
          id: item.id, title: item.title, body: item.body, atMs: item.at.getTime(),
          sound: item.sound || "default", extra: { route: "/", ...(item.extra || {}) },
        })),
      }), `nativeSchedule:${group}`, 15000);
      const wanted = new Set(valid.map((i) => i.id));
      const verifiedIds = (result.verifiedIds || []).filter((id) => wanted.has(id));
      return { ...base, granted: true, scheduled: verifiedIds.length, verifiedIds, pendingCount: result.verifiedIds?.length || 0, errors: result.errors || [], reason: verifiedIds.length ? undefined : "empty" };
    }

    const LN = await plugin();
    const granted = await ensurePermission();
    if (!granted) return { ...base, reason: "denied" };

    // Cancel ONLY this feature's previous requests. Never cancelAll().
    const oldIds = await pendingIdsFor(group);
    if (oldIds.length) {
      try {
        await timeout(
          LN.cancel({ notifications: oldIds.map((id) => ({ id })) }),
          `cancel:${group}`,
          8000,
        );
      } catch (error) {
        errors.push(`cancel:${String((error as Error)?.message || error)}`);
      }
    }

    if (!valid.length) return { ...base, granted: true, reason: "empty" };

    const platform = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (globalThis as any).Capacitor?.getPlatform?.() || "";
      } catch {
        return "";
      }
    })();

    const makePayload = (item: NativeNotifItem, defaultSound = false) => {
      const payload: Record<string, unknown> = {
        id: item.id,
        title: item.title,
        body: item.body,
        schedule: { at: item.at, allowWhileIdle: true },
        sound: defaultSound ? "default" : item.sound || "default",
        extra: { route: "/", ...(item.extra || {}) },
      };
      if (platform === "android" && item.channelId) payload.channelId = item.channelId;
      return payload;
    };

    const wanted: number[] = [];
    const CHUNK_SIZE = 6;

    for (const chunk of chunks(valid, CHUNK_SIZE)) {
      try {
        await timeout(
          LN.schedule({ notifications: chunk.map((item) => makePayload(item)) as never[] }),
          `schedule:${group}`,
          8000,
        );
        chunk.forEach((item) => wanted.push(item.id));
      } catch (customError) {
        errors.push(`chunk-custom:${String((customError as Error)?.message || customError)}`);
        try {
          await timeout(
            LN.schedule({ notifications: chunk.map((item) => makePayload(item, true)) as never[] }),
            `schedule-default:${group}`,
            8000,
          );
          chunk.forEach((item) => wanted.push(item.id));
        } catch (defaultError) {
          errors.push(`chunk-default:${String((defaultError as Error)?.message || defaultError)}`);

          // Last-resort direct path: only for the failed chunk. This is the exact
          // one-notification path already proven on the user's iPhone.
          for (const item of chunk) {
            try {
              await timeout(
                LN.schedule({ notifications: [makePayload(item, true) as never] }),
                `schedule-one:${group}:${item.id}`,
                5000,
              );
              wanted.push(item.id);
            } catch (singleError) {
              errors.push(`#${item.id}:${String((singleError as Error)?.message || singleError)}`);
            }
          }
        }
      }
    }

    // Give iOS a moment to expose requests in getPending(), then verify once.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pending = await pendingIdsFor(group);
    const verifiedIds = wanted.filter((id) => pending.includes(id));
    const missing = wanted.filter((id) => !pending.includes(id));
    if (missing.length) errors.push(`missing:${missing.join(",")}`);

    console.info(
      `[notify:${group}] requested=${items.length} valid=${valid.length} verified=${verifiedIds.length} pending=${pending.length} errors=${errors.length}`,
    );

    return {
      ...base,
      granted: true,
      scheduled: verifiedIds.length,
      verifiedIds,
      pendingCount: pending.length,
      reason: verifiedIds.length === 0 ? "empty" : undefined,
    };
  });
}

export interface NotificationDeliveryTestResult {
  granted: boolean;
  scheduled: boolean;
  notificationId: number;
  firesAt: Date;
  errors: string[];
}

/**
 * User-facing iPhone notification test that uses the SAME production native
 * scheduler as prayers/events/athkar, but owns a completely separate id range.
 */
export async function runNotificationDeliveryTest(
  lang: "ar" | "en" = "ar",
  delaySeconds = 12,
): Promise<NotificationDeliveryTestResult> {
  const notificationId = 900001;
  const firesAt = new Date(Date.now() + Math.max(10, delaySeconds) * 1000);
  const result = await scheduleNativeGroup("test", [
    {
      id: notificationId,
      title: lang === "ar" ? "اختبار إشعارات النخبة الإسلامية" : "Islamic Elite notification test",
      body: lang === "ar"
        ? "إذا ظهر هذا الإشعار فمسار الإشعارات الأصلي يعمل بشكل صحيح."
        : "If you can see this notification, the native notification path is working.",
      at: firesAt,
      sound: "default",
      extra: { kind: "user-notification-test" },
    },
  ]);

  return {
    granted: result.granted,
    scheduled: result.verifiedIds.includes(notificationId),
    notificationId,
    firesAt,
    errors: result.errors,
  };
}

/** Cancel only one group's pending notifications. */
export async function cancelNativeGroup(group: NotifGroup): Promise<void> {
  return enqueueNativeGroup(async () => {
    if (!isNativeApp()) return;
    const ids = await pendingIdsFor(group);
    if (!ids.length) return;
    if (isIOSNative()) {
      const { min, max } = NOTIF_RANGES[group];
      const native = await iosPlugin();
      await timeout(native.cancelGroup({ minId: min, maxId: max }), `nativeCancel:${group}`, 8000);
      return;
    }
    const LN = await plugin();
    try {
      await timeout(
        LN.cancel({ notifications: ids.map((id) => ({ id })) }),
        `cancel-group:${group}`,
        8000,
      );
    } catch {
      /* ignore */
    }
  });
}

/* ------------------------------------------------------------------ */
/* Temporary internal self-test (NOT auto-run, no UI, no button)        */
/* ------------------------------------------------------------------ */

/**
 * Schedules one notification per type (event 90s, athkar 120s,
 * pre-prayer 150s, athan 180s) and verifies the four ids in getPending().
 * Disabled by default — call manually from the console when debugging.
 */
export async function runInternalNotificationSelfTest(): Promise<{
  ids: number[];
  verified: number[];
  prayerPending: number;
  eventsPending: number;
  athkarPending: number;
}> {
  const t = (s: number) => new Date(Date.now() + s * 1000);
  const eventId = NOTIF_RANGES.events.max - 1; // 29998
  const athkarId = NOTIF_RANGES.athkar.max - 1; // 30998
  const preId = NOTIF_RANGES.prayer.max - 2; // 19997
  const athanId = NOTIF_RANGES.prayer.max - 1; // 19998

  const prayer = await scheduleNativeGroup("prayer", [
    { id: preId, title: "اختبار التنبيه قبل الصلاة", body: "استغفر الله وأتوب إليه", at: t(150), sound: "astaghfirullah.caf" },
    { id: athanId, title: "اختبار إشعار الأذان", body: "حان الآن وقت الصلاة", at: t(180), sound: "default" },
  ]);
  const events = await scheduleNativeGroup("events", [
    { id: eventId, title: "اختبار إشعار موعد", body: "موعد تجريبي", at: t(90), sound: "notif_chime.caf" },
  ]);
  const athkar = await scheduleNativeGroup("athkar", [
    { id: athkarId, title: "اختبار إشعار الأذكار", body: "ذكر تجريبي", at: t(120), sound: "notif_bell.caf" },
  ]);

  return {
    ids: [eventId, athkarId, preId, athanId],
    verified: [...events.verifiedIds, ...athkar.verifiedIds, ...prayer.verifiedIds],
    prayerPending: prayer.pendingCount,
    eventsPending: events.pendingCount,
    athkarPending: athkar.pendingCount,
  };
}
