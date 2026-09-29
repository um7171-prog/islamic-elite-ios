import { readAccountsConfig } from "./account/config";

/**
 * The Supabase values a build bakes in (VITE_*). They are read in two places:
 *   - at startup: the legacy client (src/integrations/supabase/client.ts) is created while the bundle
 *     loads, before React renders. supabase-js THROWS on a malformed URL (quotes around it, no
 *     https://), and that throw leaves the iOS app on a black screen;
 *   - at build time (vite.config.ts): a malformed value fails the build with a clear message, so a
 *     broken IPA is never produced.
 * Plain module (no import.meta, no browser APIs): the Vite config imports it too.
 */

/** A Supabase project URL, or null when it is not a usable http(s) URL. */
export function usableSupabaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

type Env = Record<string, string | boolean | undefined>;

const QUOTED = /^\s*["'`]|["'`]\s*$/;
const LEGACY = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const;
const ACCOUNTS = ["VITE_ACCOUNTS_SUPABASE_URL", "VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY"] as const;

/**
 * Problems with the Supabase values of a build — variable NAMES only, never their values.
 * Missing values are not a problem here (the app runs without them); malformed ones are.
 */
export function supabaseEnvProblems(env: Env): string[] {
  const problems: string[] = [];
  const text = (k: string) => (typeof env[k] === "string" ? (env[k] as string) : "");

  for (const k of [...LEGACY, ...ACCOUNTS]) {
    if (QUOTED.test(text(k))) problems.push(`${k} is wrapped in quotes — enter the value without quotes.`);
  }
  const legacyUrl = text("VITE_SUPABASE_URL");
  if (legacyUrl.trim() && !QUOTED.test(legacyUrl) && !usableSupabaseUrl(legacyUrl)) {
    problems.push("VITE_SUPABASE_URL is not a valid URL — it must start with https://");
  }
  // Accounts: both or neither, and exactly what the accounts client accepts.
  if (ACCOUNTS.some((k) => text(k).trim()) && !ACCOUNTS.some((k) => QUOTED.test(text(k)))) {
    const cfg = readAccountsConfig(env);
    if ("reason" in cfg) problems.push(`VITE_ACCOUNTS_SUPABASE_URL / VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY rejected: ${cfg.reason}.`);
  }
  return problems;
}
