/**
 * Translation catalogs for the non-source UI languages (see languages.ts).
 *
 * A catalog is a flat JSON object { "<English source string>": "<translation>" } at
 * src/i18n/locales/<code>.json. The source strings come from scripts/i18n-extract.mjs, which
 * collects every t("English", "العربية") pair into src/i18n/source.json (the translators' handoff
 * file). Catalogs are loaded lazily (one chunk per language).
 */
export type Catalog = Record<string, string>;

export interface Coverage {
  total: number;
  translated: number;
  /** Source strings with no (or an empty) translation. */
  missing: string[];
  /** Catalog keys that are not source strings any more (stale). */
  stale: string[];
}

/** How much of the source a catalog translates. */
export function catalogCoverage(source: readonly string[], catalog: Catalog): Coverage {
  const keys = new Set(source);
  const missing = source.filter((s) => typeof catalog[s] !== "string" || !catalog[s].trim());
  const stale = Object.keys(catalog).filter((k) => !keys.has(k));
  return { total: source.length, translated: source.length - missing.length, missing, stale };
}

/** Only a complete catalog is offered to users (no half-translated UI). */
export function isCatalogComplete(source: readonly string[], catalog: Catalog): boolean {
  return source.length > 0 && catalogCoverage(source, catalog).missing.length === 0;
}

/** Translates one UI string: Arabic/English from the call site, other languages from the catalog. */
export function translate(lang: string, en: string, ar: string, catalog: Catalog | null): string {
  if (lang === "ar") return ar;
  if (lang === "en" || !catalog) return en;
  const hit = catalog[en];
  return typeof hit === "string" && hit.trim() ? hit : en;
}

// Lazy catalogs: Vite turns each locales/*.json into its own chunk; nothing loads until asked.
const loaders = import.meta.glob<Catalog>("./locales/*.json", { import: "default" });

export function catalogCodes(): string[] {
  return Object.keys(loaders).map((p) => p.replace(/^.*\/(.+)\.json$/, "$1")).sort();
}

export async function loadCatalog(code: string): Promise<Catalog | null> {
  const load = loaders[`./locales/${code}.json`];
  if (!load) return null;
  try {
    return await load();
  } catch {
    return null;
  }
}
