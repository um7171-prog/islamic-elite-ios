import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ATHKAR_LISTS, loadAthkarCounts, saveAthkarCounts } from "@/lib/athkarProgress";
import { loadBookmarks, loadPosition, toggleBookmark } from "@/lib/mushaf";
import { getFavorites, getSelectedReciterId, setSelectedReciterId, toggleFavorite } from "@/lib/reciters";
import { getJourneyState, recordActivity } from "@/lib/journey/store";
import { createMemoryAuthStorage } from "@/lib/account/authStorage";
import { LEGACY_PROJECT_REF } from "@/lib/account/config";
import { LOCAL_KEYS, readLocalDocs } from "@/lib/accountSync/localAdapters";
import { applyLocalDocs, createLocalDataPort } from "@/lib/accountSync/localApply";
import { createSyncEngine } from "@/lib/accountSync/syncEngine";
import { createSyncStateStore } from "@/lib/accountSync/syncState";
import type { ServerDoc, SyncServer } from "@/lib/accountSync/syncServer";
import { SYNC_SCHEMA_VERSION, type SyncDocName } from "@/lib/accountSync/types";

const NOW = new Date(2026, 8, 28, 12, 0).getTime();
const ctx = { now: NOW };
const USER = "11111111-1111-1111-1111-111111111111";
const apply = (docs: Record<string, unknown>) => applyLocalDocs(docs, ctx);
const allEntries = () => {
  const out: [string, string | null][] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; out.push([k, localStorage.getItem(k)]); }
  return out.sort();
};
const dump = () => JSON.stringify(allEntries());
const favs = (...ids: string[]) => ({ items: ids.map((id, seq) => ({ id, at: 0, seq })), deleted: [] });
const ones = (list: keyof typeof ATHKAR_LISTS) => ATHKAR_LISTS[list].items.map(() => 1);
const today = new Date(2026, 8, 28);

/** Every key the apply layer may ever write: the app's existing keys. */
const EXISTING_KEY = new RegExp(
  `^(${[LOCAL_KEYS.position, LOCAL_KEYS.bookmarks, LOCAL_KEYS.selectedReciter, LOCAL_KEYS.favoriteReciters, LOCAL_KEYS.journey, LOCAL_KEYS.services, LOCAL_KEYS.lang, LOCAL_KEYS.themeMode, LOCAL_KEYS.themeId]
    .map((k) => k.replace(/\./g, "\\.")).join("|")}|athkar\\.counts\\.(morning|evening|sleep|post-prayer)\\.\\d{4}-\\d{2}-\\d{2})$`,
);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ---------------- each domain ---------------- */

describe("quran.position -> mushaf:position", () => {
  it("writes the app's shape {page, surah, at} with the merged time (not 'now'), read back by loadPosition", () => {
    const r = apply({ "quran.position": { page: 42, surah: 2, at: 12345 } });
    expect(r.written).toEqual(["mushaf:position"]);
    expect(JSON.parse(localStorage.getItem("mushaf:position")!)).toEqual({ page: 42, surah: 2, at: 12345 });
    expect(loadPosition()).toMatchObject({ page: 42, surah: 2, at: 12345 });
  });
  it("never moves back to an older position", () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 300, surah: 20, at: 900 }));
    expect(apply({ "quran.position": { page: 42, surah: 2, at: 100 } }).written).toEqual([]);
    expect(loadPosition().page).toBe(300);
  });
});

describe("quran.bookmarks -> mushaf:bookmarks", () => {
  it("writes the union in the app's MushafBookmark shape, sorted by page; deletions only via the document", () => {
    toggleBookmark(10);
    toggleBookmark(77);
    const r = apply({ "quran.bookmarks": { items: [{ page: 5, surah: 1, label: "الفاتحة", at: 1 }, { page: 10, surah: 2, label: "البقرة", at: 1 }], deleted: [{ page: 77, deletedAt: NOW - 1000 }] } });
    expect(r.written).toEqual(["mushaf:bookmarks"]);
    expect(loadBookmarks().map((b) => b.page)).toEqual([5, 10]);
    expect(Object.keys(loadBookmarks()[0]).sort()).toEqual(["at", "label", "page", "surah"]);
  });
});

