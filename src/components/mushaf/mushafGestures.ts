/**
 * Taps and presses in the Mushaf reader (the pinch is handled by pinchInput.ts / nativePinch.ts):
 *
 * - One finger always belongs to the browser's own momentum scrolling: nothing here moves the page.
 * - A single tap (not part of a double tap) toggles the toolbars (or plays / pauses auto-scroll).
 * - A double tap switches between the printed page and reading zoom, at the tapped place.
 * - Holding a finger still on the page (or a right-click) opens the ayahs there.
 *
 * Listeners go on the reader's root, so they keep working whichever view (the page images or the
 * reading text) is under the finger, including while the view changes during a gesture.
 */

export const DOUBLE_TAP_MS = 260;
export const LONG_PRESS_MS = 500;
const DOUBLE_TAP_SLOP = 40;
const LONG_PRESS_SLOP = 10;

export interface GestureHost {
  /** A single tap (not part of a double tap). */
  onTap: () => void;
  onDoubleTap: (clientX: number, clientY: number) => void;
  /** A finger held still on a page (or a right-click) at this point. */
  onLongPress: (clientX: number, clientY: number) => void;
  /** A finger touched the reader: programmatic scrolling must yield. */
  onUserInput: () => void;
}

export interface MushafGestures {
  attach(root: HTMLElement): void;
  detach(): void;
  /** Feed the scroll views' click events (single tap / double tap). */
  click(e: MouseEvent): void;
}

const onReadingSurface = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("[data-mushaf-scroll]");

export function createMushafGestures(host: GestureHost): MushafGestures {
  let root: HTMLElement | null = null;
  let suppressClick = false;
  let lastTap: { t: number; x: number; y: number } | null = null;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };

  const onTouchStart = (e: TouchEvent) => {
    cancelPress();
    if (!onReadingSurface(e.target)) return;
    host.onUserInput();
    if (e.touches.length !== 1) return; // a second finger is a pinch, never a press
    suppressClick = false; // a new touch: a leftover long-press flag is stale
    const t = e.touches[0];
    press = {
      x: t.clientX,
      y: t.clientY,
      timer: setTimeout(() => {
        const at = press;
        press = null;
        if (!at) return;
        suppressClick = true; // the lift that follows is not a tap
        host.onLongPress(at.x, at.y);
      }, LONG_PRESS_MS),
    };
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!press) return;
    const t = e.touches[0];
    if (e.touches.length !== 1 || !t || Math.hypot(t.clientX - press.x, t.clientY - press.y) > LONG_PRESS_SLOP) cancelPress();
  };

  const onContextMenu = (e: MouseEvent) => {
    if (!onReadingSurface(e.target)) return;
    e.preventDefault();
    cancelPress();
    host.onLongPress(e.clientX, e.clientY);
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
      host.onDoubleTap(e.clientX, e.clientY);
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

  const detach = () => {
    cancelPress();
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = null;
    if (!root) return;
    root.removeEventListener("touchstart", onTouchStart);
    root.removeEventListener("touchmove", onTouchMove);
    root.removeEventListener("touchend", cancelPress);
    root.removeEventListener("touchcancel", cancelPress);
    root.removeEventListener("contextmenu", onContextMenu);
    root.removeEventListener("scroll", cancelPress, true);
    root = null;
  };

  const attach = (el: HTMLElement) => {
    if (root === el) return;
    detach();
    root = el;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", cancelPress);
    el.addEventListener("touchcancel", cancelPress);
    el.addEventListener("contextmenu", onContextMenu);
    // Scroll events do not bubble, but they do reach the root in the capture phase: any scroll
    // of either view means the finger was not held still.
    el.addEventListener("scroll", cancelPress, { capture: true, passive: true });
  };

  return { attach, detach, click };
}
