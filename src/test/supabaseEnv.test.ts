import { describe, it, expect, afterEach, vi } from "vitest";
import { supabaseEnvProblems, usableSupabaseUrl } from "@/lib/supabaseEnv";

/**
 * iOS black screen: a malformed VITE_SUPABASE_URL (e.g. quotes pasted into a CI variable) made the
 * legacy client throw while the bundle loaded — before React rendered anything.
 */

const LEGACY_URL = "https://zododbbdbjqxkasgzrbn.supabase.co";
const ACC_URL = "https://lyjnlufwtvkjptibksux.supabase.co";
const ACC_KEY = "sb_publishable_TESTONLY_not_a_real_key";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("usableSupabaseUrl", () => {
  it("accepts an https URL (surrounding spaces trimmed)", () => {
    expect(usableSupabaseUrl(LEGACY_URL)).toBe(LEGACY_URL);
    expect(usableSupabaseUrl(`  ${LEGACY_URL}\n`)).toBe(LEGACY_URL);
  });
  it("rejects what makes supabase-js throw: quotes, no scheme, other schemes, empty", () => {
    for (const bad of [`"${LEGACY_URL}"`, `'${LEGACY_URL}'`, "zododbbdbjqxkasgzrbn.supabase.co", "ftp://x.supabase.co", "", "   ", undefined, 42]) {
      expect(usableSupabaseUrl(bad)).toBeNull();
    }
  });
});

describe("the legacy client never throws at startup", () => {
  for (const [label, url] of [["quoted", `"${LEGACY_URL}"`], ["no scheme", "zododbbdbjqxkasgzrbn.supabase.co"], ["missing", ""]] as const) {
    it(`${label} VITE_SUPABASE_URL: the module loads (the app can render), the problem is logged`, async () => {
      vi.stubEnv("VITE_SUPABASE_URL", url);
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-TESTONLY");
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const mod = await import("@/integrations/supabase/client");
      expect(mod.supabase).toBeTruthy();
      expect(error).toHaveBeenCalled();
      expect(String(error.mock.calls[0][0])).not.toContain("zododbbdbjqxkasgzrbn");
    });
  }
  it("a valid URL is used as-is, nothing logged", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", LEGACY_URL);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-TESTONLY");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mod = await import("@/integrations/supabase/client");
    expect(mod.supabase).toBeTruthy();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("supabaseEnvProblems (the build refuses malformed values)", () => {
  it("valid or missing values: no problem", () => {
    expect(supabaseEnvProblems({})).toEqual([]);
    expect(supabaseEnvProblems({ VITE_SUPABASE_URL: LEGACY_URL, VITE_SUPABASE_PUBLISHABLE_KEY: "eyJ.anon.key" })).toEqual([]);
    expect(supabaseEnvProblems({ VITE_SUPABASE_URL: LEGACY_URL, VITE_ACCOUNTS_SUPABASE_URL: ACC_URL, VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY: ACC_KEY })).toEqual([]);
  });
  it("a quoted value is refused, for every Supabase variable", () => {
    for (const [k, v] of [["VITE_SUPABASE_URL", LEGACY_URL], ["VITE_SUPABASE_PUBLISHABLE_KEY", "eyJ.anon.key"], ["VITE_ACCOUNTS_SUPABASE_URL", ACC_URL], ["VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY", ACC_KEY]]) {
      const p = supabaseEnvProblems({ [k]: `"${v}"` });
      expect(p.join(" ")).toContain(k);
      expect(p.join(" ")).toContain("quotes");
    }
  });
  it("a legacy URL without https:// is refused", () => {
    expect(supabaseEnvProblems({ VITE_SUPABASE_URL: "zododbbdbjqxkasgzrbn.supabase.co" })).toEqual(["VITE_SUPABASE_URL is not a valid URL — it must start with https://"]);
  });
  it("accounts: wrong project, a secret key, or only one of the two values is refused", () => {
    expect(supabaseEnvProblems({ VITE_ACCOUNTS_SUPABASE_URL: LEGACY_URL, VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY: ACC_KEY })[0]).toContain("wrong-project");
    expect(supabaseEnvProblems({ VITE_ACCOUNTS_SUPABASE_URL: ACC_URL, VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY: "sb_secret_TESTONLY" })[0]).toContain("secret-key");
    expect(supabaseEnvProblems({ VITE_ACCOUNTS_SUPABASE_URL: ACC_URL })[0]).toContain("missing");
  });
  it("messages never contain the values", () => {
    const all = supabaseEnvProblems({ VITE_SUPABASE_URL: `"${LEGACY_URL}"`, VITE_SUPABASE_PUBLISHABLE_KEY: '"eyJ.secret-looking"', VITE_ACCOUNTS_SUPABASE_URL: LEGACY_URL, VITE_ACCOUNTS_SUPABASE_PUBLISHABLE_KEY: ACC_KEY }).join(" ");
    for (const v of ["zododbbdbjqxkasgzrbn", "eyJ", "TESTONLY"]) expect(all).not.toContain(v);
  });
});
