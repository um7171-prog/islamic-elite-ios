import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMemoryAuthStorage } from "@/lib/account/authStorage";
import { createAccountSyncCoordinator } from "@/lib/accountSync/accountSyncCoordinator";
import { createLocalDataPort } from "@/lib/accountSync/localApply";
import { createSupabaseSyncServer, type SyncServer } from "@/lib/accountSync/syncServer";
import { SYNC_STATE_KEY, createSyncStateStore, emptySyncState, isUuid, newDeviceId, parseSyncState } from "@/lib/accountSync/syncState";

/** sync_put's p_device is a uuid column: the device id must always be an RFC 4122 UUID. */

const NOW = new Date(2026, 8, 28, 12, 0).getTime();
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("newDeviceId", () => {
  it("uses crypto.randomUUID when it exists", () => {
    const randomUUID = vi.fn(() => "3F2504E0-4F89-41D3-9A0C-0305E82C3301" as `${string}-${string}-${string}-${string}-${string}`);
    expect(newDeviceId({ randomUUID })).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    expect(randomUUID).toHaveBeenCalledOnce();
  });
  it("without crypto.randomUUID: a UUID v4 from crypto.getRandomValues", () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(a: T) => { new Uint8Array(a!.buffer).fill(0xff); return a; });
    const id = newDeviceId({ getRandomValues: getRandomValues as Crypto["getRandomValues"] });
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff"); // version 4, variant 10xx
    expect(isUuid(id)).toBe(true);
  });
  it("with no crypto at all (or a throwing one): still a valid UUID v4, and random", () => {
    const ids = [newDeviceId(undefined), newDeviceId({}), newDeviceId({ randomUUID: () => { throw new Error("insecure context"); } }), newDeviceId({ randomUUID: () => "not-a-uuid" as never })];
    for (const id of ids) expect(id).toMatch(V4);
    expect(new Set(Array.from({ length: 200 }, () => newDeviceId(undefined))).size).toBe(200);
  });
  it("the real platform crypto gives UUID v4s; never the old id-… format, never a time", () => {
    for (let i = 0; i < 50; i++) expect(newDeviceId()).toMatch(V4);
    vi.stubGlobal("crypto", undefined);
    const id = newDeviceId();
    expect(id).toMatch(V4);
    expect(id).not.toMatch(/^id-/);
    expect(id).not.toContain(Date.now().toString(36));
  });
  it("a new sync state gets a UUID", () => {
    expect(emptySyncState().deviceId).toMatch(V4);
  });
});

