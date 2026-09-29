import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryAuthStorage } from "@/lib/account/authStorage";
import { LEGACY_PROJECT_REF } from "@/lib/account/config";
import { createAccountSyncCoordinator } from "@/lib/accountSync/accountSyncCoordinator";
import { createLocalDataPort } from "@/lib/accountSync/localApply";
import { readLocalDocs } from "@/lib/accountSync/localAdapters";
import type { LocalDataPort } from "@/lib/accountSync/syncEngine";
import type { ServerDoc, ServerError, SyncServer } from "@/lib/accountSync/syncServer";
import { SYNC_STATE_KEY, createSyncStateStore, emptySyncState } from "@/lib/accountSync/syncState";
import { SYNC_SCHEMA_VERSION, type SyncDocName } from "@/lib/accountSync/types";

const NOW = new Date(2026, 8, 28, 12, 0).getTime();
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

/* ---------- fakes: the server keeps the database's rev rules; the device is the REAL localStorage ---------- */

function fakeServer(initial: Partial<Record<SyncDocName, ServerDoc>> = {}) {
  const db = new Map<SyncDocName, ServerDoc>(Object.entries(initial) as [SyncDocName, ServerDoc][]);
  const log: { op: "pull" | "put"; doc?: SyncDocName }[] = [];
  const ctl: { failPull: ServerError | null; failPut: ServerError | null; beforePut: ((doc: SyncDocName) => void) | null } = { failPull: null, failPut: null, beforePut: null };
  const server: SyncServer = {
    async pullAll() {
      log.push({ op: "pull" });
      if (ctl.failPull) return { ok: false, error: ctl.failPull };
      return { ok: true, docs: Object.fromEntries([...db].map(([k, v]) => [k, structuredClone(v)])) };
    },
    async put(doc, data, schemaVersion, expected) {
      log.push({ op: "put", doc });
      if (ctl.failPut) return { ok: false, error: ctl.failPut };
      ctl.beforePut?.(doc);
      const cur = db.get(doc);
      if (expected === 0 ? !!cur : !cur || cur.rev !== expected) return { ok: true, status: "conflict", server: cur ? structuredClone(cur) : null };
      const rev = (cur?.rev ?? 0) + 1;
      db.set(doc, { rev, schemaVersion, data: structuredClone(data) });
      return { ok: true, status: "ok", rev };
    },
  };
  const otherDeviceWrites = (doc: SyncDocName, data: unknown) => {
    const cur = db.get(doc);
    db.set(doc, { rev: (cur?.rev ?? 0) + 1, schemaVersion: SYNC_SCHEMA_VERSION, data: structuredClone(data) });
  };
  const puts = () => log.filter((l) => l.op === "put").length;
  return { server, db, log, ctl, otherDeviceWrites, puts };
}

const sdoc = (data: unknown, rev = 1): ServerDoc => ({ rev, schemaVersion: SYNC_SCHEMA_VERSION, data });
const favs = (...ids: string[]) => ({ items: ids.map((id, seq) => ({ id, at: 100, seq })), deleted: [] });
const pos = (page: number, at: number) => ({ page, surah: 2, at });
const storedFavs = () => JSON.parse(localStorage.getItem("services.favorites") ?? "null") as string[] | null;
const storedPos = () => JSON.parse(localStorage.getItem("mushaf:position") ?? "null") as { page: number } | null;
const dump = () => JSON.stringify(Object.entries({ ...localStorage }).sort());

function setup(o: { server?: Partial<Record<SyncDocName, ServerDoc>>; user?: string | null; local?: LocalDataPort } = {}) {
  const srv = fakeServer(o.server);
  const kv = createMemoryAuthStorage();
  const state = createSyncStateStore(kv);
  const session = { user: o.user === undefined ? A : o.user };
  const coordinator = createAccountSyncCoordinator({
    account: { getCurrentSession: async () => (session.user ? { userId: session.user, sessionId: `s-${session.user}` } : null) },
    server: () => srv.server,
    local: o.local ?? createLocalDataPort(() => NOW),
    state,
    now: () => NOW,
  });
  const seedOwner = (owner: string | null) => state.save({ ...emptySyncState("0d0d0d0d-0000-4000-8000-000000000001"), owner, boundSession: owner ? `s-${owner}` : null });
  return { srv, kv, state, session, coordinator, seedOwner };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("A) no session", () => {
  it("does not sync: no network, no local write, no sync state", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["qibla"]));
    const s = setup({ user: null });
    const before = dump();
    const setItem = vi.spyOn(localStorage, "setItem");
    expect(await s.coordinator.syncNow({ claimGuestData: true })).toEqual({ status: "signed-out", sessionEnded: false });
    expect(s.srv.log).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(dump()).toBe(before);
    expect(await s.kv.getItem(SYNC_STATE_KEY)).toBeNull();
  });
  it("not configured (no accounts server): nothing happens", async () => {
    const kv = createMemoryAuthStorage();
    const c = createAccountSyncCoordinator({
      account: { getCurrentSession: async () => ({ userId: A, sessionId: "s-A" }) },
      server: () => null,
      local: createLocalDataPort(() => NOW),
      state: createSyncStateStore(kv),
      now: () => NOW,
    });
    expect(await c.syncNow()).toEqual({ status: "not-configured" });
    expect(await kv.getItem(SYNC_STATE_KEY)).toBeNull();
  });
});

