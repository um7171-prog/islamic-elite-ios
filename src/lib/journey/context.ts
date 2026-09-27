import type { PrayerEntry } from "@/lib/prayer";
import { SINCE_WINDOW_MINUTES } from "@/lib/prayerSince";
import type { JourneyActivity, JourneySession } from "./types";

/**
 * The context engine: "where is the user in their day right now?", computed ONLY from the real
 * prayer times and the Journey. Pure (no React, no timers, no storage) so the same answer can later
 * feed widgets, a post-prayer screen, travel or Ramadan modes. It is for the app's own screens only
 * and is deliberately NOT connected to notification scheduling.
 */

/** UI thresholds (minutes) — about presentation, not about any religious timing. */
export const BEFORE_PRAYER_MINUTES = 15;
export const PRAYER_TIME_MINUTES = 20;
export const AFTER_PRAYER_MINUTES = SINCE_WINDOW_MINUTES;

export type PrayerPhase = "prayer-time" | "before-prayer" | "after-prayer" | "between";
export type DayPeriod = "late-night" | "dawn" | "morning" | "midday" | "afternoon" | "evening" | "night";

export interface PrayerDay {
  yesterday: PrayerEntry[];
  today: PrayerEntry[];
  tomorrow: PrayerEntry[];
}

export interface DayContextInput {
  now: Date;
  prayers: PrayerDay;
  unfinished: JourneyActivity | null;
  activeSession: JourneySession | null;
}

export interface DayContext {
  now: Date;
  /** The prayer whose time entered most recently (yesterday's Isha just after midnight). */
  currentPrayer: PrayerEntry | null;
  /** The next of the five prayers (tomorrow's Fajr after Isha). */
  nextPrayer: PrayerEntry | null;
  minutesToNext: number | null;
  minutesSinceCurrent: number | null;
  phase: PrayerPhase;
  period: DayPeriod;
  unfinished: JourneyActivity | null;
  hasUnfinishedActivity: boolean;
  activeSession: JourneySession | null;
  hasActiveSession: boolean;
}

const isSalah = (e: PrayerEntry) => e.key !== "sunrise";
const minutesBetween = (a: number, b: number) => Math.floor((b - a) / 60_000);

export function getDayContext({ now, prayers, unfinished, activeSession }: DayContextInput): DayContext {
  const t = now.getTime();
  const past = [...prayers.yesterday, ...prayers.today].filter((e) => isSalah(e) && e.time.getTime() <= t);
  const currentPrayer = past.reduce<PrayerEntry | null>((b, e) => (!b || e.time > b.time ? e : b), null);
  const upcoming = [...prayers.today, ...prayers.tomorrow].filter((e) => isSalah(e) && e.time.getTime() > t);
  const nextPrayer = upcoming.reduce<PrayerEntry | null>((b, e) => (!b || e.time < b.time ? e : b), null);

  const minutesToNext = nextPrayer ? Math.max(0, Math.ceil((nextPrayer.time.getTime() - t) / 60_000)) : null;
  const minutesSinceCurrent = currentPrayer ? minutesBetween(currentPrayer.time.getTime(), t) : null;

  let phase: PrayerPhase = "between";
  if (minutesSinceCurrent !== null && minutesSinceCurrent < PRAYER_TIME_MINUTES) phase = "prayer-time";
  else if (minutesToNext !== null && minutesToNext <= BEFORE_PRAYER_MINUTES) phase = "before-prayer";
  else if (minutesSinceCurrent !== null && minutesSinceCurrent < AFTER_PRAYER_MINUTES) phase = "after-prayer";

  return {
    now,
    currentPrayer,
    nextPrayer,
    minutesToNext,
    minutesSinceCurrent,
    phase,
    period: dayPeriod(now, currentPrayer, prayers.today),
    unfinished,
    hasUnfinishedActivity: unfinished !== null,
    activeSession,
    hasActiveSession: activeSession !== null,
  };
}

function dayPeriod(now: Date, current: PrayerEntry | null, today: PrayerEntry[]): DayPeriod {
  const h = now.getHours();
  const sunrise = today.find((e) => e.key === "sunrise");
  switch (current?.key) {
    case "fajr":
      return sunrise && now < sunrise.time ? "dawn" : "morning";
    case "dhuhr":
      return "midday";
    case "asr":
      return "afternoon";
    case "maghrib":
      return "evening";
    case "isha": {
      // Yesterday's Isha (after midnight) or a late hour → late night.
      const fajr = today.find((e) => e.key === "fajr");
      return h >= 23 || (fajr !== undefined && now < fajr.time) ? "late-night" : "night";
    }
    default:
      return h < 5 ? "late-night" : h < 12 ? "morning" : h < 15 ? "midday" : h < 18 ? "afternoon" : "night";
  }
}
