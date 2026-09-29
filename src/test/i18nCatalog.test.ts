import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { catalogCodes, catalogCoverage, isCatalogComplete, loadCatalog, translate } from "@/i18n/catalog";
import { TARGET_LANGUAGES, languageDir } from "@/i18n/languages";

const ROOT = resolve(__dirname, "../..");

describe("translate", () => {
  it("Arabic and English come from the call site; nothing else changes for them", () => {
    expect(translate("ar", "Home", "الرئيسية", null)).toBe("الرئيسية");
    expect(translate("en", "Home", "الرئيسية", { Home: "x" })).toBe("Home");
  });
  it("another language uses its catalog, and falls back to English for a missing or empty entry", () => {
    const tr = { Home: "Ana Sayfa", Settings: " " };
    expect(translate("tr", "Home", "الرئيسية", tr)).toBe("Ana Sayfa");
    expect(translate("tr", "Settings", "الإعدادات", tr)).toBe("Settings");
    expect(translate("tr", "Qibla", "القبلة", tr)).toBe("Qibla");
    expect(translate("tr", "Home", "الرئيسية", null)).toBe("Home");
  });
});

describe("coverage (no half-translated language is ever offered)", () => {
  const source = ["Home", "Settings", "Qibla"];
  it("counts missing and stale entries", () => {
    const c = catalogCoverage(source, { Home: "Ana Sayfa", Settings: "", Old: "Eski" });
    expect(c).toEqual({ total: 3, translated: 1, missing: ["Settings", "Qibla"], stale: ["Old"] });
  });
  it("complete only when every source string is translated", () => {
    expect(isCatalogComplete(source, { Home: "a", Settings: "b" })).toBe(false);
    expect(isCatalogComplete(source, { Home: "a", Settings: "b", Qibla: "c" })).toBe(true);
    expect(isCatalogComplete([], {})).toBe(false);
  });
});

describe("languages", () => {
  it("20+ target languages besides Arabic and English, each with a direction and a unique code", () => {
    expect(TARGET_LANGUAGES.length).toBeGreaterThanOrEqual(20);
    const codes = TARGET_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain("ar");
    expect(codes).not.toContain("en");
  });
  it("right-to-left where the script is", () => {
    expect(languageDir("ar")).toBe("rtl");
    expect(languageDir("ur")).toBe("rtl");
    expect(languageDir("fa")).toBe("rtl");
    expect(languageDir("tr")).toBe("ltr");
    expect(languageDir("xx")).toBe("ltr");
  });
  it("catalogs are lazy: none exists yet, and an unknown code loads nothing", async () => {
    expect(catalogCodes()).toEqual([]);
    expect(await loadCatalog("tr")).toBeNull();
  });
});

describe("source.json (translators' handoff file)", () => {
  it("is up to date with the code", () => {
    expect(() => execFileSync(process.execPath, [resolve(ROOT, "scripts/i18n-extract.mjs"), "--check"], { cwd: ROOT, stdio: "pipe" })).not.toThrow();
  });
  it("holds English -> Arabic pairs taken from the code", () => {
    const src = JSON.parse(readFileSync(resolve(ROOT, "src/i18n/source.json"), "utf8")) as Record<string, string>;
    expect(Object.keys(src).length).toBeGreaterThan(500);
    expect(src["Settings"]).toBe("الإعدادات");
  });
  it("is never bundled into the app (no import of it anywhere in src)", () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    const users = walk(resolve(ROOT, "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/[\\/]test[\\/]/.test(f))
      .filter((f) => /(?:import|from)\s*\(?\s*["'][^"']*source\.json["']/.test(readFileSync(f, "utf8")));
    expect(users).toEqual([]);
  });
});
