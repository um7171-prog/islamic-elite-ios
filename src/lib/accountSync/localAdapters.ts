import { ATHKAR_LISTS, isAthkarListKey } from "@/lib/athkarProgress";
import { JOURNEY_KEY, parseJourney } from "@/lib/journey/store";
import { THEMES, THEME_STORAGE_KEY } from "@/lib/themes";
import { normalizeDoc } from "./merge";
import type { LocalSnapshot } from "./snapshot";
import {
  SYNC_DOCS,
  type AppPrefsDoc,
  type AthkarProgressDoc,
  type QuranBookmarksDoc,
  type QuranPositionDoc,
  type QuranRecitersDoc,
  type ServicesFavoritesDoc,
  type SyncDocName,
  type SyncDocs,
  type ThemeModePref,
} from "./types";

/**
 * Local-storage adapters: read the app's EXISTING keys and express them as the seven sync
 * documents of Phase 2. Strictly read-only — the storage type below has no write methods, and no
 * key is renamed, migrated or removed.
 *
 * Time rules (never invent a timestamp):
 *   - a value that carries its own time (mushaf position, bookmarks, journey) keeps it;
 *   - a value WITHOUT a time, unchanged since the last sync snapshot, keeps the time it was synced with;
 *   - a value WITHOUT a time that changed since the snapshot gets `snapshot.takenAt` — the only
 *     recorded moment it is known to be later than (a lower bound, not "now");
 *   - with no snapshot (first sync) it gets UNKNOWN_TIME (0): the oldest possible, so any recorded
 *     change elsewhere wins. Such fields are listed in `unknownTimes`.
 * The reading moment is never used as a modification time.
 */

/** The only storage operations the adapters may use. */
export interface ReadonlyStorageLike {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
}

/** The existing keys, exactly as the app writes them (not changed here). */
export const LOCAL_KEYS = {
  position: "mushaf:position",
  bookmarks: "mushaf:bookmarks",
  selectedReciter: "quran:selected-reciter",
  favoriteReciters: "quran:fav-reciters",
  journey: JOURNEY_KEY,
  services: "services.favorites",
  lang: "lang",
  themeMode: "theme-mode",
  themeModeLegacy: "theme",
  themeId: THEME_STORAGE_KEY,
} as const;

/** athkar.counts.<list>.<YYYY-MM-DD> (see src/lib/athkarProgress.ts). */
export const ATHKAR_KEY = /^athkar\.counts\.([a-z-]+)\.(\d{4}-\d{2}-\d{2})$/;

/** "No known time": older than any real change. */
export const UNKNOWN_TIME = 0;

export interface LocalReadContext {
  storage: ReadonlyStorageLike;
  /** State after the last successful sync on this device (null = never synced). */
  snapshot: LocalSnapshot | null;
  /** Used ONLY to select the Athkar days that are synced (last 7) — never as a modification time. */
  now: number;
}

export interface LocalReadResult {
  docs: SyncDocs;
  /** Fields whose time is unknown (no own time and no snapshot): they lose to any recorded change. */
  unknownTimes: string[];
  /** Keys that could not be read (corrupted JSON, storage error) — treated as empty, never thrown. */
  unreadable: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** getItem + JSON.parse that never throws; `bad` collects keys that exist but cannot be read. */
function readJson(s: ReadonlyStorageLike, key: string, bad: string[]): unknown {
  let raw: string | null;
  try {
    raw = s.getItem(key);
  } catch {
    bad.push(key);
    return undefined;
  }
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    bad.push(key);
    return undefined;
  }
}

function readText(s: ReadonlyStorageLike, key: string, bad: string[]): string | null {
  try {
    return s.getItem(key);
  } catch {
    bad.push(key);
    return null;
  }
}

/** Time for a value that carries none (see the rules above). */
function timeFor<T>(value: T, synced: { value: T; at: number } | undefined | null, snapshot: LocalSnapshot | null): number {
  if (!snapshot) return UNKNOWN_TIME;
  if (synced && synced.value === value) return synced.at;
  return snapshot.takenAt;
}

