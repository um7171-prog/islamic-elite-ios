import type { PrayerEntry } from "@/lib/prayer";

/** How long the "<الصلاة> منذ MM:SS" line stays under the countdown after a prayer's time enters. */
export const SINCE_WINDOW_MINUTES = 45;

export interface PrayerSince {
  entry: PrayerEntry;
  /** milliseconds since that prayer's time (0 at the adhan) */
  ms: number;
}

/**
 * The prayer whose time entered MOST RECENTLY, and how long ago — while under `windowMinutes`.
 *
 * Computed only from the current time and the real prayer times (pass yesterday's entries too, so
 * yesterday's Isha still counts just after midnight). It never depends on the prayer the user
 * selected, on when the page was opened, or on timer ticks — so it is right after a late launch,
 * after coming back to the page and after the app returns from the background.
 * Sunrise is not a prayer and never counts.
 */
export function getLatestPrayerSince(
  now: Date,
  entries: PrayerEntry[],
  windowMinutes = SINCE_WINDOW_MINUTES,
): PrayerSince | null {
  let latest: PrayerEntry | null = null;
  for (const e of entries) {
    if (e.key === "sunrise") continue;
    if (e.time.getTime() > now.getTime()) continue;
    if (!latest || e.time.getTime() > latest.time.getTime()) latest = e;
  }
  if (!latest) return null;
  const ms = now.getTime() - latest.time.getTime();
  // A newer prayer resets it; once the latest one is 45 minutes old it disappears.
  if (ms >= windowMinutes * 60_000) return null;
  return { entry: latest, ms };
}
