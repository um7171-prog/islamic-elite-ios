import { ATHKAR_LISTS, isAthkarListKey, loadAthkarCounts, saveAthkarCounts } from "@/lib/athkarProgress";
import { getJourneyState, writeJourney } from "@/lib/journey/store";
import { setSelectedReciterId } from "@/lib/reciters";
import { THEMES } from "@/lib/themes";
import {
  LOCAL_KEYS,
  readAppPrefs,
  readQuranBookmarks,
  readQuranPosition,
  readQuranReciters,
  readServicesFavorites,
  type ReadonlyStorageLike,
} from "./localAdapters";
import { isEmptyDoc, mergeJourney, normalizeDoc, stableStringify } from "./merge";
import type { LocalDataPort } from "./syncEngine";
import { createAdapterReader } from "./syncEngine";
import { SYNC_DOCS, type MergeContext, type SyncDocName, type SyncDocs } from "./types";

/**
 * Local Apply Layer: writes the FINAL merged documents into the app's existing storage keys.
 *
 *   Sync Engine -> merged document -> applyLocalDocs -> existing writer / isolated adapter -> existing key
 *
 * Guarantees (each domain):
 *   - guarded union: nothing already on the device is removed unless the document itself records its
 *     deletion (a tombstone); an empty, missing or malformed document therefore removes nothing;
 *   - a value only moves forward (an older Mushaf position never replaces a newer one);
 *   - a key is written only when its content actually changes -> idempotent, no-op when unchanged;
 *   - only the documents given are touched; unknown document names are ignored;
 *   - no new key, no renamed/moved/removed key.
 *
 * Writers used: the app's own writers where they write exactly the given value
 * (writeJourney, saveAthkarCounts, setSelectedReciterId); small isolated adapters otherwise — see
 * each section for why. Open screens that read their data only on mount will show the new values on
 * their next mount (the Journey store notifies its subscribers immediately).
 */

/** The storage operations the isolated adapters need (the app's localStorage in production). */
export interface WritableStorageLike extends ReadonlyStorageLike {
  setItem(key: string, value: string): void;
}

export interface ApplyReport {
  /** Keys actually written (content changed). */
  written: string[];
  /** Documents given but ignored (unknown name, or nothing valid in them). */
  ignored: string[];
  /** Documents for which at least one key was actually written. */
  writtenDocs: SyncDocName[];
}

/** Writes `value` (JSON) to `key` only if the stored content differs; returns whether it wrote. */
function writeIfChanged(s: WritableStorageLike, key: string, value: unknown, written: string[]): void {
  const next = JSON.stringify(value);
  let cur: string | null = null;
  try { cur = s.getItem(key); } catch { /* treated as absent */ }
  if (cur !== null) {
    try { if (stableStringify(JSON.parse(cur)) === stableStringify(value)) return; } catch { /* corrupted: rewrite */ }
  }
  s.setItem(key, next);
  written.push(key);
}

function writeTextIfChanged(s: WritableStorageLike, key: string, value: string, written: string[]): void {
  let cur: string | null = null;
  try { cur = s.getItem(key); } catch { /* treated as absent */ }
  if (cur === value) return;
  s.setItem(key, value);
  written.push(key);
}

/* ---------------- quran.position -> "mushaf:position" (isolated adapter) ----------------
 * savePosition() records Date.now() instead of the merged time, which would invent a timestamp, so
 * the same shape {page, surah, at} is written directly. Never moves back to an older position. */
function applyQuranPosition(s: WritableStorageLike, doc: SyncDocs["quran.position"], written: string[]) {
  if (!doc) return;
  const cur = readQuranPosition(s);
  if (cur && cur.at > doc.at) return;
  writeIfChanged(s, LOCAL_KEYS.position, { page: doc.page, surah: doc.surah, at: doc.at }, written);
}

/* ---------------- quran.bookmarks -> "mushaf:bookmarks" (isolated adapter) ----------------
 * The app only has toggleBookmark()/removeBookmark() (one page at a time). The stored shape is the
 * app's MushafBookmark[] = {page, surah, label, at}, sorted by page (as toggleBookmark keeps it). */
function applyQuranBookmarks(s: WritableStorageLike, doc: SyncDocs["quran.bookmarks"], written: string[]) {
  const local = readQuranBookmarks(s, null).items;
  const docPages = new Set(doc.items.map((b) => b.page));
  const deleted = new Set(doc.deleted.map((d) => d.page));
  const keep = local.filter((b) => !docPages.has(b.page) && !deleted.has(b.page));
  const next = [...doc.items, ...keep]
    .map((b) => ({ page: b.page, surah: b.surah, label: b.label, at: b.at }))
    .sort((a, b) => a.page - b.page);
  if (next.length === 0 && local.length === 0) return;
  writeIfChanged(s, LOCAL_KEYS.bookmarks, next, written);
}

/* ---------------- quran.reciters -> "quran:selected-reciter" + "quran:fav-reciters" ----------------
 * Selected: the app's setSelectedReciterId() (writes the id as-is). Favorites: the app only has
 * toggleFavorite(), so the list is written directly (same plain string[]). */
function applyQuranReciters(s: WritableStorageLike, doc: SyncDocs["quran.reciters"], written: string[]) {
  const local = readQuranReciters(s, null);
  if (doc.selected && doc.selected.id !== local.selected?.id) {
    setSelectedReciterId(doc.selected.id);
    written.push(LOCAL_KEYS.selectedReciter);
  }
  const favorites = [...new Set([...doc.favorites, ...local.favorites])].sort();
  if (favorites.length === 0) return;
  writeIfChanged(s, LOCAL_KEYS.favoriteReciters, favorites, written);
}

