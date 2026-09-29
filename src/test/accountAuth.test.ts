import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ACCOUNTS_PROJECT_REF, LEGACY_PROJECT_REF, readAccountsConfig } from "@/lib/account/config";
import { createDefaultAuthStorage, createMemoryAuthStorage, type AuthStorage } from "@/lib/account/authStorage";
import { ACCOUNTS_AUTH_STORAGE_KEY, createAccountsClient, getAccountsClient, setAccountsClientForTests } from "@/lib/account/client";
import { ALLOW_NEW_ACCOUNTS, createAccountAuth } from "@/lib/account/accountAuth";

const URL_OK = `https://${ACCOUNTS_PROJECT_REF}.supabase.co`;
const PUB_KEY = "sb_publishable_TESTONLY_not_a_real_key";
const LEGACY_SESSION_KEY = `sb-${LEGACY_PROJECT_REF}-auth-token`;
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "user@test.invalid" };

/** A base64url JWT-shaped string (unsigned) — only its payload is ever decoded client-side. */
const fakeJwt = (payload: Record<string, unknown>) =>
  `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.sig`;

interface Call { url: string; method: string; body: unknown; headers: Record<string, string> }
let calls: Call[] = [];
let respond: (c: Call) => { status: number; body: unknown } = () => ({ status: 200, body: {} });

function stubNetwork() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const call = { url, method: init?.method ?? "GET", body, headers };
    calls.push(call);
    const r = respond(call);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }));
}

function sessionFor(user = USER) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: fakeJwt({ sub: user.id, role: "authenticated", exp, aud: "authenticated", email: user.email }),
    refresh_token: "refresh-TESTONLY",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
}

let storage: AuthStorage;
function freshAuth() {
  storage = createMemoryAuthStorage();
  const cfg = readAccountsConfig({ VITE_ACCOUNTS_SUPABASE_URL: URL_OK, VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY: PUB_KEY });
  if (!cfg.ok) throw new Error("config");
  const client = createAccountsClient(cfg, storage);
  return { client, auth: createAccountAuth(() => client) };
}
const appStorageDump = () => {
  const out: [string, string | null][] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; out.push([k, localStorage.getItem(k)]); }
  return JSON.stringify(out.sort());
};

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 200, body: {} });
  localStorage.clear();
  // The app's own data + a legacy Supabase session: none of it may be touched.
  localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify({ access_token: "legacy-TESTONLY", user: { id: "legacy" } }));
  localStorage.setItem("mushaf:position", JSON.stringify({ page: 42, surah: 2, at: 1 }));
  localStorage.setItem("services.favorites", JSON.stringify(["qibla"]));
  stubNetwork();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setAccountsClientForTests(undefined);
});

/* ---------------- configuration ---------------- */

