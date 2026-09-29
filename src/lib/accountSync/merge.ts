import { ATHKAR_LISTS, isAthkarListKey, localDayKey, type AthkarListKey } from "@/lib/athkarProgress";
import { parseJourney } from "@/lib/journey/store";
import type { JourneyActivity, JourneySession } from "@/lib/journey/types";
import {
  SYNC_DOCS,
  type AppPrefsDoc,
  type AthkarProgressDoc,
  type BookmarkEntry,
  type JourneyDoc,
  type MergeContext,
  type QuranBookmarksDoc,
  type QuranPositionDoc,
  type QuranRecitersDoc,
  type RawSyncDocs,
  type ServicesFavoritesDoc,
  type SyncDocMap,
  type SyncDocName,
  type SyncDocs,
  type ThemeModePref,
} from "./types";

/**
 * Guest -> Account merge engine (pure). Each domain has one rule; every rule is
 *   - total:        malformed input is normalised (invalid entries dropped), never thrown on;
 *   - commutative:  merge(a, b) equals merge(b, a) — ties are broken by content, not by argument order;
 *   - idempotent:   merge(m, m) === m and merge(merge(a, b), b) === merge(a, b) — re-running never duplicates.
 * Nothing here reads storage, the clock or the network: "now" comes from the caller.
 */

/* ---------------- canonical JSON (for deterministic ties and change detection) ---------------- */

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

