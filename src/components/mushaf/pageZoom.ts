/**
 * Zoom math for one Mushaf page. The page box never changes size: zoom is a
 * translate + scale of the page image inside it (origin top-left), clamped so the
 * image always covers the whole box — it can't slide away, leave an empty band,
 * or grow outside its own page.
 */

/** 1 = the fit-width page. */
export const MIN_ZOOM = 1;
/** Enough to read fine marks; higher would only magnify the 1280 px source's pixels. */
export const MAX_ZOOM = 3;
export const DOUBLE_TAP_ZOOM = 2.5;
/** One zoom button / key step. */
export const ZOOM_STEP = 1.5;
/** Released below this, a page settles back to fit (no near-1x limbo). */
export const FIT_SNAP = 1.05;

export interface ZoomState {
  scale: number;
  /** Translation of the scaled image, CSS px (≤ 0). */
  x: number;
  y: number;
}

export const FIT: ZoomState = Object.freeze({ scale: 1, x: 0, y: 0 });

export const clampZoom = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(scale) ? scale : MIN_ZOOM));

export const isZoomed = (z: ZoomState) => z.scale > MIN_ZOOM + 1e-3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps the scaled image covering its w×h box; at 1x the page is exactly in place. */
export function clampPan(z: ZoomState, w: number, h: number): ZoomState {
  const scale = clampZoom(z.scale);
  if (scale <= MIN_ZOOM) return FIT;
  return { scale, x: clamp(z.x, w - w * scale, 0), y: clamp(z.y, h - h * scale, 0) };
}

/** Zoom to `scale` keeping the image point under (px, py) — the fingers — where it is. */
export function zoomAt(z: ZoomState, scale: number, px: number, py: number, w: number, h: number): ZoomState {
  const s = clampZoom(scale);
  const k = s / z.scale;
  return clampPan({ scale: s, x: px - (px - z.x) * k, y: py - (py - z.y) * k }, w, h);
}

/** A pinch: scale around where it started (m0) and follow the fingers' midpoint (m). */
export function pinchZoom(
  start: ZoomState,
  scale: number,
  m0: { x: number; y: number },
  m: { x: number; y: number },
  w: number,
  h: number,
): ZoomState {
  const s = clampZoom(scale);
  const k = s / start.scale;
  return clampPan({ scale: s, x: m.x - (m0.x - start.x) * k, y: m.y - (m0.y - start.y) * k }, w, h);
}

/** Moves a zoomed image; `restY` is the part of the move the image could not take
 * (it hit its top/bottom edge) — the reader scrolls by that much instead. */
export function panBy(z: ZoomState, dx: number, dy: number, w: number, h: number): { zoom: ZoomState; restX: number; restY: number } {
  const want = { scale: z.scale, x: z.x + dx, y: z.y + dy };
  const zoom = clampPan(want, w, h);
  return { zoom, restX: want.x - zoom.x, restY: want.y - zoom.y };
}

/** End of a gesture: back to fit when barely zoomed, otherwise kept (within bounds). */
export function settleZoom(z: ZoomState, w: number, h: number): ZoomState {
  return z.scale < FIT_SNAP ? FIT : clampPan(z, w, h);
}

/** Screen pixels kept between the text and the screen edge when a view is aligned to the text. */
export const TEXT_MARGIN_PX = 8;
/** A view edge this close to the text edge (share of the view's width) is aligned to it. */
export const EDGE_SNAP = 0.2;

/**
 * Where a zoomed page comes to rest after a pinch / pan: the nearest comfortable position to
 * where the user left it, so a line is not left cut by accident at a screen edge.
 *
 * - The whole width of the printed text fits on screen → it is centred (nothing is cut).
 * - Otherwise, a view edge that stopped near the text's edge is aligned to it (the full start of
 *   the lines on the right, or their end on the left), instead of showing a sliver of margin or
 *   cutting the first / last words.
 * - Anywhere else the user's position is kept: they are reading mid-line on purpose.
 * Vertically only the page bounds apply. The result is always inside the page (clampPan).
 */
export function comfortableZoom(z: ZoomState, w: number, h: number, ink: { left: number; right: number }): ZoomState {
  const settled = settleZoom(z, w, h);
  if (!isZoomed(settled)) return FIT;
  const s = settled.scale;
  const viewW = w / s; // visible width, in unzoomed page pixels
  const pad = TEXT_MARGIN_PX / s;
  const textL = ink.left * w;
  const textR = ink.right * w;
  const inkL = textL - pad;
  const inkR = textR + pad;
  const u0 = -settled.x / s;
  let next = u0;
  if (textR - textL <= viewW) {
    next = (textL + textR) / 2 - viewW / 2;
  } else {
    const snap = viewW * EDGE_SNAP;
    if (Math.abs(u0 + viewW - inkR) < snap) next = inkR - viewW;
    else if (Math.abs(u0 - inkL) < snap) next = inkL;
  }
  return clampPan({ scale: s, x: -next * s, y: settled.y }, w, h);
}

/** A 2D transform (as the previous, device-tested zoom used): WebKit re-renders the
 * page image sharply at the new scale instead of stretching a cached bitmap. */
export function zoomTransform(z: ZoomState): string {
  return `translate(${z.x}px, ${z.y}px) scale(${z.scale})`;
}
