import { PAGE_RATIO, TOTAL_PAGES } from "@/lib/mushaf";

/**
 * Geometry of the vertical Mushaf. All pages share one size (fit to the reading width),
 * so they sit on a single column at a fixed stride: where a page is, which page the reader
 * is on and which pages are near the screen are exact arithmetic — the same whether a page
 * is currently mounted or not, which is what keeps virtualization from moving anything.
 */

/** Space on each side of a page (the page image has its own white margin as well). */
export const SIDE_GUTTER = 8;
/** Space between two consecutive pages. */
export const PAGE_GAP = 8;
/** Space between the safe area and the first page / after the last page. */
export const EDGE_GAP = 8;
/** Fit-width stops growing past this on large screens (iPad landscape, desktop). */
export const MAX_PAGE_WIDTH = 820;

export interface ReaderViewport {
  /** Scroll container's inner size (CSS px). */
  width: number;
  height: number;
  /** env(safe-area-inset-*) in CSS px. */
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
}

export interface ReaderLayout {
  viewportW: number;
  viewportH: number;
  /** Page box: full page width visible, original aspect ratio. */
  pageW: number;
  pageH: number;
  /** x of every page box (centred between the horizontal safe areas). */
  left: number;
  /** y of page 1's top edge inside the column. */
  top: number;
  gap: number;
  /** pageH + gap: distance from one page's top to the next one's. */
  stride: number;
  /** Height of the whole column (all pages + safe areas). */
  contentH: number;
  /** Largest valid scrollTop. */
  maxScroll: number;
  total: number;
}

export function computeLayout(v: ReaderViewport, total = TOTAL_PAGES): ReaderLayout {
  const readingW = Math.max(0, v.width - v.safeLeft - v.safeRight);
  const pageW = Math.max(1, Math.floor(Math.min(readingW - 2 * SIDE_GUTTER, MAX_PAGE_WIDTH)));
  // Whole pixels keep page edges crisp; object-fit: contain absorbs the < 0.5 px rounding.
  const pageH = Math.max(1, Math.round(pageW / PAGE_RATIO));
  const left = Math.max(0, Math.round(v.safeLeft + (readingW - pageW) / 2));
  const top = v.safeTop + EDGE_GAP;
  const stride = pageH + PAGE_GAP;
  const contentH = top + total * pageH + (total - 1) * PAGE_GAP + EDGE_GAP + v.safeBottom;
  return {
    viewportW: v.width,
    viewportH: v.height,
    pageW,
    pageH,
    left,
    top,
    gap: PAGE_GAP,
    stride,
    contentH,
    maxScroll: Math.max(0, contentH - v.height),
    total,
  };
}

export function sameLayout(a: ReaderLayout | null, b: ReaderLayout | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.viewportW === b.viewportW &&
    a.viewportH === b.viewportH &&
    a.pageW === b.pageW &&
    a.left === b.left &&
    a.top === b.top &&
    a.contentH === b.contentH
  );
}

const clampPageNo = (L: ReaderLayout, p: number) => Math.min(L.total, Math.max(1, p));

/** y of a page's top edge inside the column. */
export const pageTop = (L: ReaderLayout, p: number) => L.top + (clampPageNo(L, p) - 1) * L.stride;

export const clampScroll = (L: ReaderLayout, y: number) => Math.min(L.maxScroll, Math.max(0, y));

/** The scroll offset that shows page `p` from its top edge, just below the safe area. */
export const scrollTopForPage = (L: ReaderLayout, p: number) => clampScroll(L, pageTop(L, p) - L.top);

/** The page at content height `y` (a point in a gap belongs to the nearer page). */
export function pageAtY(L: ReaderLayout, y: number): number {
  return clampPageNo(L, Math.floor((y - L.top + L.gap / 2) / L.stride) + 1);
}

/** Pages intersecting the viewport at `scrollTop`, widened by `buffer` pages on each side. */
export function visibleRange(L: ReaderLayout, scrollTop: number, buffer = 0): { first: number; last: number } {
  const first = clampPageNo(L, Math.floor((scrollTop - L.top) / L.stride) + 1);
  const last = clampPageNo(L, Math.floor((scrollTop + L.viewportH - L.top) / L.stride) + 1);
  return { first: clampPageNo(L, first - buffer), last: clampPageNo(L, last + buffer) };
}

/** Height of page `p` inside the viewport at `scrollTop`. */
export function visiblePart(L: ReaderLayout, scrollTop: number, p: number): number {
  const top = pageTop(L, p);
  return Math.max(0, Math.min(top + L.pageH, scrollTop + L.viewportH) - Math.max(top, scrollTop));
}

/** The page the reader is on: the most visible one (an exact tie goes to the earlier page). */
export function pageAtScroll(L: ReaderLayout, scrollTop: number): number {
  const { first, last } = visibleRange(L, scrollTop);
  let best = first;
  let bestPart = -1;
  for (let p = first; p <= last; p++) {
    const part = visiblePart(L, scrollTop, p);
    if (part > bestPart + 0.5) {
      best = p;
      bestPart = part;
    }
  }
  return best;
}

export interface ReadingAnchor {
  page: number;
  /** Where the viewport centre is inside that page (0 = top edge, 1 = bottom edge). */
  offset: number;
}

/** The reading place, independent of page size — used to keep it across a relayout. */
export function readingAnchor(L: ReaderLayout, scrollTop: number): ReadingAnchor {
  const centre = scrollTop + L.viewportH / 2;
  const page = pageAtY(L, centre);
  return { page, offset: (centre - pageTop(L, page)) / L.pageH };
}

export function scrollTopForAnchor(L: ReaderLayout, a: ReadingAnchor): number {
  return clampScroll(L, pageTop(L, a.page) + a.offset * L.pageH - L.viewportH / 2);
}

/** One arrow-key / scroll-button step: a small, readable move, never a whole page. */
export function scrollStep(L: ReaderLayout): number {
  return Math.round(Math.min(160, Math.max(56, L.viewportH * 0.12)));
}
