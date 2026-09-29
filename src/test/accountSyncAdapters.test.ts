import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ATHKAR_LISTS, saveAthkarCounts } from "@/lib/athkarProgress";
import { savePosition, toggleBookmark } from "@/lib/mushaf";
import { setSelectedReciterId, toggleFavorite } from "@/lib/reciters";
import { recordActivity } from "@/lib/journey/store";
import {
  LOCAL_KEYS,
  UNKNOWN_TIME,
  buildSnapshot,
  readAppPrefs,
  readAthkarProgress,
  readJourney,
  readLocalDocs,
  readQuranBookmarks,
  readQuranPosition,
  readQuranReciters,
  readServicesFavorites,
} from "@/lib/accountSync/localAdapters";
import { hasAnyData, normalizeDoc, stableStringify } from "@/lib/accountSync/merge";
import { mergeIntoAccount } from "@/lib/accountSync/owner";
import { parseSnapshot, type LocalSnapshot } from "@/lib/accountSync/snapshot";
import { SYNC_DOCS, type RawSyncDocs } from "@/lib/accountSync/types";

const NOW = new Date(2026, 8, 28, 12, 0).getTime();
const T_WRITE = new Date(2026, 8, 28, 9, 30).getTime();
const read = (snapshot: LocalSnapshot | null = null, now = NOW) => readLocalDocs({ storage: localStorage, snapshot, now });
const dump = () => {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; out[k] = localStorage.getItem(k); }
  return JSON.stringify(Object.entries(out).sort());
};
const ones = (list: keyof typeof ATHKAR_LISTS) => ATHKAR_LISTS[list].items.map(() => 1);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T_WRITE);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Fills localStorage exactly the way the app does (its own functions / its own formats). */
function fillLikeTheApp() {
  savePosition(42); // mushaf:position {page 42, surah 2, at T_WRITE}
  toggleBookmark(10);
  vi.setSystemTime(T_WRITE + 1000);
  toggleBookmark(50);
  setSelectedReciterId("sudais");
  toggleFavorite("maher");
  toggleFavorite("afasy");
  recordActivity({ id: "quran:mushaf", type: "quran", title: { ar: "المصحف", en: "Mushaf" }, route: "/mushaf" }, T_WRITE);
  saveAthkarCounts("morning", ones("morning"), new Date(2026, 8, 28));
  saveAthkarCounts("evening", ones("evening"), new Date(2026, 8, 20)); // 8 days ago: outside the synced window
  localStorage.setItem("services.favorites", JSON.stringify(["qibla", "quran", "athkar"]));
  localStorage.setItem("lang", "ar");
  localStorage.setItem("theme-mode", "night");
  localStorage.setItem("elite.theme.id.v1", "makkah");
}

describe("read-only guarantee", () => {
  it("never writes, removes or clears anything, and leaves every key byte-identical", () => {
    fillLikeTheApp();
    localStorage.setItem("mushaf:bookmarks", "{corrupted");
    const before = dump();
    const setItem = vi.spyOn(localStorage, "setItem");
    const removeItem = vi.spyOn(localStorage, "removeItem");
    const clear = vi.spyOn(localStorage, "clear");
    read();
    read({ version: 1, takenAt: T_WRITE - 5000, owner: null, bookmarkPages: [10, 77], serviceFavorites: [], selectedReciter: null, prefs: {} });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(dump()).toBe(before);
  });
});

describe("empty storage", () => {
  it("gives seven empty documents, nothing unknown, nothing unreadable", () => {
    const r = read();
    expect(Object.keys(r.docs).sort()).toEqual([...SYNC_DOCS].sort());
    expect(hasAnyData(r.docs)).toBe(false);
    expect(r.unknownTimes).toEqual([]);
    expect(r.unreadable).toEqual([]);
  });
  it("does not treat the app's defaults as user data (default reciter, position page 1 at 0, system theme)", () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 1, surah: 1, at: 0 }));
    const r = read();
    expect(r.docs["quran.position"]).toBeNull();
    expect(r.docs["quran.reciters"].selected).toBeNull();
    expect(r.docs["prefs.app"]).toEqual({});
  });
});

