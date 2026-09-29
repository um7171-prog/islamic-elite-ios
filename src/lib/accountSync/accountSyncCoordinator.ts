import { accountAuth, type AccountSession } from "@/lib/account/accountAuth";
import { createDefaultAuthStorage } from "@/lib/account/authStorage";
import { getAccountsClient } from "@/lib/account/client";
import { createLocalDataPort } from "./localApply";
import { hasAnyData } from "./merge";
import { createSyncEngine, type LocalDataPort, type SkipReason } from "./syncEngine";
import { createSupabaseSyncServer, type ServerError, type SyncServer } from "./syncServer";
import { createSyncStateStore, type SyncState, type SyncStateStore } from "./syncState";
import type { SyncDocName } from "./types";

/**
 * Account <-> Sync coordinator: the single entry point a future account screen calls.
 *
 *   account session -> device ownership -> local snapshot -> Sync Engine -> Local Apply -> sync state
 *
 * It only orchestrates; merging, sync_put, conflicts and retries stay in the Sync Engine, and every
 * local write goes through the Local Apply layer (the port). It is never started automatically.
 *
 * Device ownership (kept in the sync state, in the accounts storage — never in the app's storage):
 *
 *   guest            owner = null, formerOwner = null       never linked to an account
 *   guest (detached) owner = null, formerOwner = A          signed out of A: the data is guest data now
 *   account:A        owner = A, boundSession = the session   linked — syncs normally in THAT session only
 *   pending-switch   (computed, never stored) the signed-in account is not the device's (former) account
 *
 * Rules (checked BEFORE the engine, so a blocked case never reaches the network or the device's data):
 *   - no account session       -> nothing is read from or written to the server or the device;
 *   - another account's device (linked or detached) -> account-switch-required: no merge, no push, no
 *     local write, no "use the account's data only" (that choice stays out until a safe design exists);
 *   - guest data (never linked, or detached by a sign-out) -> needs-guest-decision until the user
 *     explicitly claims it; signing in again, even to the same account, is not consent;
 *   - a sign-out never deletes app data. It detaches the device (signOut() here); a sign-out this code
 *     did not see is caught by the session binding: a new session is never the linked one;
 *   - results never carry a user id, a session id, a token, a code or an email; nothing here logs.
 */

export interface CoordinatorAccount {
  getCurrentSession(): Promise<AccountSession | null>;
  signOut?(): Promise<{ ok: boolean }>;
}

export interface AccountSyncCoordinatorDeps {
  account: CoordinatorAccount;
  /** The accounts server, or null when the build has no accounts configuration. */
  server: () => SyncServer | null;
  local: LocalDataPort;
  state: SyncStateStore;
  now?: () => number;
  maxAttempts?: number;
}

export interface CoordinatorSyncOptions {
  /** The user explicitly confirmed that this device's guest data belongs to the signed-in account. */
  claimGuestData?: boolean;
}

export type PendingReason = ServerError | "offline" | "conflict-retries-exhausted";

/** Public ownership of the device, relative to the signed-in account (no ids). */
export type DeviceOwnership = "guest" | "account" | "pending-switch";

export type CoordinatorResult =
  /** No account session. `sessionEnded`: this coordinator saw a session before (signed out / expired). */
  | { status: "signed-out"; sessionEnded: boolean }
  | { status: "not-configured" }
  | { status: "needs-guest-decision" }
  /** The device holds (or held) another account's data. Nothing was merged, pushed or written. */
  | { status: "account-switch-required" }
  /** Not finished (network, server refusal, conflicts): local data untouched, run again later. */
  | { status: "pending"; reason: PendingReason }
  /** The device could not store the result: NOT a successful sync, stays pending. */
  | { status: "apply-failed" }
  /** Unexpected failure, or a session without a session id (reason code only). */
  | { status: "failed"; reason: "unexpected" | "session-unverifiable" }
  | {
      status: "synced";
      /** false when some documents were left out (newer app version, too large). */
      complete: boolean;
      pushed: SyncDocName[];
      applied: SyncDocName[];
      skipped: { doc: SyncDocName; reason: SkipReason }[];
    };

