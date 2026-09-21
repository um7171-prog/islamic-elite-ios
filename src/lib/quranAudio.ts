// Page-aware Quran playback helpers: which ayah a Mushaf page starts with, and
// how to walk ayah by ayah across pages. Pure functions, no network.
import { PAGE_START } from "./mushafPageStart";
import { SURAHS } from "./mushafData";

export interface AyahRef { surah: number; ayah: number }
const TOTAL_PAGES = 604;

/** The first ayah printed on a Mushaf page (page -> surah -> starting ayah). */
export function pageStartAyah(page: number): AyahRef {
  const p = Math.min(TOTAL_PAGES, Math.max(1, Math.round(page)));
  const [surah, ayah] = PAGE_START[p - 1];
  return { surah, ayah };
}

const before = (a: AyahRef, b: AyahRef) => a.surah < b.surah || (a.surah === b.surah && a.ayah < b.ayah);

/** The Mushaf page an ayah is printed on (last page whose first ayah is at or before it). */
export function pageOfAyah(ref: AyahRef): number {
  let lo = 0, hi = TOTAL_PAGES - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const [s, a] = PAGE_START[mid];
    if (before(ref, { surah: s, ayah: a })) hi = mid - 1;
    else lo = mid;
  }
  return lo + 1;
}

export function nextAyah(ref: AyahRef): AyahRef | null {
  if (ref.ayah < SURAHS[ref.surah - 1].ayahs) return { surah: ref.surah, ayah: ref.ayah + 1 };
  return ref.surah < 114 ? { surah: ref.surah + 1, ayah: 1 } : null;
}

export function prevAyah(ref: AyahRef): AyahRef | null {
  if (ref.ayah > 1) return { surah: ref.surah, ayah: ref.ayah - 1 };
  return ref.surah > 1 ? { surah: ref.surah - 1, ayah: SURAHS[ref.surah - 2].ayahs } : null;
}
