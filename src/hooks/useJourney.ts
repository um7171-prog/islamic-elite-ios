import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { getPrayerTimes } from "@/lib/prayer";
import { getDayContext, type DayContext, type PrayerDay } from "@/lib/journey/context";
import { getQuranProgress, getTodayAthkarProgress, type AthkarDayProgress, type QuranProgress } from "@/lib/journey/sources";
import { findActiveSession, getJourneyState, getJourneySummary, getUnfinishedActivity, subscribeJourney, type JourneySummary } from "@/lib/journey/store";
import { suggestNow, type Suggestion } from "@/lib/journey/suggest";
import type { JourneyState } from "@/lib/journey/types";

/** The Journey, re-rendering only when it actually changes. */
export function useJourneyState(): JourneyState {
  return useSyncExternalStore(subscribeJourney, getJourneyState, getJourneyState);
}

/**
 * A clock that ticks once a minute (aligned to the minute) and again whenever the app becomes
 * visible — enough for "minutes to the next prayer" without a per-second re-render.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    const onVisible = () => { if (document.visibilityState === "visible") setNow(new Date()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

/** Yesterday's, today's and tomorrow's real prayer times for the user's city and settings. */
export function usePrayerDay(now: Date): PrayerDay {
  const { city } = useCity();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const day = now.toDateString();
  return useMemo(() => {
    const calc = { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 };
    const at = (offset: number) => getPrayerTimes(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset), city.lat, city.lng, madhab, calc).entries;
    return { yesterday: at(-1), today: at(0), tomorrow: at(1) };
    // Recomputed per calendar day / city / calculation settings only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, city.id, madhab, calcSignature]);
}

export interface JourneyNow {
  now: Date;
  journey: JourneyState;
  context: DayContext;
  quran: QuranProgress | null;
  athkarToday: AthkarDayProgress[];
  suggestion: Suggestion;
  summary: JourneySummary;
}

/** Everything «يومك في النخبة», «أكمل رحلتي» and «رحلتي» need, computed once per minute or per Journey change. */
export function useJourneyNow(): JourneyNow {
  const journey = useJourneyState();
  const now = useMinuteClock();
  const prayers = usePrayerDay(now);
  return useMemo(() => {
    const t = now.getTime();
    const context = getDayContext({
      now,
      prayers,
      unfinished: getUnfinishedActivity(t, journey),
      activeSession: findActiveSession(journey, t),
    });
    const quran = getQuranProgress();
    const athkarToday = getTodayAthkarProgress(t);
    return {
      now,
      journey,
      context,
      quran,
      athkarToday,
      suggestion: suggestNow({ context, quran, athkarToday }),
      summary: getJourneySummary(t, journey),
    };
  }, [now, prayers, journey]);
}