/* ---------------- quran.position (mushaf:position) ---------------- */

export function readQuranPosition(s: ReadonlyStorageLike, bad: string[] = []): QuranPositionDoc | null {
  const v = readJson(s, LOCAL_KEYS.position, bad);
  // The app's own default is { page: 1, surah: 1, at: 0 } = never opened -> no position.
  if (!isObj(v) || typeof v.at !== "number" || v.at <= 0) return null;
  return { page: v.page as number, surah: v.surah as number, at: v.at };
}

/* ---------------- quran.bookmarks (mushaf:bookmarks) ---------------- */

export function readQuranBookmarks(s: ReadonlyStorageLike, snapshot: LocalSnapshot | null, bad: string[] = []): QuranBookmarksDoc {
  const v = readJson(s, LOCAL_KEYS.bookmarks, bad);
  const items = (Array.isArray(v) ? v : [])
    .filter(isObj)
    .map((b) => ({ page: b.page as number, surah: b.surah as number, label: b.label as string, at: b.at as number }));
  const present = new Set(items.map((b) => b.page));
  // A page bookmarked at the last sync and missing now was removed after that sync.
  const deleted = snapshot
    ? snapshot.bookmarkPages.filter((p) => !present.has(p)).map((page) => ({ page, deletedAt: snapshot.takenAt }))
    : [];
  return { items, deleted };
}

/* ---------------- quran.reciters (quran:selected-reciter + quran:fav-reciters) ---------------- */

export function readQuranReciters(s: ReadonlyStorageLike, snapshot: LocalSnapshot | null, unknown: string[] = [], bad: string[] = []): QuranRecitersDoc {
  // The app falls back to a default reciter when the key is absent: that default is NOT a choice.
  const id = readText(s, LOCAL_KEYS.selectedReciter, bad);
  let selected: QuranRecitersDoc["selected"] = null;
  if (id) {
    const synced = snapshot?.selectedReciter ? { value: snapshot.selectedReciter.id, at: snapshot.selectedReciter.at } : null;
    selected = { id, at: timeFor(id, synced, snapshot) };
    if (!snapshot) unknown.push("quran.reciters.selected");
  }
  const fav = readJson(s, LOCAL_KEYS.favoriteReciters, bad);
  const favorites = Array.isArray(fav) ? fav.filter((x): x is string => typeof x === "string") : [];
  return { selected, favorites };
}

/* ---------------- journey (elite.journey.v1) ---------------- */

export function readJourney(s: ReadonlyStorageLike, bad: string[] = []) {
  const raw = readText(s, LOCAL_KEYS.journey, bad);
  // The Journey store's own validator (it already ignores corrupted parts).
  return parseJourney(raw);
}

/* ---------------- services.favorites ---------------- */

export function readServicesFavorites(s: ReadonlyStorageLike, snapshot: LocalSnapshot | null, unknown: string[] = [], bad: string[] = []): ServicesFavoritesDoc {
  const v = readJson(s, LOCAL_KEYS.services, bad);
  const ids = [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string"))];
  const syncedAt = new Map((snapshot?.serviceFavorites ?? []).map((f) => [f.id, f.at]));
  // seq = the item's position in the user's list (the order the app shows); no time is invented.
  const items = ids.map((id, seq) => ({ id, at: syncedAt.get(id) ?? (snapshot ? snapshot.takenAt : UNKNOWN_TIME), seq }));
  if (!snapshot && items.length) unknown.push("services.favorites");
  const present = new Set(ids);
  const deleted = snapshot
    ? snapshot.serviceFavorites.filter((f) => !present.has(f.id)).map((f) => ({ id: f.id, deletedAt: snapshot.takenAt }))
    : [];
  return { items, deleted };
}

/* ---------------- athkar.progress (athkar.counts.<list>.<day>) ---------------- */

export function readAthkarProgress(s: ReadonlyStorageLike, bad: string[] = []): AthkarProgressDoc {
  const days: AthkarProgressDoc["days"] = {};
  let n = 0;
  try {
    n = s.length;
  } catch {
    bad.push("athkar.counts.*");
  }
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    try {
      const k = s.key(i);
      if (k) keys.push(k);
    } catch {
      /* skip */
    }
  }
  for (const key of keys.sort()) {
    const m = ATHKAR_KEY.exec(key);
    if (!m || !isAthkarListKey(m[1])) continue;
    const v = readJson(s, key, bad);
    if (!Array.isArray(v) || v.length !== ATHKAR_LISTS[m[1]].items.length) continue;
    (days[m[2]] ??= {})[m[1]] = v as number[];
  }
  return { days };
}

