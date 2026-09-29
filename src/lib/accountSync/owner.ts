import { SYNC_DOCS, type MergeContext, type RawSyncDocs, type SyncDocName, type SyncDocs } from "./types";
import { hasAnyData, mergeAll, normalizeAll, stableStringify } from "./merge";

/**
 * Account guard for the first sync on a device. The device remembers whose data it holds
 * (`sync.owner`: null = a guest's data, otherwise the account's user id). Data that belongs to a
 * DIFFERENT account is never merged silently — the caller must get an explicit choice from the user.
 */
export type OwnerPlan =
  | { kind: "merge" }
  | { kind: "owner-conflict"; localOwner: string };

/**
 *   guest data (owner null)         -> merge into the account
 *   same account                    -> merge
 *   another account, but no data    -> merge (nothing to mix)
 *   another account WITH data       -> owner-conflict: ask the user
 */
export function planOwner(localOwner: string | null, userId: string, localHasData: boolean): OwnerPlan {
  if (!userId) throw new Error("planOwner: userId is required");
  if (localOwner === null || localOwner === userId || !localHasData) return { kind: "merge" };
  return { kind: "owner-conflict", localOwner };
}

/** What the user chose when the device holds another account's data. */
export type OwnerChoice = "merge-into-account" | "use-account-only";

export type AccountMergeResult =
  | {
      status: "ok";
      /** The new `sync.owner` for this device. */
      owner: string;
      docs: SyncDocs;
      /** Documents whose merged value differs from what the device has. */
      writeLocal: SyncDocName[];
      /** Documents whose merged value differs from what the account has. */
      writeRemote: SyncDocName[];
    }
  | { status: "owner-conflict"; localOwner: string };

export interface AccountMergeInput {
  userId: string;
  /** `sync.owner` stored on this device (null = guest data). */
  localOwner: string | null;
  local: RawSyncDocs;
  remote: RawSyncDocs;
  ctx: MergeContext;
  /** Required only when planOwner() reports an owner conflict. */
  choice?: OwnerChoice;
}

export function mergeIntoAccount(input: AccountMergeInput): AccountMergeResult {
  const { userId, localOwner, ctx } = input;
  const local = normalizeAll(input.local, ctx);
  const remote = normalizeAll(input.remote, ctx);
  const plan = planOwner(localOwner, userId, hasAnyData(local));

  let docs: SyncDocs;
  if (plan.kind === "owner-conflict" && !input.choice) return { status: "owner-conflict", localOwner: plan.localOwner };
  if (plan.kind === "owner-conflict" && input.choice === "use-account-only") docs = remote;
  // Merge the raw inputs (not the normalised copies) so every deletion on either side is applied first.
  else docs = mergeAll(input.local, input.remote, ctx);

  const differs = (a: SyncDocs, name: SyncDocName) => stableStringify(docs[name]) !== stableStringify(a[name]);
  return {
    status: "ok",
    owner: userId,
    docs,
    writeLocal: SYNC_DOCS.filter((n) => differs(local, n)),
    writeRemote: SYNC_DOCS.filter((n) => differs(remote, n)),
  };
}
