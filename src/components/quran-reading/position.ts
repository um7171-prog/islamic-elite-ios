import { isValidAyah } from "@/lib/quran";
import { loadPosition } from "@/lib/mushaf";
import { pageOfAyah, pageStartAyah, type AyahRef } from "@/lib/quranAudio";

/**
 * Where reading starts and how the two modes hand the position to each other. Both directions use
 * the same verified mapping as the Mushaf and its audio (PAGE_START).
 */

/** "2:255" → { surah: 2, ayah: 255 } (null when not a real ayah). */
export function parseAyahParam(v: string | null): AyahRef | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(v ?? "");
  if (!m) return null;
  const ref = { surah: Number(m[1]), ayah: Number(m[2]) };
  return isValidAyah(ref.surah, ref.ayah) ? ref : null;
}

/** ?ayah= when valid; otherwise the first ayah of the page the Mushaf is on (mushaf:position). */
export function readingStart(ayahParam: string | null): AyahRef {
  return parseAyahParam(ayahParam) ?? pageStartAyah(loadPosition().page);
}

/** Mushaf page → reading mode at the first ayah printed on that page. */
export const readingUrlForPage = (page: number) => {
  const a = pageStartAyah(page);
  return `/mushaf/read?ayah=${a.surah}:${a.ayah}`;
};

/** Reading mode → the Mushaf page that ayah is printed on. */
export const mushafUrlForAyah = (ref: AyahRef) => `/mushaf?page=${pageOfAyah(ref)}`;
