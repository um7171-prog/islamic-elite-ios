import { clampScroll, pageAtY, pageTop, type ReaderLayout } from "./readerLayout";
import {
  DOUBLE_TAP_ZOOM, FIT, isZoomed, panBy, pinchZoom, settleZoom, zoomAt, zoomTransform, type ZoomState,
} from "./pageZoom";

/**
 * Touch / trackpad / mouse handling for the vertical Mushaf, attached once to the scroll
 * container (not to every page):
 *
 * - One finger on a page at 1x is left to the browser: native, momentum vertical scrolling
 *   (the container is `touch-action: pan-y`, so there is no horizontal movement at all).
 * - Two fingers zoom the page under their midpoint, around that point, within MIN..MAX.
 *   Only one page is zoomed at a time; zooming another page returns the previous one to fit.
 * - One finger on the zoomed page pans inside it (that page is `touch-action: none`). When the
 *   pan reaches the page's top/bottom edge, the rest of the movement scrolls the reader, so the
 *   user is never stuck inside a zoomed page.
 * - Pinching back below FIT_SNAP (or double-tapping) returns the page to fit width, in place.
 *
 * Transforms are written straight to the page's zoom layer (no React render per frame).
 */

export const DOUBLE_TAP_MS = 260;
const DOUBLE_TAP_SLOP = 40;
const ZOOM_ANIMATION = "transform 260ms cubic-bezier(.22,.61,.36,1)";

export interface GestureHost {
  scroller: () => HTMLElement | null;
  layout: () => ReaderLayout | null;
  /** The element that carries a mounted page's zoom transform. */
  layer: (page: number) => HTMLElement | null;
  /** The zoomed page changed (null = every page at fit width). */
  onZoomPage: (page: number | null) => void;
  /** A single tap (not part of a double tap). */
  onTap: () => void;
  /** The user touched / wheeled the reader: programmatic scrolling must yield. */
  onUserInput: () => void;
  /** A finger / mouse gesture ended (a zoomed page pushed off screen can now return to fit). */
  onSettle?: () => void;
}

export interface MushafGestures {
  attach(): void;
  detach(): void;
  /** Feed the scroll container's click events (single tap / double tap). */
  click(e: MouseEvent): void;
  /** Zoom buttons / keys: the zoomed page, or `page`, around the centre of its visible part. */
  zoomBy(factor: number, page: number): void;
  resetZoom(animated?: boolean): void;
  zoomedPage(): number | null;
  zoomState(): ZoomState;
  /** A finger / pinch / glide is in progress. */
  gestureActive(): boolean;
}

interface Point {
  clientX: number;
  clientY: number;
}

type SafariGestureEvent = Event & { scale: number; clientX: number; clientY: number };