/** The later of two versions by `time`; equal times are settled by content, so the order of arguments never matters. */
function later<T>(a: T | undefined, b: T, time: (x: T) => number): T {
  if (a === undefined) return b;
  const ta = time(a), tb = time(b);
  if (tb !== ta) return tb > ta ? b : a;
  return stableStringify(b) > stableStringify(a) ? b : a;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Deletions are kept this long (so a stale device cannot resurrect an item), then forgotten. */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_TOMBSTONES = 500;
/** Same caps as the Journey store (src/lib/journey/store.ts). */
export const JOURNEY_MAX_ACTIVITIES = 40;
export const JOURNEY_MAX_SESSIONS = 50;
/** Athkar tallies are synced for today and the 6 days before. */
export const ATHKAR_SYNC_DAYS = 7;

function pruneTombstones<T extends { deletedAt: number }>(list: T[], now: number, key: (t: T) => string | number): T[] {
  return list
    .filter((t) => t.deletedAt >= now - TOMBSTONE_TTL_MS)
    .sort((x, y) => y.deletedAt - x.deletedAt || String(key(x)).localeCompare(String(key(y))))
    .slice(0, MAX_TOMBSTONES)
    .sort((x, y) => String(key(x)).localeCompare(String(key(y)), "en", { numeric: true }));
}

/* ---------------- quran.position: latest `at` wins ---------------- */

function normPosition(v: unknown): QuranPositionDoc | null {
  if (!isObj(v) || !isInt(v.page, 1, 604) || !isInt(v.surah, 1, 114) || !isTime(v.at) || v.at === 0) return null;
  return { page: v.page, surah: v.surah, at: v.at };
}

export function mergeQuranPosition(a: QuranPositionDoc | null, b: QuranPositionDoc | null): QuranPositionDoc | null {
  if (!a) return b;
  if (!b) return a;
  return later(a, b, (x) => x.at);
}

/* ---------------- quran.bookmarks: union + timed deletions ---------------- */

function normBookmarks(v: unknown): QuranBookmarksDoc {
  const o = isObj(v) ? v : {};
  const items = new Map<number, BookmarkEntry>();
  for (const x of arr(o.items)) {
    if (!isObj(x) || !isInt(x.page, 1, 604) || !isInt(x.surah, 1, 114) || typeof x.label !== "string" || x.label.length > 200 || !isTime(x.at)) continue;
    const e: BookmarkEntry = { page: x.page, surah: x.surah, label: x.label, at: x.at };
    items.set(e.page, later(items.get(e.page), e, (y) => y.at));
  }
  const deleted = new Map<number, number>();
  for (const x of arr(o.deleted)) {
    if (!isObj(x) || !isInt(x.page, 1, 604) || !isTime(x.deletedAt)) continue;
    deleted.set(x.page, Math.max(deleted.get(x.page) ?? 0, x.deletedAt));
  }
  return { items: [...items.values()], deleted: [...deleted].map(([page, deletedAt]) => ({ page, deletedAt })) };
}

export function mergeQuranBookmarks(a: QuranBookmarksDoc, b: QuranBookmarksDoc, ctx: MergeContext): QuranBookmarksDoc {
  const items = new Map<number, BookmarkEntry>();
  for (const e of [...a.items, ...b.items]) items.set(e.page, later(items.get(e.page), e, (y) => y.at));
  const deleted = new Map<number, number>();
  for (const t of [...a.deleted, ...b.deleted]) deleted.set(t.page, Math.max(deleted.get(t.page) ?? 0, t.deletedAt));
  // A deletion wins over a bookmark made at or before it; a later re-bookmark wins over the deletion.
  for (const [page, deletedAt] of deleted) {
    const e = items.get(page);
    if (e && deletedAt >= e.at) items.delete(page);
    else if (e) deleted.delete(page);
  }
  return {
    items: [...items.values()].sort((x, y) => x.page - y.page),
    deleted: pruneTombstones([...deleted].map(([page, deletedAt]) => ({ page, deletedAt })), ctx.now, (t) => t.page),
  };
}

/* ---------------- quran.reciters: selected = latest, favorites = union ---------------- */

const RECITER_ID = /^[a-z0-9_-]{1,40}$/;

function normReciters(v: unknown): QuranRecitersDoc {
  const o = isObj(v) ? v : {};
  const s = o.selected;
  const selected = isObj(s) && typeof s.id === "string" && RECITER_ID.test(s.id) && isTime(s.at) ? { id: s.id, at: s.at } : null;
  const favorites = [...new Set(arr(o.favorites).filter((x): x is string => typeof x === "string" && RECITER_ID.test(x)))].sort();
  return { selected, favorites };
}

export function mergeQuranReciters(a: QuranRecitersDoc, b: QuranRecitersDoc): QuranRecitersDoc {
  const selected = !a.selected ? b.selected : !b.selected ? a.selected : later(a.selected, b.selected, (x) => x.at);
  return { selected, favorites: [...new Set([...a.favorites, ...b.favorites])].sort() };
}

/* ---------------- journey: by id, latest update wins, capped ---------------- */

function normJourney(v: unknown): JourneyDoc {
  // The Journey store's own validator: anything it would not trust is dropped here too.
  return parseJourney(v === undefined ? null : JSON.stringify(v));
}

export function mergeJourney(a: JourneyDoc, b: JourneyDoc): JourneyDoc {
  const activities = new Map<string, JourneyActivity>();
  for (const x of [...a.activities, ...b.activities]) activities.set(x.id, later(activities.get(x.id), x, (y) => y.updatedAt));
  const sessions = new Map<string, JourneySession>();
  for (const x of [...a.sessions, ...b.sessions]) sessions.set(x.id, later(sessions.get(x.id), x, (y) => y.updatedAt));
  // Cursors (e.g. the 99 Names position) only move forward: max.
  const cursors: Record<string, number> = {};
  for (const [k, n] of [...Object.entries(a.cursors), ...Object.entries(b.cursors)]) cursors[k] = Math.max(cursors[k] ?? n, n);
  return {
    version: 1,
    activities: [...activities.values()]
      .sort((x, y) => y.updatedAt - x.updatedAt || x.id.localeCompare(y.id))
      .slice(0, JOURNEY_MAX_ACTIVITIES),
    sessions: [...sessions.values()]
      .sort((x, y) => y.startedAt - x.startedAt || x.id.localeCompare(y.id))
      .slice(0, JOURNEY_MAX_SESSIONS),
    cursors,
  };
}

/* ---------------- services.favorites: order by seq + timed deletions ---------------- */
//
// ORDER RULE (the only rule that decides the order of favorites):
//   1. Every item carries `seq` = its position in its own list (0 = first).
//   2. The same item in both lists keeps the SMALLER seq (the earlier of its two places).
//   3. Items are ordered by seq; seq values are never renumbered.
//   4. Equal seq is a real conflict (each list put a different item in the same place):
//      it is settled by id (alphabetical) — a deterministic tie-break only, never a re-sort.
// Consequences: one list keeps its order exactly; each list's order is kept whenever the lists do
// not disagree; min() makes the merge order-independent and re-running it changes nothing.
// `at` (when it was favorited) is kept only to be compared with deletions.

const SERVICE_ID = /^[A-Za-z0-9_-]{1,60}$/;
type ServiceItem = ServicesFavoritesDoc["items"][number];

/** The same favorite seen twice: its latest add time, its earliest place. */
const combineService = (x: ServiceItem | undefined, y: ServiceItem): ServiceItem =>
  x ? { id: y.id, at: Math.max(x.at, y.at), seq: Math.min(x.seq, y.seq) } : y;

function normServices(v: unknown): ServicesFavoritesDoc {
  const o = isObj(v) ? v : {};
  const items = new Map<string, ServiceItem>();
  arr(o.items).forEach((x, index) => {
    if (!isObj(x) || typeof x.id !== "string" || !SERVICE_ID.test(x.id) || !isTime(x.at)) return;
    // A document without seq (older shape) keeps the order in which it lists its items.
    const seq = isInt(x.seq, 0, Number.MAX_SAFE_INTEGER) ? x.seq : index;
    items.set(x.id, combineService(items.get(x.id), { id: x.id, at: x.at, seq }));
  });
  const deleted = new Map<string, number>();
  for (const x of arr(o.deleted)) {
    if (!isObj(x) || typeof x.id !== "string" || !SERVICE_ID.test(x.id) || !isTime(x.deletedAt)) continue;
    deleted.set(x.id, Math.max(deleted.get(x.id) ?? 0, x.deletedAt));
  }
  return { items: [...items.values()], deleted: [...deleted].map(([id, deletedAt]) => ({ id, deletedAt })) };
}

export function mergeServicesFavorites(a: ServicesFavoritesDoc, b: ServicesFavoritesDoc, ctx: MergeContext): ServicesFavoritesDoc {
  const items = new Map<string, ServiceItem>();
  for (const e of [...a.items, ...b.items]) items.set(e.id, combineService(items.get(e.id), e));
  const deleted = new Map<string, number>();
  for (const t of [...a.deleted, ...b.deleted]) deleted.set(t.id, Math.max(deleted.get(t.id) ?? 0, t.deletedAt));
  for (const [id, deletedAt] of deleted) {
    const e = items.get(id);
    if (e && deletedAt >= e.at) items.delete(id);
    else if (e) deleted.delete(id);
  }
  return {
    items: [...items.values()].sort((x, y) => x.seq - y.seq || x.id.localeCompare(y.id)),
    deleted: pruneTombstones([...deleted].map(([id, deletedAt]) => ({ id, deletedAt })), ctx.now, (t) => t.id),
  };
}

/* ---------------- athkar.progress: max per dhikr per day, last 7 days ---------------- */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function athkarCutoff(now: number): string {
  const d = new Date(now);
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (ATHKAR_SYNC_DAYS - 1)));
}

