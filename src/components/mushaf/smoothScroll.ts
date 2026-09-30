/**
 * Programmatic scrolling of the Mushaf column, always animated with requestAnimationFrame
 * (the same on every iOS version, unlike CSS smooth scrolling) and always clamped to the
 * column. Repeated steps accumulate from the pending target, so pressing again keeps
 * advancing smoothly instead of restarting or jumping.
 */

export const STEP_MS = 240;
export const GOTO_MS = 420;
/** Speed while a scroll key is held down (continuous, readable). */
export const HOLD_PX_PER_S = 520;

export interface ScrollAnimator {
  /** Animate to `y` (0 ms = jump). */
  to(y: number, ms?: number): void;
  /** Animate by `dy` from where the current animation is heading. */
  by(dy: number, ms?: number): void;
  /** Continuous scrolling while a key is held (1 = down, -1 = up). */
  hold(dir: 1 | -1): void;
  release(): void;
  stop(): void;
  busy(): boolean;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createScrollAnimator(
  getEl: () => HTMLElement | null,
  clamp: (y: number) => number,
  opts: { onFrame?: () => void; reducedMotion?: () => boolean } = {},
): ScrollAnimator {
  let raf = 0;
  let target: number | null = null;
  let holdDir: 1 | -1 | 0 = 0;

  const cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const stop = () => {
    cancel();
    target = null;
    holdDir = 0;
  };

  const to = (y: number, ms = STEP_MS) => {
    const el = getEl();
    if (!el) return;
    cancel();
    holdDir = 0;
    const from = el.scrollTop;
    const dest = clamp(y);
    opts.onFrame?.();
    if (ms <= 0 || opts.reducedMotion?.() || Math.abs(dest - from) < 0.5) {
      el.scrollTop = dest;
      target = null;
      return;
    }
    target = dest;
    const start = now();
    const frame = () => {
      const t = Math.min(1, (now() - start) / ms);
      el.scrollTop = from + (dest - from) * easeOutCubic(t);
      opts.onFrame?.();
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        raf = 0;
        target = null;
      }
    };
    raf = requestAnimationFrame(frame);
  };

  const by = (dy: number, ms = STEP_MS) => {
    const el = getEl();
    if (!el) return;
    to((target ?? el.scrollTop) + dy, ms);
  };

  const hold = (dir: 1 | -1) => {
    if (holdDir === dir && raf) return;
    const el = getEl();
    if (!el) return;
    cancel();
    target = null;
    holdDir = dir;
    let last = now();
    const frame = () => {
      const t = now();
      const dt = Math.min(64, t - last);
      last = t;
      const next = clamp(el.scrollTop + holdDir * (HOLD_PX_PER_S * dt) / 1000);
      el.scrollTop = next;
      opts.onFrame?.();
      // Stop at the first / last page instead of spinning at the edge.
      if (holdDir !== 0 && next !== clamp(next + holdDir)) raf = requestAnimationFrame(frame);
      else raf = 0;
    };
    raf = requestAnimationFrame(frame);
  };

  const release = () => {
    if (!holdDir) return;
    holdDir = 0;
    cancel();
  };

  return { to, by, hold, release, stop, busy: () => raf !== 0 };
}