describe("quran.reciters -> quran:selected-reciter + quran:fav-reciters", () => {
  it("selected through setSelectedReciterId; favorites are a union (none lost)", () => {
    toggleFavorite("maher");
    const r = apply({ "quran.reciters": { selected: { id: "sudais", at: 5 }, favorites: ["afasy"] } });
    expect(r.written.sort()).toEqual(["quran:fav-reciters", "quran:selected-reciter"]);
    expect(getSelectedReciterId()).toBe("sudais");
    expect(getFavorites().sort()).toEqual(["afasy", "maher"]);
  });
  it("a document without a selected reciter never clears the device's choice", () => {
    setSelectedReciterId("husary");
    apply({ "quran.reciters": { selected: null, favorites: ["afasy"] } });
    expect(getSelectedReciterId()).toBe("husary");
  });
});

describe("journey -> elite.journey.v1 (writeJourney)", () => {
  it("writes through the Journey store (union by id) and the store sees it immediately", () => {
    recordActivity({ id: "local-a", type: "dhikr", title: { ar: "a", en: "a" }, route: "/athkar" }, NOW - 5000);
    const incoming = { version: 1, activities: [{ id: "remote-b", type: "quran", title: { ar: "b", en: "b" }, route: "/mushaf", progress: 0.2, status: "active", startedAt: 1, updatedAt: NOW - 1000, completedAt: null, expiresAt: null, metadata: {} }], sessions: [], cursors: { names: 9 } };
    const r = apply({ journey: incoming });
    expect(r.written).toEqual(["elite.journey.v1"]);
    const st = getJourneyState();
    expect(st.activities.map((a) => a.id)).toEqual(["remote-b", "local-a"]);
    expect(st.cursors.names).toBe(9);
  });
});

describe("services.favorites -> services.favorites", () => {
  it("keeps the document's order (seq) and the device's extra favorites after it", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["tasbeeh"]));
    apply({ "services.favorites": favs("qibla", "quran", "athkar") });
    expect(JSON.parse(localStorage.getItem("services.favorites")!)).toEqual(["qibla", "quran", "athkar", "tasbeeh"]);
  });
  it("a deletion in the document removes only that favorite", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", "zakat"]));
    apply({ "services.favorites": { items: [{ id: "qibla", at: 0, seq: 0 }], deleted: [{ id: "zakat", deletedAt: NOW - 10 }] } });
    expect(JSON.parse(localStorage.getItem("services.favorites")!)).toEqual(["qibla"]);
  });
});

describe("athkar.progress -> athkar.counts.<list>.<day> (saveAthkarCounts)", () => {
  it("per dhikr max(device, document): counts never go down", () => {
    const dev = ATHKAR_LISTS.morning.items.map(() => 0); dev[0] = 1; dev[1] = 3;
    saveAthkarCounts("morning", dev, today);
    const incoming = ATHKAR_LISTS.morning.items.map(() => 0); incoming[1] = 1; incoming[2] = 1;
    const r = apply({ "athkar.progress": { days: { "2026-09-28": { morning: incoming } } } });
    expect(r.written).toEqual(["athkar.counts.morning.2026-09-28"]);
    const want = ATHKAR_LISTS.morning.items.map(() => 0); want[0] = 1; want[1] = 3; want[2] = 1;
    expect(loadAthkarCounts("morning", today)).toEqual(want);
  });
});