/* ---------------- prefs.app (lang, theme-mode / theme, elite.theme.id.v1) ---------------- */

export function readAppPrefs(s: ReadonlyStorageLike, snapshot: LocalSnapshot | null, unknown: string[] = [], bad: string[] = []): AppPrefsDoc {
  const out: AppPrefsDoc = {};
  const lang = readText(s, LOCAL_KEYS.lang, bad);
  if (lang === "ar" || lang === "en") {
    out.lang = { value: lang, at: timeFor(lang, snapshot?.prefs.lang, snapshot) };
    if (!snapshot) unknown.push("prefs.app.lang");
  }
  // Same resolution as ThemeContext: "theme-mode", else the legacy "theme" (light/night only).
  const modeRaw = readText(s, LOCAL_KEYS.themeMode, bad);
  const legacy = readText(s, LOCAL_KEYS.themeModeLegacy, bad);
  const mode: ThemeModePref | null =
    modeRaw === "system" || modeRaw === "night" || modeRaw === "light" ? modeRaw
    : legacy === "light" || legacy === "night" ? legacy
    : null;
  if (mode) {
    out.themeMode = { value: mode, at: timeFor(mode, snapshot?.prefs.themeMode, snapshot) };
    if (!snapshot) unknown.push("prefs.app.themeMode");
  }
  const themeId = readText(s, LOCAL_KEYS.themeId, bad);
  if (themeId && THEMES.some((t) => t.id === themeId)) {
    out.themeId = { value: themeId, at: timeFor(themeId, snapshot?.prefs.themeId, snapshot) };
    if (!snapshot) unknown.push("prefs.app.themeId");
  }
  return out;
}

/* ---------------- everything ---------------- */

/** Reads all seven documents. Never writes, never throws on bad data; output is canonical Phase 2 documents. */
export function readLocalDocs({ storage, snapshot, now }: LocalReadContext): LocalReadResult {
  const unknownTimes: string[] = [];
  const unreadable: string[] = [];
  const raw: Record<SyncDocName, unknown> = {
    "quran.position": readQuranPosition(storage, unreadable),
    "quran.bookmarks": readQuranBookmarks(storage, snapshot, unreadable),
    "quran.reciters": readQuranReciters(storage, snapshot, unknownTimes, unreadable),
    journey: readJourney(storage, unreadable),
    "services.favorites": readServicesFavorites(storage, snapshot, unknownTimes, unreadable),
    "athkar.progress": readAthkarProgress(storage, unreadable),
    "prefs.app": readAppPrefs(storage, snapshot, unknownTimes, unreadable),
  };
  const docs = {} as Record<SyncDocName, unknown>;
  for (const name of SYNC_DOCS) docs[name] = normalizeDoc(name, raw[name], { now });
  return { docs: docs as SyncDocs, unknownTimes, unreadable: [...new Set(unreadable)] };
}

/** A snapshot of `docs` as they are right after a successful sync (pure; storing it is a later phase). */
export function buildSnapshot(docs: SyncDocs, takenAt: number, owner: string | null): LocalSnapshot {
  return {
    version: 1,
    takenAt,
    owner,
    bookmarkPages: docs["quran.bookmarks"].items.map((b) => b.page),
    serviceFavorites: docs["services.favorites"].items.map((f) => ({ id: f.id, at: f.at })),
    selectedReciter: docs["quran.reciters"].selected,
    prefs: docs["prefs.app"],
  };
}