describe("the stored device id", () => {
  it("is stable across runs (app restarts)", async () => {
    const kv = createMemoryAuthStorage();
    const first = createSyncStateStore(kv);
    const s = await first.load();
    await first.save(s);
    for (let i = 0; i < 3; i++) expect((await createSyncStateStore(kv).load()).deviceId).toBe(s.deviceId);
  });
  it("an existing valid UUID is never changed", async () => {
    const kv = createMemoryAuthStorage();
    const id = "0d0d0d0d-0000-4000-8000-000000000001";
    const raw = JSON.stringify({ ...emptySyncState(id), owner: A });
    await kv.setItem(SYNC_STATE_KEY, raw);
    const setItem = vi.spyOn(kv, "setItem");
    for (let i = 0; i < 3; i++) expect((await createSyncStateStore(kv).load()).deviceId).toBe(id);
    expect(setItem).not.toHaveBeenCalled();
    expect(await kv.getItem(SYNC_STATE_KEY)).toBe(raw);
  });
  it("an old non-UUID id is replaced ONCE; owner, formerOwner, boundSession and the rest are kept", async () => {
    for (const old of ["id-lz8k2-abc12345", "device-1", "", 42, undefined]) {
      const kv = createMemoryAuthStorage();
      const before = { version: 1, deviceId: old, owner: A, formerOwner: null, boundSession: "session-7", snapshot: null, revs: { journey: 3 }, pending: true, lastSyncedAt: 1234 };
      await kv.setItem(SYNC_STATE_KEY, JSON.stringify(before));
      const setItem = vi.spyOn(kv, "setItem");
      const s1 = await createSyncStateStore(kv).load();
      expect(s1.deviceId).toMatch(V4);
      expect(s1).toMatchObject({ owner: A, formerOwner: null, boundSession: "session-7", revs: { journey: 3 }, pending: true, lastSyncedAt: 1234 });
      expect(setItem).toHaveBeenCalledOnce();
      // Later runs: the same new id, no further writes.
      for (let i = 0; i < 3; i++) expect((await createSyncStateStore(kv).load()).deviceId).toBe(s1.deviceId);
      expect(setItem).toHaveBeenCalledOnce();
      expect(parseSyncState(await kv.getItem(SYNC_STATE_KEY))).toMatchObject({ deviceId: s1.deviceId, owner: A, boundSession: "session-7" });
      vi.restoreAllMocks();
    }
  });
  it("a detached device keeps its ownership through the replacement", async () => {
    const kv = createMemoryAuthStorage();
    await kv.setItem(SYNC_STATE_KEY, JSON.stringify({ ...emptySyncState("id-old"), owner: null, formerOwner: A }));
    expect(await createSyncStateStore(kv).load()).toMatchObject({ owner: null, formerOwner: A, boundSession: null });
  });
  it("uses no localStorage (the sync state lives in the accounts storage)", async () => {
    const setItem = vi.spyOn(localStorage, "setItem");
    const kv = createMemoryAuthStorage();
    await kv.setItem(SYNC_STATE_KEY, JSON.stringify(emptySyncState("id-old")));
    await createSyncStateStore(kv).load();
    newDeviceId(undefined);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});

describe("sync_put always receives a valid UUID", () => {
  function recordingClient() {
    const devices: unknown[] = [];
    const client = {
      from: () => ({ select: async () => ({ data: [], error: null, status: 200 }) }),
      rpc: async (_fn: string, args: { p_device: unknown; p_expected_rev: number; p_schema_version: number; p_data: unknown; p_doc: string }) => {
        devices.push(args.p_device);
        return { data: [{ status: "ok", doc: args.p_doc, rev: args.p_expected_rev + 1, schema_version: args.p_schema_version, data: args.p_data }], error: null, status: 200 };
      },
    } as unknown as SupabaseClient;
    return { client, devices };
  }

  it("a device that started with an old id: sync_put gets the new UUID, and the same one on later syncs", async () => {
    const { client, devices } = recordingClient();
    const server: SyncServer = createSupabaseSyncServer(client);
    const kv = createMemoryAuthStorage();
    await kv.setItem(SYNC_STATE_KEY, JSON.stringify({ ...emptySyncState("id-lz8k2-abc12345"), owner: A, boundSession: "s1" }));
    const c = createAccountSyncCoordinator({
      account: { getCurrentSession: async () => ({ userId: A, sessionId: "s1" }) },
      server: () => server,
      local: createLocalDataPort(() => NOW),
      state: createSyncStateStore(kv),
      now: () => NOW,
    });
    localStorage.setItem("services.favorites", JSON.stringify(["qibla"]));
    expect(await c.syncNow()).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    localStorage.setItem("services.favorites", JSON.stringify(["qibla", "zakat"]));
    expect(await c.syncNow()).toMatchObject({ status: "synced", pushed: ["services.favorites"] });
    expect(devices).toHaveLength(2);
    for (const d of devices) expect(d).toMatch(V4);
    expect(devices[0]).toBe(devices[1]);
    // Ownership untouched by the replacement.
    expect(parseSyncState(await kv.getItem(SYNC_STATE_KEY))).toMatchObject({ owner: A, boundSession: "s1", deviceId: devices[0] });
  });
  it("the server layer never sends a non-UUID p_device (sent as null = unknown device)", async () => {
    const { client, devices } = recordingClient();
    const server = createSupabaseSyncServer(client);
    await server.put("journey", {}, 1, 0, "id-lz8k2-abc12345");
    await server.put("journey", {}, 1, 1, "0d0d0d0d-0000-4000-8000-000000000001");
    expect(devices).toEqual([null, "0d0d0d0d-0000-4000-8000-000000000001"]);
  });
});
