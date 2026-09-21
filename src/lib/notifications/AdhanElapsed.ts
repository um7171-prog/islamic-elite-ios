import type { PrayerKey } from "@/lib/prayer";

/**
 * "الأذان الآن" / "الأذان منذ N دقيقة": how long ago the latest prayer's adhan time passed.
 *
 * Computed only from the CURRENT time and the ACTUAL prayer times, never from notifications or from
 * a count of timer ticks. So it is right after the app was in the background for any length of
 * time, and it works when notifications are switched off or denied.
 */
export const ADHAN_ELAPSED_WINDOW_MINUTES = 30;

export interface PrayerTimeEntry {
  key: PrayerKey;
  time: Date;
}

export interface AdhanElapsed {
  prayer: Exclude<PrayerKey, "sunrise">;
  /** whole minutes since the prayer time (0 during the first minute) */
  minutes: number;
}

/** The prayer whose time passed within the last `windowMinutes`, or null. Sunrise is not a prayer. */
export function getAdhanElapsed(now: Date, entries: PrayerTimeEntry[], windowMinutes = ADHAN_ELAPSED_WINDOW_MINUTES): AdhanElapsed | null {
  let best: AdhanElapsed | null = null;
  let bestAge = Infinity;
  for (const e of entries) {
    if (e.key === "sunrise") continue;
    const ageMs = now.getTime() - e.time.getTime();
    if (ageMs < 0 || ageMs >= windowMinutes * 60_000) continue;
    if (ageMs < bestAge) {
      bestAge = ageMs;
      best = { prayer: e.key, minutes: Math.floor(ageMs / 60_000) };
    }
  }
  return best;
}

/** Arabic label with correct dual/plural forms: الآن، منذ دقيقة، دقيقتين، 3 دقائق … 10 دقائق، 11 دقيقة … */
export function adhanElapsedLabel(minutes: number, lang: "ar" | "en"): string {
  if (lang === "en") {
    if (minutes <= 0) return "Adhan now";
    return minutes === 1 ? "Adhan 1 min ago" : `Adhan ${minutes} min ago`;
  }
  if (minutes <= 0) return "الأذان الآن";
  if (minutes === 1) return "الأذان منذ دقيقة";
  if (minutes === 2) return "الأذان منذ دقيقتين";
  if (minutes <= 10) return `الأذان منذ ${minutes} دقائق`;
  return `الأذان منذ ${minutes} دقيقة`;
}
