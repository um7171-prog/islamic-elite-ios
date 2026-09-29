import { parseSnapshot, type LocalSnapshot } from "./snapshot";
import { SYNC_DOCS, type SyncDocName } from "./types";

/**
 * Per-device sync bookkeeping. Stored in the ACCOUNTS key-value storage (IndexedDB, see
 * src/lib/account/authStorage.ts) — never in the app's localStorage, and never mixed with app data.
 */
export interface SyncState {
  version: 1;
  /** Stable id of this installation (an RFC 4122 UUID), sent as sync_put's p_device (informational). */
  deviceId: string;
  /** sync.owner: whose data the device holds — null = a guest's data (never synced, or signed out). */
  owner: string | null;
  /**
   * Set when the device was detached from an account (sign-out): the account its data came from.
   * The data is guest data now; only that same account may claim it (explicitly), never another one.
   */
  formerOwner: string | null;
  /**
   * The account session (session_id) the device was linked in. A different session for the same account
   * means a sign-out happened in between (seen or not): the device is then treated as detached.
   */
  boundSession: string | null;
  /** The device's data right after the last complete sync (for change detection). */
  snapshot: LocalSnapshot | null;
  /** Last known server rev per document. */
  revs: Partial<Record<SyncDocName, number>>;
  /** A sync did not finish (offline, conflict retries exhausted…): run it again later. */
  pending: boolean;
  lastSyncedAt: number | null;
}

/** Async key-value storage (the accounts storage implements it). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const SYNC_STATE_KEY = "elite-sync-state-v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** An RFC 4122 UUID (what sync_put's p_device accepts). */
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

type RandomSource = Partial<Pick<Crypto, "randomUUID" | "getRandomValues">> | undefined;

/**
 * A new device id: always a UUID v4. crypto.randomUUID when available; otherwise 16 random bytes from
 * crypto.getRandomValues (or Math.random where no crypto exists at all) with the v4 version/variant bits.
 * Random only — never a time, an account, an email or a session.
 */
export function newDeviceId(c: RandomSource = (globalThis as { crypto?: Crypto }).crypto): string {
  try {
    const id = typeof c?.randomUUID === "function" ? c.randomUUID() : null;
    if (isUuid(id)) return id.toLowerCase();
  } catch { /* fall back below */ }
  const b = new Uint8Array(16);
  let filled = false;
  try {
    if (typeof c?.getRandomValues === "function") { c.getRandomValues(b); filled = true; }
  } catch { /* fall back below */ }
  if (!filled) for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptySyncState(deviceId: string = newDeviceId()): SyncState {
  return { version: 1, deviceId, owner: null, formerOwner: null, boundSession: null, snapshot: null, revs: {}, pending: false, lastSyncedAt: null };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseSyncState(raw: string | null): SyncState | null {
  return readSyncState(raw)?.state ?? null;
}

/**
 * A stored state, validated. A device id that is not a UUID (an older fallback id) is replaced by a new
 * UUID — everything else (owner, formerOwner, boundSession, snapshot, revs…) is kept as it is.
 */
function readSyncState(raw: string | null): { state: SyncState; repairedDeviceId: boolean } | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v) || v.version !== 1) return null;
    const repairedDeviceId = !isUuid(v.deviceId);
    const revs: SyncState["revs"] = {};
    if (isObj(v.revs)) for (const d of SYNC_DOCS) { const r = v.revs[d]; if (Number.isInteger(r) && (r as number) >= 1) revs[d] = r as number; }
    const state: SyncState = {
      version: 1,
      deviceId: repairedDeviceId ? newDeviceId() : (v.deviceId as string).toLowerCase(),
      owner: typeof v.owner === "string" && v.owner ? v.owner : null,
      formerOwner: typeof v.formerOwner === "string" && v.formerOwner ? v.formerOwner : null,
      boundSession: typeof v.boundSession === "string" && v.boundSession ? v.boundSession : null,
      snapshot: parseSnapshot(v.snapshot),
      revs,
      pending: v.pending === true,
      lastSyncedAt: typeof v.lastSyncedAt === "number" && Number.isFinite(v.lastSyncedAt) ? v.lastSyncedAt : null,
    };
    return { state, repairedDeviceId };
  } catch {
    return null;
  }
}

export interface SyncStateStore {
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
}

/** Sync state over the accounts key-value storage; an unreadable state starts over as a fresh device. */
export function createSyncStateStore(kv: KeyValueStore): SyncStateStore {
  return {
    async load() {
      let raw: string | null = null;
      try { raw = await kv.getItem(SYNC_STATE_KEY); } catch { /* treated as a fresh device */ }
      const read = readSyncState(raw);
      if (!read) return emptySyncState();
      // A replaced device id is stored right away, so it is replaced once, not on every load.
      if (read.repairedDeviceId) {
        try { await kv.setItem(SYNC_STATE_KEY, JSON.stringify(read.state)); } catch { /* replaced again next time */ }
      }
      return read.state;
    },
    async save(state) {
      await kv.setItem(SYNC_STATE_KEY, JSON.stringify(state));
    },
  };
}