describe("prefs.app -> lang / theme-mode / elite.theme.id.v1", () => {
  it("writes only the fields present, as the plain strings the contexts store; legacy 'theme' untouched", () => {
    localStorage.setItem("theme", "night");
    localStorage.setItem("lang", "ar");
    const r = apply({ "prefs.app": { lang: { value: "en", at: 1 }, themeId: { value: "makkah", at: 1 } } });
    expect(r.written.sort()).toEqual(["elite.theme.id.v1", "lang"]);
    expect(localStorage.getItem("lang")).toBe("en");
    expect(localStorage.getItem("elite.theme.id.v1")).toBe("makkah");
    expect(localStorage.getItem("theme-mode")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("night");
  });
  it("an unknown theme id is not written", () => {
    expect(apply({ "prefs.app": { themeId: { value: "neon", at: 1 } } }).written).toEqual([]);
  });
});

/* ---------------- safety ---------------- */

function fillDevice() {
  localStorage.setItem("mushaf:position", JSON.stringify({ page: 42, surah: 2, at: 500 }));
  toggleBookmark(10);
  setSelectedReciterId("maher");
  toggleFavorite("maher");
  recordActivity({ id: "quran:mushaf", type: "quran", title: { ar: "م", en: "m" }, route: "/mushaf" }, NOW - 100);
  localStorage.setItem("services.favorites", JSON.stringify(["qibla", "quran"]));
  saveAthkarCounts("evening", ones("evening"), today);
  localStorage.setItem("lang", "ar");
}

describe("safety", () => {
  it("empty documents never wipe the device (every domain)", () => {
    fillDevice();
    const before = dump();
    const r = apply({
      "quran.position": null, "quran.bookmarks": { items: [], deleted: [] }, "quran.reciters": { selected: null, favorites: [] },
      journey: { version: 1, activities: [], sessions: [], cursors: {} }, "services.favorites": { items: [], deleted: [] },
      "athkar.progress": { days: {} }, "prefs.app": {},
    });
    expect(r.written).toEqual([]);
    expect(dump()).toBe(before);
  });
  it("malformed documents cause no data loss", () => {
    fillDevice();
    const before = dump();
    apply({ "quran.position": "garbage", "quran.bookmarks": { items: "x" }, journey: { version: 7 }, "services.favorites": [1, 2], "athkar.progress": { days: { nope: 1 } }, "prefs.app": { lang: { value: "fr" } }, "quran.reciters": 42 });
    expect(dump()).toBe(before);
  });
  it("unknown documents are ignored and write nothing", () => {
    fillDevice();
    const before = dump();
    const r = apply({ "notifications.prayer": { enabled: false }, "location": { city: "x" } });
    expect(r.ignored.sort()).toEqual(["location", "notifications.prayer"]);
    expect(dump()).toBe(before);
  });
  it("applying the same documents twice changes nothing the second time (and writes nothing)", () => {
    fillDevice();
    const docs = readLocalDocs({ storage: localStorage, snapshot: null, now: NOW }).docs;
    const incoming = { ...docs, "services.favorites": favs("athkar", "qibla"), "quran.position": { page: 100, surah: 5, at: 999 } };
    apply(incoming);
    const after = dump();
    const setItem = vi.spyOn(localStorage, "setItem");
    const second = apply(incoming);
    expect(second.written).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(dump()).toBe(after);
  });
  it("documents equal to the device's data write nothing", () => {
    fillDevice();
    const docs = readLocalDocs({ storage: localStorage, snapshot: null, now: NOW }).docs;
    const setItem = vi.spyOn(localStorage, "setItem");
    expect(apply(docs as unknown as Record<string, unknown>).written).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
  });
  it("only the final merged value is written (one write per changed key)", () => {
    fillDevice();
    const setItem = vi.spyOn(localStorage, "setItem");
    apply({ "services.favorites": favs("athkar", "qibla", "quran") });
    expect(setItem.mock.calls.map((c) => c[0])).toEqual(["services.favorites"]);
  });
  it("only the documents given are touched", () => {
    fillDevice();
    const before = new Map(allEntries());
    apply({ "quran.position": { page: 7, surah: 2, at: 9999 } });
    for (const [k, v] of allEntries()) if (k !== "mushaf:position") expect(v, k).toBe(before.get(k));
  });
  it("no new key is ever created: every written key is one of the app's existing keys", () => {
    apply({
      "quran.position": { page: 7, surah: 2, at: 9 }, "quran.bookmarks": { items: [{ page: 3, surah: 1, label: "x", at: 1 }], deleted: [] },
      "quran.reciters": { selected: { id: "afasy", at: 1 }, favorites: ["afasy"] },
      journey: { version: 1, activities: [], sessions: [], cursors: { names: 3 } }, "services.favorites": favs("quran"),
      "athkar.progress": { days: { "2026-09-27": { sleep: ones("sleep") } } },
      "prefs.app": { lang: { value: "en", at: 1 }, themeMode: { value: "light", at: 1 }, themeId: { value: "layl", at: 1 } },
    });
    const keys = allEntries().map(([k]) => k);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k, k).toMatch(EXISTING_KEY);
  });
});

/* ---------------- adapters = the app's real keys ---------------- */

describe("the adapters use the app's real keys", () => {
  it("each LOCAL_KEYS entry is the key the app's own code reads/writes", () => {
    const src = (f: string) => readFileSync(f, "utf8");
    expect(src("src/lib/mushaf.ts")).toContain(`"${LOCAL_KEYS.position}"`);
    expect(src("src/lib/mushaf.ts")).toContain(`"${LOCAL_KEYS.bookmarks}"`);
    expect(src("src/lib/reciters.ts")).toContain(`"${LOCAL_KEYS.selectedReciter}"`);
    expect(src("src/lib/reciters.ts")).toContain(`"${LOCAL_KEYS.favoriteReciters}"`);
    expect(src("src/lib/journey/store.ts")).toContain(`"${LOCAL_KEYS.journey}"`);
    expect(src("src/components/services/ServicesHub.tsx")).toContain(`"${LOCAL_KEYS.services}"`);
    expect(src("src/contexts/LocaleContext.tsx")).toContain(`"${LOCAL_KEYS.lang}"`);
    expect(src("src/contexts/ThemeContext.tsx")).toContain(`"${LOCAL_KEYS.themeMode}"`);
    expect(src("src/contexts/ThemeContext.tsx")).toContain(`"${LOCAL_KEYS.themeModeLegacy}"`);
    expect(src("src/lib/themes.ts")).toContain(`"${LOCAL_KEYS.themeId}"`);
    expect(src("src/lib/athkarProgress.ts")).toContain("athkar.counts.${list}.${localDayKey(d)}");
  });
});