describe("B) authenticated, empty account + empty device", () => {
  it("synced, nothing pushed or applied, nothing lost, the device now belongs to the account", async () => {
    const s = setup();
    const before = dump();
    expect(await s.coordinator.syncNow()).toEqual({ status: "synced", complete: true, pushed: [], applied: [], skipped: [] });
    expect(s.srv.puts()).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(dump()).toBe(before);
    const st = await s.state.load();
    expect(st).toMatchObject({ owner: A, pending: false, lastSyncedAt: NOW });
  });
});

describe("C) authenticated account with server data", () => {
  it("the server data reaches Local Apply and the device's storage matches the result", async () => {
    const s = setup({ server: { "services.favorites": sdoc(favs("athkar", "qibla"), 3), "quran.position": sdoc(pos(77, 900), 2) } });
    const r = await s.coordinator.syncNow();
    expect(r).toMatchObject({ status: "synced", complete: true, pushed: [] });
    if (r.status === "synced") expect([...r.applied].sort()).toEqual(["quran.position", "services.favorites"]);
    expect(storedFavs()).toEqual(["athkar", "qibla"]);
    expect(storedPos()).toMatchObject({ page: 77, at: 900 });
    // What the device now reads is exactly what the account holds.
    const local = readLocalDocs({ storage: localStorage, snapshot: (await s.state.load()).snapshot, now: NOW }).docs;
    expect(local["services.favorites"].items.map((x) => x.id)).toEqual(["athkar", "qibla"]);
    expect(local["quran.position"]).toEqual(pos(77, 900));
  });
});

describe("D) guest data + account", () => {
  it("no automatic claim: needs-guest-decision, no network at all, nothing written, nothing deleted", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) } });
    const before = dump();
    expect(await s.coordinator.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(await s.coordinator.inspect()).toEqual({ status: "needs-guest-decision", ownership: "guest" });
    expect(s.srv.log).toEqual([]);
    expect(dump()).toBe(before);
    expect(await s.kv.getItem(SYNC_STATE_KEY)).toBeNull(); // still a guest device
  });
  it("after the user confirms (claimGuestData), the guest data is merged, uploaded and kept", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) } });
    expect(await s.coordinator.syncNow({ claimGuestData: true })).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    expect(storedFavs()).toEqual(expect.arrayContaining(["qibla", "zakat"]));
    expect((s.srv.db.get("services.favorites")?.data as { items: { id: string }[] }).items.map((x) => x.id).sort()).toEqual(["qibla", "zakat"]);
  });
});

describe("E) the device's owner is this account", () => {
  it("syncs normally, with no guest question", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) } });
    await s.seedOwner(A);
    expect(await s.coordinator.inspect()).toMatchObject({ status: "ready" });
    expect(await s.coordinator.syncNow()).toMatchObject({ status: "synced", pushed: ["services.favorites"], applied: ["services.favorites"] });
  });
});

describe("F) the device's owner is ANOTHER account", () => {
  it("account-switch-required: no merge, no push, no local write — with or without local data", async () => {
    for (const withData of [true, false]) {
      localStorage.clear();
      if (withData) localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
      const s = setup({ user: B, server: { "services.favorites": sdoc(favs("qibla")) } });
      await s.seedOwner(A);
      const before = dump();
      const stateBefore = await s.kv.getItem(SYNC_STATE_KEY);
      const setItem = vi.spyOn(localStorage, "setItem");
      expect(await s.coordinator.syncNow({ claimGuestData: true })).toEqual({ status: "account-switch-required" });
      expect(s.srv.log).toEqual([]);
      expect(setItem).not.toHaveBeenCalled();
      expect(dump()).toBe(before);
      expect(await s.kv.getItem(SYNC_STATE_KEY)).toBe(stateBefore); // still A's device
      vi.restoreAllMocks();
    }
  });
  it("the result never exposes the other account's id", async () => {
    const s = setup({ user: B });
    await s.seedOwner(A);
    expect(JSON.stringify(await s.coordinator.syncNow())).not.toContain(A);
  });
});

