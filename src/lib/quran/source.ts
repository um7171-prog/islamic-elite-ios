/**
 * Provenance of the local Quran text + tafsir (see data/kfgqpc/SOURCE.md for the full record).
 * These values let anyone re-verify the data later: re-download the package, compare the official
 * checksums, and re-run `node scripts/ingest-kfgqpc-muyassar.mjs` (it refuses a different file).
 */
export const QURAN_SOURCE = {
  publisher: "King Fahd Glorious Quran Printing Complex (KFGQPC) — مجمع الملك فهد لطباعة المصحف الشريف",
  platform: "منصة مطوري برمجيات القرآن الكريم",
  platformUrl: "https://qurancomplex.gov.sa/quran-dev/",
  package: "التفسير الميسر للقرآن الكريم — Tafseer Muyassar (Hafs 'an 'Asim + Al-Muyassar tafsir per ayah)",
  downloadUrl: "https://download.qurancomplex.gov.sa/resources_dev/hafs_tafseerMouaser_v3.zip",
  version: "3.0",
  /** Dates as published on the platform page / in read.me. */
  created: "2020-12-15",
  updated: "2023-01-08",
  /** Official checksums of the ZIP, published on the platform page — and matched by our download. */
  zip: {
    file: "hafs_tafseerMouaser_v3.zip",
    bytes: 7885418,
    md5: "b38703983d438a5cd22269b746eaac0c",
    sha1: "a8f054411c6cd14a258d5ba7bc4e30c9ea79b336",
    sha256: "443a6927dbbf9df0fb63792dc83b83511f7d308f3ec322c9230fbebfe3c69c86",
  },
  /** The file inside the ZIP that was ingested (kept verbatim in data/kfgqpc/hafs_tafseerMouaser_v3/). */
  dataFile: {
    path: "hafs_tafseerMouaser_v3_data/tafseerMouaser_v03.txt",
    format: "UTF-8, tab-separated, LF line endings, 1 header row + 6236 rows",
    sha256: "df92e4e2c86b0a57cf67c31e710b55db00f04ba0ee6f18c497bb5f8b1b1be0cc",
  },
  tafsir: {
    id: "muyassar",
    nameAr: "التفسير الميسر",
    nameEn: "Al-Tafsir Al-Muyassar",
    publisher: "مجمع الملك فهد لطباعة المصحف الشريف",
  },
  /** Text encoding notes from the package documentation. */
  notes: [
    "aya_text is encoded for the KFGQPC Uthmanic Hafs font and ends with the ayah-number glyph (a font symbol).",
    "aya_tafseer marks quoted Quranic words with <span class='aya'>…</span> and starts with the ayah number in brackets.",
    "The package's `page` is the KFGQPC edition's page; the app's Mushaf images use a different edition for 56 ayahs (see `mushafPage`).",
  ],
} as const;
