import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readAccountsConfig, type AccountsConfig } from "./config";
import { createDefaultAuthStorage, type AuthStorage } from "./authStorage";

/**
 * The accounts Supabase client (backend-v2). Independent from the legacy client in
 * src/integrations/supabase/client.ts: different project, different session storage (IndexedDB,
 * see authStorage.ts) and a different storage key, so signing in or out here can never touch the
 * legacy session — and the legacy client can never read this one.
 */
export const ACCOUNTS_AUTH_STORAGE_KEY = "elite-accounts-auth-v1";

export function createAccountsClient(config: Extract<AccountsConfig, { ok: true }>, storage: AuthStorage): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      storage,
      storageKey: ACCOUNTS_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // Email OTP codes are typed in the app: no session is ever read from a URL (that is the
      // legacy client's territory, and a code never travels in a link).
      detectSessionInUrl: false,
    },
  });
}

let client: SupabaseClient | null | undefined;

/** The shared accounts client, or null when the build has no (valid) accounts configuration. */
export function getAccountsClient(): SupabaseClient | null {
  if (client === undefined) {
    const cfg = readAccountsConfig(import.meta.env);
    client = cfg.ok ? createAccountsClient(cfg, createDefaultAuthStorage()) : null;
  }
  return client;
}

/** Tests only: use a prepared client (or none). */
export function setAccountsClientForTests(c: SupabaseClient | null | undefined): void {
  client = c;
}