describe("G) account switching: A, then B on the same device", () => {
  it("B never receives A's data and A's data never reaches B's account", async () => {
    const srvA = fakeServer({ "services.favorites": sdoc(favs("quran")) });
    const srvB = fakeServer({ "services.favorites": sdoc(favs("tasbeeh")) });
    const kv = createMemoryAuthStorage();
    const session: { user: string | null } = { user: A };
    const c = createAccountSyncCoordinator({
      account: { getCurrentSession: async () => (session.user ? { userId: session.user, sessionId: `s-${session.user}` } : null) },
      server: () => (session.user === B ? srvB.server : srvA.server),
      local: createLocalDataPort(() => NOW),
      state: createSyncStateStore(kv),
      now: () => NOW,
    });
    expect(await c.syncNow()).toMatchObject({ status: "synced" });
    expect(storedFavs()).toEqual(["quran"]);

    session.user = null; // A signs out: the coordinator knows, nothing is deleted
    expect(await c.syncNow()).toEqual({ status: "signed-out", sessionEnded: true });
    expect(await c.inspect()).toEqual({ status: "signed-out", sessionEnded: false, ownership: "guest" });
    expect(storedFavs()).toEqual(["quran"]);

    session.user = B;
    expect(await c.syncNow({ claimGuestData: true })).toEqual({ status: "account-switch-required" });
    expect(srvB.log).toEqual([]);
    expect(storedFavs()).toEqual(["quran"]); // B's "tasbeeh" was not mixed in
    expect((srvB.db.get("services.favorites")?.data as { items: { id: string }[] }).items.map((x) => x.id)).toEqual(["tasbeeh"]);

    session.user = A; // back to A: syncs normally again
    expect(await c.syncNow()).toMatchObject({ status: "synced" });
    expect(storedFavs()).toEqual(["quran"]);
  });
});

describe("H) network failure", () => {
  it("pending, the device's data kept; a later run succeeds", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) } });
    await s.seedOwner(A);
    const before = dump();
    s.srv.ctl.failPull = "network";
    expect(await s.coordinator.syncNow()).toEqual({ status: "pending", reason: "offline" });
    expect(dump()).toBe(before);
    expect(await s.state.load()).toMatchObject({ pending: true });
    s.srv.ctl.failPull = null;
    s.srv.ctl.failPut = "network";
    expect(await s.coordinator.syncNow()).toEqual({ status: "pending", reason: "offline" });
    expect(dump()).toBe(before);
    s.srv.ctl.failPut = null;
    expect(await s.coordinator.syncNow()).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    expect(await s.state.load()).toMatchObject({ pending: false });
    expect(storedFavs()).toEqual(expect.arrayContaining(["qibla", "zakat"]));
  });
  it("a server refusal is reported as such (not hidden as offline)", async () => {
    const s = setup();
    s.srv.ctl.failPull = "unauthorized";
    expect(await s.coordinator.syncNow()).toEqual({ status: "pending", reason: "unauthorized" });
  });
  it("a malformed server document deletes nothing on the device", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    localStorage.setItem("mushaf:position", JSON.stringify(pos(12, 500)));
    const s = setup({ server: { "services.favorites": sdoc("garbage", 4), "quran.position": sdoc({ page: "x" }, 2) } });
    await s.seedOwner(A);
    expect(await s.coordinator.syncNow()).toMatchObject({ status: "synced" });
    expect(storedFavs()).toEqual(["zakat"]);
    expect(storedPos()).toMatchObject({ page: 12 });
  });
});

describe("I) conflict", () => {
  it("handled by the Sync Engine: another device's write is merged in, never overwritten", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) } });
    await s.seedOwner(A);
    let once = true;
    s.srv.ctl.beforePut = (doc) => { if (once) { once = false; s.srv.otherDeviceWrites(doc, favs("qibla", "hajj")); } };
    expect(await s.coordinator.syncNow()).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    const ids = (s.srv.db.get("services.favorites")?.data as { items: { id: string }[] }).items.map((x) => x.id).sort();
    expect(ids).toEqual(["hajj", "qibla", "zakat"]);
    expect([...(storedFavs() ?? [])].sort()).toEqual(["hajj", "qibla", "zakat"]);
  });
  it("conflicts that never end: pending (the engine's retry limit), nothing applied", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) } });
    await s.seedOwner(A);
    let n = 0;
    s.srv.ctl.beforePut = (doc) => s.srv.otherDeviceWrites(doc, favs("qibla", `x${n++}`));
    expect(await s.coordinator.syncNow()).toEqual({ status: "pending", reason: "conflict-retries-exhausted" });
    expect(storedFavs()).toEqual(["zakat"]);
  });
  it("the coordinator itself has no merge or conflict logic", () => {
    const src = readFileSync(resolve(__dirname, "../lib/accountSync/accountSyncCoordinator.ts"), "utf8");
    expect(src).not.toMatch(/mergeDoc|mergeAll|mergeIntoAccount|\.put\(|expectedRev|"conflict"/);
  });
});