describe("valid data written by the app itself", () => {
  it("maps every source key to its document", () => {
    fillLikeTheApp();
    const { docs } = read();
    expect(docs["quran.position"]).toEqual({ page: 42, surah: 2, at: T_WRITE });
    expect(docs["quran.bookmarks"].items.map((b) => [b.page, b.at])).toEqual([[10, T_WRITE], [50, T_WRITE + 1000]]);
    expect(docs["quran.bookmarks"].deleted).toEqual([]);
    expect(docs["quran.reciters"]).toEqual({ selected: { id: "sudais", at: UNKNOWN_TIME }, favorites: ["afasy", "maher"] });
    expect(docs.journey.activities.map((a) => a.id)).toEqual(["quran:mushaf"]);
    expect(docs["services.favorites"].items.map((f) => f.id).sort()).toEqual(["athkar", "qibla", "quran"]);
    expect(Object.keys(docs["athkar.progress"].days)).toEqual(["2026-09-28"]);
    expect(docs["athkar.progress"].days["2026-09-28"].morning).toEqual(ones("morning"));
    expect(docs["prefs.app"]).toEqual({
      lang: { value: "ar", at: UNKNOWN_TIME },
      themeMode: { value: "night", at: UNKNOWN_TIME },
      themeId: { value: "makkah", at: UNKNOWN_TIME },
    });
  });
  it("keeps only the times stored in the data; the reading moment is never used", () => {
    fillLikeTheApp();
    const a = read(null, NOW);
    const b = read(null, NOW + 3 * 60 * 60 * 1000);
    expect(stableStringify(a.docs)).toBe(stableStringify(b.docs));
    expect(stableStringify(a.docs)).not.toContain(String(NOW));
  });
  it("lists every field whose time is unknown (no own time, no snapshot)", () => {
    fillLikeTheApp();
    expect(read().unknownTimes.sort()).toEqual(
      ["prefs.app.lang", "prefs.app.themeId", "prefs.app.themeMode", "quran.reciters.selected", "services.favorites"].sort(),
    );
  });
});

describe("services.favorites keeps the user's order", () => {
  it('["qibla","quran","athkar"] stays in that order after the adapter (seq 0,1,2; no invented time)', () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", "quran", "athkar"]));
    const { docs } = read();
    expect(docs["services.favorites"].items).toEqual([
      { id: "qibla", at: UNKNOWN_TIME, seq: 0 },
      { id: "quran", at: UNKNOWN_TIME, seq: 1 },
      { id: "athkar", at: UNKNOWN_TIME, seq: 2 },
    ]);
  });
  it("duplicates in storage keep the first place only", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["quran", "qibla", "quran"]));
    expect(read().docs["services.favorites"].items.map((f) => [f.id, f.seq])).toEqual([["quran", 0], ["qibla", 1]]);
  });
  it("the order survives the guest -> account merge unchanged", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat", "athkar", "quran"]));
    const r = mergeIntoAccount({ userId: "u1", localOwner: null, local: read().docs as unknown as RawSyncDocs, remote: {}, ctx: { now: NOW } });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.docs["services.favorites"].items.map((f) => f.id)).toEqual(["zakat", "athkar", "quran"]);
  });
});

