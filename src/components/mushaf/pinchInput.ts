/**
 * Two-finger pinch for the Mushaf in the browser / web view.
 *
 * Two fingers always mean a pinch: from the moment the second finger lands the scroll view is
 * frozen (overflow hidden) so native scrolling cannot take the gesture over, and it scrolls again as
 * soon as fewer than two fingers remain. Events are never ignored because the browser marked them
 * non-cancelable (it does that once a scroll has begun): the pinch is followed regardless, and
 * `preventDefault` is only called where it is allowed. Safari's own gesture events are always
 * prevented so the whole screen never zooms. A trackpad pinch (Ctrl + wheel) zooms too.
 *
 * In the iPhone app a native UIKit recognizer drives the pinch instead (nativePinch.ts); this input
 * then only freezes scrolling (`setEmit(false)`), so there is never a second zoom.
 */

export interface PinchEvent {
  phase: "start" | "change" | "end";
  /** Relative to the start of this pinch (1 = the fingers as they landed). */
  scale: number;
  /** The point between the fingers, in viewport coordinates. */
  x: number;
  y: number;
}

export interface PinchHandlers {
  onPinch: (e: PinchEvent) => void;
  /** Trackpad pinch / Ctrl + wheel: a zoom factor around (x, y). */
  onWheelZoom?: (factor: number, x: number, y: number) => void;
}

export interface PinchInput {
  detach(): void;
  /** False while another source (the native recognizer) reports the pinch. */
  setEmit(emit: boolean): void;
  /** A pinch is in progress. */
  active(): boolean;
}

interface Pt {
  clientX: number;
  clientY: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const mid = (a: Pt, b: Pt) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

/** The scroll views inside `root` (marked data-mushaf-scroll), and `root` itself if it is one. */
function scrollViews(root: HTMLElement): HTMLElement[] {
  const list = Array.from(root.querySelectorAll<HTMLElement>("[data-mushaf-scroll]"));
  return root.matches?.("[data-mushaf-scroll]") || !list.length ? [root, ...list] : list;
}

export function createPinchInput(root: HTMLElement, handlers: PinchHandlers): PinchInput {
  let emit = true;
  let pinch: { d0: number; scale: number; x: number; y: number } | null = null;
  let frozen: { el: HTMLElement; overflowY: string }[] = [];

  const freeze = () => {
    if (frozen.length) return;
    frozen = scrollViews(root).map((el) => ({ el, overflowY: el.style.overflowY }));
    for (const f of frozen) f.el.style.overflowY = "hidden";
  };
  const unfreeze = () => {
    for (const f of frozen) f.el.style.overflowY = f.overflowY;
    frozen = [];
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length < 2) return;
    freeze();
    if (e.cancelable) e.preventDefault();
    if (pinch) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const m = mid(a, b);
    pinch = { d0: Math.max(1, dist(a, b)), scale: 1, x: m.x, y: m.y };
    if (emit) handlers.onPinch({ phase: "start", scale: 1, x: m.x, y: m.y });
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!pinch || e.touches.length < 2) return;
    if (e.cancelable) e.preventDefault();
    const [a, b] = [e.touches[0], e.touches[1]];
    const m = mid(a, b);
    pinch.scale = dist(a, b) / pinch.d0;
    pinch.x = m.x;
    pinch.y = m.y;
    if (emit) handlers.onPinch({ phase: "change", scale: pinch.scale, x: m.x, y: m.y });
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length >= 2) return;
    unfreeze();
    if (!pinch) return;
    const { scale, x, y } = pinch;
    pinch = null;
    if (emit) handlers.onPinch({ phase: "end", scale, x, y });
  };

  // Safari: never let the browser zoom the whole screen. On macOS (no touch events) these carry
  // the trackpad pinch itself; on iOS the touch events above already report it.
  let safari: { x: number; y: number } | null = null;
  const onGestureStart = (ev: Event) => {
    ev.preventDefault();
    if (pinch || !emit) return;
    const e = ev as Event & { clientX?: number; clientY?: number };
    safari = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
    handlers.onPinch({ phase: "start", scale: 1, ...safari });
  };
  const onGestureChange = (ev: Event) => {
    ev.preventDefault();
    if (!safari || pinch) return;
    handlers.onPinch({ phase: "change", scale: (ev as Event & { scale?: number }).scale ?? 1, ...safari });
  };
  const onGestureEnd = (ev: Event) => {
    ev.preventDefault();
    if (!safari) return;
    const at = safari;
    safari = null;
    handlers.onPinch({ phase: "end", scale: (ev as Event & { scale?: number }).scale ?? 1, ...at });
  };

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey || !handlers.onWheelZoom) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    handlers.onWheelZoom(Math.exp(-e.deltaY * unit * 0.01), e.clientX, e.clientY);
  };

  const opts: AddEventListenerOptions = { passive: false };
  root.addEventListener("touchstart", onTouchStart, opts);
  root.addEventListener("touchmove", onTouchMove, opts);
  root.addEventListener("touchend", onTouchEnd);
  root.addEventListener("touchcancel", onTouchEnd);
  root.addEventListener("gesturestart", onGestureStart, opts);
  root.addEventListener("gesturechange", onGestureChange, opts);
  root.addEventListener("gestureend", onGestureEnd, opts);
  root.addEventListener("wheel", onWheel, opts);

  return {
    detach() {
      unfreeze();
      pinch = null;
      safari = null;
      root.removeEventListener("touchstart", onTouchStart, opts);
      root.removeEventListener("touchmove", onTouchMove, opts);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
      root.removeEventListener("gesturestart", onGestureStart, opts);
      root.removeEventListener("gesturechange", onGestureChange, opts);
      root.removeEventListener("gestureend", onGestureEnd, opts);
      root.removeEventListener("wheel", onWheel, opts);
    },
    setEmit(v) {
      emit = v;
    },
    active: () => !!(pinch || safari),
  };
}
