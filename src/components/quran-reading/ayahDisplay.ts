import { SURAHS } from "@/lib/mushafData";
import { toArabicDigits } from "@/lib/mushaf";
import type { QuranAyah } from "@/lib/quran";

/**
 * Display helpers for the KFGQPC text (pure — the data itself is never changed).
 *
 * The source encodes some symbols for its own font (KFGQPC Uthmanic Hafs): each ayah ends with a
 * no-break space + the ayah-number glyph (Arabic presentation-form code points), and the tafsir wraps
 * quoted Quranic words in U+FD61 … U+FD60. With any other font those code points are unrelated
 * ligatures, so for display the number is split off (and drawn by the UI) and the tafsir brackets are
 * shown as the standard ornate parentheses ﴿ ﴾.
 */

const AYAH_MARK = /\u00A0([\uFB50-\uFDFF\uFE70-\uFEFF]+)$/u;

/** body + "\u00A0" + mark === text (lossless). `mark` is null if the text has no number glyph. */
export function splitAyahMark(text: string): { body: string; mark: string | null } {
  const m = AYAH_MARK.exec(text);
  return m ? { body: text.slice(0, m.index), mark: m[1] } : { body: text, mark: null };
}

export const ayahBody = (a: Pick<QuranAyah, "text">) => splitAyahMark(a.text).body;

export const surahNameAr = (surah: number) => SURAHS[surah - 1]?.ar ?? "";
export const surahNameEn = (surah: number) => SURAHS[surah - 1]?.en ?? "";

export type TafsirSegment = { kind: "text" | "quran"; text: string };

const TAFSIR_QURAN = /<span class='aya'>([\s\S]*?)<\/span>/g;

/** Splits the tafsir into plain text and quoted Quran (the source's <span class='aya'>). No HTML is rendered. */
export function tafsirSegments(tafsir: string): TafsirSegment[] {
  const out: TafsirSegment[] = [];
  let last = 0;
  for (const m of tafsir.matchAll(TAFSIR_QURAN)) {
    if (m.index > last) out.push({ kind: "text", text: tafsir.slice(last, m.index) });
    out.push({ kind: "quran", text: m[1].replace(/\uFD61/g, "\uFD3F").replace(/\uFD60/g, "\uFD3E") });
    last = m.index + m[0].length;
  }
  if (last < tafsir.length) out.push({ kind: "text", text: tafsir.slice(last) });
  return out;
}

/** "﴿ … ﴾ [البقرة: ٢٥٥]" — what Copy / Share put on the clipboard. */
export function ayahShareText(a: Pick<QuranAyah, "text" | "surah" | "ayah">): string {
  return `﴿${ayahBody(a)}﴾ [${surahNameAr(a.surah)}: ${toArabicDigits(a.ayah)}]`;
}

/** Consecutive ayahs of one surah as one quotation: "﴿ … (٣٠) … (٣١)﴾ [البقرة: ٣٠–٣١]".
 * A single ayah is exactly `ayahShareText`. */
export function ayahRangeShareText(ayahs: Pick<QuranAyah, "text" | "surah" | "ayah">[]): string {
  if (ayahs.length === 0) return "";
  if (ayahs.length === 1) return ayahShareText(ayahs[0]);
  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  const body = ayahs.map((a) => `${ayahBody(a)} (${toArabicDigits(a.ayah)})`).join(" ");
  return `﴿${body}﴾ [${surahNameAr(first.surah)}: ${toArabicDigits(first.ayah)}–${toArabicDigits(last.ayah)}]`;
}