describe("partial, corrupted and unexpected data", () => {
  it("corrupted JSON in every JSON key: empty documents, keys reported, no throw", () => {
    for (const k of ["mushaf:position", "mushaf:bookmarks", "quran:fav-reciters", "elite.journey.v1", "services.favorites", "athkar.counts.morning.2026-09-28"]) {
      localStorage.setItem(k, "{not json");
    }
    const r = read();
    expect(hasAnyData(r.docs)).toBe(false);
    expect(r.unreadable.sort()).toEqual(["athkar.counts.morning.2026-09-28", "mushaf:bookmarks", "mushaf:position", "quran:fav-reciters", "services.favorites"].sort());
    // The Journey store's own parser swallows its corrupted value (it reports nothing, and holds nothing).
    expect(r.docs.journey.activities).toEqual([]);
  });
  it("partial / invalid entries are dropped one by one, valid ones kept", () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 42, surah: 2 })); // no time -> unknown -> not synced
    localStorage.setItem("mushaf:bookmarks", JSON.stringify([{ page: 3, surah: 1, label: "الفاتحة", at: 5 }, { page: 999, surah: 1, label: "x", at: 5 }, "junk", null]));
    localStorage.setItem("quran:fav-reciters", JSON.stringify(["afasy", 7, null, "NOT VALID"]));
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", 3, { id: "x" }, "qibla"]));
    const { docs } = read();
    expect(docs["quran.position"]).toBeNull();
    expect(docs["quran.bookmarks"].items.map((b) => b.page)).toEqual([3]);
    expect(docs["quran.reciters"].favorites).toEqual(["afasy"]);
    expect(docs["services.favorites"].items.map((f) => f.id)).toEqual(["qibla"]);
  });
  it("wrong shapes for whole keys (object instead of array, array instead of object)", () => {
    localStorage.setItem("mushaf:bookmarks", JSON.stringify({ page: 3 }));
    localStorage.setItem("services.favorites", JSON.stringify({ qibla: true }));
    localStorage.setItem("mushaf:position", JSON.stringify([42]));
    const { docs } = read();
    expect(docs["quran.bookmarks"].items).toEqual([]);
    expect(docs["services.favorites"].items).toEqual([]);
    expect(docs["quran.position"]).toBeNull();
  });
  it("old / unexpected values: legacy theme key, unknown theme, odd language, foreign athkar keys", () => {
    localStorage.setItem("theme", "light"); // legacy key, read like ThemeContext does
    localStorage.setItem("elite.theme.id.v1", "neon"); // not a theme of this app
    localStorage.setItem("lang", "fr");
    localStorage.setItem("athkar.counts.morning.2026-09-28", JSON.stringify([1, 2])); // wrong length
    localStorage.setItem("athkar.counts.unknownlist.2026-09-28", JSON.stringify(ones("morning")));
    localStorage.setItem("athkar.counts.evening.not-a-date", JSON.stringify(ones("evening")));
    localStorage.setItem("athkar.counts.evening.2026-09-27", JSON.stringify(ones("evening").map(() => 999)));
    const { docs } = read();
    expect(docs["prefs.app"]).toEqual({ themeMode: { value: "light", at: UNKNOWN_TIME } });
    expect(Object.keys(docs["athkar.progress"].days)).toEqual(["2026-09-27"]);
    expect(docs["athkar.progress"].days["2026-09-27"].evening).toEqual(ATHKAR_LISTS.evening.items.map((it) => it.count));
  });
  it("a storage that throws on access is reported, not fatal", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, key: () => { throw new Error("blocked"); }, get length(): number { throw new Error("blocked"); } };
    const r = readLocalDocs({ storage: broken, snapshot: null, now: NOW });
    expect(hasAnyData(r.docs)).toBe(false);
    expect(r.unreadable.length).toBeGreaterThan(0);
  });
});

