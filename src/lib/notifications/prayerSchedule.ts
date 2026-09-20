import { getPrayerTimes, type CalcOptions, type MadhabPref } from "@/lib/prayer";
import { NOTIFICATION_RANGES } from "./ranges";
import { scheduleGroup, type ScheduleItemInput } from "./scheduler";
import { athanNativeSound } from "./sounds";
import { NOTIFIABLE_PRAYERS, type PrayerNotificationSettings } from "./settings";

const NAMES: Record<(typeof NOTIFIABLE_PRAYERS)[number], { ar: string; en: string }> = {
  fajr: { ar: "الفجر", en: "Fajr" },
  dhuhr: { ar: "الظهر", en: "Dhuhr" },
  asr: { ar: "العصر", en: "Asr" },
  maghrib: { ar: "المغرب", en: "Maghrib" },
  isha: { ar: "العشاء", en: "Isha" },
};

/** How many upcoming days to keep scheduled at once. Kept small (like the
 * previous system) because the provider re-tops this up every time the app
 * returns to the foreground — combined with the other groups' caps this
 * stays safely under iOS's 64-pending-notification-per-app ceiling. */
const ROLLING_DAYS = 3;

/** Deterministic id within the "prayer" range: one slot per (day offset,
 * prayer index, athan-or-reminder) combination — never random, so a rebuild
 * with the same inputs always produces the same ids and old ones are
 * cleanly replaced rather than accumulating. */
function idFor(dayOffset: number, prayerIndex: number, isPreReminder: boolean): number {
  const base = NOTIFICATION_RANGES.prayer.min;
  // 5 prayers * 2 (athan + reminder) = 10 slots/day, well within the range's headroom.
  return base + dayOffset * 10 + prayerIndex * 2 + (isPreReminder ? 1 : 0);
}

export interface BuildPrayerScheduleInput {
  lat: number;
  lng: number;
  madhab: MadhabPref;
  calc?: CalcOptions;
  settings: PrayerNotificationSettings;
  lang: "ar" | "en";
}

/** Pure builder — no native calls. Kept separate from scheduling so it can be
 * unit-tested and reasoned about without a device. */
export function buildPrayerScheduleItems(input: BuildPrayerScheduleInput): ScheduleItemInput[] {
  const { lat, lng, madhab, calc, settings, lang } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return [];

  const items: ScheduleItemInput[] = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset < ROLLING_DAYS; dayOffset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const { entries } = getPrayerTimes(day, lat, lng, madhab, calc);

    NOTIFIABLE_PRAYERS.forEach((key, prayerIndex) => {
      if (settings.perPrayerEnabled[key] === false) return;
      const entry = entries.find((e) => e.key === key);
      if (!entry) return;
      const name = NAMES[key];
      const sound = athanNativeSound(key === "fajr" ? settings.soundFajr : settings.soundOther);

      items.push({
        id: idFor(dayOffset, prayerIndex, false),
        title: lang === "ar" ? `حان الآن وقت صلاة ${name.ar}` : `It's time for ${name.en}`,
        body: lang === "ar" ? "حيّ على الصلاة، حيّ على الفلاح" : "Hayya 'ala-s-salah",
        at: entry.time,
        sound,
        extra: { route: "/", prayer: key, kind: "athan" },
      });

      if (settings.preReminderEnabled && settings.preReminderMinutes > 0) {
        const at = new Date(entry.time.getTime() - settings.preReminderMinutes * 60_000);
        items.push({
          id: idFor(dayOffset, prayerIndex, true),
          title: lang === "ar"
            ? `تذكير: ${name.ar} بعد ${settings.preReminderMinutes} دقيقة`
            : `Reminder: ${name.en} in ${settings.preReminderMinutes} min`,
          body: lang === "ar" ? "استعد لأداء الصلاة" : "Prepare for prayer",
          at,
          sound,
          extra: { route: "/", prayer: key, kind: "pre-reminder" },
        });
      }
    });
  }

  return items;
}

export async function schedulePrayerNotifications(input: BuildPrayerScheduleInput) {
  const items = buildPrayerScheduleItems(input);
  return scheduleGroup("prayer", items);
}