/** What the coordinator would do, without any network call or write (for a future screen). */
export type CoordinatorReadiness =
  | { status: "signed-out"; sessionEnded: boolean; ownership: "guest" }
  | { status: "not-configured" }
  | { status: "failed"; reason: "unexpected" | "session-unverifiable" }
  | { status: "needs-guest-decision"; ownership: "guest" }
  | { status: "account-switch-required"; ownership: "pending-switch" }
  | { status: "ready"; ownership: DeviceOwnership; pending: boolean; lastSyncedAt: number | null };

export type SignOutResult = { status: "signed-out"; detached: boolean } | { status: "failed"; detached: boolean };

/**
 * How the device relates to the signed-in account `userId` in session `sessionId`:
 *   linked   — this account, this session: normal sync;
 *   other    — another account's data (linked or detached): switch required;
 *   guest    — never-linked guest data;
 *   detached — this account's former data, or its data from an earlier session: guest data to claim.
 */
export type OwnershipPlan = "linked" | "other" | "guest" | "detached";

export function planOwnership(state: Pick<SyncState, "owner" | "formerOwner" | "boundSession">, userId: string, sessionId: string): OwnershipPlan {
  if (state.owner !== null) {
    if (state.owner !== userId) return "other";
    return state.boundSession === sessionId ? "linked" : "detached";
  }
  if (state.formerOwner === null) return "guest";
  return state.formerOwner === userId ? "detached" : "other";
}

type Gate =
  | Exclude<CoordinatorResult, { status: "synced" | "pending" | "apply-failed" }>
  | { status: "ready"; userId: string; sessionId: string; plan: OwnershipPlan; hasData: boolean; state: SyncState };