describe("J) local apply failure", () => {
  it("apply-failed, never 'synced'; the sync stays pending and a later run completes", async () => {
    const real = createLocalDataPort(() => NOW);
    const ctl = { fail: true };
    const port: LocalDataPort = { read: real.read, apply: async (d) => { if (ctl.fail) throw new Error("QuotaExceededError"); return real.apply(d); } };
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) }, local: port });
    await s.seedOwner(A);
    expect(await s.coordinator.syncNow()).toEqual({ status: "apply-failed" });
    expect(await s.state.load()).toMatchObject({ pending: true, lastSyncedAt: null });
    ctl.fail = false;
    expect(await s.coordinator.syncNow()).toMatchObject({ status: "synced", applied: ["services.favorites"] });
    expect(storedFavs()).toEqual(["qibla"]);
  });
  it("an unexpected failure (sync state unreadable/unsavable) is reported, not hidden, and leaks no message", async () => {
    const s = setup();
    vi.spyOn(s.state, "save").mockRejectedValue(new Error("token=secret-value"));
    const r = await s.coordinator.syncNow();
    expect(r).toEqual({ status: "failed", reason: "unexpected" });
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});

describe("K) idempotency", () => {
  it("two runs on the same state: the second writes nothing locally and pushes nothing", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    localStorage.setItem("mushaf:position", JSON.stringify(pos(5, 100)));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")), "quran.position": sdoc(pos(9, 50), 2) } });
    await s.seedOwner(A);
    await s.coordinator.syncNow();
    const puts = s.srv.puts();
    const before = dump();
    const serverBefore = JSON.stringify([...s.srv.db]);
    const setItem = vi.spyOn(localStorage, "setItem");
    expect(await s.coordinator.syncNow()).toEqual({ status: "synced", complete: true, pushed: [], applied: [], skipped: [] });
    expect(s.srv.puts()).toBe(puts);
    expect(setItem).not.toHaveBeenCalled();
    expect(dump()).toBe(before);
    expect(JSON.stringify([...s.srv.db])).toBe(serverBefore);
    const f = storedFavs() ?? [];
    expect(new Set(f).size).toBe(f.length);
  });
  it("concurrent calls share one pass", async () => {
    localStorage.setItem("services.favorites", JSON.stringify(["zakat"]));
    const s = setup();
    await s.seedOwner(A);
    const [r1, r2] = await Promise.all([s.coordinator.syncNow(), s.coordinator.syncNow()]);
    expect(r1).toEqual(r2);
    expect(s.srv.log.filter((l) => l.op === "pull").length).toBe(1);
    expect(s.srv.puts()).toBe(1);
  });
});

describe("L) security", () => {
  const src = readFileSync(resolve(__dirname, "../lib/accountSync/accountSyncCoordinator.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("no localStorage of its own, no new storage key", () => {
    expect(code).not.toMatch(/localStorage|sessionStorage|setItem|removeItem/);
  });
  it("no legacy Supabase, no service_role, no secret keys, no direct fetch", () => {
    expect(code).not.toContain(LEGACY_PROJECT_REF);
    expect(code).not.toMatch(/integrations\/supabase|service_role|sb_secret|createClient|fetch\(/);
  });
  it("never logs (no tokens, codes or emails can reach a log)", () => {
    expect(code).not.toMatch(/console\./);
  });
  it("wired only for sign-out: the account session hook is its one user, and nothing in the app starts a sync", async () => {
    const { globSync } = await import("node:fs");
    const files = globSync("src/**/*.{ts,tsx}", { cwd: resolve(__dirname, "../..") }).filter((f) => !/[\\/]test[\\/]|accountSyncCoordinator\.ts$/.test(f));
    const read = (f: string) => readFileSync(resolve(__dirname, "../..", f), "utf8");
    const users = files.filter((f) => read(f).includes("accountSyncCoordinator")).map((f) => f.replace(/\\/g, "/"));
    expect(users).toEqual(["src/hooks/useAccountSession.ts"]);
    expect(files.filter((f) => /\.syncNow\(/.test(read(f)))).toEqual([]);
  });
  it("a run writes nothing to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const s = setup({ server: { "services.favorites": sdoc(favs("qibla")) } });
    s.srv.ctl.failPull = "network";
    await s.coordinator.syncNow();
    s.srv.ctl.failPull = null;
    await s.coordinator.syncNow();
    for (const sp of spies) expect(sp).not.toHaveBeenCalled();
  });
});
