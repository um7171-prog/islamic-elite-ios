import { readLocalDocs, buildSnapshot, type LocalReadResult, type ReadonlyStorageLike } from "./localAdapters";
import { hasAnyData, mergeDoc, stableStringify } from "./merge";
import { mergeIntoAccount, type OwnerChoice } from "./owner";
import type { LocalSnapshot } from "./snapshot";
import type { SyncServer, ServerError, ServerDoc } from "./syncServer";
import type { SyncState, SyncStateStore } from "./syncState";
import { SYNC_DOCS, SYNC_SCHEMA_VERSION, type RawSyncDocs, type SyncDocName, type SyncDocs } from "./types";

/**
 * Sync engine: pull -> merge (Phase 2) -> push with sync_put (optimistic concurrency) -> apply locally.
 *
 * Safety rules:
 *   - nothing happens without an account session;
 *   - guest data is never uploaded until the caller confirms it belongs to this account
 *     (claimGuestData), and another account's data is never merged (owner conflict);
 *   - a missing or malformed server document is NEVER a deletion: merging is a union;
 *   - on any failure the device's data is left exactly as it was and the sync stays pending;
 *   - local data is only read through the adapters and only written through `local.apply`
 *     (this engine never touches localStorage);
 *   - a conflicting write is re-merged with the server's copy and retried, at most `maxAttempts` times.
 */

export interface SyncAccount {
  getCurrentUser(): Promise<{ id: string } | null>;
}

/**
 * The device side. `apply` receives only the documents whose content differs from the device's, and
 * reports which of them it actually wrote (a document can differ only in representation — e.g. seq or
 * deletion records the device does not store — and then nothing is written).
 */
export interface LocalDataPort {
  read(snapshot: LocalSnapshot | null, now: number): LocalReadResult;
  apply(docs: Partial<SyncDocs>): Promise<{ written: SyncDocName[] } | void>;
}

export interface SyncEngineDeps {
  account: SyncAccount;
  server: SyncServer;
  local: LocalDataPort;
  state: SyncStateStore;
  now?: () => number;
  /** Put attempts per document before giving up (conflicts). */
  maxAttempts?: number;
}

export interface SyncOptions {
  /** First sync of a device holding guest data: true = this data belongs to the signed-in account. */
  claimGuestData?: boolean;
  /** The device holds ANOTHER account's data: what the user chose. */
  ownerChoice?: OwnerChoice;
}

export type SkipReason = "newer-schema" | "too-large";

export type SyncOutcome =
  | { status: "no-session" }
  | { status: "needs-guest-decision" }
  | { status: "owner-conflict"; localOwner: string }
  | { status: "offline"; pending: true }
  | { status: "error"; reason: ServerError | "conflict-retries-exhausted" | "apply-failed"; pending: true }
  | {
      status: "synced";
      /** Server push was required and done. */
      pushed: SyncDocName[];
      /** The merged document differs from the device's representation of it. */
      changed: SyncDocName[];
      /** The device's storage actually changed. */
      applied: SyncDocName[];
      skipped: { doc: SyncDocName; reason: SkipReason }[];
    };

export const DEFAULT_MAX_ATTEMPTS = 3;
/** Kept below the server's 256 KB CHECK so a document is refused here, not by the database. */
export const MAX_DOC_BYTES = 250_000;

const byteSize = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Reads the device's data through the read-only adapters. */
export function createAdapterReader(storage: ReadonlyStorageLike): LocalDataPort["read"] {
  return (snapshot, now) => readLocalDocs({ storage, snapshot, now });
}

