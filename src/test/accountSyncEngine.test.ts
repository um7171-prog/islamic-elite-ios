import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createMemoryAuthStorage } from "@/lib/account/authStorage";
import { ACCOUNTS_PROJECT_REF, LEGACY_PROJECT_REF } from "@/lib/account/config";
import { MAX_DOC_BYTES, createAdapterReader, createSyncEngine, type LocalDataPort } from "@/lib/accountSync/syncEngine";
import { createSupabaseSyncServer, type ServerDoc, type ServerError, type SyncServer } from "@/lib/accountSync/syncServer";
import { SYNC_STATE_KEY, createSyncStateStore, emptySyncState, type SyncStateStore } from "@/lib/accountSync/syncState";
import { normalizeAll, stableStringify } from "@/lib/accountSync/merge";
import { SYNC_SCHEMA_VERSION, type RawSyncDocs, type SyncDocName, type SyncDocs } from "@/lib/accountSync/types";

const NOW = new Date(2026, 8, 28, 12, 0).getTime();
const ctx = { now: NOW };
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/* ---------- fakes ---------- */

/** In-memory user_sync_docs + sync_put with the SAME rev rules as the database function. */
function fakeServer(initial: Partial<Record<SyncDocName, ServerDoc>> = {}) {
  const db = new Map<SyncDocName, ServerDoc>(Object.entries(initial) as [SyncDocName, ServerDoc][]);
  const log: { op: "pull" | "put"; doc?: SyncDocName; expected?: number }[] = [];
  const ctl: { failPull: ServerError | null; failPut: ServerError | null; beforePut: ((doc: SyncDocName) => void) | null } = { failPull: null, failPut: null, beforePut: null };
  const server: SyncServer = {
    async pullAll() {
      log.push({ op: "pull" });
      if (ctl.failPull) return { ok: false, error: ctl.failPull };
      return { ok: true, docs: Object.fromEntries([...db].map(([k, v]) => [k, structuredClone(v)])) };
    },
    async put(doc, data, schemaVersion, expected) {
      log.push({ op: "put", doc, expected });
      if (ctl.failPut) return { ok: false, error: ctl.failPut };
      ctl.beforePut?.(doc);
      const cur = db.get(doc);
      const written = expected === 0 ? !cur : !!cur && cur.rev === expected;
      if (!written) return { ok: true, status: "conflict", server: cur ? structuredClone(cur) : null };
      const rev = (cur?.rev ?? 0) + 1;
      db.set(doc, { rev, schemaVersion, data: structuredClone(data) });
      return { ok: true, status: "ok", rev };
    },
  };
  /** Another device writes through the same rules. */
  const writeAsOtherDevice = (doc: SyncDocName, data: unknown) => {
    const cur = db.get(doc);
    db.set(doc, { rev: (cur?.rev ?? 0) + 1, schemaVersion: SYNC_SCHEMA_VERSION, data: structuredClone(data) });
  };
  return { server, db, log, ctl, writeAsOtherDevice };
}

/** The device: its documents, and a recording `apply` (the real localStorage applier is not built yet). */
function fakeLocal(initial: RawSyncDocs = {}) {
  let docs: SyncDocs = normalizeAll(initial, ctx);
  const applied: Partial<SyncDocs>[] = [];
  const ctl = { failApply: false };
  const port: LocalDataPort = {
    read: () => ({ docs: structuredClone(docs), unknownTimes: [], unreadable: [] }),
    async apply(changes) {
      if (ctl.failApply) throw new Error("disk full");
      applied.push(structuredClone(changes));
      docs = { ...docs, ...structuredClone(changes) };
    },
  };
  return { port, applied, ctl, get docs() { return docs; } };
}

function setup(o: { user?: string | null; server?: Partial<Record<SyncDocName, ServerDoc>>; local?: RawSyncDocs; owner?: string | null; maxAttempts?: number } = {}) {
  const srv = fakeServer(o.server);
  const loc = fakeLocal(o.local);
  const kv = createMemoryAuthStorage();
  const state: SyncStateStore = createSyncStateStore(kv);
  const user = o.user === undefined ? USER : o.user;
  const engine = createSyncEngine({
    account: { getCurrentUser: async () => (user ? { id: user } : null) },
    server: srv.server,
    local: loc.port,
    state,
    now: () => NOW,
    maxAttempts: o.maxAttempts,
  });
  const seedOwner = async () => { if (o.owner !== undefined) await state.save({ ...emptySyncState("0d0d0d0d-0000-4000-8000-000000000001"), owner: o.owner }); };
  return { srv, loc, kv, state, engine, seedOwner };
}