export function createAccountSyncCoordinator(deps: AccountSyncCoordinatorDeps) {
  const now = deps.now ?? (() => Date.now());
  let lastUserId: string | null = null;
  // Every operation (sync, sign-out) runs one after the other: a sign-out can never interleave a sync.
  let queue: Promise<unknown> = Promise.resolve();
  let running: Promise<CoordinatorResult> | null = null;
  const serial = <T>(op: () => Promise<T>): Promise<T> => {
    const p = queue.then(op, op);
    queue = p.catch(() => undefined);
    return p;
  };

  /** Session, ownership and guest checks: reads the device and the accounts storage only. */
  async function gate(opts: CoordinatorSyncOptions): Promise<Gate> {
    const session = await deps.account.getCurrentSession();
    if (!session?.userId) {
      const sessionEnded = lastUserId !== null;
      lastUserId = null;
      return { status: "signed-out", sessionEnded };
    }
    lastUserId = session.userId;
    // Without a session id a sign-out could not be told apart from the same session: fail closed.
    if (!session.sessionId) return { status: "failed", reason: "session-unverifiable" };
    if (!deps.server()) return { status: "not-configured" };

    const state = await deps.state.load();
    const plan = planOwnership(state, session.userId, session.sessionId);
    if (plan === "other") return { status: "account-switch-required" };
    // Presence of data is judged without the snapshot (a stale snapshot must not invent deletions).
    const hasData = plan !== "linked" && hasAnyData(deps.local.read(null, now()).docs);
    if (plan !== "linked" && hasData && !opts.claimGuestData) return { status: "needs-guest-decision" };
    return { status: "ready", userId: session.userId, sessionId: session.sessionId, plan, hasData, state };
  }

  async function run(opts: CoordinatorSyncOptions): Promise<CoordinatorResult> {
    let g: Gate;
    try {
      g = await gate(opts);
    } catch {
      return { status: "failed", reason: "unexpected" };
    }
    if (g.status !== "ready") return g;
    const { userId, sessionId, plan, hasData, state } = g;

    try {
      // A detached device with NO data left: its old snapshot would turn "everything is gone" into
      // deletions for the account. Start from a clean slate instead (the account's data is restored).
      if (plan === "detached" && !hasData) {
        await deps.state.save({ ...state, owner: null, formerOwner: state.formerOwner ?? state.owner, snapshot: null, revs: {} });
      }

      const engine = createSyncEngine({
        // The engine runs for exactly the account checked above (no second session lookup).
        account: { getCurrentUser: async () => ({ id: userId }) },
        server: deps.server() as SyncServer,
        local: deps.local,
        state: deps.state,
        now,
        maxAttempts: deps.maxAttempts,
      });
      // Never an owner choice: another account's device was stopped by the gate. The claim reaches the
      // engine only when the user gave it explicitly.
      const r = await engine.syncNow({ claimGuestData: opts.claimGuestData === true });
      switch (r.status) {
        case "no-session": return { status: "signed-out", sessionEnded: true };
        case "needs-guest-decision": return { status: "needs-guest-decision" };
        case "owner-conflict": return { status: "account-switch-required" };
        case "offline": return { status: "pending", reason: "offline" };
        case "error": return r.reason === "apply-failed" ? { status: "apply-failed" } : { status: "pending", reason: r.reason };
        case "synced": {
          // The device now belongs to this account in THIS session.
          if (plan !== "linked") {
            const after = await deps.state.load();
            await deps.state.save({ ...after, owner: userId, formerOwner: null, boundSession: sessionId });
          }
          return { status: "synced", complete: r.skipped.length === 0, pushed: r.pushed, applied: r.applied, skipped: r.skipped };
        }
      }
    } catch {
      return { status: "failed", reason: "unexpected" };
    }
  }

  return {
    /** Where things stand, without touching the network or the device's data. */
    async inspect(): Promise<CoordinatorReadiness> {
      try {
        const g = await gate({});
        switch (g.status) {
          case "signed-out": return { ...g, ownership: "guest" };
          case "needs-guest-decision": return { status: "needs-guest-decision", ownership: "guest" };
          case "account-switch-required": return { status: "account-switch-required", ownership: "pending-switch" };
          case "ready": return { status: "ready", ownership: g.plan === "linked" ? "account" : "guest", pending: g.state.pending, lastSyncedAt: g.state.lastSyncedAt };
          default: return g as CoordinatorReadiness;
        }
      } catch {
        return { status: "failed", reason: "unexpected" };
      }
    },

    /** One sync pass, only when asked. Concurrent calls share the pass already running. */
    syncNow(opts: CoordinatorSyncOptions = {}): Promise<CoordinatorResult> {
      running ??= serial(() => run(opts)).finally(() => { running = null; });
      return running;
    },

    /**
     * Signs out of the account on this device. The device is detached FIRST (its data becomes guest
     * data that only this account may claim, explicitly), then the session is ended. App data is never
     * deleted. Waits for a running sync so it can never re-link the device afterwards.
     */
    signOut(): Promise<SignOutResult> {
      return serial(async () => {
        let detached = false;
        try {
          const state = await deps.state.load();
          if (state.owner !== null) {
            await deps.state.save({ ...state, owner: null, formerOwner: state.owner, boundSession: null });
          }
          detached = true;
        } catch {
          /* not recorded: the session binding still treats any later session as detached */
        }
        lastUserId = null;
        try {
          const r = deps.account.signOut ? await deps.account.signOut() : { ok: true };
          return r.ok ? { status: "signed-out", detached } : { status: "failed", detached };
        } catch {
          return { status: "failed", detached };
        }
      });
    },
  };
}

export type AccountSyncCoordinator = ReturnType<typeof createAccountSyncCoordinator>;

/** The production wiring: accounts auth + backend-v2 server + the app's storage. Not started by anything. */
export function createDefaultAccountSyncCoordinator(): AccountSyncCoordinator {
  let server: SyncServer | null | undefined;
  return createAccountSyncCoordinator({
    account: accountAuth,
    server: () => {
      if (server === undefined) { const c = getAccountsClient(); server = c ? createSupabaseSyncServer(c) : null; }
      return server;
    },
    local: createLocalDataPort(),
    state: createSyncStateStore(createDefaultAuthStorage()),
  });
}
