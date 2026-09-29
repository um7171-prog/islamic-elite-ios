import { ATHKAR_LIST_KEYS, athkarListProgress, loadAthkarCounts, localDayKey } from "./athkarProgress";
import { getAchievements, getCurrentStreak, type Achievement } from "./journey/achievements";
import { getJourneyState } from "./journey/store";
import { loadPlan, planProgress } from "./hifzPlan";
import { loadSessions, practiceStats, type PracticeStats } from "./recitePractice";

/**
 * «إحصائياتك» — ONLY figures the device actually recorded (nothing estimated, no placeholders):
 *   - recitation practice and the memorization plan (src/lib/recitePractice.ts, hifzPlan.ts);
 *   - Athkar: the per-day tallies the Athkar screens store (athkar.counts.<list>.<day>);
 *   - Journey sessions, streak and achievements (src/lib/journey);
 *   - the tasbeeh counter as it stands now.
 * What the app does not record (e.g. use of the services) is not shown.
 */

export interface AthkarDay {
  day: string;
  /** Lists fully counted that day (every dhikr reached its target). */
  completedLists: number;
  /** At least one dhikr counted that day. */
  active: boolean;
}

export interface PersonalStats {
  practice: PracticeStats;
  plan: { percent: number; memorizedAyahs: number; totalAyahs: number; todayAyahs: number; dailyAyahs: number } | null;
  athkar: { last7: AthkarDay[]; completedLists7: number; activeDays7: number };
  journey: { completedSessions: number; streakDays: number; achievements: Achievement[] };
  tasbeehCounter: number;
}

export function personalStats(now = Date.now()): PersonalStats {
  const sessions = loadSessions();
  const plan = loadPlan();
  const pp = plan ? planProgress(plan, sessions, now) : null;

  const last7: AthkarDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    let completedLists = 0;
    let active = false;
    for (const list of ATHKAR_LIST_KEYS) {
      const p = athkarListProgress(list, loadAthkarCounts(list, d));
      if (p.done === p.total) completedLists++;
      if (p.started) active = true;
    }
    last7.push({ day: localDayKey(d), completedLists, active });
  }

  const journey = getJourneyState();
  const rawTasbeeh = Number(localStorage.getItem("tasbeeh"));

  return {
    practice: practiceStats(sessions, now),
    plan: pp && { percent: pp.percent, memorizedAyahs: pp.memorizedAyahs, totalAyahs: pp.totalAyahs, todayAyahs: pp.todayAyahs, dailyAyahs: pp.dailyAyahs },
    athkar: {
      last7,
      completedLists7: last7.reduce((n, d) => n + d.completedLists, 0),
      activeDays7: last7.filter((d) => d.active).length,
    },
    journey: {
      completedSessions: journey.sessions.filter((s) => s.status === "completed").length,
      streakDays: getCurrentStreak(journey, now),
      achievements: getAchievements(journey, now),
    },
    tasbeehCounter: Number.isFinite(rawTasbeeh) && rawTasbeeh > 0 ? Math.floor(rawTasbeeh) : 0,
  };
}
