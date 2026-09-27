import { PAGE_INFO, SURAHS } from "@/lib/mushafData";
import { pageOfAyah } from "@/lib/quranAudio";
import type { QuranAyah, QuranSurah, RawSurahFile, Tafsir } from "./types";

export { QURAN_SOURCE } from "./source";
export type { QuranAyah, QuranSurah, Tafsir } from "./types";

/**
 * Local Quran data layer (Hafs text + Al-Muyassar tafsir, from KFGQPC — see ./source.ts).
 *
 * The unit is the AYAH: surah + ayah → text + page + juz + tafsir. Each surah's data is a separate
 * JSON chunk loaded on first use (nothing is downloaded, nothing leaves the device), then kept in
 * memory. Positions in the app's Mushaf come from the same verified mapping the Mushaf reader and
 * its audio already use (PAGE_START → pageOfAyah), so both modes always agree on the page.
 */

export const TOTAL_SURAHS = 114;
export const TOTAL_AYAHS = 6236;
export const TOTAL_PAGES = 604;

const loaders = import.meta.glob<RawSurahFile>("./data/surah-*.json", { import: "default" });
const fileOf = (surah: number) => `./data/surah-${String(surah).padStart(3, "0")}.json`;

/** Global ids: the id of ayah 1 of each surah (index 0 unused). */
const FIRST_ID: number[] = (() => {
  const out = [0];
  let next = 1;
  for (const s of SURAHS) {
    out.push(next);
    next += s.ayahs;
  }
  return out;
})();

export const ayahKey = (surah: number, ayah: number) => `${surah}:${ayah}`;

export function isValidAyah(surah: number, ayah: number): boolean {
  return Number.isInteger(surah) && surah >= 1 && surah <= TOTAL_SURAHS && Number.isInteger(ayah) && ayah >= 1 && ayah <= SURAHS[surah - 1].ayahs;
}

/** 1..6236 for a valid ayah, else null. */
export function globalIdOf(surah: number, ayah: number): number | null {
  return isValidAyah(surah, ayah) ? FIRST_ID[surah] + ayah - 1 : null;
}

/** surah + ayah for a global id (1..6236), else null. */
export function ayahOfGlobalId(id: number): { surah: number; ayah: number } | null {
  if (!Number.isInteger(id) || id < 1 || id > TOTAL_AYAHS) return null;
  let lo = 1, hi = TOTAL_SURAHS;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (FIRST_ID[mid] <= id) lo = mid;
    else hi = mid - 1;
  }
  return { surah: lo, ayah: id - FIRST_ID[lo] + 1 };
}

/** The ayah's page in the app's Mushaf (synchronous — no data needs to be loaded). */
export function getPageForAyah(surah: number, ayah: number): number | null {
  return isValidAyah(surah, ayah) ? pageOfAyah({ surah, ayah }) : null;
}

function build(raw: RawSurahFile): QuranSurah {
  return {
    surah: raw.surah,
    nameAr: raw.nameAr,
    nameEn: raw.nameEn,
    ayahCount: raw.ayahs.length,
    ayahs: raw.ayahs.map((a) => {
      const mushafPage = pageOfAyah({ surah: raw.surah, ayah: a.ayah });
      const tafsir: Tafsir = { source: "muyassar", text: a.tafseer };
      return {
        key: ayahKey(raw.surah, a.ayah),
        globalId: a.id,
        surah: raw.surah,
        ayah: a.ayah,
        text: a.text,
        textImlaei: a.textImlaei,
        juz: a.juz,
        mushafPage,
        sourcePage: a.page,
        pageHizb: PAGE_INFO[mushafPage - 1][1],
        lineStart: a.lineStart,
        lineEnd: a.lineEnd,
        tafsir,
      };
    }),
  };
}

const cache = new Map<number, Promise<QuranSurah>>();

/** A whole surah (loads its chunk on first use). Null for an invalid surah number. */
export function getSurah(surah: number): Promise<QuranSurah | null> {
  if (!Number.isInteger(surah) || surah < 1 || surah > TOTAL_SURAHS) return Promise.resolve(null);
  let p = cache.get(surah);
  if (!p) {
    const load = loaders[fileOf(surah)];
    if (!load) return Promise.resolve(null);
    p = load().then(build);
    // A failed load is not cached, so it can be retried.
    p.catch(() => cache.delete(surah));
    cache.set(surah, p);
  }
  return p;
}

export async function getAyah(surah: number, ayah: number): Promise<QuranAyah | null> {
  if (!isValidAyah(surah, ayah)) return null;
  const s = await getSurah(surah);
  return s?.ayahs[ayah - 1] ?? null;
}

export async function getAyahByGlobalId(id: number): Promise<QuranAyah | null> {
  const ref = ayahOfGlobalId(id);
  return ref ? getAyah(ref.surah, ref.ayah) : null;
}

/** The tafsir of one ayah — the same object the ayah carries. */
export async function getTafsir(surah: number, ayah: number): Promise<Tafsir | null> {
  return (await getAyah(surah, ayah))?.tafsir ?? null;
}

/** Every ayah on a page of the app's Mushaf (1..604), in order. Empty for an invalid page. */
export async function getPage(page: number): Promise<QuranAyah[]> {
  if (!Number.isInteger(page) || page < 1 || page > TOTAL_PAGES) return [];
  const surahNumbers = PAGE_INFO[page - 1][2];
  const surahs = await Promise.all(surahNumbers.map(getSurah));
  return surahs.flatMap((s) => (s ? s.ayahs.filter((a) => a.mushafPage === page) : []));
}
