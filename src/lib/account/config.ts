/**
 * Configuration of the ACCOUNTS backend (backend-v2, project lyjnlufwtvkjptibksux) — a separate
 * Supabase project from the one the app already uses for analytics / OCR / remote push, which stays
 * untouched (src/integrations/supabase/client.ts).
 *
 * Both values are PUBLIC by design and come from the build environment:
 *   VITE_ACCOUNTS_SUPABASE_URL              https://lyjnlufwtvkjptibksux.supabase.co
 *   VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…   (Dashboard -> Project Settings -> API)
 * A secret / service_role key is refused: it must never reach the app bundle.
 */
export const ACCOUNTS_PROJECT_REF = "lyjnlufwtvkjptibksux";
/** The project the rest of the app uses — never valid for accounts. */
export const LEGACY_PROJECT_REF = "zododbbdbjqxkasgzrbn";

export type AccountsConfig =
  | { ok: true; url: string; publishableKey: string }
  | { ok: false; reason: "missing" | "wrong-project" | "secret-key" | "invalid-key" };

type Env = Record<string, string | boolean | undefined>;

/** Decodes a JWT payload without verifying it (only to reject service_role keys). */
function jwtRole(key: string): string | null {
  const part = key.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function readAccountsConfig(env: Env): AccountsConfig {
  const url = typeof env.VITE_ACCOUNTS_SUPABASE_URL === "string" ? env.VITE_ACCOUNTS_SUPABASE_URL.trim() : "";
  const key = typeof env.VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY === "string" ? env.VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY.trim() : "";
  if (!url || !key) return { ok: false, reason: "missing" };
  // Exactly the backend-v2 project, over https — never the legacy project or any other host.
  if (url.replace(/\/+$/, "") !== `https://${ACCOUNTS_PROJECT_REF}.supabase.co`) return { ok: false, reason: "wrong-project" };
  if (key.startsWith("sb_secret_") || jwtRole(key) === "service_role") return { ok: false, reason: "secret-key" };
  if (!key.startsWith("sb_publishable_") && jwtRole(key) !== "anon") return { ok: false, reason: "invalid-key" };
  return { ok: true, url: `https://${ACCOUNTS_PROJECT_REF}.supabase.co`, publishableKey: key };
}
