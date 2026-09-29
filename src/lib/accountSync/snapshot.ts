import type { AppPrefsDoc } from "./types";

/**
 * What the device looked like right after its last successful sync. Several local stores keep no
 * timestamps and no deletion records (mushaf:bookmarks deletions, services.favorites,
 * quran:fav-reciters, quran:selected-reciter, lang/theme). Comparing the current local data with
 * this snapshot is the only honest way to tell "added / changed / removed since the last sync" —
 * and `takenAt` (a real, recorded moment) is the only time we can attach to such a change.
 *
 * Pure data + pure functions: nothing here reads or writes storage. Persisting a snapshot is a
 * later phase (after a real sync succeeds).
 */
export interface LocalSnapshot {
  version: 1;
  /** When the sync that produced this snapshot finished (ms). */
  takenAt: number;
  /** Whose data this device held at that sync (sync.owner). */
  owner: string | null;
  /** Bookmarked Mushaf pages at that moment. */
  bookmarkPages: number[];
  /** Favorite services with the `at` they were synced with. */
  serviceFavorites: { id: string; at: number }[];
  /** Selected reciter with the `at` it was synced with. */
  selectedReciter: { id: string; at: number } | null;
  /** Preferences with the `at` they were synced with. */
  prefs: AppPrefsDoc;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** A stored snapshot, validated; anything unusable -> null (treated as "no previous sync"). */
export function parseSnapshot(v: unknown): LocalSnapshot | null {
  if (!isObj(v) || v.version !== 1 || !isTime(v.takenAt) || v.takenAt === 0) return null;
  const owner = typeof v.owner === "string" && v.owner ? v.owner : null;
  const bookmarkPages = Array.isArray(v.bookmarkPages)
    ? [...new Set(v.bookmarkPages.filter((p): p is number => Number.isInteger(p) && (p as number) >= 1 && (p as number) <= 604))].sort((a, b) => a - b)
    : [];
  const serviceFavorites = Array.isArray(v.serviceFavorites)
    ? v.serviceFavorites.filter((x): x is { id: string; at: number } => isObj(x) && typeof x.id === "string" && isTime(x.at)).map((x) => ({ id: x.id, at: x.at }))
    : [];
  const s = v.selectedReciter;
  const selectedReciter = isObj(s) && typeof s.id === "string" && isTime(s.at) ? { id: s.id, at: s.at } : null;
  const prefs: AppPrefsDoc = {};
  if (isObj(v.prefs)) {
    const p = v.prefs;
    if (isObj(p.lang) && (p.lang.value === "ar" || p.lang.value === "en") && isTime(p.lang.at)) prefs.lang = { value: p.lang.value, at: p.lang.at };
    if (isObj(p.themeMode) && (p.themeMode.value === "system" || p.themeMode.value === "night" || p.themeMode.value === "light") && isTime(p.themeMode.at)) {
      prefs.themeMode = { value: p.themeMode.value, at: p.themeMode.at };
    }
    if (isObj(p.themeId) && typeof p.themeId.value === "string" && isTime(p.themeId.at)) prefs.themeId = { value: p.themeId.value, at: p.themeId.at };
  }
  return { version: 1, takenAt: v.takenAt, owner, bookmarkPages, serviceFavorites, selectedReciter, prefs };
}
