import { TOTAL_PAGES, getPageInfo, loadPosition } from "@/lib/mushaf";
import { ATHKAR_LISTS, ATHKAR_LIST_KEYS, athkarListProgress, loadAthkarCounts, localDayKey, type AthkarListKey } from "@/lib/athkarProgress";
import { completeActivity, getJourneyState, recordActivity } from "./store";

/**
 * Adapters between the app's existing features and the Journey. The features keep their own data
 * (the Mushaf position, today's Athkar tallies); these functions only mirror the user's real
 * activity into the Journey and read the real numbers back — nothing is estimated or invented.
 */

/** A reading the user has not touched for this long is no longer offered as "continue". */
const QURAN_CONTINUE_MS = 12 * 60 * 60 * 1000;

const endOfLocalDay = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

export const QURAN_ACTIVITY_ID = "quran:mushaf";

/** Called by the Mushaf reader whenever the shown page changes. */
export function noteQuranReading(page: number, now = Date.now()): void {
  const info = getPageInfo(page);
  recordActivity(
    {
      id: QURAN_ACTIVITY_ID,
      type: "quran",
      title: { ar: `المصحف — ${info.mainSurah.ar}`, en: `Mushaf — ${info.mainSurah.en}` },
      route: "/mushaf",
      progress: info.page / TOTAL_PAGES,
      expiresAt: now + QURAN_CONTINUE_MS,
      metadata: { page: info.page, surah: info.mainSurah.n },
    },
    now,
  );
}

export const athkarActivityId = (list: AthkarListKey, now = Date.now()) => `athkar:${list}:${localDayKey(new Date(now))}`;

/** Called when the user counts a dhikr (Athkar screen or a session). Completes the activity when the list is done. */
export function noteAthkarProgress(list: AthkarListKey, counts: number[], now = Date.now()): void {
  const { done, total } = athkarListProgress(list, counts);
  const id = athkarActivityId(list, now);
  recordActivity(
    {
      id,
      type: "dhikr",
      title: { ar: ATHKAR_LISTS[list].ar, en: ATHKAR_LISTS[list].en },
      route: `/athkar?list=${list}`,
      progress: total ? done / total : null,
      // Tallies are per day: tomorrow this list starts fresh, so it is not "continued".
      expiresAt: endOfLocalDay(now),
      metadata: { list, done, total },
    },
    now,
  );
  if (total && done === total) completeActivity(id, now);
}

export interface QuranProgress {
  page: number;
  totalPages: number;
  surahNumber: number;
  surahAr: string;
  surahEn: string;
  /** When the position was last saved (ms), from the Mushaf itself. */
  at: number;
}

/** The real Mushaf position, or null if the user has never opened the Mushaf. */
export function getQuranProgress(): QuranProgress | null {
  const pos = loadPosition();
  if (!pos.at) return null;
  const info = getPageInfo(pos.page);
  return { page: info.page, totalPages: TOTAL_PAGES, surahNumber: info.mainSurah.n, surahAr: info.mainSurah.ar, surahEn: info.mainSurah.en, at: pos.at };
}

export interface AthkarDayProgress {
  list: AthkarListKey;
  done: number;
  total: number;
  started: boolean;
}

/** Today's real Athkar tallies for every list. */
export function getTodayAthkarProgress(now = Date.now()): AthkarDayProgress[] {
  const d = new Date(now);
  return ATHKAR_LIST_KEYS.map((list) => ({ list, ...athkarListProgress(list, loadAthkarCounts(list, d)) }));
}

/* ---------------- 99 Names reading cursor ---------------- */

export const NAMES_CURSOR = "names";

export function getNamesCursor(): number {
  const c = getJourneyState().cursors[NAMES_CURSOR];
  return typeof c === "number" && c >= 0 ? Math.floor(c) : 0;
}
