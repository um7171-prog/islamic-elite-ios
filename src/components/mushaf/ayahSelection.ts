import { toArabicDigits } from "@/lib/mushaf";
import type { QuranAyah } from "@/lib/quran";
import { surahNameAr, surahNameEn } from "@/components/quran-reading/ayahDisplay";

/**
 * Ayah selection in the Mushaf: one ayah, or a run of consecutive ayahs of one surah (ayah
 * numbers restart with every surah, so a range never crosses one). Pure — the ayahs themselves
 * always come from the app's Quran data (KFGQPC), never from the page image.
 */
export interface AyahSelection {
  surah: number;
  from: number;
  to: number;
}

/**
 * A tap on an ayah:
 * - nothing selected, a finished range, or another surah → that ayah alone;
 * - one ayah selected → the range between it and the tapped ayah (either order);
 * - the single selected ayah tapped again → nothing selected.
 */
export function selectAyah(sel: AyahSelection | null, a: { surah: number; ayah: number }): AyahSelection | null {
  if (!sel || sel.surah !== a.surah || sel.from !== sel.to) return { surah: a.surah, from: a.ayah, to: a.ayah };
  if (sel.from === a.ayah) return null;
  return { surah: a.surah, from: Math.min(sel.from, a.ayah), to: Math.max(sel.from, a.ayah) };
}

export const isSelected = (sel: AyahSelection | null, a: { surah: number; ayah: number }) =>
  !!sel && a.surah === sel.surah && a.ayah >= sel.from && a.ayah <= sel.to;

/** The selected ayahs, in order, from a list of loaded ayahs (e.g. the page's). */
export const selectedAyahs = (sel: AyahSelection | null, ayahs: QuranAyah[]) => ayahs.filter((a) => isSelected(sel, a));

/** "البقرة ٣٠–٣١" / "Al-Baqara 30–31" (a single ayah: "البقرة ٣٠"). */
export function selectionLabel(sel: AyahSelection, lang: "ar" | "en"): string {
  if (lang === "ar") {
    const n = sel.from === sel.to ? toArabicDigits(sel.from) : `${toArabicDigits(sel.from)}–${toArabicDigits(sel.to)}`;
    return `${surahNameAr(sel.surah)} ${n}`;
  }
  return `${surahNameEn(sel.surah)} ${sel.from === sel.to ? sel.from : `${sel.from}–${sel.to}`}`;
}