const doc = (data: unknown, rev = 1): ServerDoc => ({ rev, schemaVersion: SYNC_SCHEMA_VERSION, data });
const pos = (page: number, at: number) => ({ page, surah: 2, at });
const favs = (...ids: string[]) => ({ items: ids.map((id, seq) => ({ id, at: 0, seq })), deleted: [] });
const ids = (d: { items: { id: string }[] }) => d.items.map((x) => x.id);

/* ---------- tests ---------- */

describe("without a session", () => {
  it("does nothing at all: no network, no apply, no state written", async () => {
    const s = setup({ user: null, local: { "quran.position": pos(42, 5) } });
    expect(await s.engine.syncNow({ claimGuestData: true })).toEqual({ status: "no-session" });
    expect(s.srv.log).toEqual([]);
    expect(s.loc.applied).toEqual([]);
    expect(await s.kv.getItem(SYNC_STATE_KEY)).toBeNull();
  });
});

describe("pull", () => {
  it("empty account + empty device: synced, nothing pushed or applied, device now owned by the account", async () => {
    const s = setup();
    expect(await s.engine.syncNow()).toEqual({ status: "synced", pushed: [], changed: [], applied: [], skipped: [] });
    expect(s.srv.log.filter((l) => l.op === "put")).toEqual([]);
    expect((await s.state.load()).owner).toBe(USER);
  });
  it("account with data + empty device: the account is restored locally, nothing pushed", async () => {
    const s = setup({ server: { "quran.position": doc(pos(42, 500), 3), "services.favorites": doc(favs("qibla", "quran"), 2) } });
    const r = await s.engine.syncNow();
    expect(r).toMatchObject({ status: "synced", pushed: [] });
    expect(s.loc.docs["quran.position"]).toEqual(pos(42, 500));
    expect(ids(s.loc.docs["services.favorites"])).toEqual(["qibla", "quran"]);
    expect((await s.state.load()).revs).toMatchObject({ "quran.position": 3, "services.favorites": 2 });
  });
  it("a document missing on the server is NOT a deletion: the local copy is kept and uploaded", async () => {
    const s = setup({ owner: USER, local: { "quran.position": pos(7, 100) } });
    await s.seedOwner();
    const r = await s.engine.syncNow();
    expect(r).toMatchObject({ status: "synced", pushed: ["quran.position"], applied: [] });
    expect(s.srv.db.get("quran.position")).toMatchObject({ rev: 1, data: pos(7, 100) });
    expect(s.srv.log.find((l) => l.op === "put")?.expected).toBe(0);
  });
});

