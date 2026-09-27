import { EVENING, MORNING, POST_PRAYER, SLEEP, type Athkar } from "@/lib/athkarData";

/**
 * Today's Athkar tallies — the single place that reads/writes them (the Athkar screen, the
 * "Session now" dhikr step and the Journey all share it). Stored per list and per LOCAL calendar
 * day (`athkar.counts.<list>.<YYYY-MM-DD>`), so tomorrow's Athkar start fresh.
 */
export type AthkarListKey = "morning" | "evening" | "sleep" | "post-prayer";

export const ATHKAR_LISTS: Record<AthkarListKey, { items: Athkar[]; ar: string; en: string }> = {
  morning: { items: MORNING, ar: "أذكار الصباح", en: "Morning Athkar" },
  evening: { items: EVENING, ar: "أذكار المساء", en: "Evening Athkar" },
  sleep: { items: SLEEP, ar: "أذكار النوم", en: "Sleep Athkar" },
  "post-prayer": { items: POST_PRAYER, ar: "أذكار بعد الصلاة", en: "Post-Prayer Athkar" },
};

export const ATHKAR_LIST_KEYS = Object.keys(ATHKAR_LISTS) as AthkarListKey[];

export function isAthkarListKey(v: unknown): v is AthkarListKey {
  return typeof v === "string" && v in ATHKAR_LISTS;
}

/** Local calendar day, e.g. "2026-09-27". */
export function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const athkarCountsKey = (list: AthkarListKey, d = new Date()) => `athkar.counts.${list}.${localDayKey(d)}`;

export function loadAthkarCounts(list: AthkarListKey, d = new Date()): number[] {
  const items = ATHKAR_LISTS[list].items;
  try {
    const raw = localStorage.getItem(athkarCountsKey(list, d));
    const arr: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length === items.length && arr.every((n) => typeof n === "number")) return arr as number[];
  } catch {
    /* ignore malformed/unavailable storage */
  }
  return items.map(() => 0);
}

export function saveAthkarCounts(list: AthkarListKey, counts: number[], d = new Date()): void {
  try {
    localStorage.setItem(athkarCountsKey(list, d), JSON.stringify(counts));
  } catch {
    /* storage unavailable */
  }
}

/** How many entries of a list are fully counted (real tallies, never estimated). */
export function athkarListProgress(list: AthkarListKey, counts: number[] = loadAthkarCounts(list)): { done: number; total: number; started: boolean } {
  const items = ATHKAR_LISTS[list].items;
  const done = items.filter((it, i) => (counts[i] ?? 0) >= it.count).length;
  return { done, total: items.length, started: counts.some((n) => n > 0) };
}
