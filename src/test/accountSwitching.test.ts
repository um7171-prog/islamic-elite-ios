import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAccountAuth, sessionIdOf } from "@/lib/account/accountAuth";
import { createMemoryAuthStorage } from "@/lib/account/authStorage";
import { createAccountSyncCoordinator, planOwnership } from "@/lib/accountSync/accountSyncCoordinator";
import { createLocalDataPort } from "@/lib/accountSync/localApply";
import { LOCAL_KEYS } from "@/lib/accountSync/localAdapters";
import type { ServerDoc, SyncServer } from "@/lib/accountSync/syncServer";
import { SYNC_STATE_KEY, createSyncStateStore, emptySyncState, parseSyncState } from "@/lib/accountSync/syncState";
import { SYNC_SCHEMA_VERSION, type SyncDocName } from "@/lib/accountSync/types";

/**
 * Phase 8 — account switching & guest ownership. A device's data belongs to ONE account session; a
 * sign-out turns it into guest data that only that account may claim, explicitly; another account
 * never merges with it, never receives it, never writes over it.
 */

const NOW = new Date(2026, 8, 28, 12, 0).getTime();
const A = "aaaaaaaa-1111-1111-1111-111111111111";
const B = "bbbbbbbb-2222-2222-2222-222222222222";

function fakeServer(initial: Partial<Record<SyncDocName, ServerDoc>> = {}) {
  const db = new Map<SyncDocName, ServerDoc>(Object.entries(initial) as [SyncDocName, ServerDoc][]);
  const log: string[] = [];
  const server: SyncServer = {
    async pullAll() {
      log.push("pull");
      return { ok: true, docs: Object.fromEntries([...db].map(([k, v]) => [k, structuredClone(v)])) };
    },
    async put(doc, data, schemaVersion, expected) {
      log.push(`put:${doc}`);
      const cur = db.get(doc);
      if (expected === 0 ? !!cur : !cur || cur.rev !== expected) return { ok: true, status: "conflict", server: cur ? structuredClone(cur) : null };
      const rev = (cur?.rev ?? 0) + 1;
      db.set(doc, { rev, schemaVersion, data: structuredClone(data) });
      return { ok: true, status: "ok", rev };
    },
  };
  const ids = (doc: SyncDocName = "services.favorites") => ((db.get(doc)?.data as { items?: { id: string }[] } | undefined)?.items ?? []).map((x) => x.id).sort();
  const otherDeviceWrites = (doc: SyncDocName, data: unknown) => {
    const cur = db.get(doc);
    db.set(doc, { rev: (cur?.rev ?? 0) + 1, schemaVersion: SYNC_SCHEMA_VERSION, data: structuredClone(data) });
  };
  return { server, db, log, ids, otherDeviceWrites };
}

const favs = (...ids: string[]) => ({ items: ids.map((id, seq) => ({ id, at: 100, seq })), deleted: [] });
const sdoc = (data: unknown, rev = 1): ServerDoc => ({ rev, schemaVersion: SYNC_SCHEMA_VERSION, data });
const local = () => JSON.parse(localStorage.getItem("services.favorites") ?? "[]") as string[];
const setLocal = (...ids: string[]) => localStorage.setItem("services.favorites", JSON.stringify(ids));
const dump = () => JSON.stringify(Object.entries({ ...localStorage }).sort());

/** One device: the app's storage (localStorage), the accounts storage (kv), an account session, two accounts. */
function device(o: { a?: string[]; b?: string[] } = {}) {
  const servers = { [A]: fakeServer({ "services.favorites": sdoc(favs(...(o.a ?? ["quran"]))) }), [B]: fakeServer({ "services.favorites": sdoc(favs(...(o.b ?? ["tasbeeh"]))) }) };
  const kv = createMemoryAuthStorage();
  const state = createSyncStateStore(kv);
  let n = 0;
  const auth = {
    current: null as { userId: string; sessionId: string } | null,
    signOutOk: true,
    /** A new sign-in (email code): always a NEW session. */
    signIn(userId: string) { auth.current = { userId, sessionId: `session-${++n}` }; },
    /** The session disappears without the coordinator (expired, revoked, signed out elsewhere). */
    lose() { auth.current = null; },
  };
  const make = () =>
    createAccountSyncCoordinator({
      account: {
        getCurrentSession: async () => (auth.current ? { ...auth.current } : null),
        signOut: async () => { if (auth.signOutOk) auth.current = null; return { ok: auth.signOutOk }; },
      },
      server: () => (auth.current ? servers[auth.current.userId].server : null),
      local: createLocalDataPort(() => NOW),
      state,
      now: () => NOW,
    });
  const stored = async () => parseSyncState(await kv.getItem(SYNC_STATE_KEY));
  return { servers, kv, state, auth, make, stored, coordinator: make() };
}

