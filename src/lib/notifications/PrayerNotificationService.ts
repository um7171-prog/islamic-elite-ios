import { getPrayerTimes, type CalcOptions, type MadhabPref } from "@/lib/prayer";
import { NOTIFICATION_RANGES, replaceGroup, type ScheduleItemInput } from "./NotificationScheduler";
import { athanNativeSound, preprayerNativeSound } from "./NotificationSounds";
import { NOTIFIABLE_PRAYERS, type PrayerNotificationSettings } from "./NotificationSettings";

/**
 * PrayerNotificationService: turns the app's own prayer times (`getPrayerTimes`, the same source
 * the prayer screens use: same location, method, madhab and adjustments) into local notifications
 * and hands them to the NotificationScheduler. Sunrise is shown in the app but is not a prayer, so
 * it gets no alert.
 */

const NAMES: Record<(typeof NOTIFIABLE_PRAYERS)[number], { ar: string; en: string }> = {
  fajr: { ar: "الفجر", en: "Fajr" },
  dhuhr: { ar: "الظهر", en: "Dhuhr" },
  asr: { ar: "العصر", en: "Asr" },
  maghrib: { ar: "المغرب", en: "Maghrib" },
  isha: { ar: "العشاء", en: "Isha" },
};

/** Upcoming days kept scheduled at once. Topped up every time the app returns to the foreground;
 * with the other groups' caps this stays under iOS's 64 pending notifications. */
export const PRAYER_ROLLING_DAYS = 3;

/** Deterministic id inside the prayer range: one slot per (day offset, prayer, athan-or-reminder),
 * so rebuilding with the same inputs yields the same ids and replaces rather than accumulates. */
export function prayerNotificationId(dayOffset: number, prayerIndex: number, isPreReminder: boolean): number {
  return NOTIFICATION_RANGES.prayer.min + dayOffset * 10 + prayerIndex * 2 + (isPreReminder ? 1 : 0);
}

export interface BuildPrayerScheduleInput {
  lat: number;
  lng: number;
  madhab: MadhabPref;
  calc?: CalcOptions;
  settings: PrayerNotificationSettings;
  lang: "ar" | "en";
  /** Injected for tests; defaults to the real clock. */
  now?: Date;
}

/** Pure: no native calls. */
export function buildPrayerItems(input: BuildPrayerScheduleInput): ScheduleItemInput[] {
  const { lat, lng, madhab, calc, settings, lang } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return [];

  const items: ScheduleItemInput[] = [];
  const now = input.now ?? new Date();

  for (let dayOffset = 0; dayOffset < PRAYER_ROLLING_DAYS; dayOffset++) {
    // Local calendar days, so a date change or time zone change lands on the right day.
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const { entries } = getPrayerTimes(day, lat, lng, madhab, calc);

    NOTIFIABLE_PRAYERS.forEach((key, prayerIndex) => {
      if (settings.perPrayerEnabled[key] === false) return;
      const entry = entries.find((e) => e.key === key);
      if (!entry) return;
      const name = NAMES[key];
      // PRAYER TIME = the full athan (its own bundled sound, up to iOS's notification-sound
      // length). The athan id/sound also rides along in `extra` so the app can play the FULL,
      // untruncated recitation in-app (see lib/notifications/AdhanPlayer.ts) once the tap or the
      // foreground delivery event fires — the short bundled file is what iOS itself can play as a
      // notification sound; it is never what limits how much of the athan the user actually hears.
      const athanId = key === "fajr" ? settings.soundFajr : settings.soundOther;
      items.push({
        id: prayerNotificationId(dayOffset, prayerIndex, false),
        title: lang === "ar" ? `حان الآن وقت صلاة ${name.ar}` : `It's time for ${name.en}`,
        body: lang === "ar" ? "حيّ على الصلاة، حيّ على الفلاح" : "Hayya 'ala-s-salah",
        at: entry.time,
        sound: athanNativeSound(athanId),
        extra: { route: "/", prayer: key, kind: "athan", sound: athanId },
      });

      // PRE-PRAYER reminder = "أستغفر الله" only — deliberately a different, short sound so it is
      // never confused with the athan itself.
      if (settings.preReminderEnabled && settings.preReminderMinutes > 0) {
        items.push({
          id: prayerNotificationId(dayOffset, prayerIndex, true),
          title: lang === "ar" ? `تذكير: ${name.ar} بعد ${settings.preReminderMinutes} دقيقة` : `Reminder: ${name.en} in ${settings.preReminderMinutes} min`,
          body: lang === "ar" ? "أستغفر الله — استعد لأداء الصلاة" : "Astaghfirullah — prepare for prayer",
          at: new Date(entry.time.getTime() - settings.preReminderMinutes * 60_000),
          sound: preprayerNativeSound(),
          extra: { route: "/", prayer: key, kind: "pre-reminder" },
        });
      }
    });
  }
  return items;
}

/** Rebuilds the whole prayer group (location / method / madhab / settings / date changes). */
export function syncPrayerNotifications(input: BuildPrayerScheduleInput) {
  return replaceGroup("prayer", buildPrayerItems(input));
}