const midpoint = (a: Point, b: Point): Point => ({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createMushafGestures(host: GestureHost): MushafGestures {
  let owner: number | null = null;
  let zoom: ZoomState = FIT;
  let pinch: { d0: number; start: ZoomState; m0: { x: number; y: number } } | null = null;
  let safariPinch: { start: ZoomState; m0: { x: number; y: number } } | null = null;
  let pan: { x: number; y: number; t: number; vx: number; vy: number } | null = null;
  let mouse: { x: number; y: number; moved: number } | null = null;
  let glide = 0;
  let suppressClick = false;
  let lastTap: { t: number; x: number; y: number } | null = null;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let attachedTo: HTMLElement | null = null;

  const paint = (animated: boolean) => {
    if (owner === null) return;
    const el = host.layer(owner);
    if (!el) return;
    el.style.transition = animated ? ZOOM_ANIMATION : "none";
    el.style.transform = zoomTransform(zoom);
  };

  const unpaint = (page: number, animated: boolean) => {
    const el = host.layer(page);
    if (!el) return;
    el.style.transition = animated ? ZOOM_ANIMATION : "none";
    el.style.transform = "";
  };

  const stopGlide = () => {
    if (glide) cancelAnimationFrame(glide);
    glide = 0;
  };

  const setOwner = (page: number | null, animated = true) => {
    if (owner === page) return;
    if (owner !== null) unpaint(owner, animated);
    owner = page;
    zoom = FIT;
    host.onZoomPage(page);
  };

  const resetZoom = (animated = true) => {
    stopGlide();
    pinch = null;
    safariPinch = null;
    pan = null;
    if (owner !== null) setOwner(null, animated);
  };

  /** A viewport point in the coordinates of `page`'s box (null before the first layout). */
  const pointIn = (page: number | null, clientX: number, clientY: number) => {
    const L = host.layout();
    const el = host.scroller();
    if (!L || !el) return null;
    const rect = el.getBoundingClientRect();
    const cy = clientY - rect.top + el.scrollTop;
    const p = page ?? pageAtY(L, cy);
    return { L, page: p, x: clientX - rect.left - L.left, y: cy - pageTop(L, p) };
  };

  const inside = (pt: { L: ReaderLayout; x: number; y: number }) =>
    pt.x >= 0 && pt.x <= pt.L.pageW && pt.y >= 0 && pt.y <= pt.L.pageH;

  /** The vertical part a zoomed page could not take scrolls the reader instead. */
  const chainScroll = (restY: number) => {
    if (!restY) return;
    const el = host.scroller();
    const L = host.layout();
    if (el && L) el.scrollTop = clampScroll(L, el.scrollTop - restY);
  };

  const startGlide = (vx: number, vy: number) => {
    if (Math.hypot(vx, vy) < 0.05) return;
    let last = now();
    const frame = () => {
      const L = host.layout();
      if (!L || owner === null) {
        glide = 0;
        return;
      }
      const t = now();
      const dt = Math.min(48, t - last);
      last = t;
      const r = panBy(zoom, vx * dt, vy * dt, L.pageW, L.pageH);
      zoom = r.zoom;
      paint(false);
      const decay = 0.95 ** (dt / 16);
      vx = r.restX ? 0 : vx * decay;
      vy = r.restY ? 0 : vy * decay;
      glide = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(frame) : 0;
    };
    glide = requestAnimationFrame(frame);
  };

  const settle = () => {
    const L = host.layout();
    if (!L || owner === null) return;
    zoom = settleZoom(zoom, L.pageW, L.pageH);
    if (isZoomed(zoom)) paint(true);
    else resetZoom(true);
  };

  /* ---------- touch ---------- */

  const onTouchStart = (e: TouchEvent) => {
    host.onUserInput();
    stopGlide();
    if (e.touches.length >= 2) {
      // A second finger during a native scroll can't be taken over (the browser owns that
      // gesture): zooming on top of it would fight the scroll, so it waits for a fresh pinch.
      if (!e.cancelable) return;
      const m = midpoint(e.touches[0], e.touches[1]);
      const pt = pointIn(null, m.clientX, m.clientY);
      if (!pt || !host.layer(pt.page)) return;
      if (owner !== pt.page) setOwner(pt.page);
      pinch = { d0: Math.max(1, distance(e.touches[0], e.touches[1])), start: { ...zoom }, m0: { x: pt.x, y: pt.y } };
      pan = null;
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (e.touches.length === 1 && owner !== null && isZoomed(zoom)) {
      const t = e.touches[0];
      const pt = pointIn(owner, t.clientX, t.clientY);
      if (pt && inside(pt)) pan = { x: t.clientX, y: t.clientY, t: now(), vx: 0, vy: 0 };
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    const L = host.layout();
    if (!L || owner === null) return;
    if (pinch && e.touches.length >= 2) {
      if (!e.cancelable) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const m = midpoint(a, b);
      const pt = pointIn(owner, m.clientX, m.clientY);
      if (!pt) return;
      zoom = pinchZoom(pinch.start, pinch.start.scale * (distance(a, b) / pinch.d0), pinch.m0, pt, L.pageW, L.pageH);
      paint(false);
      return;
    }
    if (pan && e.touches.length === 1) {
      if (e.cancelable) e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - pan.x;
      const dy = t.clientY - pan.y;
      const tn = now();
      const dt = Math.max(1, tn - pan.t);
      pan.vx = 0.8 * pan.vx + 0.2 * (dx / dt);
      pan.vy = 0.8 * pan.vy + 0.2 * (dy / dt);
      pan.x = t.clientX;
      pan.y = t.clientY;
      pan.t = tn;
      const r = panBy(zoom, dx, dy, L.pageW, L.pageH);
      zoom = r.zoom;
      paint(false);
      chainScroll(r.restY);
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (pinch && e.touches.length < 2) {
      pinch = null;
      settle();
      if (e.touches.length === 1 && owner !== null && isZoomed(zoom)) {
        const t = e.touches[0];
        pan = { x: t.clientX, y: t.clientY, t: now(), vx: 0, vy: 0 };
      }
      return;
    }
    if (pan && e.touches.length === 0) {
      const { vx, vy, t } = pan;
      pan = null;
      host.onSettle?.();
      // Lifted while still moving: a short glide inside the page (never into the reader).
      if (owner !== null && now() - t < 80) startGlide(vx, vy);
    }
  };

  /* ---------- trackpad / wheel / mouse (web) ---------- */

  const onWheel = (e: WheelEvent) => {
    const L = host.layout();
    if (!L) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? L.viewportH : 1;
    if (e.ctrlKey) {
      // Trackpad pinch (and Ctrl + wheel) zooms the page under the pointer.
      const pt = pointIn(null, e.clientX, e.clientY);
      if (!pt || !host.layer(pt.page)) return;
      e.preventDefault();
      host.onUserInput();
      if (owner !== pt.page) setOwner(pt.page);
      zoom = zoomAt(zoom, zoom.scale * Math.exp(-e.deltaY * unit * 0.01), pt.x, pt.y, L.pageW, L.pageH);
      if (isZoomed(zoom)) paint(false);
      else resetZoom(false);
      return;
    }
    // Plain wheel scrolls the reader natively, except over the zoomed page, where it pans.
    if (owner === null || !isZoomed(zoom)) return;
    const pt = pointIn(owner, e.clientX, e.clientY);
    if (!pt || !inside(pt)) return;
    e.preventDefault();
    host.onUserInput();
    const r = panBy(zoom, -e.deltaX * unit, -e.deltaY * unit, L.pageW, L.pageH);
    zoom = r.zoom;
    paint(false);
    chainScroll(r.restY);
  };

  // Safari (macOS trackpad) pinch. On iOS these accompany the touch pinch, which already
  // handles it — they are only prevented so the browser never zooms the whole screen.
  const onGestureStart = (ev: Event) => {
    ev.preventDefault();
    if (pinch) return;
    const e = ev as SafariGestureEvent;
    const pt = pointIn(null, e.clientX, e.clientY);
    if (!pt || !host.layer(pt.page)) return;
    host.onUserInput();
    if (owner !== pt.page) setOwner(pt.page);
    safariPinch = { start: { ...zoom }, m0: { x: pt.x, y: pt.y } };
  };
  const onGestureChange = (ev: Event) => {
    ev.preventDefault();
    const L = host.layout();
    if (!safariPinch || pinch || !L) return;
    const e = ev as SafariGestureEvent;
    const { start, m0 } = safariPinch;
    zoom = zoomAt(start, start.scale * e.scale, m0.x, m0.y, L.pageW, L.pageH);
    paint(false);
  };
  const onGestureEnd = (ev: Event) => {
    ev.preventDefault();
    if (!safariPinch) return;
    safariPinch = null;
    settle();
  };

  const onMouseMove = (e: MouseEvent) => {
    const L = host.layout();
    if (!mouse || !L || owner === null) return;
    const dx = e.clientX - mouse.x;
    const dy = e.clientY - mouse.y;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    const r = panBy(zoom, dx, dy, L.pageW, L.pageH);
    zoom = r.zoom;
    paint(false);
    chainScroll(r.restY);
  };
  const onMouseUp = () => {
    if (mouse && mouse.moved > 4) suppressClick = true; // a drag is not a tap
    mouse = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    host.onSettle?.();
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || owner === null || !isZoomed(zoom)) return;
    const pt = pointIn(owner, e.clientX, e.clientY);
    if (!pt || !inside(pt)) return;
    host.onUserInput();
    stopGlide();
    mouse = { x: e.clientX, y: e.clientY, moved: 0 };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  /* ---------- taps ---------- */

  const doubleTap = (clientX: number, clientY: number) => {
    const pt = pointIn(null, clientX, clientY);
    if (!pt) return;
    if (owner === pt.page && isZoomed(zoom)) {
      resetZoom(true);
      return;
    }
    if (!inside(pt) || !host.layer(pt.page)) return;
    setOwner(pt.page);
    zoom = zoomAt(FIT, DOUBLE_TAP_ZOOM, pt.x, pt.y, pt.L.pageW, pt.L.pageH);
    paint(true);
  };

  const click = (e: MouseEvent) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const t = now();
    if (lastTap && t - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_SLOP) {
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = null;
      lastTap = null;
      doubleTap(e.clientX, e.clientY);
      return;
    }
    lastTap = { t, x: e.clientX, y: e.clientY };
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapTimer = null;
      lastTap = null;
      host.onTap();
    }, DOUBLE_TAP_MS);
  };

  const zoomBy = (factor: number, page: number) => {
    const L = host.layout();
    const el = host.scroller();
    const p = owner ?? page;
    if (!L || !el || !host.layer(p)) return;
    host.onUserInput();
    stopGlide();
    if (owner !== p) setOwner(p);
    // Anchor: the middle of the part of the page that is on screen.
    const top = pageTop(L, p) - el.scrollTop;
    const y0 = Math.max(0, -top);
    const y1 = Math.min(L.pageH, L.viewportH - top);
    const ay = y1 > y0 ? (y0 + y1) / 2 : L.pageH / 2;
    zoom = zoomAt(zoom, zoom.scale * factor, L.pageW / 2, ay, L.pageW, L.pageH);
    if (isZoomed(zoom)) paint(true);
    else resetZoom(true);
  };

  /* ---------- lifecycle ---------- */

  const active: AddEventListenerOptions = { passive: false };

  const detach = () => {
    const el = attachedTo;
    stopGlide();
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    if (!el) return;
    el.removeEventListener("touchstart", onTouchStart, active);
    el.removeEventListener("touchmove", onTouchMove, active);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
    el.removeEventListener("wheel", onWheel, active);
    el.removeEventListener("gesturestart", onGestureStart, active);
    el.removeEventListener("gesturechange", onGestureChange, active);
    el.removeEventListener("gestureend", onGestureEnd, active);
    el.removeEventListener("mousedown", onMouseDown);
    attachedTo = null;
  };

  const attach = () => {
    const el = host.scroller();
    if (!el || attachedTo === el) return;
    detach();
    attachedTo = el;
    el.addEventListener("touchstart", onTouchStart, active);
    el.addEventListener("touchmove", onTouchMove, active);
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, active);
    el.addEventListener("gesturestart", onGestureStart, active);
    el.addEventListener("gesturechange", onGestureChange, active);
    el.addEventListener("gestureend", onGestureEnd, active);
    el.addEventListener("mousedown", onMouseDown);
  };

  return {
    attach,
    detach,
    click,
    zoomBy,
    resetZoom,
    zoomedPage: () => owner,
    zoomState: () => zoom,
    gestureActive: () => !!(pinch || safariPinch || pan || mouse || glide),
  };
}
