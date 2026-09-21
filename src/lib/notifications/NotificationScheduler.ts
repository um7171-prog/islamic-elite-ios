import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeApp } from "@/lib/platform";
import { getPermissionStatus } from "./NotificationPermissionService";

/**
 * NotificationScheduler: the single owner of scheduling. Prayer, appointment and Athkar services
 * only BUILD lists of notifications; this module is the only code that talks to iOS to schedule,
 * replace or cancel them (through the official Capacitor LocalNotifications plugin, i.e.
 * UNUserNotificationCenter with calendar triggers). Scheduling is native/local: a delivered
 * notification never depends on the app being open, on JS timers, or on the web.
 *
 * Every group owns an exclusive id range, so one group can never touch another's notifications.
 * iOS keeps at most 64 pending local notifications per app; the caps below sum to 60.
 */
export const NOTIFICATION_RANGES = {
  /** Prayer-time + pre-prayer-reminder alerts. */
  prayer: { min: 41000, max: 41999, cap: 42 },
  /** Morning/evening Athkar reminders. */
  athkar: { min: 42000, max: 42999, cap: 6 },
  /** Appointment (calendar) reminders. */
  calendar: { min: 43000, max: 43999, cap: 12 },
} as const;

export type NotificationGroup = keyof typeof NOTIFICATION_RANGES;

export interface ScheduleItemInput {
  id: number;
  title: string;
  body: string;
  at: Date;
  /** Bundled iOS `.caf` filename, or "default" for the system sound. */
  sound: string;
  extra?: Record<string, unknown>;
}

export interface ScheduleGroupResult {
  /** Notifications iOS reports as pending (read back from iOS, not assumed). */
  scheduled: number;
  verifiedIds: number[];
  errors: string[];
  reason?: "not-native" | "permission-denied" | "empty";
}

/* ---------------- test-only dry run (browser) ---------------- */
// In a plain browser there is no notification centre. With localStorage
// "elite.debug.notifications" = "1" the requests that WOULD be sent are recorded in
// window.__eliteNotifLog so tests can inspect them. It never reports anything as scheduled.
export interface DryRunEntry {
  group: string;
  minId: number;
  maxId: number;
  items: { id: number; atMs: number; title: string; body: string }[];
  at: number;
}
export function isDryRun(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("elite.debug.notifications") === "1";
  } catch {
    return false;
  }
}
function logDryRun(entry: Omit<DryRunEntry, "at">) {
  const w = window as unknown as { __eliteNotifLog?: DryRunEntry[] };
  (w.__eliteNotifLog ||= []).push({ ...entry, at: Date.now() });
}

/* ---------------- building the native request ---------------- */

/** Future items only, soonest first, capped for the group (so the nearest ones win). */
export function prepareItems(group: NotificationGroup, items: ScheduleItemInput[], now = Date.now()): ScheduleItemInput[] {
  const range = NOTIFICATION_RANGES[group];
  return items
    .filter((it) => Number.isFinite(it.at.getTime()) && it.at.getTime() > now + 5000)
    .filter((it) => it.id >= range.min && it.id <= range.max)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, range.cap);
}

/* ---------------- serialised scheduling ---------------- */

let chain: Promise<unknown> = Promise.resolve();

/**
 * Makes iOS hold exactly `itemsIn` (the future ones) for this group: stale notifications in the
 * group's range are cancelled, the rest are (re)scheduled by id (same id = replaced), then the
 * pending list is read back from iOS to verify. Calls are queued, never interleaved.
 */
export function replaceGroup(group: NotificationGroup, itemsIn: ScheduleItemInput[]): Promise<ScheduleGroupResult> {
  const run = chain.then(() => doReplace(group, itemsIn), () => doReplace(group, itemsIn));
  chain = run.catch(() => undefined);
  return run;
}

/** Cancels every pending notification of a group. */
export const cancelGroup = (group: NotificationGroup) => replaceGroup(group, []);

/** Ids iOS currently holds for a group (empty in a browser). */
export async function pendingIds(group: NotificationGroup): Promise<number[]> {
  if (!isNativeApp()) return [];
  const { min, max } = NOTIFICATION_RANGES[group];
  try {
    const { notifications } = await LocalNotifications.getPending();
    return notifications.map((n) => n.id).filter((id) => id >= min && id <= max).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function doReplace(group: NotificationGroup, itemsIn: ScheduleItemInput[]): Promise<ScheduleGroupResult> {
  const range = NOTIFICATION_RANGES[group];
  const items = prepareItems(group, itemsIn);

  if (!isNativeApp()) {
    if (isDryRun()) {
      logDryRun({ group, minId: range.min, maxId: range.max, items: items.map((i) => ({ id: i.id, atMs: i.at.getTime(), title: i.title, body: i.body })) });
    }
    return { scheduled: 0, verifiedIds: [], errors: [], reason: "not-native" };
  }

  if ((await getPermissionStatus()) !== "granted") {
    return { scheduled: 0, verifiedIds: [], errors: [], reason: "permission-denied" };
  }

  const errors: string[] = [];
  try {
    const desired = new Set(items.map((i) => i.id));

    const before = await LocalNotifications.getPending();
    const stale = before.notifications.filter((n) => n.id >= range.min && n.id <= range.max && !desired.has(n.id));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });

    if (items.length) {
      await LocalNotifications.schedule({
        notifications: items.map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
          schedule: { at: i.at, allowWhileIdle: true },
          ...(i.sound && i.sound !== "default" ? { sound: i.sound } : {}),
          extra: i.extra,
        })),
      });
    }

    const after = await LocalNotifications.getPending();
    const verifiedIds = after.notifications.map((n) => n.id).filter((id) => id >= range.min && id <= range.max && desired.has(id)).sort((a, b) => a - b);
    const have = new Set(verifiedIds);
    for (const i of items) if (!have.has(i.id)) errors.push(`#${i.id}: iOS did not keep this notification`);
    return { scheduled: verifiedIds.length, verifiedIds, errors, reason: items.length === 0 ? "empty" : undefined };
  } catch (e) {
    errors.push(String((e as Error)?.message || e));
    return { scheduled: 0, verifiedIds: [], errors };
  }
}

/* ---------------- rebuild requests ---------------- */
// Settings screens ask for a rebuild; the NotificationsProvider (the orchestrator) owns the handler,
// so no screen ever builds notification logic of its own.
type RebuildHandler = () => void;
let activeHandler: RebuildHandler | null = null;
let queuedBeforeRegistration = false;

export function registerNotificationRebuildHandler(handler: RebuildHandler): () => void {
  activeHandler = handler;
  if (queuedBeforeRegistration) {
    queuedBeforeRegistration = false;
    queueMicrotask(() => {
      if (activeHandler === handler) handler();
    });
  }
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function requestNotificationRebuild(): void {
  if (activeHandler) activeHandler();
  else queuedBeforeRegistration = true;
}