describe("accounts configuration (backend-v2 only, public key only)", () => {
  const cfg = (url: string | undefined, key: string | undefined) =>
    readAccountsConfig({ VITE_ACCOUNTS_SUPABASE_URL: url, VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY: key });

  it("accepts exactly the backend-v2 project URL with a publishable key", () => {
    expect(cfg(URL_OK, PUB_KEY)).toEqual({ ok: true, url: URL_OK, publishableKey: PUB_KEY });
    expect(cfg(`${URL_OK}/`, PUB_KEY)).toMatchObject({ ok: true, url: URL_OK });
    expect(cfg(URL_OK, fakeJwt({ role: "anon" }))).toMatchObject({ ok: true });
  });
  it("refuses the legacy project, any other project, http, and a missing value", () => {
    expect(cfg(`https://${LEGACY_PROJECT_REF}.supabase.co`, PUB_KEY)).toEqual({ ok: false, reason: "wrong-project" });
    expect(cfg("https://someoneelse.supabase.co", PUB_KEY)).toEqual({ ok: false, reason: "wrong-project" });
    expect(cfg(`http://${ACCOUNTS_PROJECT_REF}.supabase.co`, PUB_KEY)).toEqual({ ok: false, reason: "wrong-project" });
    expect(cfg(undefined, PUB_KEY)).toEqual({ ok: false, reason: "missing" });
    expect(cfg(URL_OK, "")).toEqual({ ok: false, reason: "missing" });
  });
  it("refuses a secret or service_role key outright", () => {
    expect(cfg(URL_OK, "sb_secret_TESTONLY")).toEqual({ ok: false, reason: "secret-key" });
    expect(cfg(URL_OK, fakeJwt({ role: "service_role" }))).toEqual({ ok: false, reason: "secret-key" });
    expect(cfg(URL_OK, "random-string")).toEqual({ ok: false, reason: "invalid-key" });
  });
  it("the shared client reads the backend-v2 URL from the environment (and is absent without it)", async () => {
    // Independent of the developer's local .env: absent values first.
    vi.stubEnv("VITE_ACCOUNTS_SUPABASE_URL", "");
    vi.stubEnv("VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY", "");
    setAccountsClientForTests(undefined);
    expect(getAccountsClient()).toBeNull();
    setAccountsClientForTests(undefined);
    vi.stubEnv("VITE_ACCOUNTS_SUPABASE_URL", URL_OK);
    vi.stubEnv("VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY", PUB_KEY);
    const client = getAccountsClient();
    expect(client).not.toBeNull();
    await createAccountAuth(() => client).sendEmailOtp("user@test.invalid");
    expect(new URL(calls[0].url).host).toBe(`${ACCOUNTS_PROJECT_REF}.supabase.co`);
    expect(calls[0].headers.apikey).toBe(PUB_KEY);
  });
  it("without configuration every call fails safely as not-configured (no network)", async () => {
    const auth = createAccountAuth(() => null);
    expect(await auth.getCurrentUser()).toBeNull();
    expect(await auth.sendEmailOtp("user@test.invalid")).toEqual({ ok: false, error: "not-configured" });
    expect(await auth.deleteAccount()).toEqual({ ok: false, error: "not-configured" });
    expect(calls).toHaveLength(0);
  });
});

/* ---------------- session storage isolation ---------------- */

describe("session storage is separate from the legacy client and from app data", () => {
  it("uses its own storage key, different from the legacy client's", () => {
    expect(ACCOUNTS_AUTH_STORAGE_KEY).not.toBe(LEGACY_SESSION_KEY);
    expect(ACCOUNTS_AUTH_STORAGE_KEY).not.toMatch(/^sb-/);
  });
  it("the default storage is IndexedDB-or-memory, never localStorage (jsdom has no IndexedDB -> memory)", async () => {
    const s = createDefaultAuthStorage();
    expect(s.persistent).toBe(false);
    const before = appStorageDump();
    await s.setItem(ACCOUNTS_AUTH_STORAGE_KEY, "x");
    expect(await s.getItem(ACCOUNTS_AUTH_STORAGE_KEY)).toBe("x");
    expect(appStorageDump()).toBe(before);
  });
  it("a whole sign-in / sign-out / delete cycle never writes to localStorage", async () => {
    const setItem = vi.spyOn(localStorage, "setItem");
    const removeItem = vi.spyOn(localStorage, "removeItem");
    const before = appStorageDump();
    const { auth } = freshAuth();
    respond = (c) => (c.url.includes("/verify") ? { status: 200, body: sessionFor() } : { status: 200, body: {} });
    await auth.sendEmailOtp("user@test.invalid");
    await auth.verifyEmailOtp("user@test.invalid", "123456");
    await auth.getCurrentUser();
    await auth.deleteAccount();
    await auth.signOut();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(appStorageDump()).toBe(before);
  });
});

/* ---------------- the service ---------------- */