describe("snapshot-based change detection (no invented times)", () => {
  const TAKEN = T_WRITE - 60_000;
  const snap = (p: Partial<LocalSnapshot> = {}): LocalSnapshot => ({
    version: 1, takenAt: TAKEN, owner: "u1", bookmarkPages: [], serviceFavorites: [], selectedReciter: null, prefs: {}, ...p,
  });

  it("a bookmark present at the last sync and gone now becomes a deletion at snapshot.takenAt", () => {
    toggleBookmark(10);
    const r = readQuranBookmarks(localStorage, snap({ bookmarkPages: [10, 77] }));
    expect(r.deleted).toEqual([{ page: 77, deletedAt: TAKEN }]);
    expect(r.items.map((b) => b.page)).toEqual([10]);
  });
  it("services favorites: kept ones keep their synced time, new ones get takenAt, removed ones become deletions", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["quran", "athkar"]));
    const r = readServicesFavorites(localStorage, snap({ serviceFavorites: [{ id: "quran", at: 111 }, { id: "qibla", at: 222 }] }));
    expect(r.items).toEqual([{ id: "quran", at: 111, seq: 0 }, { id: "athkar", at: TAKEN, seq: 1 }]);
    expect(r.deleted).toEqual([{ id: "qibla", deletedAt: TAKEN }]);
  });
  it("selected reciter / preferences: unchanged -> synced time; changed -> takenAt; never 'now'", () => {
    setSelectedReciterId("maher");
    localStorage.setItem("lang", "ar");
    localStorage.setItem("theme-mode", "light");
    const s = snap({ selectedReciter: { id: "maher", at: 333 }, prefs: { lang: { value: "ar", at: 444 }, themeMode: { value: "night", at: 555 } } });
    expect(readQuranReciters(localStorage, s).selected).toEqual({ id: "maher", at: 333 });
    const prefs = readAppPrefs(localStorage, s);
    expect(prefs.lang).toEqual({ value: "ar", at: 444 });
    expect(prefs.themeMode).toEqual({ value: "light", at: TAKEN });
    expect(read(s).unknownTimes).toEqual([]);
  });
  it("without a snapshot there are no deletions at all (nothing to compare with)", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["quran"]));
    expect(readServicesFavorites(localStorage, null).deleted).toEqual([]);
    expect(readQuranBookmarks(localStorage, null).deleted).toEqual([]);
  });
  it("buildSnapshot -> parseSnapshot round-trips, and garbage snapshots are ignored", () => {
    fillLikeTheApp();
    const s = buildSnapshot(read().docs, TAKEN, "u1");
    expect(parseSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(s.bookmarkPages).toEqual([10, 50]);
    for (const bad of [null, "x", { version: 2 }, { version: 1, takenAt: 0 }, { version: 1, takenAt: "soon" }]) expect(parseSnapshot(bad)).toBeNull();
  });
  it("after a sync, reading again with that snapshot gives the same documents (no false changes)", () => {
    fillLikeTheApp();
    const first = read().docs;
    const s = buildSnapshot(first, TAKEN, "u1");
    const again = read(s).docs;
    expect(again["quran.bookmarks"]).toEqual(first["quran.bookmarks"]);
    expect(again["services.favorites"].deleted).toEqual([]);
  });
});

describe("output matches the Phase 2 types", () => {
  it("every document is already canonical (normalising it changes nothing)", () => {
    fillLikeTheApp();
    const { docs } = read();
    for (const name of SYNC_DOCS) expect(stableStringify(normalizeDoc(name, docs[name], { now: NOW })), name).toBe(stableStringify(docs[name]));
  });
  it("individual adapters agree with the combined reader", () => {
    fillLikeTheApp();
    const { docs } = read();
    expect(readQuranPosition(localStorage)).toEqual(docs["quran.position"]);
    expect(readJourney(localStorage)).toEqual(docs.journey);
    expect(Object.keys(readAthkarProgress(localStorage).days).sort()).toEqual(["2026-09-20", "2026-09-28"]); // raw reader keeps all days;
    expect(Object.keys(docs["athkar.progress"].days)).toEqual(["2026-09-28"]); // the synced doc keeps the last 7
  });
  it("the result feeds the Phase 2 guest -> account merge directly", () => {
    fillLikeTheApp();
    const { docs } = read();
    const r = mergeIntoAccount({ userId: "u1", localOwner: null, local: docs as unknown as RawSyncDocs, remote: {}, ctx: { now: NOW } });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.writeLocal).toEqual([]);
  });
  it("uses the app's existing keys, unchanged", () => {
    expect(LOCAL_KEYS).toEqual({
      position: "mushaf:position", bookmarks: "mushaf:bookmarks", selectedReciter: "quran:selected-reciter",
      favoriteReciters: "quran:fav-reciters", journey: "elite.journey.v1", services: "services.favorites",
      lang: "lang", themeMode: "theme-mode", themeModeLegacy: "theme", themeId: "elite.theme.id.v1",
    });
  });
});
