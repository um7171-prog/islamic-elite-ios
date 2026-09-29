import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import { ServicesHub } from "@/components/services/ServicesHub";
import { AthkarDialog } from "@/components/islamic/AthkarDialog";
import { ATHKAR_LISTS, loadAthkarCounts, saveAthkarCounts } from "@/lib/athkarProgress";
import { applyLocalDocs, createLocalDataPort } from "@/lib/accountSync/localApply";
import { readLocalDocs } from "@/lib/accountSync/localAdapters";
import { createSyncEngine } from "@/lib/accountSync/syncEngine";
import { createSyncStateStore } from "@/lib/accountSync/syncState";
import { createMemoryAuthStorage } from "@/lib/account/authStorage";
import type { ServerDoc, SyncServer } from "@/lib/accountSync/syncServer";
import { SYNC_SCHEMA_VERSION, type SyncDocName } from "@/lib/accountSync/types";

const NOW = new Date(2026, 8, 28, 12, 0).getTime();
const ctx = { now: NOW };
const favs = (...ids: string[]) => ({ items: ids.map((id, seq) => ({ id, at: 0, seq })), deleted: [] });
const stored = () => JSON.parse(localStorage.getItem("services.favorites") ?? "[]") as string[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ---------------- ServicesHub ---------------- */

function renderHub() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LocaleProvider>
          <CityProvider>
            <PrayerCalcProvider>
              <ServicesHub />
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
/** The star button of the tile whose visible name is `label`. */
function star(label: string): HTMLButtonElement {
  const name = screen.getAllByText(label, { exact: true })[0];
  const tile = name.closest("div.relative, li, [class*='relative']") as HTMLElement;
  const btn = tile?.querySelector<HTMLButtonElement>('button[aria-label="Favorite"]');
  if (!btn) throw new Error(`no star for ${label}`);
  return btn;
}

describe("A) ServicesHub open during a sync apply, then the user ADDS a favorite", () => {
  it("keeps the synced favorites and adds the user's one", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["quran"]));
    renderHub();
    // The account sync writes while the screen is open (the screen's state still says ["quran"]).
    act(() => { applyLocalDocs({ "services.favorites": favs("athkar", "qibla", "quran") }, ctx); });
    expect(stored()).toEqual(["athkar", "qibla", "quran"]);
    fireEvent.click(star("Tasbeeh"));
    expect(stored()).toEqual(["athkar", "qibla", "quran", "tasbeeh"]);
  });
});

describe("B) ServicesHub open during a sync apply, then the user REMOVES a favorite", () => {
  it("removes it from the latest stored list, not from the screen's old copy", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["quran", "tasbeeh"]));
    renderHub();
    act(() => { applyLocalDocs({ "services.favorites": favs("athkar", "quran", "tasbeeh", "qibla") }, ctx); });
    fireEvent.click(star("Tasbeeh"));
    expect(stored()).toEqual(["athkar", "quran", "qibla"]);
  });
});

/* ---------------- AthkarDialog ---------------- */

const zeros = () => ATHKAR_LISTS.morning.items.map(() => 0);
function renderAthkar() {
  return render(
    <LocaleProvider>
      <AthkarDialog open onOpenChange={() => undefined} initialList="morning" />
    </LocaleProvider>,
  );
}
const tapDhikr = (i: number) => fireEvent.click(document.querySelector(`[data-thikr="${i}"]`) as HTMLElement);

describe("C) AthkarDialog open during a sync apply, then the user counts", () => {
  it("counts on top of the synced tallies (max per dhikr), nothing from the sync is lost", () => {
    const start = zeros(); start[0] = 1;
    saveAthkarCounts("morning", start);
    renderAthkar();
    const synced = zeros(); synced[1] = 3; synced[4] = 1;
    act(() => { applyLocalDocs({ "athkar.progress": { days: { [dayKey()]: { morning: synced } } } }, ctx); });
    tapDhikr(0);
    const want = zeros(); want[0] = Math.min(2, ATHKAR_LISTS.morning.items[0].count); want[1] = Math.min(3, ATHKAR_LISTS.morning.items[1].count); want[4] = 1;
    expect(loadAthkarCounts("morning")).toEqual(want);
  });
  it("counting the dhikr the sync already raised continues from the synced value", () => {
    saveAthkarCounts("morning", zeros());
    renderAthkar();
    const synced = zeros(); synced[7] = 5; // "لا إله إلا الله وحده…" (target 10)
    act(() => { applyLocalDocs({ "athkar.progress": { days: { [dayKey()]: { morning: synced } } } }, ctx); });
    tapDhikr(7);
    expect(loadAthkarCounts("morning")[7]).toBe(6);
  });
  it("fast taps before the screen re-renders are all counted", () => {
    saveAthkarCounts("morning", zeros());
    renderAthkar();
    act(() => { tapDhikr(7); tapDhikr(7); tapDhikr(7); });
    expect(loadAthkarCounts("morning")[7]).toBe(3);
  });
});

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------------- D) the same scenario twice ---------------- */