/** Signs in to A and completes a first sync: the device is linked to A. */
async function linkedToA(d: ReturnType<typeof device>) {
  d.auth.signIn(A);
  expect(await d.coordinator.syncNow()).toMatchObject({ status: "synced" });
  expect(await d.stored()).toMatchObject({ owner: A, formerOwner: null });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("device ownership model", () => {
  const st = (owner: string | null, formerOwner: string | null, boundSession: string | null) => ({ owner, formerOwner, boundSession });
  it("guest / account (this session) / detached / another account", () => {
    expect(planOwnership(st(null, null, null), A, "s1")).toBe("guest");
    expect(planOwnership(st(A, null, "s1"), A, "s1")).toBe("linked");
    expect(planOwnership(st(A, null, "s1"), A, "s2")).toBe("detached"); // a sign-out happened in between
    expect(planOwnership(st(null, A, null), A, "s2")).toBe("detached");
    expect(planOwnership(st(A, null, "s1"), B, "s9")).toBe("other");
    expect(planOwnership(st(null, A, null), B, "s9")).toBe("other");
  });
  it("the sync state keeps the new fields; older states read as unbound (never as linked)", () => {
    const s = parseSyncState(JSON.stringify({ ...emptySyncState("d"), owner: A, formerOwner: B, boundSession: "s1" }));
    expect(s).toMatchObject({ owner: A, formerOwner: B, boundSession: "s1" });
    const old = parseSyncState(JSON.stringify({ version: 1, deviceId: "d", owner: A, revs: {}, pending: false, lastSyncedAt: 1 }));
    expect(old).toMatchObject({ owner: A, formerOwner: null, boundSession: null });
    expect(planOwnership(old!, A, "s1")).toBe("detached");
  });
});

describe("A) A -> sign-out -> guest edits: nothing can reach A without an explicit claim", () => {
  it("through the coordinator's sign-out", async () => {
    const d = device();
    await linkedToA(d);
    expect(await d.coordinator.signOut()).toEqual({ status: "signed-out", detached: true });
    expect(local()).toEqual(["quran"]); // nothing deleted
    setLocal("quran", "zakat"); // guest edit
    const before = d.servers[A].log.length;
    // Signed out: nothing at all.
    expect(await d.coordinator.syncNow({ claimGuestData: true })).toMatchObject({ status: "signed-out" });
    // Signed in to A again: still no upload without the user's explicit claim.
    d.auth.signIn(A);
    expect(await d.coordinator.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(d.servers[A].log.length).toBe(before);
    expect(d.servers[A].ids()).toEqual(["quran"]);
  });
  it("a sign-out the coordinator never saw (expired / revoked session) is caught by the session binding", async () => {
    const d = device();
    await linkedToA(d);
    d.auth.lose();
    setLocal("quran", "zakat");
    d.auth.signIn(A); // a new session
    const before = d.servers[A].log.length;
    expect(await d.coordinator.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(d.servers[A].log.length).toBe(before);
    expect(d.servers[A].ids()).toEqual(["quran"]);
  });
  it("even if ending the session fails, the device is already detached (fail closed)", async () => {
    const d = device();
    await linkedToA(d);
    d.auth.signOutOk = false;
    expect(await d.coordinator.signOut()).toEqual({ status: "failed", detached: true });
    setLocal("quran", "zakat");
    const before = d.servers[A].log.length;
    expect(await d.coordinator.syncNow()).toEqual({ status: "needs-guest-decision" }); // same session, still A
    expect(d.servers[A].log.length).toBe(before);
  });
  it("a detached device whose data is all gone does not turn that into deletions for A", async () => {
    const d = device({ a: ["quran", "qibla"] });
    await linkedToA(d);
    await d.coordinator.signOut();
    localStorage.clear();
    d.auth.signIn(A);
    expect(await d.coordinator.syncNow()).toMatchObject({ status: "synced", pushed: [] });
    expect(d.servers[A].ids()).toEqual(["qibla", "quran"]);
    expect([...local()].sort()).toEqual(["qibla", "quran"]); // A's data restored, nothing lost
  });
});

describe("B) A -> sign-out -> guest -> sign in to B", () => {
  it("no merge, no push, no apply — even with a claim", async () => {
    const d = device();
    await linkedToA(d);
    await d.coordinator.signOut();
    setLocal("quran", "zakat");
    d.auth.signIn(B);
    const before = dump();
    const stateBefore = await d.kv.getItem(SYNC_STATE_KEY);
    const setItem = vi.spyOn(localStorage, "setItem");
    for (const claim of [false, true]) {
      expect(await d.coordinator.syncNow({ claimGuestData: claim })).toEqual({ status: "account-switch-required" });
    }
    expect(d.servers[B].log).toEqual([]);
    expect(d.servers[B].ids()).toEqual(["tasbeeh"]);
    expect(setItem).not.toHaveBeenCalled();
    expect(dump()).toBe(before);
    expect(await d.kv.getItem(SYNC_STATE_KEY)).toBe(stateBefore);
  });
});

describe("C) A -> sign-out -> guest -> sign in to A", () => {
  it("no automatic claim", async () => {
    const d = device();
    await linkedToA(d);
    await d.coordinator.signOut();
    setLocal("quran", "zakat");
    d.auth.signIn(A);
    const before = d.servers[A].log.length;
    expect(await d.coordinator.inspect()).toEqual({ status: "needs-guest-decision", ownership: "guest" });
    expect(await d.coordinator.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(await d.coordinator.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(d.servers[A].log.length).toBe(before);
    expect(local()).toEqual(["quran", "zakat"]); // nothing deleted
    expect(await d.stored()).toMatchObject({ owner: null, formerOwner: A });
  });
});

describe("D) A -> sign-out -> guest -> sign in to A -> explicit claim", () => {
  it("merges safely: A's other devices' data kept, the guest's changes added, then normal sync in this session", async () => {
    const d = device({ a: ["quran", "qibla"] });
    await linkedToA(d);
    await d.coordinator.signOut();
    setLocal("quran", "qibla", "zakat"); // guest adds zakat
    d.servers[A].otherDeviceWrites("services.favorites", favs("quran", "qibla", "hajj")); // A elsewhere adds hajj
    d.auth.signIn(A);
    expect(await d.coordinator.syncNow({ claimGuestData: true })).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    expect(d.servers[A].ids()).toEqual(["hajj", "qibla", "quran", "zakat"]);
    expect([...local()].sort()).toEqual(["hajj", "qibla", "quran", "zakat"]);
    expect(await d.stored()).toMatchObject({ owner: A, formerOwner: null, boundSession: d.auth.current?.sessionId });
    // Linked again in this session: no claim needed any more.
    setLocal(...local(), "zakah-calc");
    expect(await d.coordinator.syncNow()).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
  });
  it("a removal the user made as a guest is part of what they claimed (and only then reaches A)", async () => {
    const d = device({ a: ["quran", "qibla"] });
    await linkedToA(d);
    await d.coordinator.signOut();
    setLocal("quran"); // guest removed qibla
    d.auth.signIn(A);
    expect(await d.coordinator.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(d.servers[A].ids()).toEqual(["qibla", "quran"]);
    expect(await d.coordinator.syncNow({ claimGuestData: true })).toMatchObject({ status: "synced" });
    expect(d.servers[A].ids()).toEqual(["quran"]);
  });
});

describe("E) A -> sign-out -> B -> sign-out B -> no mixing of A and B", () => {
  it("B never receives A's data, A never receives B's, the device stays A's former data", async () => {
    const d = device();
    await linkedToA(d);
    await d.coordinator.signOut();
    d.auth.signIn(B);
    expect(await d.coordinator.syncNow({ claimGuestData: true })).toEqual({ status: "account-switch-required" });
    expect(await d.coordinator.signOut()).toEqual({ status: "signed-out", detached: true });
    expect(await d.stored()).toMatchObject({ owner: null, formerOwner: A }); // B's sign-out changed nothing
    expect(local()).toEqual(["quran"]);
    d.auth.signIn(B);
    expect(await d.coordinator.syncNow({ claimGuestData: true })).toEqual({ status: "account-switch-required" });
    expect(d.servers[B].log).toEqual([]);
    expect(d.servers[B].ids()).toEqual(["tasbeeh"]);
    expect(local()).not.toContain("tasbeeh");
    d.auth.signIn(A);
    expect(await d.coordinator.syncNow({ claimGuestData: true })).toMatchObject({ status: "synced" });
    expect(d.servers[A].ids()).toEqual(["quran"]);
    expect(local()).toEqual(["quran"]);
  });
});

describe("F) A -> sign-out -> app closed and reopened", () => {
  it("the device is still guest (detached from A)", async () => {
    const d = device();
    await linkedToA(d);
    await d.coordinator.signOut();
    const reopened = d.make(); // same storages, a fresh coordinator
    expect(await reopened.inspect()).toEqual({ status: "signed-out", sessionEnded: false, ownership: "guest" });
    expect(await d.stored()).toMatchObject({ owner: null, formerOwner: A, boundSession: null });
    setLocal("quran", "zakat");
    d.auth.signIn(A);
    const again = d.make();
    expect(await again.syncNow()).toEqual({ status: "needs-guest-decision" });
    expect(d.servers[A].ids()).toEqual(["quran"]);
  });
});

describe("G) A linked -> B signs in directly", () => {
  it("account-switch-required with no network at all and no write", async () => {
    const d = device();
    await linkedToA(d);
    setLocal("quran", "zakat");
    const logA = d.servers[A].log.length;
    const before = dump();
    const stateBefore = await d.kv.getItem(SYNC_STATE_KEY);
    d.auth.signIn(B);
    expect(await d.coordinator.inspect()).toEqual({ status: "account-switch-required", ownership: "pending-switch" });
    expect(await d.coordinator.syncNow({ claimGuestData: true })).toEqual({ status: "account-switch-required" });
    expect(d.servers[B].log).toEqual([]);
    expect(d.servers[A].log.length).toBe(logA);
    expect(dump()).toBe(before);
    expect(await d.kv.getItem(SYNC_STATE_KEY)).toBe(stateBefore); // pending-switch is never stored
  });
  it("the coordinator never passes an owner choice ('use the account's data only' stays unused)", () => {
    const code = readFileSync(resolve(__dirname, "../lib/accountSync/accountSyncCoordinator.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/ownerChoice|use-account-only|merge-into-account/);
  });
});

describe("H) A linked -> the same account session continues", () => {
  it("normal sync continues after an app restart and a token refresh (same session), no claim asked", async () => {
    const d = device();
    await linkedToA(d);
    setLocal("quran", "zakat");
    const reopened = d.make();
    expect(await reopened.inspect()).toMatchObject({ status: "ready", ownership: "account" });
    expect(await reopened.syncNow()).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    expect(d.servers[A].ids()).toEqual(["quran", "zakat"]);
  });
});

describe("I) nothing public reveals an account or session id", () => {
  it("results and readiness for a device of A while B is signed in carry no id", async () => {
    const d = device();
    await linkedToA(d);
    const sessA = d.auth.current!.sessionId;
    d.auth.signIn(B);
    const outputs = [await d.coordinator.syncNow(), await d.coordinator.syncNow({ claimGuestData: true }), await d.coordinator.inspect(), await d.coordinator.signOut()];
    await d.coordinator.signOut();
    d.auth.signIn(A);
    outputs.push(await d.coordinator.syncNow(), await d.coordinator.inspect());
    const text = JSON.stringify(outputs);
    for (const secret of [A, B, sessA, "session-"]) expect(text).not.toContain(secret);
  });
  it("a session without a session id is refused (fail closed), with no network", async () => {
    const srv = fakeServer();
    const c = createAccountSyncCoordinator({
      account: { getCurrentSession: async () => ({ userId: A, sessionId: null }) },
      server: () => srv.server,
      local: createLocalDataPort(() => NOW),
      state: createSyncStateStore(createMemoryAuthStorage()),
      now: () => NOW,
    });
    expect(await c.syncNow()).toEqual({ status: "failed", reason: "session-unverifiable" });
    expect(srv.log).toEqual([]);
  });
});

describe("J) repeated runs change nothing", () => {
  it("in every state: same ownership, no extra merge, push or write", async () => {
    const d = device();
    await linkedToA(d);
    const snap = async () => [await d.kv.getItem(SYNC_STATE_KEY), dump(), d.servers[A].log.filter((l) => l.startsWith("put")).length, d.servers[B].log.length];

    // linked
    let ref = await snap();
    for (let i = 0; i < 3; i++) { await d.coordinator.syncNow(); await d.coordinator.inspect(); }
    expect(await snap()).toEqual(ref);
    // pending-switch
    d.auth.signIn(B);
    ref = await snap();
    for (let i = 0; i < 3; i++) { await d.coordinator.syncNow({ claimGuestData: true }); await d.coordinator.inspect(); }
    expect(await snap()).toEqual(ref);
    // detached, waiting for a decision
    await d.coordinator.signOut();
    setLocal("quran", "zakat");
    d.auth.signIn(A);
    ref = await snap();
    for (let i = 0; i < 3; i++) { await d.coordinator.syncNow(); await d.coordinator.inspect(); await d.make().syncNow(); }
    expect(await snap()).toEqual(ref);
    // repeated sign-outs
    d.auth.lose();
    ref = await snap();
    for (let i = 0; i < 3; i++) await d.coordinator.signOut();
    expect(await snap()).toEqual(ref);
  });
  it("a sign-out while a sync is running waits for it, so the sync can never re-link the device", async () => {
    const d = device();
    await linkedToA(d);
    setLocal("quran", "zakat");
    const [r, out] = await Promise.all([d.coordinator.syncNow(), d.coordinator.signOut()]);
    expect(r).toMatchObject({ status: "synced" });
    expect(out).toEqual({ status: "signed-out", detached: true });
    expect(await d.stored()).toMatchObject({ owner: null, formerOwner: A, boundSession: null });
  });
});

describe("storage and account auth", () => {
  it("no new app-storage key: only the app's own keys are ever written", async () => {
    const d = device();
    await linkedToA(d);
    await d.coordinator.signOut();
    d.auth.signIn(B);
    await d.coordinator.syncNow();
    d.auth.signIn(A);
    await d.coordinator.syncNow({ claimGuestData: true });
    const appKeys = new Set<string>(Object.values(LOCAL_KEYS));
    for (let i = 0; i < localStorage.length; i++) expect(appKeys.has(localStorage.key(i)!)).toBe(true);
  });
  it("getCurrentSession: the session id from the access token; the token itself is never returned", async () => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const token = `${b64({ alg: "HS256" })}.${b64({ sub: A, session_id: "11112222-aaaa-bbbb-cccc-000000000001" })}.sig-TESTONLY`;
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: token, refresh_token: "refresh-TESTONLY", user: { id: A } } } }) } } as unknown as SupabaseClient;
    const s = await createAccountAuth(() => client).getCurrentSession();
    expect(s).toEqual({ userId: A, sessionId: "11112222-aaaa-bbbb-cccc-000000000001" });
    expect(JSON.stringify(s)).not.toMatch(/TESTONLY|sig-/);
    expect(sessionIdOf(undefined)).toBeNull();
    expect(sessionIdOf("garbage")).toBeNull();
    expect(sessionIdOf(`${b64({})}.${b64({ sub: A })}.x`)).toBeNull();
    const none = { auth: { getSession: async () => ({ data: { session: null } }) } } as unknown as SupabaseClient;
    expect(await createAccountAuth(() => none).getCurrentSession()).toBeNull();
    expect(await createAccountAuth(() => null).getCurrentSession()).toBeNull();
  });
});
