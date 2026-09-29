import { SURAHS } from "./mushafData";
import { surahUrl, type Reciter } from "./reciters";

/**
 * The reciters library's surah player: pure helpers (search, surah stepping, last-played memory)
 * and a playable URL that STREAMS unless the surah is already in the offline cache. Unlike
 * getPlayableUrl() it never starts a background download of a whole surah (tens of MB).
 */

/** Diacritics- and letter-form-insensitive matching (Arabic and Latin). */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ـ۞۩]/g, "")
    .replace(/[ٱآأإ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

export function searchReciters(list: Reciter[], query: string): Reciter[] {
  const q = normalizeSearch(query);
  if (!q) return list;
  return list.filter((r) => normalizeSearch(r.name).includes(q) || normalizeSearch(r.nameEn).includes(q));
}

export function searchSurahs(query: string) {
  const q = normalizeSearch(query);
  if (!q) return SURAHS;
  return SURAHS.filter((s) => String(s.n) === q || normalizeSearch(s.ar).includes(q) || normalizeSearch(s.en).includes(q) || normalizeSearch(s.tr).includes(q));
}

export const nextSurah = (n: number): number | null => (n < 114 ? n + 1 : null);
export const prevSurah = (n: number): number | null => (n > 1 ? n - 1 : null);

/* ---------------- last played (this device only) ---------------- */
const LAST_KEY = "quran:player-last";

export interface LastPlayed {
  reciterId: string;
  surah: number;
  /** Seconds into the surah. */
  position: number;
}

export function loadLastPlayed(): LastPlayed | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
    if (!v || typeof v.reciterId !== "string" || !Number.isInteger(v.surah) || v.surah < 1 || v.surah > 114) return null;
    const position = typeof v.position === "number" && Number.isFinite(v.position) && v.position > 0 ? v.position : 0;
    return { reciterId: v.reciterId, surah: v.surah, position };
  } catch {
    return null;
  }
}

export function saveLastPlayed(last: LastPlayed): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ reciterId: last.reciterId, surah: last.surah, position: Math.max(0, Math.floor(last.position)) }));
  } catch { /* storage full or blocked: playback still works */ }
}

/* ---------------- playable URL: cached copy if present, otherwise stream ---------------- */
export async function streamOrCachedUrl(reciter: Reciter, surah: number): Promise<{ url: string; cached: boolean }> {
  const remote = surahUrl(reciter, surah);
  if (typeof caches === "undefined") return { url: remote, cached: false };
  try {
    const cache = await caches.open("quran-audio-v1");
    const hit = await cache.match(remote);
    if (hit) return { url: URL.createObjectURL(await hit.blob()), cached: true };
  } catch { /* no cache available: stream */ }
  return { url: remote, cached: false };
}
