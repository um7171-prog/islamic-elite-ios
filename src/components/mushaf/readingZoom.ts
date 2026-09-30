import type { QuranAyah } from "@/lib/quran";

/**
 * Zoom in the Mushaf reader, as reading rather than magnifying a picture.
 *
 * 1x is the printed page (the page images, whole, at fit width). A page image's text already
 * spans ~90% of the screen width, so enlarging the picture past ~1.1x can only cut every line and
 * force a sideways drag per line. Past ENTER_READING the reader therefore shows the same page's
 * ayahs from the local KFGQPC Hafs text, reflowed at `zoom` times the page's own letter size:
 * lines wrap inside the screen at every size, and nothing is ever cut or dragged sideways.
 */

export type ReaderMode = "page" | "reading";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
/** A pinch past this opens reading mode… */
export const ENTER_READING = 1.15;
/** …and pinching reading mode back below this returns to the page (hysteresis: no flicker). */
export const EXIT_READING = 1.1;
/** Double tap / the zoom button open reading mode at the last zoom used, 2x the first time. */
export const DEFAULT_READING_ZOOM = 2;
/** One press of the zoom buttons / keys. */
export const ZOOM_STEP = 1.25;

export const clampZoom = (z: number) => (Number.isFinite(z) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) : MIN_ZOOM);

export function nextMode(mode: ReaderMode, zoom: number): ReaderMode {
  return mode === "page" ? (zoom >= ENTER_READING ? "reading" : "page") : zoom < EXIT_READING ? "page" : "reading";
}

export const stepZoom = (zoom: number, dir: 1 | -1) => clampZoom(zoom * ZOOM_STEP ** dir);

/**
 * The Mushaf page's own letter size at fit width: a 1280 × 2071 page has 15 lines, so at a column
 * `w` wide a line is ≈ 0.1 w tall and its letters ≈ half of that. Reading at 2x is twice this size.
 */
export const baseFontPx = (columnW: number) => Math.min(26, Math.max(15, columnW * 0.052));

/** The longest word in the local text, in base letters (checked against the data by the tests). */
export const LONGEST_WORD_LETTERS = 11;
/** A generous width of one base letter with its marks in the Quran font, in em. */
export const LETTER_EM = 0.6;

/** Font size for reading at `zoom`: zoom × the page's letter size, capped so the longest word of
 * the Quran still fits the column (so no word is ever split or cut, even at 3x on a narrow phone). */
export function readingFontPx(zoom: number, columnW: number): number {
  return Math.min(baseFontPx(columnW) * clampZoom(zoom), columnW / (LONGEST_WORD_LETTERS * LETTER_EM));
}

const ZOOM_KEY = "mushaf:readingZoom";

/** The last reading zoom, exactly as the fingers left it (clamped to the reading range). */
export function loadReadingZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    const v = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(v) ? Math.max(ENTER_READING, clampZoom(v)) : DEFAULT_READING_ZOOM;
  } catch {
    return DEFAULT_READING_ZOOM;
  }
}

export function saveReadingZoom(zoom: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(Math.max(ENTER_READING, clampZoom(zoom))));
  } catch {
    /* private mode: the zoom just isn't remembered */
  }
}

/* ---------- the page image ↔ the local text ---------- */

/** Lines on every Mushaf page, and where the text block sits in the page image (fractions of
 * its height, measured from the 604 page images: median top and bottom of the printed text). */
export const PAGE_LINES = 15;
const TEXT_TOP = 0.015;
const TEXT_BOTTOM = 0.967;

/** The printed line (1..15) at a height `fy` (0..1) of the page image. */
export function lineAtFraction(fy: number): number {
  const t = (fy - TEXT_TOP) / (TEXT_BOTTOM - TEXT_TOP);
  return Math.min(PAGE_LINES, Math.max(1, Math.floor(t * PAGE_LINES) + 1));
}

/** Where line `line` starts, as a fraction of the page image's height. */
export const lineTopFraction = (line: number) => TEXT_TOP + ((Math.min(PAGE_LINES, Math.max(1, line)) - 1) / PAGE_LINES) * (TEXT_BOTTOM - TEXT_TOP);

/**
 * The ayah printed on `line` of a page (its ayahs in order, from getPage). The source gives every
 * ayah's first and last line; where the source edition's page differs from the app's (56 ayahs),
 * the ayah's place in the page's list is used instead.
 */
export function ayahAtLine(ayahs: readonly QuranAyah[], line: number): QuranAyah | null {
  if (!ayahs.length) return null;
  const onSourcePage = ayahs.every((a) => a.sourcePage === a.mushafPage);
  if (onSourcePage) {
    const hit = ayahs.find((a) => line >= a.lineStart && line <= a.lineEnd);
    if (hit) return hit;
    const next = ayahs.find((a) => a.lineStart > line);
    return next ?? ayahs[ayahs.length - 1];
  }
  const i = Math.min(ayahs.length - 1, Math.floor(((line - 1) / PAGE_LINES) * ayahs.length));
  return ayahs[i];
}
