/**
 * Continuous auto-scroll for a scroll view (the Mushaf column, or any list).
 *
 * - requestAnimationFrame only: no intervals, and no frame at all is scheduled while it is still.
 * - Continuous: position += velocity × time, with the fractional part kept between frames, so a
 *   slow speed is a steady glide, never page snapping or jumps.
 * - Speed changes and pausing are eased (the velocity approaches its target exponentially), so the
 *   motion never jumps; pausing keeps the exact place, playing again continues from it.
 * - If anything else moves the view (a finger, keys, "go to page"), it stops and hands over.
 * - It only ever changes scrollTop: never anything horizontal.
 */

export interface AutoScrollerOptions {
  /** Clamp a position to the scrollable range. */
  clamp: (y: number) => number;
  /** Injectable for tests (default: the window's). */
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  now?: () => number;
  /** Time constant (s) of speed changes; pausing uses half of it. */
  easeS?: number;
  /** Every programmatic move. */
  onFrame?: () => void;
  /** Playing / not playing changed (including stops at the end or on user scroll). */
  onStateChange?: (playing: boolean) => void;
  /** Reached the end of the view. */
  onEnd?: () => void;
  /** Someone else moved the view, so auto-scroll stopped. */
  onUserScroll?: () => void;
}

export interface AutoScroller {
  play(): void;
  pause(): void;
  toggle(): void;
  /** Target speed in px/s (eased towards). */
  setSpeed(pxPerSecond: number): void;
  playing(): boolean;
  /** Current velocity, px/s. */
  velocity(): number;
  /** A frame is scheduled. */
  active(): boolean;
  destroy(): void;
}

/** A move by someone else larger than this (px) between two frames stops auto-scroll. */
const FOREIGN_MOVE_PX = 2;

/**
 * Mushaf reading speeds, as seconds per page (so a speed reads the same on every screen size):
 * 1 = very slow … 5 = very fast.
 */
export const AUTO_SCROLL_SECONDS_PER_PAGE = [200, 130, 90, 60, 35] as const;
export const AUTO_SCROLL_LEVELS = AUTO_SCROLL_SECONDS_PER_PAGE.length;
export const DEFAULT_AUTO_SCROLL_LEVEL = 3;

export const clampAutoScrollLevel = (level: number) =>
  Math.min(AUTO_SCROLL_LEVELS, Math.max(1, Math.round(Number.isFinite(level) ? level : DEFAULT_AUTO_SCROLL_LEVEL)));

/** px/s for a level, from the height of one page on this screen. */
export const autoScrollSpeed = (pageHeight: number, level: number) =>
  pageHeight / AUTO_SCROLL_SECONDS_PER_PAGE[clampAutoScrollLevel(level) - 1];

const LEVEL_KEY = "mushaf:autoScrollLevel";

export function loadAutoScrollLevel(): number {
  try {
    const v = Number(localStorage.getItem(LEVEL_KEY));
    return v ? clampAutoScrollLevel(v) : DEFAULT_AUTO_SCROLL_LEVEL;
  } catch {
    return DEFAULT_AUTO_SCROLL_LEVEL;
  }
}

export function saveAutoScrollLevel(level: number): void {
  try {
    localStorage.setItem(LEVEL_KEY, String(clampAutoScrollLevel(level)));
  } catch {
    /* private mode: the level just isn't remembered */
  }
}

export function createAutoScroller(getEl: () => HTMLElement | null, opts: AutoScrollerOptions): AutoScroller {
  const raf = opts.raf ?? ((cb: FrameRequestCallback) => requestAnimationFrame(cb));
  const caf = opts.caf ?? ((id: number) => cancelAnimationFrame(id));
  const now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const easeS = opts.easeS ?? 0.35;

  let isPlaying = false;
  let speed = 0;
  let v = 0;
  let frameId = 0;
  let last = 0;
  let pos = 0;
  let written = Number.NaN;

  const setPlaying = (p: boolean) => {
    if (isPlaying === p) return;
    isPlaying = p;
    opts.onStateChange?.(p);
  };

  const stopLoop = () => {
    if (frameId) caf(frameId);
    frameId = 0;
    written = Number.NaN;
  };

  const frame = () => {
    frameId = 0;
    const el = getEl();
    if (!el) {
      v = 0;
      stopLoop();
      setPlaying(false);
      return;
    }
    const t = now();
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    if (Number.isFinite(written) && Math.abs(el.scrollTop - written) > FOREIGN_MOVE_PX) {
      v = 0;
      stopLoop();
      setPlaying(false);
      opts.onUserScroll?.();
      return;
    }
    const target = isPlaying ? speed : 0;
    const tau = isPlaying ? easeS : easeS / 2;
    v += (target - v) * (1 - Math.exp(-dt / tau));
    if (!isPlaying && Math.abs(v) < 0.5) {
      v = 0;
      stopLoop();
      return;
    }
    const next = opts.clamp(pos + v * dt);
    const atEnd = v > 0 && next <= pos && opts.clamp(pos + 1) <= pos;
    pos = next;
    el.scrollTop = pos;
    written = el.scrollTop;
    opts.onFrame?.();
    if (atEnd) {
      v = 0;
      stopLoop();
      setPlaying(false);
      opts.onEnd?.();
      return;
    }
    frameId = raf(frame);
  };

  const ensureLoop = () => {
    if (frameId) return;
    const el = getEl();
    if (!el) return;
    pos = el.scrollTop;
    written = el.scrollTop;
    last = now();
    frameId = raf(frame);
  };

  const play = () => {
    setPlaying(true);
    ensureLoop();
  };
  const pause = () => {
    setPlaying(false);
    if (v !== 0) ensureLoop(); // ease out; the loop ends by itself
  };

  return {
    play,
    pause,
    toggle: () => (isPlaying ? pause() : play()),
    setSpeed: (px) => {
      speed = Math.max(0, Number.isFinite(px) ? px : 0);
    },
    playing: () => isPlaying,
    velocity: () => v,
    active: () => frameId !== 0,
    destroy: () => {
      isPlaying = false;
      v = 0;
      stopLoop();
    },
  };
}