describe("D) repeating the scenario", () => {
  it("no duplicates, no loss", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["quran"]));
    renderHub();
    for (let round = 0; round < 2; round++) {
      act(() => { applyLocalDocs({ "services.favorites": favs("athkar", "quran") }, ctx); });
      fireEvent.click(star("Qibla"));
    }
    // round 1 adds qibla, round 2 toggles it off again — the synced items stay, nothing is duplicated.
    const s = stored();
    expect(new Set(s).size).toBe(s.length);
    expect(s).toEqual(["athkar", "quran"]);
    act(() => { applyLocalDocs({ "services.favorites": favs("athkar", "quran") }, ctx); });
    fireEvent.click(star("Qibla"));
    expect(stored()).toEqual(["athkar", "quran", "qibla"]);
  });
});

/* ---------------- E) applied reporting ---------------- */

function fakeServer(initial: Partial<Record<SyncDocName, ServerDoc>> = {}) {
  const db = new Map<SyncDocName, ServerDoc>(Object.entries(initial) as [SyncDocName, ServerDoc][]);
  const server: SyncServer = {
    async pullAll() { return { ok: true, docs: Object.fromEntries([...db].map(([k, v]) => [k, structuredClone(v)])) }; },
    async put(doc, data, schemaVersion, expected) {
      const cur = db.get(doc);
      if (expected === 0 ? !!cur : !cur || cur.rev !== expected) return { ok: true, status: "conflict", server: cur ? structuredClone(cur) : null };
      const rev = (cur?.rev ?? 0) + 1;
      db.set(doc, { rev, schemaVersion, data: structuredClone(data) });
      return { ok: true, status: "ok", rev };
    },
  };
  return { server, db };
}
function engineWith(server: SyncServer) {
  return createSyncEngine({
    account: { getCurrentUser: async () => ({ id: "11111111-1111-1111-1111-111111111111" }) },
    server,
    local: createLocalDataPort(() => NOW),
    state: createSyncStateStore(createMemoryAuthStorage()),
    now: () => NOW,
  });
}

describe("E) applied = an actual local write, nothing else", () => {
  it("apply layer: unchanged document -> no write, not in writtenDocs", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", "quran"]));
    const docs = readLocalDocs({ storage: localStorage, snapshot: null, now: NOW }).docs;
    const r = applyLocalDocs({ "services.favorites": docs["services.favorites"] }, ctx);
    expect(r.writtenDocs).toEqual([]);
  });
  it("apply layer: different representation, same local meaning (seq values) -> not written", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", "quran"]));
    const setItem = vi.spyOn(localStorage, "setItem");
    const r = applyLocalDocs({ "services.favorites": { items: [{ id: "qibla", at: 0, seq: 0 }, { id: "quran", at: 0, seq: 0 }], deleted: [] } }, ctx);
    expect(r.writtenDocs).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
  });
  it("apply layer: a real write -> in writtenDocs", () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla"]));
    expect(applyLocalDocs({ "services.favorites": favs("qibla", "zakat") }, ctx).writtenDocs).toEqual(["services.favorites"]);
  });
  it("engine: a representation-only difference is 'changed' but NOT 'applied', and writes nothing", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", "quran"]));
    // The server holds the same list with different seq values (a representation difference only).
    const srv = fakeServer({ "services.favorites": { rev: 1, schemaVersion: SYNC_SCHEMA_VERSION, data: { items: [{ id: "qibla", at: 0, seq: 0 }, { id: "quran", at: 0, seq: 0 }], deleted: [] } } });
    const setItem = vi.spyOn(localStorage, "setItem");
    const r = await engineWith(srv.server).syncNow({ claimGuestData: true });
    expect(r).toMatchObject({ status: "synced", applied: [] });
    if (r.status === "synced") expect(r.changed).toContain("services.favorites");
    expect(setItem).not.toHaveBeenCalled();
    expect(stored()).toEqual(["qibla", "quran"]);
  });
  it("engine: a real local write is 'applied'; an unchanged document is not listed at all", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla"]));
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 42, surah: 2, at: 500 }));
    const srv = fakeServer({ "services.favorites": { rev: 1, schemaVersion: SYNC_SCHEMA_VERSION, data: favs("qibla", "zakat") } });
    const r = await engineWith(srv.server).syncNow({ claimGuestData: true });
    expect(r).toMatchObject({ status: "synced", applied: ["services.favorites"] });
    if (r.status === "synced") {
      expect(r.changed).toEqual(["services.favorites"]);
      expect(r.applied).not.toContain("quran.position");
    }
    expect(stored()).toEqual(["qibla", "zakat"]);
  });
});