/* ---------------- journey -> "elite.journey.v1" (the Journey store's writeJourney) ----------------
 * Merged once more with what is on the device (a union by id), then written through the store,
 * which caps it and notifies every screen subscribed to it. */
function applyJourney(doc: SyncDocs["journey"], written: string[]) {
  const current = getJourneyState();
  const next = mergeJourney(doc, current);
  if (stableStringify(mergeJourney(current, current)) === stableStringify(next)) return;
  writeJourney((d) => {
    d.activities = next.activities;
    d.sessions = next.sessions;
    d.cursors = next.cursors;
  });
  written.push(LOCAL_KEYS.journey);
}

/* ---------------- services.favorites -> "services.favorites" (isolated adapter) ----------------
 * Only the Services screen writes it (component state), so the plain id list is written directly,
 * in the document's order (seq); device favorites the document does not mention and did not delete
 * are kept, after them, in their own order. */
function applyServicesFavorites(s: WritableStorageLike, doc: SyncDocs["services.favorites"], written: string[]) {
  const local = readServicesFavorites(s, null).items.map((x) => x.id);
  const docIds = [...doc.items].sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id)).map((x) => x.id);
  const deleted = new Set(doc.deleted.map((d) => d.id));
  const next = [...docIds, ...local.filter((id) => !docIds.includes(id) && !deleted.has(id))];
  if (next.length === 0 && local.length === 0) return;
  writeIfChanged(s, LOCAL_KEYS.services, next, written);
}

/* ---------------- athkar.progress -> "athkar.counts.<list>.<day>" (the app's saveAthkarCounts) ----------------
 * Per dhikr: max(device, document) — counts never go down. Only the days/lists in the document. */
function applyAthkarProgress(doc: SyncDocs["athkar.progress"], written: string[]) {
  for (const [day, lists] of Object.entries(doc.days)) {
    const [y, m, dd] = day.split("-").map(Number);
    const date = new Date(y, m - 1, dd);
    for (const [list, counts] of Object.entries(lists)) {
      if (!isAthkarListKey(list) || !counts) continue;
      const cur = loadAthkarCounts(list, date);
      const next = ATHKAR_LISTS[list].items.map((it, i) => Math.min(it.count, Math.max(cur[i] ?? 0, counts[i] ?? 0)));
      if (stableStringify(next) === stableStringify(cur)) continue;
      saveAthkarCounts(list, next, date);
      written.push(`athkar.counts.${list}.${day}`);
    }
  }
}

/* ---------------- prefs.app -> "lang", "theme-mode", "elite.theme.id.v1" (isolated adapter) ----------------
 * These are written by LocaleContext / ThemeContext from React state; outside React the same keys and
 * plain-string values are written. The legacy "theme" key is never touched. Only fields present in the
 * document are applied (an absent field never clears the device's choice). */
function applyAppPrefs(s: WritableStorageLike, doc: SyncDocs["prefs.app"], written: string[]) {
  const local = readAppPrefs(s, null);
  if (doc.lang && doc.lang.value !== local.lang?.value) writeTextIfChanged(s, LOCAL_KEYS.lang, doc.lang.value, written);
  if (doc.themeMode) writeTextIfChanged(s, LOCAL_KEYS.themeMode, doc.themeMode.value, written);
  if (doc.themeId && THEMES.some((t) => t.id === doc.themeId?.value)) writeTextIfChanged(s, LOCAL_KEYS.themeId, doc.themeId.value, written);
}

/* ---------------- entry points ---------------- */

/**
 * Applies the given merged documents. Each is validated first (normalizeDoc); a document with nothing
 * valid in it is ignored rather than applied as "empty".
 */
export function applyLocalDocs(docs: Partial<Record<string, unknown>>, ctx: MergeContext, storage: WritableStorageLike = localStorage): ApplyReport {
  const written: string[] = [];
  const ignored: string[] = [];
  const writtenDocs: SyncDocName[] = [];
  for (const [name, raw] of Object.entries(docs)) {
    if (!(SYNC_DOCS as readonly string[]).includes(name)) { ignored.push(name); continue; }
    const docName = name as SyncDocName;
    const doc = normalizeDoc(docName, raw, ctx);
    if (isEmptyDoc(docName, doc)) { ignored.push(name); continue; }
    const before = written.length;
    switch (docName) {
      case "quran.position": applyQuranPosition(storage, doc as SyncDocs["quran.position"], written); break;
      case "quran.bookmarks": applyQuranBookmarks(storage, doc as SyncDocs["quran.bookmarks"], written); break;
      case "quran.reciters": applyQuranReciters(storage, doc as SyncDocs["quran.reciters"], written); break;
      case "journey": applyJourney(doc as SyncDocs["journey"], written); break;
      case "services.favorites": applyServicesFavorites(storage, doc as SyncDocs["services.favorites"], written); break;
      case "athkar.progress": applyAthkarProgress(doc as SyncDocs["athkar.progress"], written); break;
      case "prefs.app": applyAppPrefs(storage, doc as SyncDocs["prefs.app"], written); break;
    }
    if (written.length > before) writtenDocs.push(docName);
  }
  return { written, ignored, writtenDocs };
}

/** The device port for the Sync Engine: reads through the adapters, writes through this layer. */
export function createLocalDataPort(now: () => number = () => Date.now(), storage: WritableStorageLike = localStorage): LocalDataPort {
  return {
    read: createAdapterReader(storage),
    apply: async (docs) => ({ written: applyLocalDocs(docs, { now: now() }, storage).writtenDocs }),
  };
}