describe("accountAuth", () => {
  it("getCurrentUser: null without a session", async () => {
    const { auth } = freshAuth();
    expect(await auth.getCurrentUser()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("sendEmailOtp: email OTP through the client, sign-up stays closed (create_user = false)", async () => {
    const { auth } = freshAuth();
    expect(ALLOW_NEW_ACCOUNTS).toBe(false);
    expect(await auth.sendEmailOtp("  User@Test.invalid ")).toEqual({ ok: true, value: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${URL_OK}/auth/v1/otp`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({ email: "user@test.invalid", create_user: false });
    expect(JSON.stringify(calls[0].body)).not.toMatch(/password/i);
  });

  it("sendEmailOtp: an invalid email is refused before any request", async () => {
    const { auth } = freshAuth();
    for (const bad of ["", "no-at-sign", "a@b", "two words@x.com"]) {
      expect(await auth.sendEmailOtp(bad)).toEqual({ ok: false, error: "invalid-email" });
    }
    expect(calls).toHaveLength(0);
  });

  it("sendEmailOtp: server refusal / rate limit are reported, not thrown", async () => {
    const { auth } = freshAuth();
    respond = () => ({ status: 429, body: { code: 429, msg: "rate limited" } });
    expect(await auth.sendEmailOtp("user@test.invalid")).toEqual({ ok: false, error: "rate-limited" });
    respond = () => ({ status: 422, body: { code: 422, msg: "Signups not allowed for otp" } });
    expect(await auth.sendEmailOtp("user@test.invalid")).toEqual({ ok: false, error: "rejected" });
  });

  it("verifyEmailOtp: checks the 6-digit token as type 'email' and stores the session in the accounts storage", async () => {
    const { auth } = freshAuth();
    respond = () => ({ status: 200, body: sessionFor() });
    const r = await auth.verifyEmailOtp("user@test.invalid", " 123456 ");
    expect(r).toEqual({ ok: true, value: USER });
    expect(calls[0].url).toBe(`${URL_OK}/auth/v1/verify`);
    expect(calls[0].body).toMatchObject({ email: "user@test.invalid", token: "123456", type: "email" });
    expect(await storage.getItem(ACCOUNTS_AUTH_STORAGE_KEY)).toContain(USER.id);
    expect(await auth.getCurrentUser()).toEqual(USER);
  });

  it("verifyEmailOtp: a malformed code is refused locally; a wrong code is 'invalid-code'", async () => {
    const { auth } = freshAuth();
    for (const bad of ["", "12345", "1234567", "abcdef"]) expect(await auth.verifyEmailOtp("user@test.invalid", bad)).toEqual({ ok: false, error: "invalid-code" });
    expect(calls).toHaveLength(0);
    respond = () => ({ status: 403, body: { code: 403, msg: "Token has expired or is invalid" } });
    expect(await auth.verifyEmailOtp("user@test.invalid", "000000")).toEqual({ ok: false, error: "invalid-code" });
  });

  it("signOut: clears only the accounts session; the legacy session and app data are untouched", async () => {
    const { auth } = freshAuth();
    await storage.setItem(ACCOUNTS_AUTH_STORAGE_KEY, JSON.stringify(sessionFor()));
    const legacyBefore = localStorage.getItem(LEGACY_SESSION_KEY);
    const before = appStorageDump();
    expect(await auth.getCurrentUser()).toEqual(USER);
    await auth.signOut();
    expect(await storage.getItem(ACCOUNTS_AUTH_STORAGE_KEY)).toBeNull();
    expect(await auth.getCurrentUser()).toBeNull();
    expect(localStorage.getItem(LEGACY_SESSION_KEY)).toBe(legacyBefore);
    expect(appStorageDump()).toBe(before);
    // Only the accounts project was contacted, and only for this device's session.
    for (const c of calls) expect(new URL(c.url).host).toBe(`${ACCOUNTS_PROJECT_REF}.supabase.co`);
    expect(calls.some((c) => c.url.includes("/logout") && c.url.includes("scope=local"))).toBe(true);
  });

  it("deleteAccount: calls the delete_my_account RPC only, then clears the local session", async () => {
    const { auth } = freshAuth();
    await storage.setItem(ACCOUNTS_AUTH_STORAGE_KEY, JSON.stringify(sessionFor()));
    expect(await auth.deleteAccount()).toEqual({ ok: true, value: undefined });
    const rpc = calls.filter((c) => c.url.includes("/rest/v1/"));
    expect(rpc).toHaveLength(1);
    expect(rpc[0].url).toBe(`${URL_OK}/rest/v1/rpc/delete_my_account`);
    expect(rpc[0].method).toBe("POST");
    expect(calls.some((c) => /auth\/v1\/admin|\/users/.test(c.url))).toBe(false);
    expect(rpc[0].headers.authorization).toMatch(/^Bearer /);
    expect(await storage.getItem(ACCOUNTS_AUTH_STORAGE_KEY)).toBeNull();
  });

  it("deleteAccount: refused without a session (no request), and a server error keeps the session", async () => {
    const { auth } = freshAuth();
    expect(await auth.deleteAccount()).toEqual({ ok: false, error: "not-signed-in" });
    expect(calls).toHaveLength(0);
    await storage.setItem(ACCOUNTS_AUTH_STORAGE_KEY, JSON.stringify(sessionFor()));
    respond = (c) => (c.url.includes("delete_my_account") ? { status: 403, body: { message: "admin members cannot delete their account here" } } : { status: 200, body: {} });
    expect(await auth.deleteAccount()).toEqual({ ok: false, error: "rejected" });
    expect(await auth.getCurrentUser()).toEqual(USER);
  });

  it("never logs codes or tokens", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const { auth } = freshAuth();
    respond = (c) => (c.url.includes("/verify") ? { status: 200, body: sessionFor() } : { status: 200, body: {} });
    await auth.sendEmailOtp("user@test.invalid");
    await auth.verifyEmailOtp("user@test.invalid", "654321");
    await auth.deleteAccount();
    const logged = spies.flatMap((s) => s.mock.calls).map((a) => JSON.stringify(a)).join(" ");
    expect(logged).not.toContain("654321");
    expect(logged).not.toContain("refresh-TESTONLY");
    expect(logged).not.toContain(sessionFor().access_token.split(".")[1]);
  });
});

/* ---------------- source-level guarantees ---------------- */

describe("source guarantees for src/lib/account", () => {
  const files = readdirSync("src/lib/account").map((f) => `src/lib/account/${f}`);
  // Code only: explanatory comments may name what the code must NOT use.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const src = files.map((f) => [f, stripComments(readFileSync(f, "utf8"))] as const);

  it("no secret key, service-role env var, or embedded credential", () => {
    for (const [f, s] of src) {
      expect(s, f).not.toMatch(/sb_secret_[A-Za-z0-9]{6,}/);
      expect(s, f).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
      expect(s, f).not.toMatch(/SERVICE_ROLE|SECRET_KEY|VITE_[A-Z_]*SECRET/);
      expect(s, f).not.toMatch(/sb_publishable_[A-Za-z0-9]{6,}/);
    }
  });
  it("no hand-written fetch, no localStorage, no console, no password or social login", () => {
    for (const [f, s] of src) {
      expect(s, f).not.toMatch(/\bfetch\(/);
      expect(s, f).not.toMatch(/localStorage|sessionStorage/);
      expect(s, f).not.toMatch(/console\./);
      expect(s, f).not.toMatch(/signInWithPassword|signUp\(|signInWithOAuth|signInWithIdToken|updateUser\(/);
      expect(s, f).not.toMatch(/auth\.admin|from\(["']users["']\)/);
    }
  });
  it("the legacy client file is not imported by the accounts layer (and vice versa)", () => {
    for (const [f, s] of src) expect(s, f).not.toMatch(/integrations\/supabase/);
    expect(readFileSync("src/integrations/supabase/client.ts", "utf8")).not.toMatch(/lib\/account/);
  });
  it("only the account screen and its session hook import the accounts layer (no sync start anywhere)", () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    // Real imports only (comments may mention paths). The accounts subsystem itself —
    // src/lib/account and its sync library src/lib/accountSync — may import it; in the app only the
    // account screen (sign-in) and its session hook (session + sign-out) do.
    const importsAccounts = (s: string) => /(?:from\s+|import\s*\()\s*["'][^"']*lib\/account(?:Sync)?\//.test(stripComments(s));
    const users = walk("src")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("src/lib/account/") && !f.startsWith("src/lib/accountSync/") && !f.startsWith("src/test/"))
      .filter((f) => importsAccounts(readFileSync(f, "utf8")));
    expect(users.sort()).toEqual(["src/hooks/useAccountSession.ts", "src/pages/AccountPage.tsx"]);
  });
});