describe("guest -> account", () => {
  it("guest data is not uploaded until ownership is confirmed (no network at all)", async () => {
    const s = setup({ local: { "quran.position": pos(42, 5) } });
    expect(await s.engine.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(s.srv.log).toEqual([]);
    expect(s.loc.applied).toEqual([]);
  });
  it("with claimGuestData: merged with the account, pushed with the right expected rev, applied locally", async () => {
    const s = setup({
      local: { "quran.position": pos(42, 900), "services.favorites": favs("athkar") },
      server: { "quran.position": doc(pos(7, 100), 4), "services.favorites": doc(favs("quran"), 2) },
    });
    const r = await s.engine.syncNow({ claimGuestData: true });
    expect(r).toMatchObject({ status: "synced" });
    // position: the device's is newer -> pushed on top of rev 4
    expect(s.srv.log.find((l) => l.doc === "quran.position")).toMatchObject({ op: "put", expected: 4 });
    expect(s.srv.db.get("quran.position")).toMatchObject({ rev: 5, data: pos(42, 900) });
    // favorites: union, both sides kept
    expect(ids(s.srv.db.get("services.favorites")!.data as { items: { id: string }[] }).sort()).toEqual(["athkar", "quran"]);
    expect(ids(s.loc.docs["services.favorites"]).sort()).toEqual(["athkar", "quran"]);
    expect((await s.state.load()).owner).toBe(USER);
  });
});

describe("push + optimistic concurrency", () => {
  it("pushes with the server's current rev and records the new rev", async () => {
    const s = setup({ owner: USER, local: { "quran.position": pos(50, 999) }, server: { "quran.position": doc(pos(1, 1), 3) } });
    await s.seedOwner();
    await s.engine.syncNow();
    expect(s.srv.log.filter((l) => l.op === "put")).toEqual([{ op: "put", doc: "quran.position", expected: 3 }]);
    expect(s.srv.db.get("quran.position")?.rev).toBe(4);
    expect((await s.state.load()).revs["quran.position"]).toBe(4);
  });
  it("rev conflict: nothing is overwritten; the server copy is merged in and the write retried on its rev", async () => {
    const s = setup({ owner: USER, local: { "services.favorites": favs("qibla", "athkar") }, server: { "services.favorites": doc(favs("quran"), 1) } });
    await s.seedOwner();
    let once = true;
    s.srv.ctl.beforePut = (d) => {
      if (d === "services.favorites" && once) { once = false; s.srv.writeAsOtherDevice(d, favs("quran", "tasbeeh")); }
    };
    const r = await s.engine.syncNow();
    expect(r).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    const puts = s.srv.log.filter((l) => l.op === "put");
    expect(puts.map((p) => p.expected)).toEqual([1, 2]);
    const final = s.srv.db.get("services.favorites")!;
    expect(final.rev).toBe(3);
    // The other device's "tasbeeh" and this device's items all survive.
    expect(ids(final.data as { items: { id: string }[] }).sort()).toEqual(["athkar", "qibla", "quran", "tasbeeh"]);
    expect(ids(s.loc.docs["services.favorites"]).sort()).toEqual(["athkar", "qibla", "quran", "tasbeeh"]);
  });
  it("retries are capped: a document that keeps conflicting stops after maxAttempts, stays pending, nothing applied", async () => {
    const s = setup({ owner: USER, maxAttempts: 3, local: { "quran.position": pos(42, 999) }, server: { "quran.position": doc(pos(1, 1), 1) } });
    await s.seedOwner();
    let n = 0;
    s.srv.ctl.beforePut = (d) => s.srv.writeAsOtherDevice(d, pos(1, 1 + ++n)); // always one step ahead
    const r = await s.engine.syncNow();
    expect(r).toEqual({ status: "error", reason: "conflict-retries-exhausted", pending: true });
    expect(s.srv.log.filter((l) => l.op === "put")).toHaveLength(3);
    expect(s.loc.applied).toEqual([]);
    expect(s.loc.docs["quran.position"]).toEqual(pos(42, 999));
    expect((await s.state.load()).pending).toBe(true);
  });
  it("concurrent syncNow() calls share one pass (no double writes)", async () => {
    const s = setup({ owner: USER, local: { "quran.position": pos(9, 9) } });
    await s.seedOwner();
    const [a, b] = await Promise.all([s.engine.syncNow(), s.engine.syncNow()]);
    expect(a).toEqual(b);
    expect(s.srv.log.filter((l) => l.op === "put")).toHaveLength(1);
  });
});

describe("offline-safe", () => {
  it("network failure on pull: offline + pending, the device's data untouched", async () => {
    const s = setup({ owner: USER, local: { "quran.position": pos(42, 5) } });
    await s.seedOwner();
    s.srv.ctl.failPull = "network";
    expect(await s.engine.syncNow()).toEqual({ status: "offline", pending: true });
    expect(s.loc.applied).toEqual([]);
    expect(s.loc.docs["quran.position"]).toEqual(pos(42, 5));
    const st = await s.state.load();
    expect(st.pending).toBe(true);
    expect(st.owner).toBe(USER);
  });
  it("network failure on push: offline + pending, nothing applied, and the next run completes", async () => {
    const s = setup({ owner: USER, local: { "quran.position": pos(42, 5) }, server: { "services.favorites": doc(favs("quran"), 1) } });
    await s.seedOwner();
    s.srv.ctl.failPut = "network";
    expect(await s.engine.syncNow()).toEqual({ status: "offline", pending: true });
    expect(s.loc.applied).toEqual([]);
    s.srv.ctl.failPut = null;
    expect(await s.engine.syncNow()).toMatchObject({ status: "synced", pushed: ["quran.position"] });
    expect((await s.state.load()).pending).toBe(false);
  });
  it("a failure while applying locally keeps the sync pending", async () => {
    const s = setup({ server: { "quran.position": doc(pos(42, 5), 1) } });
    s.loc.ctl.failApply = true;
    expect(await s.engine.syncNow()).toEqual({ status: "error", reason: "apply-failed", pending: true });
  });
  it("unauthorized is reported as an error, not as offline", async () => {
    const s = setup({ owner: USER });
    await s.seedOwner();
    s.srv.ctl.failPull = "unauthorized";
    expect(await s.engine.syncNow()).toEqual({ status: "error", reason: "unauthorized", pending: true });
  });
});

describe("bad server data", () => {
  it("a malformed server document never deletes local data; the server copy is repaired on its rev", async () => {
    const s = setup({ owner: USER, local: { "quran.position": pos(42, 5), "services.favorites": favs("qibla") }, server: { "quran.position": doc("garbage", 2), "services.favorites": doc({ items: "nope" }, 6) } });
    await s.seedOwner();
    const r = await s.engine.syncNow();
    expect(r).toMatchObject({ status: "synced" });
    expect(s.loc.docs["quran.position"]).toEqual(pos(42, 5));
    expect(ids(s.loc.docs["services.favorites"])).toEqual(["qibla"]);
    expect(s.srv.db.get("quran.position")).toMatchObject({ rev: 3, data: pos(42, 5) });
    expect(s.srv.db.get("services.favorites")?.rev).toBe(7);
  });
  it("a document written by a newer app version is left alone (not merged, pushed or applied)", async () => {
    const s = setup({ owner: USER, local: { "quran.position": pos(42, 5) }, server: { "quran.position": { rev: 9, schemaVersion: SYNC_SCHEMA_VERSION + 1, data: { future: true } } } });
    await s.seedOwner();
    const r = await s.engine.syncNow();
    expect(r).toMatchObject({ status: "synced", skipped: [{ doc: "quran.position", reason: "newer-schema" }] });
    expect(s.srv.log.filter((l) => l.op === "put")).toEqual([]);
    expect(s.srv.db.get("quran.position")?.data).toEqual({ future: true });
    expect(s.loc.docs["quran.position"]).toEqual(pos(42, 5));
  });
  it(`a document over the size limit (${MAX_DOC_BYTES} bytes) is not sent; the rest still syncs`, async () => {
    const big = "x".repeat(10_000);
    const activities = Array.from({ length: 30 }, (_, i) => ({
      id: `a${i}`, type: "reading", title: { ar: "t", en: "t" }, route: "/x", progress: null, status: "active",
      startedAt: 1, updatedAt: 100 + i, completedAt: null, expiresAt: null, metadata: { note: big },
    }));
    const s = setup({ owner: USER, local: { journey: { version: 1, activities, sessions: [], cursors: {} }, "quran.position": pos(3, 3) } });
    await s.seedOwner();
    const r = await s.engine.syncNow();
    expect(r).toMatchObject({ status: "synced", pushed: ["quran.position"], skipped: [{ doc: "journey", reason: "too-large" }] });
    expect(s.srv.db.has("journey")).toBe(false);
    expect(s.loc.docs.journey.activities).toHaveLength(30);
  });
});

describe("sync.owner", () => {
  it("the device holds another account's data: owner-conflict, no merge, no write", async () => {
    const s = setup({ owner: OTHER, local: { "quran.position": pos(42, 5) }, server: { "quran.position": doc(pos(7, 9), 1) } });
    await s.seedOwner();
    expect(await s.engine.syncNow()).toEqual({ status: "owner-conflict", localOwner: OTHER });
    expect(s.srv.log.filter((l) => l.op === "put")).toEqual([]);
    expect(s.loc.applied).toEqual([]);
    expect((await s.state.load()).owner).toBe(OTHER);
  });
  it("with the user's choice 'use-account-only' the device takes the account's data", async () => {
    const s = setup({ owner: OTHER, local: { "quran.position": pos(42, 5) }, server: { "quran.position": doc(pos(7, 9), 1) } });
    await s.seedOwner();
    expect(await s.engine.syncNow({ ownerChoice: "use-account-only" })).toMatchObject({ status: "synced", pushed: [] });
    expect(s.loc.docs["quran.position"]).toEqual(pos(7, 9));
    expect((await s.state.load()).owner).toBe(USER);
  });
});

describe("re-running", () => {
  it("is idempotent: a second pass reads, finds nothing to do, writes nothing", async () => {
    const s = setup({ local: { "quran.position": pos(42, 900), "services.favorites": favs("athkar", "qibla") }, server: { "quran.position": doc(pos(7, 100), 1), "services.favorites": doc(favs("quran"), 1) } });
    await s.engine.syncNow({ claimGuestData: true });
    const serverAfterFirst = stableStringify([...s.srv.db]);
    const putsAfterFirst = s.srv.log.filter((l) => l.op === "put").length;
    const second = await s.engine.syncNow();
    expect(second).toEqual({ status: "synced", pushed: [], changed: [], applied: [], skipped: [] });
    expect(s.srv.log.filter((l) => l.op === "put")).toHaveLength(putsAfterFirst);
    expect(stableStringify([...s.srv.db])).toBe(serverAfterFirst);
  });
  it("never loses local data: everything the device had is still there after syncing", async () => {
    const local = { "quran.bookmarks": { items: [{ page: 10, surah: 2, label: "b", at: 5 }], deleted: [] }, "quran.reciters": { selected: { id: "maher", at: 5 }, favorites: ["maher"] } };
    const s = setup({ local, server: { "quran.bookmarks": doc({ items: [{ page: 20, surah: 2, label: "c", at: 6 }], deleted: [] }, 1), "quran.reciters": doc({ selected: null, favorites: ["afasy"] }, 1) } });
    await s.engine.syncNow({ claimGuestData: true });
    expect(s.loc.docs["quran.bookmarks"].items.map((b) => b.page)).toEqual([10, 20]);
    expect(s.loc.docs["quran.reciters"]).toEqual({ selected: { id: "maher", at: 5 }, favorites: ["afasy", "maher"] });
  });
});

describe("isolation", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("the engine never writes localStorage (real adapters read it; apply goes through the port)", async () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 42, surah: 2, at: 500 }));
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", "quran"]));
    const before = JSON.stringify(Object.entries({ ...localStorage }).sort());
    const setItem = vi.spyOn(localStorage, "setItem");
    const removeItem = vi.spyOn(localStorage, "removeItem");
    const applied: Partial<SyncDocs>[] = [];
    const srv = fakeServer({ "quran.position": doc(pos(7, 900), 1) });
    const engine = createSyncEngine({
      account: { getCurrentUser: async () => ({ id: USER }) },
      server: srv.server,
      local: { read: createAdapterReader(localStorage), apply: async (d) => { applied.push(d); } },
      state: createSyncStateStore(createMemoryAuthStorage()),
      now: () => NOW,
    });
    expect(await engine.syncNow({ claimGuestData: true })).toMatchObject({ status: "synced" });
    expect(applied[0]?.["quran.position"]).toEqual(pos(7, 900));
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(JSON.stringify(Object.entries({ ...localStorage }).sort())).toBe(before);
  });

  it("through the real Supabase client: only backend-v2 endpoints, never the legacy project", async () => {
    const calls: string[] = [];
    const table = new Map<string, { rev: number; schema_version: number; data: unknown }>([["quran.position", { rev: 2, schema_version: 1, data: pos(7, 100) }]]);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/rest/v1/user_sync_docs")) return json(200, [...table].map(([d, v]) => ({ doc: d, ...v })));
      if (url.includes("/rest/v1/rpc/sync_put")) {
        const b = JSON.parse(String(init?.body));
        const cur = table.get(b.p_doc);
        const ok = b.p_expected_rev === 0 ? !cur : !!cur && cur.rev === b.p_expected_rev;
        if (!ok) return json(200, [{ status: "conflict", doc: b.p_doc, rev: cur?.rev ?? null, schema_version: cur?.schema_version ?? null, data: cur?.data ?? null }]);
        const rev = (cur?.rev ?? 0) + 1;
        table.set(b.p_doc, { rev, schema_version: b.p_schema_version, data: b.p_data });
        return json(200, [{ status: "ok", doc: b.p_doc, rev, schema_version: b.p_schema_version, data: b.p_data }]);
      }
      return json(404, {});
    }));
    const client = createClient(`https://${ACCOUNTS_PROJECT_REF}.supabase.co`, "sb_publishable_TESTONLY", {
      auth: { storage: createMemoryAuthStorage(), storageKey: "test-accounts", persistSession: false, detectSessionInUrl: false },
    });
    const loc = fakeLocal({ "quran.position": pos(42, 900), "services.favorites": favs("qibla") });
    const engine = createSyncEngine({
      account: { getCurrentUser: async () => ({ id: USER }) },
      server: createSupabaseSyncServer(client),
      local: loc.port,
      state: createSyncStateStore(createMemoryAuthStorage()),
      now: () => NOW,
    });
    const r = await engine.syncNow({ claimGuestData: true });
    expect(r).toMatchObject({ status: "synced" });
    expect(calls.length).toBeGreaterThan(0);
    for (const u of calls) {
      expect(new URL(u).host).toBe(`${ACCOUNTS_PROJECT_REF}.supabase.co`);
      expect(u).not.toContain(LEGACY_PROJECT_REF);
    }
    expect(table.get("quran.position")).toMatchObject({ rev: 3, data: pos(42, 900) });
    expect(table.get("services.favorites")).toMatchObject({ rev: 1 });
  });
});