/* ---------------- with the Sync Engine ---------------- */

function fakeServer(initial: Partial<Record<SyncDocName, ServerDoc>> = {}) {
  const db = new Map<SyncDocName, ServerDoc>(Object.entries(initial) as [SyncDocName, ServerDoc][]);
  let puts = 0;
  const server: SyncServer = {
    async pullAll() { return { ok: true, docs: Object.fromEntries([...db].map(([k, v]) => [k, structuredClone(v)])) }; },
    async put(doc, data, schemaVersion, expected) {
      puts++;
      const cur = db.get(doc);
      if (expected === 0 ? !!cur : !cur || cur.rev !== expected) return { ok: true, status: "conflict", server: cur ? structuredClone(cur) : null };
      const rev = (cur?.rev ?? 0) + 1;
      db.set(doc, { rev, schemaVersion, data: structuredClone(data) });
      return { ok: true, status: "ok", rev };
    },
  };
  return { server, db, puts: () => puts };
}

describe("end to end with the Sync Engine (real adapters + this layer)", () => {
  it("the engine writes nothing itself; data lands in the app's keys; a second sync is a no-op", async () => {
    fillDevice();
    const srv = fakeServer({
      "services.favorites": { rev: 2, schemaVersion: SYNC_SCHEMA_VERSION, data: favs("athkar", "qibla") },
      "quran.position": { rev: 1, schemaVersion: SYNC_SCHEMA_VERSION, data: { page: 300, surah: 20, at: 9000 } },
    });
    const engine = createSyncEngine({
      account: { getCurrentUser: async () => ({ id: USER }) },
      server: srv.server,
      local: createLocalDataPort(() => NOW),
      state: createSyncStateStore(createMemoryAuthStorage()),
      now: () => NOW,
    });
    const first = await engine.syncNow({ claimGuestData: true });
    expect(first).toMatchObject({ status: "synced" });
    expect(loadPosition().page).toBe(300);
    const fav = JSON.parse(localStorage.getItem("services.favorites")!);
    expect(fav.slice().sort()).toEqual(["athkar", "qibla", "quran"]);
    expect(fav.indexOf("athkar")).toBeLessThan(fav.indexOf("quran"));
    expect(getSelectedReciterId()).toBe("maher");

    const puts = srv.puts();
    const before = dump();
    const setItem = vi.spyOn(localStorage, "setItem");
    const second = await engine.syncNow();
    // The device keeps favorites as a plain list, so reading it back renumbers seq: the merged document
    // may still differ in representation ("changed"), but nothing is written, so nothing is "applied".
    expect(second).toMatchObject({ status: "synced", pushed: [], applied: [], skipped: [] });
    expect(srv.puts()).toBe(puts);
    expect(setItem).not.toHaveBeenCalled();
    expect(dump()).toBe(before);
  });

  it("the Sync Engine source never writes localStorage and never uses the legacy project", () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const f of ["src/lib/accountSync/syncEngine.ts", "src/lib/accountSync/syncServer.ts", "src/lib/accountSync/syncState.ts"]) {
      const s = strip(readFileSync(f, "utf8"));
      // (syncState's kv.setItem is the accounts store — IndexedDB — not the app's localStorage.)
      expect(s, f).not.toMatch(/localStorage|sessionStorage/);
      expect(s, f).not.toMatch(/integrations\/supabase|zododbbdbjqxkasgzrbn/);
    }
    const apply = strip(readFileSync("src/lib/accountSync/localApply.ts", "utf8"));
    expect(apply).not.toMatch(/integrations\/supabase|zododbbdbjqxkasgzrbn|supabase|fetch\(/);
    expect(apply).not.toMatch(/removeItem\(|\.clear\(/);
    expect(LEGACY_PROJECT_REF).toBe("zododbbdbjqxkasgzrbn");
  });
});
