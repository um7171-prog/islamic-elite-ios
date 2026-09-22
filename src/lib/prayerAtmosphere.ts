import type { PrayerEntry, PrayerKey } from "@/lib/prayer";

/** The six atmospheres Home's prayer-times strip can be in — unlike `getNextPrayer`, sunrise IS
 * one of them here (it is a real visual period of the day, even though it never gets an alert). */
export type AtmosphereKey = PrayerKey;

export const ATMOSPHERE_ORDER: AtmosphereKey[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

/** Which atmosphere `now` currently falls in, from the SAME prayer-time entries the rest of the
 * app uses (no separate time math, no separate source of truth — each entry already carries its
 * design-system gradient class, `bg-fajr`/`bg-sunrise`/…, in `PrayerEntry.gradient`). Cyclical:
 * before today's Fajr, the period is still last night's Isha. Pure and synchronous — safe to call
 * on every tick and immediately after the app returns from the background. */
export function getAtmospherePeriod(entries: PrayerEntry[], now: Date): PrayerEntry {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const ordered = ATMOSPHERE_ORDER.map((k) => byKey.get(k)).filter((e): e is PrayerEntry => !!e);
  if (ordered.length === 0) return entries[0];
  let current = ordered[ordered.length - 1]; // before Fajr: still "isha" (yesterday's)
  for (const e of ordered) {
    if (e.time.getTime() <= now.getTime()) current = e;
    else break;
  }
  return current;
}