export function createSyncEngine(deps: SyncEngineDeps) {
  const now = deps.now ?? (() => Date.now());
  const maxAttempts = Math.max(1, deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  let running: Promise<SyncOutcome> | null = null;

  async function markPending(state: SyncState): Promise<void> {
    try {
      await deps.state.save({ ...state, pending: true });
    } catch {
      /* the next run starts from the previous state; nothing local was changed */
    }
  }

  async function run(opts: SyncOptions): Promise<SyncOutcome> {
    const user = await deps.account.getCurrentUser();
    if (!user) return { status: "no-session" };

    const state = await deps.state.load();
    const t = now();
    const ctx = { now: t };
    const local = deps.local.read(state.snapshot, t).docs;

    // Guest data (never synced) is uploaded only when the caller confirms it is this account's.
    if (state.owner === null && hasAnyData(local) && !opts.claimGuestData) return { status: "needs-guest-decision" };

    const pulled = await deps.server.pullAll();
    if ("error" in pulled) {
      await markPending(state);
      return pulled.error === "network" ? { status: "offline", pending: true } : { status: "error", reason: pulled.error, pending: true };
    }

    // Documents written by a newer app version are left alone (not merged, pushed or applied).
    const skipped: { doc: SyncDocName; reason: SkipReason }[] = [];
    const remote: RawSyncDocs = {};
    for (const name of SYNC_DOCS) {
      const d = pulled.docs[name];
      if (!d) continue;
      if (d.schemaVersion > SYNC_SCHEMA_VERSION) skipped.push({ doc: name, reason: "newer-schema" });
      else remote[name] = d.data;
    }
    const isSkipped = (name: SyncDocName) => skipped.some((s) => s.doc === name);

    const merged = mergeIntoAccount({ userId: user.id, localOwner: state.owner, local: local as unknown as RawSyncDocs, remote, ctx, choice: opts.ownerChoice });
    if (merged.status === "owner-conflict") return { status: "owner-conflict", localOwner: merged.localOwner };

    const docs = { ...merged.docs } as Record<SyncDocName, unknown>;
    const revs: SyncState["revs"] = { ...state.revs };
    for (const name of SYNC_DOCS) { const d = pulled.docs[name]; if (d && !isSkipped(name)) revs[name] = d.rev; }
    const pushed: SyncDocName[] = [];

    for (const name of merged.writeRemote) {
      if (isSkipped(name)) continue;
      if (byteSize(docs[name]) > MAX_DOC_BYTES) { skipped.push({ doc: name, reason: "too-large" }); continue; }
      let expected = pulled.docs[name]?.rev ?? 0;
      let done = false;
      for (let attempt = 1; attempt <= maxAttempts && !done; attempt++) {
        const r = await deps.server.put(name, docs[name], SYNC_SCHEMA_VERSION, expected, state.deviceId);
        if ("error" in r) {
          await markPending(state);
          return r.error === "network" ? { status: "offline", pending: true } : { status: "error", reason: r.error, pending: true };
        }
        if (r.status === "ok") { revs[name] = r.rev; pushed.push(name); done = true; break; }
        // Conflict: never overwrite — merge with the server's current copy and try again on its rev.
        const server: ServerDoc | null = r.server;
        if (server && server.schemaVersion > SYNC_SCHEMA_VERSION) { skipped.push({ doc: name, reason: "newer-schema" }); done = true; break; }
        docs[name] = mergeDoc(name, docs[name], server?.data, ctx);
        expected = server?.rev ?? 0;
        if (server && stableStringify(docs[name]) === stableStringify(mergeDoc(name, server.data, undefined, ctx))) {
          revs[name] = server.rev; // the server already holds exactly the merged result
          done = true;
        }
      }
      if (!done) {
        await markPending(state);
        return { status: "error", reason: "conflict-retries-exhausted", pending: true };
      }
    }

    // Apply locally only what changed — merged data is a union of both sides (plus real deletions).
    const changed = SYNC_DOCS.filter((n) => !isSkipped(n) && stableStringify(docs[n]) !== stableStringify(local[n]));
    let applied: SyncDocName[] = [];
    if (changed.length) {
      try {
        const report = await deps.local.apply(Object.fromEntries(changed.map((n) => [n, docs[n]])) as Partial<SyncDocs>);
        // Only what the device actually wrote counts as applied (a port that reports nothing wrote all).
        applied = report ? changed.filter((n) => report.written.includes(n)) : changed;
      } catch {
        await markPending(state);
        return { status: "error", reason: "apply-failed", pending: true };
      }
    }

    const finalDocs = docs as unknown as SyncDocs;
    await deps.state.save({
      ...state,
      owner: user.id,
      snapshot: buildSnapshot(finalDocs, t, user.id),
      revs,
      pending: false,
      lastSyncedAt: t,
    });
    return { status: "synced", pushed, changed, applied, skipped };
  }

  return {
    /** One sync pass. Concurrent calls share the pass already running. */
    syncNow(opts: SyncOptions = {}): Promise<SyncOutcome> {
      running ??= run(opts).finally(() => { running = null; });
      return running;
    },
  };
}
