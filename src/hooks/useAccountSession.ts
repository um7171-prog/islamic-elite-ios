import { useCallback, useEffect, useRef, useState } from "react";
import { accountAuth } from "@/lib/account/accountAuth";
import { getAccountsClient } from "@/lib/account/client";
import { createDefaultAccountSyncCoordinator, type AccountSyncCoordinator, type SignOutResult } from "@/lib/accountSync/accountSyncCoordinator";

/**
 * The account session for the account screen: read when the screen opens (a valid stored session is
 * restored — it lives in the accounts IndexedDB storage and is refreshed by the accounts client), and
 * kept in step with sign-in / sign-out / token refresh events.
 *
 * Sign-in / sign-out only: no sync is ever started from here. Sign-out goes through the sync
 * coordinator so the device is detached from the account first (its data stays on the device).
 */
export type AccountSessionState =
  | { status: "loading" }
  | { status: "not-configured" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string | null };

let coordinator: AccountSyncCoordinator | null = null;
const getCoordinator = () => (coordinator ??= createDefaultAccountSyncCoordinator());

export function useAccountSession() {
  const [state, setState] = useState<AccountSessionState>({ status: "loading" });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    let next: AccountSessionState;
    if (!getAccountsClient()) next = { status: "not-configured" };
    else {
      const session = await accountAuth.getCurrentSession();
      next = session ? { status: "signed-in", email: (await accountAuth.getCurrentUser())?.email ?? null } : { status: "signed-out" };
    }
    if (mounted.current) setState(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    // Supabase advises against awaiting its own calls inside this callback: re-read on the next tick.
    const sub = getAccountsClient()?.auth.onAuthStateChange(() => { setTimeout(() => void refresh(), 0); });
    return () => {
      mounted.current = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [refresh]);

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    const r = await getCoordinator().signOut();
    await refresh();
    return r;
  }, [refresh]);

  return { state, refresh, signOut };
}
