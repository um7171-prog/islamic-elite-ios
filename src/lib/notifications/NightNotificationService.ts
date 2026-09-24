import { getPrayerTimes, type CalcOptions, type MadhabPref } from "@/lib/prayer";
import { NOTIFICATION_RANGES, replaceGroup, type ScheduleGroupResult, type ScheduleItemInput } from "./NotificationScheduler";
import { nightNativeSound } from "./NotificationSounds";

/**
 * NightNotificationService: two local notifications per night — the middle of the night and the
 * start of its last third — taken from the SAME night times the app shows (`getPrayerTimes(...)
 * .sunnah`, adhan's SunnahTimes: the night of day D runs from D's Maghrib to D+1's Fajr;
 * middle = Maghrib + ½ night, last third = Maghrib + ⅔ night), with the same location, method,
 * madhab and adjustments as the prayer times.
 *
 * It has its own id range ("night") and its own sound (astaghfirullah_night.caf, used by nothing
 * else). It never touches the prayer notifications: the scheduler only replaces ids inside a
 * group's own range.
 */

export type NightKind = "midnight" | "lastThird";

const NIGHT_ENABLED_KEY = "elite.notifications.night.v1";

/** "تنبيهات الليل" switch — ON by default. Off = no night notification is scheduled (the rebuild
 * then cancels this group's range only; every other group is untouched). */
export function isNightNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(NIGHT_ENABLED_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNightNotificationsEnabled(on: boolean) {
  try {
    localStorage.setItem(NIGHT_ENABLED_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}

const TEXT: Record<NightKind, { ar: string; en: string }> = {
  midnight: { ar: "🌙 دخل وقت منتصف الليل", en: "🌙 Midnight has begun" },
  lastThird: { ar: "🤲 دخل الثلث الأخير من الليل", en: "🤲 The last third of the night has begun" },
};

/** Nights considered, as day offsets from today: yesterday's night is still running before dawn. */
const NIGHT_DAY_OFFSETS = [-1, 0, 1, 2] as const;

/** Deterministic id inside the night range, per (night, kind): rebuilding with the same inputs
 * yields the same ids, so a rebuild replaces instead of accumulating. */
export function nightNotificationId(dayOffset: number, kind: NightKind): number {
  return NOTIFICATION_RANGES.night.min + (dayOffset + 1) * 2 + (kind === "lastThird" ? 1 : 0);
}

export interface NightScheduleInput {
  lat: number;
  lng: number;
  madhab: MadhabPref;
  calc?: CalcOptions;
  lang: "ar" | "en";
  /** Injected for tests; defaults to the real clock. */
  now?: Date;
}

/** The middle and last third of the night that STARTS at `day`'s Maghrib. */
export function nightTimesFor(day: Date, lat: number, lng: number, madhab: MadhabPref, calc?: CalcOptions): Record<NightKind, Date> {
  const { sunnah } = getPrayerTimes(day, lat, lng, madhab, calc);
  return { midnight: sunnah.middleOfTheNight, lastThird: sunnah.lastThirdOfTheNight };
}

/** Pure: no native calls. The scheduler keeps only future ones, soonest first, up to the cap. */
export function buildNightItems(input: NightScheduleInput): ScheduleItemInput[] {
  const { lat, lng, madhab, calc, lang } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return [];
  const now = input.now ?? new Date();
  const sound = nightNativeSound();
  const items: ScheduleItemInput[] = [];
  for (const dayOffset of NIGHT_DAY_OFFSETS) {
    // Local calendar days, so a date change or time zone change lands on the right night.
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const times = nightTimesFor(day, lat, lng, madhab, calc);
    for (const kind of ["midnight", "lastThird"] as const) {
      items.push({
        id: nightNotificationId(dayOffset, kind),
        title: TEXT[kind][lang],
        body: "",
        at: times[kind],
        sound,
        extra: { route: "/", kind: "night", night: kind },
      });
    }
  }
  return items;
}

export function syncNightNotifications(input: NightScheduleInput): Promise<ScheduleGroupResult> {
  // Switched off: an empty list makes the scheduler cancel this group's notifications (and only these).
  return replaceGroup("night", isNightNotificationsEnabled() ? buildNightItems(input) : []);
}
