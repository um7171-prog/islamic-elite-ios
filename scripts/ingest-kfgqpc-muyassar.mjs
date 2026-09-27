// Ingests the KFGQPC "Tafseer Muyassar" developer package (Hafs text + Al-Muyassar tafsir per ayah)
// into one JSON file per surah under src/lib/quran/data/.
//
// Source: https://qurancomplex.gov.sa/quran-dev/  →  hafs_tafseerMouaser_v3.zip (v3.0, 2023-01-08)
// The tab-separated file from that package is kept verbatim in data/kfgqpc/hafs_tafseerMouaser_v3/.
//
// NO text is changed: every string field is copied exactly as it is in the source (no trim, no
// Unicode normalisation, no tag stripping). Only the integer columns are parsed as numbers.
//
// Usage: node scripts/ingest-kfgqpc-muyassar.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SRC = "data/kfgqpc/hafs_tafseerMouaser_v3/tafseerMouaser_v03.txt";
const SRC_SHA256 = "df92e4e2c86b0a57cf67c31e710b55db00f04ba0ee6f18c497bb5f8b1b1be0cc";
const OUT = "src/lib/quran/data";
const HEADER = ["id", "jozz", "page", "sura_no", "sura_name_en", "sura_name_ar", "line_start", "line_end", "aya_no", "aya_text", "aya_text_emlaey", "aya_tafseer"];

const buf = readFileSync(SRC);
const sha = createHash("sha256").update(buf).digest("hex");
if (sha !== SRC_SHA256) throw new Error(`source checksum mismatch: ${sha}`);

// The file uses LF line endings; a stray CR inside any field is rejected below.
const rows = buf.toString("utf8").split("\n");
if (rows.at(-1) === "") rows.pop();
const header = rows.shift().split("\t");
if (JSON.stringify(header) !== JSON.stringify(HEADER)) throw new Error(`unexpected columns: ${header}`);

const int = (v, name, line) => {
  if (!/^\d+$/.test(v)) throw new Error(`line ${line}: ${name} is not an integer: ${v}`);
  return Number(v);
};

const surahs = new Map();
rows.forEach((row, i) => {
  const c = row.split("\t");
  if (c.length !== HEADER.length) throw new Error(`line ${i + 2}: ${c.length} columns`);
  if (c.some((x) => x.includes("\n") || x.includes("\r"))) throw new Error(`line ${i + 2}: stray line break`);
  const [id, jozz, page, suraNo, nameEn, nameAr, lineStart, lineEnd, ayaNo, text, emlaey, tafseer] = c;
  const s = int(suraNo, "sura_no", i + 2);
  if (!surahs.has(s)) surahs.set(s, { surah: s, nameEn, nameAr, ayahs: [] });
  surahs.get(s).ayahs.push({
    id: int(id, "id", i + 2),
    juz: int(jozz, "jozz", i + 2),
    page: int(page, "page", i + 2),
    lineStart: int(lineStart, "line_start", i + 2),
    lineEnd: int(lineEnd, "line_end", i + 2),
    ayah: int(ayaNo, "aya_no", i + 2),
    text,
    textImlaei: emlaey,
    tafseer,
  });
});

mkdirSync(OUT, { recursive: true });
for (const s of surahs.values()) {
  writeFileSync(`${OUT}/surah-${String(s.surah).padStart(3, "0")}.json`, JSON.stringify(s));
}
console.log(`wrote ${surahs.size} surahs, ${rows.length} ayahs from ${SRC} (sha256 ${sha})`);
