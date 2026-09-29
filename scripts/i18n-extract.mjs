#!/usr/bin/env node
/**
 * Collects every UI string pair t("English", "العربية") from src/ into src/i18n/source.json —
 * the handoff file for translators ({ "<English>": "<Arabic>" }, sorted). Translators produce
 * src/i18n/locales/<code>.json mapping the same English keys to their language.
 *
 *   node scripts/i18n-extract.mjs           write source.json and print a summary
 *   node scripts/i18n-extract.mjs --check   fail if source.json is out of date (CI)
 *   node scripts/i18n-extract.mjs --coverage  report each catalog's coverage
 *
 * Calls built from variables or template literals cannot be extracted statically; they are
 * listed so they can be turned into literal pairs over time.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(SRC, "i18n", "source.json");
const LOCALES = path.join(SRC, "i18n", "locales");

// A double-quoted JS string literal (with escapes).
const STR = String.raw`"((?:[^"\\\n]|\\.)*)"`;
const PAIR = new RegExp(String.raw`\bt\(\s*${STR}\s*,\s*${STR}\s*\)`, "g");
const ANY_CALL = /\bt\(\s*[^)\s]/g;

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "test" && e.name !== "i18n") out.push(...files(p)); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const unescape = (s) => JSON.parse(`"${s}"`);

export function extract() {
  const pairs = new Map();
  const conflicts = [];
  let calls = 0;
  let literal = 0;
  for (const f of files(SRC)) {
    const text = fs.readFileSync(f, "utf8");
    calls += (text.match(ANY_CALL) || []).length;
    for (const m of text.matchAll(PAIR)) {
      literal++;
      const en = unescape(m[1]);
      const ar = unescape(m[2]);
      if (pairs.has(en) && pairs.get(en) !== ar) conflicts.push({ en, file: path.relative(ROOT, f) });
      if (!pairs.has(en)) pairs.set(en, ar);
    }
  }
  const source = Object.fromEntries([...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { source, calls, literal, dynamic: Math.max(0, calls - literal), conflicts };
}

const mode = process.argv[2];
const { source, calls, literal, dynamic, conflicts } = extract();
const json = JSON.stringify(source, null, 2) + "\n";

if (mode === "--check") {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== json) { console.error("src/i18n/source.json is out of date — run: node scripts/i18n-extract.mjs"); process.exit(1); }
  console.log("source.json is up to date.");
} else if (mode === "--coverage") {
  const keys = Object.keys(source);
  const codes = fs.existsSync(LOCALES) ? fs.readdirSync(LOCALES).filter((f) => f.endsWith(".json")) : [];
  if (!codes.length) console.log("No catalogs yet (src/i18n/locales/*.json).");
  for (const f of codes) {
    const cat = JSON.parse(fs.readFileSync(path.join(LOCALES, f), "utf8"));
    const done = keys.filter((k) => typeof cat[k] === "string" && cat[k].trim()).length;
    console.log(`${f.replace(".json", "")}: ${done}/${keys.length} (${Math.floor((done / keys.length) * 100)}%)`);
  }
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`t() calls: ${calls} | literal pairs: ${literal} | unique strings: ${Object.keys(source).length} | not extractable (dynamic): ${dynamic}`);
  if (conflicts.length) console.log(`same English with different Arabic: ${conflicts.length} (first kept)`);
}
