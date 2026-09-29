import type { AthkarListKey } from "@/lib/athkarProgress";
import type { JourneyState } from "@/lib/journey/types";

/**
 * Cloud-sync document shapes (schema version 1). One document per domain — the same names as the
 * `user_sync_docs.doc` CHECK list in backend-v2 (migration 20260927000200). Everything here is plain
 * data: the merge engine never reads storage or talks to a server.
 */
export const SYNC_DOCS = [
  "quran.position",
  "quran.bookmarks",
  "quran.reciters",
  "journey",
  "services.favorites",
  "athkar.progress",
  "prefs.app",
] as const;
export type SyncDocName = (typeof SYNC_DOCS)[number];

export const SYNC_SCHEMA_VERSION = 1;

/** Last Mushaf position (same shape as `mushaf:position`). null = never opened. */
export interface QuranPositionDoc {
  page: number;
  surah: number;
  at: number;
}

export interface BookmarkEntry {
  page: number;
  surah: number;
  label: string;
  /** When the page was (last) bookmarked. */
  at: number;
}

/** Page bookmarks + deletions, so a removal on one device is not undone by another. */
export interface QuranBookmarksDoc {
  items: BookmarkEntry[];
  deleted: { page: number; deletedAt: number }[];
}

export interface QuranRecitersDoc {
  selected: { id: string; at: number } | null;
  favorites: string[];
}

export type JourneyDoc = JourneyState;

export interface ServiceFavoriteItem {
  id: string;
  /** When it was (last) favorited — used only against deletions. UNKNOWN (0) when not recorded. */
  at: number;
  /**
   * Position in the user's list (0 = first), taken from the order of `services.favorites`.
   * The order of favorites is decided by `seq` only — never by `at` or by name.
   */
  seq: number;
}

/** Favorite services in the user's order (`seq`) + deletions. */
export interface ServicesFavoritesDoc {
  items: ServiceFavoriteItem[];
  deleted: { id: string; deletedAt: number }[];
}

/** Athkar tallies per local day ("YYYY-MM-DD") and list. */
export interface AthkarProgressDoc {
  days: Record<string, Partial<Record<AthkarListKey, number[]>>>;
}

export interface PrefField<T> {
  value: T;
  at: number;
}

export type ThemeModePref = "system" | "night" | "light";

/** Each preference is merged on its own (latest `at` wins per field). */
export interface AppPrefsDoc {
  lang?: PrefField<"ar" | "en">;
  themeMode?: PrefField<ThemeModePref>;
  themeId?: PrefField<string>;
}

export interface SyncDocMap {
  "quran.position": QuranPositionDoc | null;
  "quran.bookmarks": QuranBookmarksDoc;
  "quran.reciters": QuranRecitersDoc;
  journey: JourneyDoc;
  "services.favorites": ServicesFavoritesDoc;
  "athkar.progress": AthkarProgressDoc;
  "prefs.app": AppPrefsDoc;
}

export type SyncDocs = { [K in SyncDocName]: SyncDocMap[K] };

/** Input documents may be missing or malformed (old app versions, corrupted storage). */
export type RawSyncDocs = Partial<Record<SyncDocName, unknown>>;

export interface MergeContext {
  /** "Now" in ms — passed in so every merge is deterministic and testable. */
  now: number;
}
