/** One ayah exactly as stored from the source (see scripts/ingest-kfgqpc-muyassar.mjs). */
export interface RawAyah {
  /** Source `id`: 1..6236 in Mushaf order. */
  id: number;
  /** Source `jozz`. */
  juz: number;
  /** Source `page` — the KFGQPC edition's page. */
  page: number;
  lineStart: number;
  lineEnd: number;
  ayah: number;
  /** Source `aya_text` (KFGQPC Uthmanic Hafs encoding, ends with the ayah-number glyph). Verbatim. */
  text: string;
  /** Source `aya_text_emlaey` — plain spelling, meant for search. Verbatim. */
  textImlaei: string;
  /** Source `aya_tafseer` — Al-Muyassar for this ayah (may contain <span class='aya'>). Verbatim. */
  tafseer: string;
}

export interface RawSurahFile {
  surah: number;
  /** Source `sura_name_en` / `sura_name_ar`, verbatim (the Arabic name keeps the source's trailing space). */
  nameEn: string;
  nameAr: string;
  ayahs: RawAyah[];
}

export interface Tafsir {
  /** Which tafsir this is (only "muyassar" today; more can be added without changing the ayah). */
  source: "muyassar";
  /** Verbatim source text. */
  text: string;
}

/**
 * The unit of the Quran data: an ayah, with its text, where it sits, and its tafsir — all reachable
 * from `surah + ayah` (or from its `key`).
 */
export interface QuranAyah {
  /** "2:255" */
  key: string;
  /** 1..6236 in Mushaf order. */
  globalId: number;
  surah: number;
  ayah: number;
  text: string;
  textImlaei: string;
  juz: number;
  /** The page in the app's Mushaf (/mushaf images) — from the verified PAGE_START mapping. */
  mushafPage: number;
  /** The page in the KFGQPC source edition (differs from `mushafPage` for 56 ayahs). */
  sourcePage: number;
  /** Hizb of `mushafPage` (from the app's PAGE_INFO; the source has no hizb field). */
  pageHizb: number;
  lineStart: number;
  lineEnd: number;
  tafsir: Tafsir;
}

export interface QuranSurah {
  surah: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
  ayahs: QuranAyah[];
}
