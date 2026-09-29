import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountsClient } from "./client";

/**
 * Account sign-in with an email one-time code (6 digits) — the only method. No password, no
 * Google, no Apple (later). Everything goes through the accounts Supabase client; nothing here
 * calls fetch itself, logs a code or a token, or touches the app's localStorage.
 *
 * Sign-up stays CLOSED: until the product opens it, a code is only sent to an email that already
 * has an account (shouldCreateUser = false).
 */
export const ALLOW_NEW_ACCOUNTS = false;

export interface AccountUser {
  id: string;
  email: string | null;
}

export type AuthFailure = "not-configured" | "invalid-email" | "invalid-code" | "not-signed-in" | "rate-limited" | "rejected" | "network";
export type AuthResult<T = void> = { ok: true; value: T } | { ok: false; error: AuthFailure };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const CODE = /^\d{6}$/;

function failure(e: unknown): AuthFailure {
  const status = (e as { status?: number } | null)?.status;
  if (status === 429) return "rate-limited";
  if (typeof status === "number" && status >= 400) return "rejected";
  return "network";
}

/** The signed-in account and the id of its session (constant across token refreshes, new on every sign-in). */
export interface AccountSession {
  userId: string;
  sessionId: string | null;
}

/** The `session_id` claim of an access token (read only — the token itself is never kept or returned). */
export function sessionIdOf(accessToken: string | undefined): string | null {
  try {
    const part = accessToken?.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims: unknown = JSON.parse(globalThis.atob(b64));
    const id = (claims as { session_id?: unknown } | null)?.session_id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });
const fail = (error: AuthFailure): AuthResult<never> => ({ ok: false, error });

export function createAccountAuth(getClient: () => SupabaseClient | null = getAccountsClient) {
  const withClient = async <T>(run: (c: SupabaseClient) => Promise<AuthResult<T>>): Promise<AuthResult<T>> => {
    const c = getClient();
    if (!c) return fail("not-configured");
    try {
      return await run(c);
    } catch (e) {
      return fail(failure(e));
    }
  };

  return {
    /** The signed-in account on this device (from the stored session), or null. */
    async getCurrentUser(): Promise<AccountUser | null> {
      const c = getClient();
      if (!c) return null;
      try {
        const { data } = await c.auth.getSession();
        const u = data.session?.user;
        return u ? { id: u.id, email: u.email ?? null } : null;
      } catch {
        return null;
      }
    },

    /** The signed-in account with its session id (for binding the device's data to ONE session), or null. */
    async getCurrentSession(): Promise<AccountSession | null> {
      const c = getClient();
      if (!c) return null;
      try {
        const { data } = await c.auth.getSession();
        const s = data.session;
        return s?.user ? { userId: s.user.id, sessionId: sessionIdOf(s.access_token) } : null;
      } catch {
        return null;
      }
    },

    /** Emails a 6-digit code. Never creates an account while sign-up is closed. */
    sendEmailOtp(email: string): Promise<AuthResult> {
      const address = email.trim().toLowerCase();
      if (!EMAIL.test(address)) return Promise.resolve(fail("invalid-email"));
      return withClient(async (c) => {
        const { error } = await c.auth.signInWithOtp({ email: address, options: { shouldCreateUser: ALLOW_NEW_ACCOUNTS } });
        return error ? fail(failure(error)) : ok(undefined);
      });
    },

    /** Checks the code the user typed; on success the account session is stored (accounts storage only). */
    verifyEmailOtp(email: string, token: string): Promise<AuthResult<AccountUser>> {
      const address = email.trim().toLowerCase();
      const code = token.trim();
      if (!EMAIL.test(address)) return Promise.resolve(fail("invalid-email"));
      if (!CODE.test(code)) return Promise.resolve(fail("invalid-code"));
      return withClient(async (c) => {
        const { data, error } = await c.auth.verifyOtp({ email: address, token: code, type: "email" });
        if (error) return fail(failure(error) === "rejected" ? "invalid-code" : failure(error));
        const u = data.user;
        return u ? ok({ id: u.id, email: u.email ?? null }) : fail("invalid-code");
      });
    },

    /** Ends the account session on THIS device only (the legacy client's session is a different storage). */
    signOut(): Promise<AuthResult> {
      return withClient(async (c) => {
        const { error } = await c.auth.signOut({ scope: "local" });
        return error ? fail(failure(error)) : ok(undefined);
      });
    },

    /** Deletes the signed-in account through the server's delete_my_account() — nothing else. */
    deleteAccount(): Promise<AuthResult> {
      return withClient(async (c) => {
        const { data } = await c.auth.getSession();
        if (!data.session) return fail("not-signed-in");
        // PostgREST reports the HTTP status on the response, not on the error object.
        const { error, status } = await c.rpc("delete_my_account");
        if (error) return fail(failure({ status }));
        // The account no longer exists: drop its local session too.
        await c.auth.signOut({ scope: "local" });
        return ok(undefined);
      });
    },
  };
}

export const accountAuth = createAccountAuth();
