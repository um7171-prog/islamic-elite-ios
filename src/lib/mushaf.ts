// Mushaf reader helpers: page images, preloading, reading position, bookmarks.
import { PAGE_INFO, SURAHS, JUZ_PAGES, HIZB_PAGES, type SurahMeta } from "./mushafData";

export const TOTAL_PAGES = 604;
export const PAGE_RATIO = 1280 / 2071; // width / height of the source images

const CDN = "https://cdn.jsdelivr.net/gh/Five-Prayers/quran-pages@main/quran_pages";
const MIRROR = "https://raw.githubusercontent.com/Five-Prayers/quran-pages/main/quran_pages";

export const clampPage = (p: number) => Math.min(TOTAL_PAGES, Math.max(1, Math.round(p)));

export function pageImageUrl(page: number) {
  return `${CDN}/${clampPage(page)}.png`;
}
export function pageImageMirror(page: number) {
  return `${MIRROR}/${clampPage(page)}.png`;
}

/* ---------------- page info ---------------- */
export interface PageInfo {
  page: number;
  juz: number;
  hizb: number;
  surahs: SurahMeta[];
  mainSurah: SurahMeta;
}

export function getPageInfo(page: number): PageInfo {
  const p = clampPage(page);
  const [juz, hizb, nums] = PAGE_INFO[p - 1];
  const surahs = nums.map((n) => SURAHS[n - 1]).filter(Boolean);
  return { page: p, juz, hizb, surahs, mainSurah: surahs[surahs.length - 1] ?? SURAHS[0] };
}

export const juzStartPage = (j: number) => JUZ_PAGES[Math.min(30, Math.max(1, j)) - 1];
export const hizbStartPage = (h: number) => HIZB_PAGES[Math.min(60, Math.max(1, h)) - 1];
export const surahStartPage = (n: number) => SURAHS[Math.min(114, Math.max(1, n)) - 1].page;

export function toArabicDigits(n: number | string) {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

/* ---------------- image preloading (LRU) ---------------- */
const cache = new Map<number, HTMLImageElement>();
const MAX_CACHED = 9;

export function preloadPage(page: number) {
  const p = clampPage(page);
  if (cache.has(p)) return cache.get(p)!;
  const img = new Image();
  img.decoding = "async";
  img.src = pageImageUrl(p);
  img.onerror = () => { img.src = pageImageMirror(p); };
  cache.set(p, img);
  return img;
}

/** Keep only pages within `radius` of `center` in memory. */
export function preloadWindow(center: number, radius = 1) {
  for (let d = -radius; d <= radius; d++) preloadPage(center + d);
  if (cache.size <= MAX_CACHED) return;
  for (const key of Array.from(cache.keys())) {
    if (Math.abs(key - center) > radius + 2) {
      const img = cache.get(key);
      if (img) img.src = "";
      cache.delete(key);
    }
  }
}

/* ---------------- reading position ---------------- */
const POS_KEY = "mushaf:position";
export interface ReadingPosition { page: number; surah: number; at: number }

export function loadPosition(): ReadingPosition {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (raw && typeof raw.page === "number") return { ...raw, page: clampPage(raw.page) };
  } catch { /* ignore */ }
  return { page: 1, surah: 1, at: 0 };
}

export function savePosition(page: number) {
  const info = getPageInfo(page);
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ page: info.page, surah: info.mainSurah.n, at: Date.now() }));
  } catch { /* ignore */ }
}

/* ---------------- bookmarks ---------------- */
const BM_KEY = "mushaf:bookmarks";
export interface MushafBookmark { page: number; surah: number; label: string; at: number }

export function loadBookmarks(): MushafBookmark[] {
  try {
    const arr = JSON.parse(localStorage.getItem(BM_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function persist(list: MushafBookmark[]) {
  try { localStorage.setItem(BM_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}

export function toggleBookmark(page: number): MushafBookmark[] {
  const list = loadBookmarks();
  const idx = list.findIndex((b) => b.page === page);
  if (idx >= 0) return persist(list.filter((_, i) => i !== idx));
  const info = getPageInfo(page);
  return persist([{ page, surah: info.mainSurah.n, label: info.mainSurah.ar, at: Date.now() }, ...list].sort((a, b) => a.page - b.page));
}

export function removeBookmark(page: number) {
  return persist(loadBookmarks().filter((b) => b.page !== page));
}

/* ---------------- verse lookup ---------------- */
/** Resolve a surah:ayah reference to its Mushaf page (network, cached). */
const verseCache = new Map<string, number>();
export async function findVersePage(surah: number, ayah: number): Promise<number | null> {
  const key = `${surah}:${ayah}`;
  if (verseCache.has(key)) return verseCache.get(key)!;
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${key}`);
    const json = await res.json();
    const page = json?.data?.page;
    if (typeof page === "number") { verseCache.set(key, page); return page; }
  } catch { /* offline */ }
  return null;
}

export { SURAHS, JUZ_PAGES, HIZB_PAGES };
export type { SurahMeta };
