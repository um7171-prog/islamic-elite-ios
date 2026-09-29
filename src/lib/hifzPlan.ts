import { SURAHS } from "./mushafData";
import { localDayKey } from "./athkarProgress";
import { surahLevel, type MemorizationLevel, type PracticeSession } from "./recitePractice";

/**
 * «خطة الحفظ والمراجعة» — a layer over the recitation self-practice (src/lib/recitePractice.ts).
 * The plan only says WHAT to memorize and HOW MUCH per day; every number shown comes from the
 * user's own saved practice sessions (nothing estimated, nothing invented):
 *   - an ayah counts as memorized when a session covering it was rated 4 or 5;
 *   - today's portion counts the ayahs of today's "memorize" sessions;
 *   - the review queue holds planned surahs that are fully memorized but due (rated low last time,
 *     or not practised for REVIEW_AFTER_DAYS).
 * The Mushaf and the reading experience are untouched.
 */

export interface HifzPlan {
  version: 1;
  /** Surah numbers, in the order they will be memorized. */
  surahs: number[];
  dailyAyahs: number;
  createdAt: number;
}

export type PlanOrder = "ascending" | "descending";

export const PRESETS = {
  /** جزء عمّ: An-Naba (78) … An-Nas (114). */
  juz30: range(78, 114),
  /** جزء تبارك: Al-Mulk (67) … Al-Mursalat (77). */
  juz29: range(67, 77),
} as const;

export const DAILY_AYAH_OPTIONS = [3, 5, 10, 15, 20] as const;
export const REVIEW_AFTER_DAYS = 7;

const KEY = "hifz:plan";
const DAY = 24 * 60 * 60 * 1000;

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export function orderSurahs(surahs: number[], order: PlanOrder): number[] {
  const unique = [...new Set(surahs)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 114).sort((x, y) => x - y);
  return order === "descending" ? unique.reverse() : unique;
}

export function loadPlan(): HifzPlan | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!v || v.version !== 1 || !Array.isArray(v.surahs) || !Number.isInteger(v.dailyAyahs) || v.dailyAyahs < 1) return null;
    const surahs = (v.surahs as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 114);
    return surahs.length ? { version: 1, surahs: [...new Set(surahs)], dailyAyahs: Math.min(v.dailyAyahs, 286), createdAt: typeof v.createdAt === "number" ? v.createdAt : 0 } : null;
  } catch {
    return null;
  }
}

export function savePlan(surahs: number[], dailyAyahs: number, now = Date.now()): HifzPlan {
  const clean = [...new Set(surahs)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 114);
  if (!clean.length) throw new Error("a plan needs at least one surah");
  if (!Number.isInteger(dailyAyahs) || dailyAyahs < 1) throw new Error("invalid daily goal");
  const plan: HifzPlan = { version: 1, surahs: clean, dailyAyahs, createdAt: now };
  localStorage.setItem(KEY, JSON.stringify(plan));
  return plan;
}

export function clearPlan(): void {
  localStorage.removeItem(KEY);
}

/** Ayahs of `surah` covered by sessions matching `keep` (a set of ayah numbers). */
function covered(sessions: PracticeSession[], surah: number, keep: (s: PracticeSession) => boolean): Set<number> {
  const out = new Set<number>();
  for (const s of sessions) {
    if (s.surah !== surah || !keep(s)) continue;
    for (let a = s.fromAyah; a <= s.toAyah; a++) out.add(a);
  }
  return out;
}

export interface SurahProgress {
  surah: number;
  ayahs: number;
  memorizedAyahs: number;
  level: MemorizationLevel;
  lastAt: number | null;
}

export interface Portion {
  surah: number;
  fromAyah: number;
  toAyah: number;
}

export interface PlanProgress {
  totalAyahs: number;
  memorizedAyahs: number;
  /** 0..100, floor (never rounds up to 100 before it is done). */
  percent: number;
  surahs: SurahProgress[];
  todayAyahs: number;
  dailyAyahs: number;
  todayDone: boolean;
  /** The next portion to memorize (null when the whole plan is memorized). */
  next: Portion | null;
  /** Memorized planned surahs that are due for review, oldest first. */
  reviewDue: SurahProgress[];
}

export function planProgress(plan: HifzPlan, sessions: PracticeSession[], now = Date.now()): PlanProgress {
  const today = localDayKey(new Date(now));
  const surahs: SurahProgress[] = plan.surahs.map((n) => {
    const mine = sessions.filter((s) => s.surah === n);
    return {
      surah: n,
      ayahs: SURAHS[n - 1].ayahs,
      memorizedAyahs: covered(sessions, n, (s) => s.rating >= 4).size,
      level: surahLevel(sessions, n, now),
      lastAt: mine.length ? Math.max(...mine.map((s) => s.at)) : null,
    };
  });
  const totalAyahs = surahs.reduce((n, s) => n + s.ayahs, 0);
  const memorizedAyahs = surahs.reduce((n, s) => n + s.memorizedAyahs, 0);

  let todayAyahs = 0;
  for (const n of plan.surahs) {
    todayAyahs += covered(sessions, n, (s) => s.mode === "memorize" && localDayKey(new Date(s.at)) === today).size;
  }

  let next: Portion | null = null;
  for (const n of plan.surahs) {
    const done = covered(sessions, n, (s) => s.rating >= 4);
    const total = SURAHS[n - 1].ayahs;
    let from = 1;
    while (from <= total && done.has(from)) from++;
    if (from <= total) { next = { surah: n, fromAyah: from, toAyah: Math.min(total, from + plan.dailyAyahs - 1) }; break; }
  }

  const reviewDue = surahs
    .filter((s) => s.memorizedAyahs === s.ayahs && (s.level === "needs-review" || (s.lastAt !== null && now - s.lastAt >= REVIEW_AFTER_DAYS * DAY)))
    .sort((a, b) => (a.lastAt ?? 0) - (b.lastAt ?? 0));

  return {
    totalAyahs,
    memorizedAyahs,
    percent: totalAyahs ? Math.floor((memorizedAyahs / totalAyahs) * 100) : 0,
    surahs,
    todayAyahs,
    dailyAyahs: plan.dailyAyahs,
    todayDone: todayAyahs >= plan.dailyAyahs,
    next,
    reviewDue,
  };
}

/** The /recite link that opens a portion ready to practise. */
export function reciteLink(p: Portion, mode: "memorize" | "review" = "memorize"): string {
  return `/recite?surah=${p.surah}&from=${p.fromAyah}&to=${p.toAyah}&mode=${mode}`;
}
