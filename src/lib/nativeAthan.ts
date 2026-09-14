// Native iOS/Android local notifications for Athan.
// Everything here is a no-op on the web build: Capacitor modules are only
// imported dynamically after `isNativeApp()` returns true, so the website
// keeps working exactly as before.
import { getPrayerTimes, type CalcOptions, type MadhabPref, type PrayerKey } from "./prayer";
import { scheduleNativeGroup } from "./nativeNotify";
import {
  nativeSoundFile,
  todayISO,
  PRE_REMINDER_NATIVE_SOUND,
  type AthanSettings,
  type NightAlertKey,
} from "./athanSettings";

/**
 * True when `astaghfirullah.caf` is verified (at build time) to be on disk in the
 * iOS target AND registered in Copy Bundle Resources. When false we never claim
 * the custom voice works — the UI surfaces a clear error instead.
 */
export const PRE_REMINDER_SOUND_BUNDLED: boolean =
  typeof __PRE_REMINDER_CAF_BUNDLED__ !== "undefined" ? __PRE_REMINDER_CAF_BUNDLED__ : false;

export const PRE_REMINDER_SOUND_FILE = PRE_REMINDER_NATIVE_SOUND;

export function isNativeApp(): boolean {
  try {
    // Capacitor injects a global on native platforms only.
    const cap = (globalThis as any).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

async function plugin() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

const CHANNEL_ID = "athan";
const NAMES: Record<PrayerKey, { en: string; ar: string }> = {
  fajr: { en: "Fajr", ar: "الفجر" },
  sunrise: { en: "Sunrise", ar: "الشروق" },
  dhuhr: { en: "Dhuhr", ar: "الظهر" },
  asr: { en: "Asr", ar: "العصر" },
  maghrib: { en: "Maghrib", ar: "المغرب" },
  isha: { en: "Isha", ar: "العشاء" },
};

const NIGHT_LABELS: Record<NightAlertKey, { en: string; ar: string }> = {
  midnight: { en: "Islamic midnight", ar: "منتصف الليل الشرعي" },
  lastThird: { en: "Last third of the night", ar: "الثلث الأخير من الليل" },
  witr: { en: "Witr prayer", ar: "صلاة الوتر" },
  qiyam: { en: "Qiyam al-Layl", ar: "قيام الليل" },
};

const PRAYER_ORDER: PrayerKey[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const NIGHT_ORDER: NightAlertKey[] = ["midnight", "lastThird", "witr", "qiyam"];

/** Deterministic, collision-free integer id. */
function makeId(dayIndex: number, slot: number, kind: number): number {
  // ATHAN_ID_MIN + day*1000 + slot*10 + kind  →  always within 10000..99999
  return ATHAN_ID_MIN + dayIndex * 1000 + slot * 10 + kind;
}

export interface NativePermissionState {
  granted: boolean;
  denied: boolean;
}

export type NotifPermissionStatus = "granted" | "denied" | "prompt";

/**
 * Single source of truth for the local-notification permission — every other
 * function in this codebase that checks or requests it goes through this one.
 *
 * `allowPrompt: false` (the default) is READ-ONLY: it reports the current OS
 * status and NEVER shows Apple's system dialog. Use this for anything
 * automatic — app boot, returning to the foreground, opening Settings —
 * so the system prompt never appears without the user having just tapped
 * an explicit "enable notifications" action first.
 *
 * `allowPrompt: true` shows the real system dialog when the status is still
 * undecided ("prompt"). Only two call sites in the whole app should ever
 * pass true: the first-launch NotificationPermissionPrompt dialog, and the
 * explicit "Enable notifications now" button in Settings.
 */
export async function checkOrRequestNotificationPermission(
  allowPrompt = false,
): Promise<{ status: NotifPermissionStatus; granted: boolean }> {
  if (!isNativeApp()) return { status: "prompt", granted: false };
  try {
    const LN = await plugin();
    const read = (display: string): NotifPermissionStatus =>
      display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
    let status = read((await LN.checkPermissions()).display);
    if (status === "prompt" && allowPrompt) {
      status = read((await LN.requestPermissions()).display);
    }
    return { status, granted: status === "granted" };
  } catch (e) {
    console.info("[athan] permission check error", e);
    return { status: "prompt", granted: false };
  }
}

/** @deprecated use checkOrRequestNotificationPermission — kept as a thin
 * compatibility wrapper for existing call sites during the rollout. */
export async function ensureNativePermission(allowPrompt = false): Promise<NativePermissionState> {
  const { status, granted } = await checkOrRequestNotificationPermission(allowPrompt);
  return { granted, denied: status === "denied" };
}

/**
 * Native iOS startup/reschedule path.
 * READ-ONLY by default (allowPrompt=false) — never pops the system dialog on
 * its own. Returns the current OS permission status so the caller can
 * schedule immediately when already granted.
 */
export async function bootstrapNativeNotifications(allowPrompt = false): Promise<{
  native: boolean;
  status: string;
  granted: boolean;
}> {
  if (!isNativeApp()) return { native: false, status: "web", granted: false };
  const { status, granted } = await checkOrRequestNotificationPermission(allowPrompt);
  console.info("[athan] bootstrap permission =", status);
  return { native: true, status, granted };
}

export async function nativePermissionGranted(): Promise<boolean> {
  const { granted } = await checkOrRequestNotificationPermission(false);
  return granted;
}

/**
 * Dedicated id range owned by the prayer scheduler:
 *   id = 10000 + day*1000 + slot*10 + kind   (day < 12, slot < 30, kind 1..3)
 * → all ids fall strictly inside 10000..99999.
 * kind 1 = athan, kind 2 = pre-prayer istighfar reminder, kind 3 = night alert.
 * Test notifications use 99xxxx (outside the range) and any other feature's
 * notifications (< 10000 or > 99999) are never cancelled by this module.
 */
const ATHAN_ID_MIN = 10000;
const ATHAN_ID_MAX = 19999;
const SCHEDULED_IDS_KEY = "athan.scheduledIds";

export function isAthanNotificationId(id: number): boolean {
  return id >= ATHAN_ID_MIN && id <= ATHAN_ID_MAX;
}

function readScheduledIds(): number[] {
  try {
    const raw = localStorage.getItem(SCHEDULED_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function writeScheduledIds(ids: number[]): void {
  try {
    localStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/** Cancels ONLY the app's prayer/pre-reminder/night notifications. */
export async function cancelAllNativeAthan(): Promise<void> {
  if (!isNativeApp()) return;
  const LN = await plugin();
  const ids = new Set<number>();
  // 1) everything pending inside our dedicated range
  try {
    const pending = await LN.getPending();
    pending.notifications.forEach((n) => {
      if (isAthanNotificationId(n.id)) ids.add(n.id);
    });
  } catch {
    /* ignore */
  }
  // 2) plus every id we previously recorded (belt & braces)
  readScheduledIds().forEach((id) => {
    if (isAthanNotificationId(id)) ids.add(id);
  });
  if (ids.size) {
    await LN.cancel({ notifications: [...ids].map((id) => ({ id })) });
  }
  writeScheduledIds([]);
}

export interface RescheduleInput {
  lat: number;
  lng: number;
  madhab: MadhabPref;
  settings: AthanSettings;
  lang: "en" | "ar";
  /** Calculation method / manual offsets — must match the on-screen times. */
  calc?: CalcOptions;
  /** How many days ahead to schedule (iOS caps at 64 pending notifications). */
  days?: number;
}

export interface RescheduleResult {
  scheduled: number;
  next: Date | null;
  reason?: "not-native" | "disabled" | "denied" | "empty" | "verification-failed";
  /** Human-readable log of every candidate time (kept / skipped). */
  log?: string[];
  /** First 10 pending notifications read back from the OS after scheduling. */
  pending?: { id: number; title: string; at: string }[];
  pendingCount?: number;
}


/**
 * Cancels every pending Athan notification and re-schedules the coming days.
 * Safe to call repeatedly — duplicates are impossible because we always
 * clear first and use deterministic ids.
 */
async function executeNativeAthanReschedule(input: RescheduleInput): Promise<RescheduleResult> {
  if (!isNativeApp()) return { scheduled: 0, next: null, reason: "not-native" };
  const { lat, lng, madhab, settings, lang, calc } = input;
  // Never schedule prayers before coordinates + settings are ready.
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0) ||
    !settings
  ) {
    return { scheduled: 0, next: null, reason: "empty" };
  }
  const LN = await plugin();

  // Android needs an explicit channel; iOS ignores this call.
  try {
    await LN.createChannel?.({
      id: CHANNEL_ID,
      name: "Athan",
      importance: 5,
      visibility: 1,
    });
  } catch {
    /* iOS / unsupported */
  }

  const boot = await bootstrapNativeNotifications();
  if (!boot.granted) {
    console.info(`[athan] permission=${boot.status} scheduled=0 pendingCount=0`);
    return { scheduled: 0, next: null, reason: "denied" };
  }
  const permissionStatus = boot.status;

  const now = new Date();
  // Keep up to 3 days while the shared group caps keep the total app queue
  // below iOS's 64 pending-local-notification limit.
  const total = Math.min(input.days ?? 3, 3);
  const items: any[] = [];
  const log: string[] = [];
  let next: Date | null = null;

  const push = (
    id: number,
    at: Date,
    title: string,
    body: string,
    sound: string | undefined,
    extra: Record<string, unknown>,
  ) => {
    const stamp = at.toLocaleString(undefined, { hour12: false });
    if (isNaN(at.getTime())) {
      log.push(`#${id} ${title} — وقت غير صالح ✗`);
      return;
    }
    if (at.getTime() <= now.getTime() + 5000) {
      log.push(`#${id} ${title} @ ${stamp} — تم تجاوزه (وقت ماضٍ)`);
      return;
    }
    if (items.length >= 42) return; // prayer group cap; app total stays below 64
    log.push(`#${id} ${title} @ ${stamp} ✓`);

    items.push({
      id,
      title,
      body,
      schedule: { at, allowWhileIdle: true },
      sound,
      channelId: CHANNEL_ID,
      smallIcon: "ic_stat_icon_config_sample",
      extra: { route: "/", ...extra },
    });
    if (!next || at < next) next = at;
  };

  for (let d = 0; d < total; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const iso = todayISO(day);
    if (settings.mutedDates.includes(iso)) continue;

    const { entries, sunnah, times } = getPrayerTimes(day, lat, lng, madhab, calc);

    entries.forEach((entry) => {
      const slot = PRAYER_ORDER.indexOf(entry.key);
      if (slot < 0) return;
      if (settings.perPrayerEnabled?.[entry.key] === false) return;
      const name = NAMES[entry.key];
      const soundName = entry.key === "fajr" ? settings.soundFajr : settings.soundOther;
      const file = nativeSoundFile(soundName);

      push(
        makeId(d, slot, 1),
        entry.time,
        lang === "ar" ? `حان الآن وقت صلاة ${name.ar}` : `It's time for ${name.en}`,
        lang === "ar" ? "حيّ على الصلاة، حيّ على الفلاح" : "Hayya 'ala-s-salah",
        file,
        { prayer: entry.key, kind: "athan" },
      );

      if (settings.preReminderMinutes > 0) {
        const at = new Date(entry.time.getTime() - settings.preReminderMinutes * 60_000);
        push(
          makeId(d, slot, 2),
          at,
          lang === "ar"
            ? `بقي ${settings.preReminderMinutes} دقائق على صلاة ${name.ar}`
            : `${settings.preReminderMinutes} minutes until ${name.en}`,
          lang === "ar" ? "استغفر الله وأتوب إليه" : "Astaghfirullah wa atubu ilayh",
          PRE_REMINDER_SOUND_BUNDLED ? PRE_REMINDER_SOUND_FILE : undefined,
          { prayer: entry.key, kind: "pre" },
        );
      }
    });

    // Independent night reminders
    const nightTimes: Record<NightAlertKey, Date> = {
      midnight: sunnah.middleOfTheNight,
      lastThird: sunnah.lastThirdOfTheNight,
      witr: new Date(times.fajr.getTime() - 45 * 60_000),
      qiyam: sunnah.lastThirdOfTheNight,
    };

    NIGHT_ORDER.forEach((key, i) => {
      const cfg = settings.nightAlerts?.[key];
      if (!cfg?.enabled) return;
      const base = nightTimes[key];
      const at = new Date(base.getTime() - (cfg.offsetMinutes || 0) * 60_000);
      const label = NIGHT_LABELS[key];
      push(
        makeId(d, 20 + i, 3),
        at,
        lang === "ar" ? label.ar : label.en,
        lang === "ar" ? "وقت مبارك للدعاء والاستغفار" : "A blessed time for prayer and dua",
        undefined,
        { kind: "night", night: key },
      );
    });
  }

  if (items.length === 0) {
    // Rebuild with an empty list so previously scheduled prayer requests are
    // actually cleared when the user disables every prayer/night reminder.
    await scheduleNativeGroup("prayer", []);
    writeScheduledIds([]);
    return { scheduled: 0, next: null, reason: "empty", log, pendingCount: 0, pending: [] };
  }

  // Shared native pipeline: permissions → schedule → getPending verify.
  const groupRes = await scheduleNativeGroup(
    "prayer",
    items.map((i) => ({
      id: i.id,
      title: i.title,
      body: i.body,
      at: i.schedule.at as Date,
      sound: i.sound,
      extra: i.extra,
      channelId: CHANNEL_ID,
    })),
  );
  if (!groupRes.granted) {
    return { scheduled: 0, next: null, reason: "denied", log, pendingCount: 0, pending: [] };
  }

  // Verify against the OS instead of trusting schedule().
  let pendingCount = 0;
  let pending: { id: number; title: string; at: string }[] = [];
  try {
    const res = await LN.getPending();
    const athanPending = res.notifications.filter((n) => isAthanNotificationId(n.id));
    pendingCount = athanPending.length;
    pending = athanPending
      .map((n) => {
        const raw = (n.schedule as any)?.at;
        const d = raw ? new Date(raw) : null;
        return {
          id: n.id,
          title: n.title || String(n.id),
          at: d && !isNaN(d.getTime()) ? d.toLocaleString(undefined, { hour12: false }) : "—",
          _t: d && !isNaN(d.getTime()) ? d.getTime() : Infinity,
        };
      })
      .sort((a, b) => a._t - b._t)
      .slice(0, 10)
      .map(({ id, title, at }) => ({ id, title, at }));
    log.push(`getPending → ${pendingCount} إشعار صلاة معلّق`);
  } catch (e: any) {
    log.push(`getPending ERROR: ${String(e?.message || e)}`);
  }

  console.info(
    `[athan] permission=${permissionStatus} scheduled=${items.length} pendingCount=${pendingCount}`,
  );


  if (pendingCount === 0) {
    writeScheduledIds([]);
    return { scheduled: 0, next: null, reason: "verification-failed", log, pending, pendingCount };
  }

  writeScheduledIds(groupRes.verifiedIds);
  try {
    localStorage.setItem(LAST_RESCHEDULE_KEY, new Date().toISOString());
  } catch {
    /* storage unavailable */
  }
  const verifiedSet = new Set(groupRes.verifiedIds);
  const verifiedItems = items.filter((i) => verifiedSet.has(i.id));
  const verifiedNext = verifiedItems
    .map((i) => i.schedule.at as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return { scheduled: groupRes.scheduled, next: verifiedNext, log, pending, pendingCount };
}

/** Direct reschedule. Native bridge serialization is handled centrally in nativeNotify.ts. */
export function rescheduleNativeAthan(input: RescheduleInput): Promise<RescheduleResult> {
  return executeNativeAthanReschedule(input);
}


const LAST_RESCHEDULE_KEY = "athan.lastReschedule";

export function getLastReschedule(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_RESCHEDULE_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export interface PendingItem {
  id: number;
  title: string;
  at: Date | null;
}

export interface NativeStatus {
  supported: boolean;
  granted: boolean;
  permission: string;
  pending: number;
  next: Date | null;
  items: PendingItem[];
  lastReschedule: Date | null;
  soundBundled: boolean;
  error?: string;
}

export async function getNativeStatus(): Promise<NativeStatus> {
  const base: NativeStatus = {
    supported: false,
    granted: false,
    permission: "unsupported",
    pending: 0,
    next: null,
    items: [],
    lastReschedule: getLastReschedule(),
    soundBundled: PRE_REMINDER_SOUND_BUNDLED,
  };
  if (!isNativeApp()) return base;
  try {
    // Read-only — status display must never itself trigger the system dialog.
    const { status } = await checkOrRequestNotificationPermission(false);
    const LN = await plugin();
    const pending = await LN.getPending();
    const items: PendingItem[] = pending.notifications.map((n) => {
      const raw = (n.schedule as any)?.at;
      const at = raw ? new Date(raw) : null;
      return { id: n.id, title: n.title || String(n.id), at: at && !isNaN(at.getTime()) ? at : null };
    }).sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));
    return {
      ...base,
      supported: true,
      granted: status === "granted",
      permission: status,
      pending: pending.notifications.length,
      next: items.find((i) => i.at)?.at ?? null,
      items,
    };
  } catch (e) {
    return { ...base, supported: true, error: String((e as Error)?.message || e) };
  }
}

export type TestResult = "ok" | "not-native" | "denied" | "missing-sound" | "error";

/**
 * Schedules a real notification 5 seconds from now using the bundled
 * `astaghfirullah.caf` — the same file the production pre-athan reminders use,
 * never the system default sound.
 */
export async function sendNativeTestNotification(lang: "en" | "ar"): Promise<TestResult> {
  if (!isNativeApp()) return "not-native";
  if (!PRE_REMINDER_SOUND_BUNDLED) return "missing-sound";
  // Explicit developer-triggered test action (a button tap on the hidden
  // diagnostics page) — allowed to prompt, same as any other direct user action.
  const perm = await ensureNativePermission(true);
  if (!perm.granted) return "denied";
  try {
    const LN = await plugin();
    await LN.schedule({
      notifications: [
        {
          id: 999999,
          title: lang === "ar" ? "تجربة إشعار الأذان" : "Athan test notification",
          body: lang === "ar" ? "استغفر الله وأتوب إليه" : "Astaghfirullah — notifications work",
          schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
          sound: PRE_REMINDER_SOUND_FILE,
          channelId: CHANNEL_ID,
          extra: { route: "/", kind: "test" },
        },
      ],
    });
    return "ok";
  } catch {
    return "error";
  }
}


export type PreReminderTestResult = "ok" | "not-native" | "denied" | "missing-sound";

/**
 * Schedules a real pre-athan notification 5 seconds from now using EXACTLY the
 * same bundled sound file as the production pre-athan reminders.
 */
export async function sendNativePreReminderTest(
  lang: "en" | "ar",
  minutes = 5,
): Promise<PreReminderTestResult> {
  if (!isNativeApp()) return "not-native";
  if (!PRE_REMINDER_SOUND_BUNDLED) return "missing-sound";
  // Explicit developer-triggered test action — allowed to prompt.
  const perm = await ensureNativePermission(true);
  if (!perm.granted) return "denied";
  const LN = await plugin();
  await LN.schedule({
    notifications: [
      {
        id: 990001,
        title: lang === "ar" ? "اختبار إشعار الاستغفار" : "Astaghfirullah test notification",
        body: lang === "ar" ? "استغفر الله وأتوب إليه" : "Astaghfirullah wa atubu ilayh",
        schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true },
        sound: PRE_REMINDER_SOUND_FILE,
        channelId: CHANNEL_ID,
        extra: { route: "/", kind: "pre", test: true },
      },
    ],
  });
  return "ok";
}


/** Opens the OS settings screen for the app (native only). */
export async function openNativeAppSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    window.open("app-settings:", "_system");
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Diagnostics — step-by-step verification of the real iOS pipeline     */
/* ------------------------------------------------------------------ */

export const TEST_NOTIFICATION_ID = 990001;
const SELFTEST_KEY = "athan.selftest.passed";

/** True once a real notification (990001) was verified inside getPending(). */
export function selfTestPassed(): boolean {
  try {
    return localStorage.getItem(SELFTEST_KEY) === "1";
  } catch {
    return false;
  }
}

function markSelfTestPassed() {
  try {
    localStorage.setItem(SELFTEST_KEY, "1");
  } catch {
    /* ignore */
  }
}

export interface NativeTestReport {
  native: boolean;
  permission: string;
  granted: boolean;
  now: string;
  scheduledAt: string | null;
  timezone: string;
  sound: string;
  inPending: boolean;
  pendingCount: number;
  pendingIds: number[];
  error?: string;
  lines: string[];
}

/**
 * Schedules a real local notification `delayMs` from now and then VERIFIES it
 * by reading getPending() back. Never reports success on a silent schedule().
 */
export async function runNativeNotificationTest(opts?: {
  sound?: "default" | "astaghfirullah.caf";
  delayMs?: number;
  lang?: "en" | "ar";
}): Promise<NativeTestReport> {
  const sound = opts?.sound ?? "default";
  const delayMs = opts?.delayMs ?? 15000;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const report: NativeTestReport = {
    native: isNativeApp(),
    permission: "unsupported",
    granted: false,
    now: new Date().toISOString(),
    scheduledAt: null,
    timezone,
    sound,
    inPending: false,
    pendingCount: 0,
    pendingIds: [],
    lines: [],
  };
  const log = (s: string) => report.lines.push(s);

  if (!report.native) {
    report.error = "اختبار الإشعارات الأصلية متاح داخل تطبيق iPhone فقط";
    log(report.error);
    return report;
  }

  try {
    const LN = await plugin();
    // Routed through the same unified gate as every other permission check in
    // the app — this diagnostic tool is an explicit developer button tap, so
    // it's one of the few call sites allowed to actually prompt.
    let { status } = await checkOrRequestNotificationPermission(false);
    log(`checkPermissions → ${status}`);
    if (status === "prompt") {
      ({ status } = await checkOrRequestNotificationPermission(true));
      log(`requestPermissions → ${status}`);
    }
    report.permission = status;
    report.granted = status === "granted";
    if (!report.granted) {
      report.error = `الإذن غير ممنوح (${status})`;
      return report;
    }

    if (sound === "astaghfirullah.caf" && !PRE_REMINDER_SOUND_BUNDLED) {
      report.error = "ملف astaghfirullah.caf غير مضمّن داخل حزمة التطبيق";
      log(report.error);
      return report;
    }

    // Cancel any previous run of THIS test only.
    await LN.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] });
    log(`cancel(${TEST_NOTIFICATION_ID}) ✓`);

    const at = new Date(Date.now() + delayMs);
    report.now = new Date().toISOString();
    report.scheduledAt = at.toISOString();

    await LN.schedule({
      notifications: [
        {
          id: TEST_NOTIFICATION_ID,
          title: "اختبار إشعارات النخبة الإسلامية",
          body:
            sound === "default"
              ? "إذا ظهر هذا الإشعار فالنظام والجدولة يعملان."
              : "اختبار صوت الاستغفار — استغفر الله وأتوب إليه.",
          sound,
          schedule: { at, allowWhileIdle: true },
          extra: { route: "/", kind: "selftest" },
        },
      ],
    });
    log(`schedule(${TEST_NOTIFICATION_ID}) @ ${at.toLocaleTimeString()} sound=${sound} ✓`);

    const pending = await LN.getPending();
    report.pendingCount = pending.notifications.length;
    report.pendingIds = pending.notifications.map((n) => n.id);
    report.inPending = report.pendingIds.includes(TEST_NOTIFICATION_ID);
    log(`getPending → ${report.pendingCount} إشعار، 990001 ${report.inPending ? "موجود ✓" : "غير موجود ✗"}`);
    if (report.inPending) markSelfTestPassed();
    else report.error = "لم يظهر المعرف 990001 داخل getPending() — الجدولة لم تُقبل من النظام";
  } catch (e: any) {
    report.error = String(e?.message || e);
    log(`ERROR: ${report.error}`);
  }
  return report;
}

let diagnosticsAttached = false;
/** Temporary diagnostic listeners (native only, attached once). */
export async function attachNotificationDiagnostics(
  onEvent?: (line: string) => void,
): Promise<void> {
  if (!isNativeApp() || diagnosticsAttached) return;
  diagnosticsAttached = true;
  try {
    const LN = await plugin();
    await LN.addListener("localNotificationReceived", (n: any) => {
      console.log("Notification received", n);
      onEvent?.(`received #${n?.id} — ${n?.title ?? ""}`);
    });
    await LN.addListener("localNotificationActionPerformed", (a: any) => {
      console.log("Notification action", a);
      onEvent?.(`action ${a?.actionId} on #${a?.notification?.id}`);
    });
  } catch {
    /* plugin unavailable */
  }
}