function normCounts(list: AthkarListKey, v: unknown): number[] | null {
  const items = ATHKAR_LISTS[list].items;
  if (!Array.isArray(v) || v.length !== items.length) return null;
  if (!v.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return v.map((n, i) => Math.min(items[i].count, Math.max(0, Math.floor(n as number))));
}

function normAthkar(v: unknown, ctx: MergeContext): AthkarProgressDoc {
  const days: AthkarProgressDoc["days"] = {};
  const src = isObj(v) && isObj(v.days) ? v.days : {};
  const cutoff = athkarCutoff(ctx.now);
  for (const [day, lists] of Object.entries(src)) {
    if (!DAY.test(day) || day < cutoff || !isObj(lists)) continue;
    for (const [list, counts] of Object.entries(lists)) {
      if (!isAthkarListKey(list)) continue;
      const c = normCounts(list, counts);
      if (!c || !c.some((n) => n > 0)) continue;
      (days[day] ??= {})[list] = c;
    }
  }
  return { days };
}

export function mergeAthkarProgress(a: AthkarProgressDoc, b: AthkarProgressDoc, ctx: MergeContext): AthkarProgressDoc {
  const cutoff = athkarCutoff(ctx.now);
  const days: AthkarProgressDoc["days"] = {};
  for (const day of [...new Set([...Object.keys(a.days), ...Object.keys(b.days)])].sort()) {
    if (day < cutoff) continue;
    for (const list of [...new Set([...Object.keys(a.days[day] ?? {}), ...Object.keys(b.days[day] ?? {})])].sort()) {
      if (!isAthkarListKey(list)) continue;
      const x = a.days[day]?.[list];
      const y = b.days[day]?.[list];
      (days[day] ??= {})[list] = x && y ? x.map((n, i) => Math.max(n, y[i] ?? 0)) : [...(x ?? y ?? [])];
    }
  }
  return { days };
}

/* ---------------- prefs.app: latest `at` wins, per preference ---------------- */

const THEME_MODES: readonly ThemeModePref[] = ["system", "night", "light"];
const THEME_ID = /^[a-z0-9-]{1,40}$/;

function normPrefs(v: unknown): AppPrefsDoc {
  const o = isObj(v) ? v : {};
  const out: AppPrefsDoc = {};
  const f = (x: unknown) => (isObj(x) && isTime(x.at) ? x : null);
  const lang = f(o.lang);
  if (lang && (lang.value === "ar" || lang.value === "en")) out.lang = { value: lang.value, at: lang.at as number };
  const mode = f(o.themeMode);
  if (mode && THEME_MODES.includes(mode.value as ThemeModePref)) out.themeMode = { value: mode.value as ThemeModePref, at: mode.at as number };
  const theme = f(o.themeId);
  if (theme && typeof theme.value === "string" && THEME_ID.test(theme.value)) out.themeId = { value: theme.value, at: theme.at as number };
  return out;
}

export function mergeAppPrefs(a: AppPrefsDoc, b: AppPrefsDoc): AppPrefsDoc {
  const out: AppPrefsDoc = {};
  const pick = <T>(x: T | undefined, y: T | undefined, time: (t: T) => number): T | undefined => (!x ? y : !y ? x : later(x, y, time));
  const lang = pick(a.lang, b.lang, (t) => t.at);
  const themeMode = pick(a.themeMode, b.themeMode, (t) => t.at);
  const themeId = pick(a.themeId, b.themeId, (t) => t.at);
  if (lang) out.lang = lang;
  if (themeMode) out.themeMode = themeMode;
  if (themeId) out.themeId = themeId;
  return out;
}

/* ---------------- per-document dispatch ---------------- */

/**
 * Validation only: invalid parts dropped, nothing merged or pruned. Merging parses BOTH sides first
 * so every deletion present in either input is applied before old deletions are pruned.
 */
function parseDoc(name: SyncDocName, v: unknown, ctx: MergeContext): unknown {
  switch (name) {
    case "quran.position": return normPosition(v);
    case "quran.bookmarks": return normBookmarks(v);
    case "quran.reciters": return normReciters(v);
    case "journey": return normJourney(v);
    case "services.favorites": return normServices(v);
    case "athkar.progress": return normAthkar(v, ctx);
    case "prefs.app": return normPrefs(v);
    default: return null;
  }
}

/** Any stored/received value -> the canonical valid document of that kind (= merging it with nothing). */
export function normalizeDoc<K extends SyncDocName>(name: K, v: unknown, ctx: MergeContext): SyncDocMap[K] {
  return mergeDoc(name, v, undefined, ctx);
}

export function mergeDoc<K extends SyncDocName>(name: K, a: unknown, b: unknown, ctx: MergeContext): SyncDocMap[K] {
  const x = parseDoc(name, a, ctx);
  const y = parseDoc(name, b, ctx);
  const m = {
    "quran.position": () => mergeQuranPosition(x as QuranPositionDoc | null, y as QuranPositionDoc | null),
    "quran.bookmarks": () => mergeQuranBookmarks(x as QuranBookmarksDoc, y as QuranBookmarksDoc, ctx),
    "quran.reciters": () => mergeQuranReciters(x as QuranRecitersDoc, y as QuranRecitersDoc),
    journey: () => mergeJourney(x as JourneyDoc, y as JourneyDoc),
    "services.favorites": () => mergeServicesFavorites(x as ServicesFavoritesDoc, y as ServicesFavoritesDoc, ctx),
    "athkar.progress": () => mergeAthkarProgress(x as AthkarProgressDoc, y as AthkarProgressDoc, ctx),
    "prefs.app": () => mergeAppPrefs(x as AppPrefsDoc, y as AppPrefsDoc),
  }[name];
  return m() as SyncDocMap[K];
}

/** True when the document holds no user data at all. */
export function isEmptyDoc<K extends SyncDocName>(name: K, doc: SyncDocMap[K]): boolean {
  switch (name) {
    case "quran.position": return doc === null;
    case "quran.bookmarks": { const d = doc as QuranBookmarksDoc; return d.items.length === 0 && d.deleted.length === 0; }
    case "quran.reciters": { const d = doc as QuranRecitersDoc; return d.selected === null && d.favorites.length === 0; }
    case "journey": { const d = doc as JourneyDoc; return d.activities.length === 0 && d.sessions.length === 0 && Object.keys(d.cursors).length === 0; }
    case "services.favorites": { const d = doc as ServicesFavoritesDoc; return d.items.length === 0 && d.deleted.length === 0; }
    case "athkar.progress": return Object.keys((doc as AthkarProgressDoc).days).length === 0;
    case "prefs.app": return Object.keys(doc as AppPrefsDoc).length === 0;
    default: return true;
  }
}

export function normalizeAll(raw: RawSyncDocs, ctx: MergeContext): SyncDocs {
  const out = {} as Record<SyncDocName, unknown>;
  for (const name of SYNC_DOCS) out[name] = normalizeDoc(name, raw[name], ctx);
  return out as SyncDocs;
}

export function mergeAll(a: RawSyncDocs, b: RawSyncDocs, ctx: MergeContext): SyncDocs {
  const out = {} as Record<SyncDocName, unknown>;
  for (const name of SYNC_DOCS) out[name] = mergeDoc(name, a[name], b[name], ctx);
  return out as SyncDocs;
}

export function hasAnyData(docs: SyncDocs): boolean {
  return SYNC_DOCS.some((name) => !isEmptyDoc(name, docs[name]));
}
