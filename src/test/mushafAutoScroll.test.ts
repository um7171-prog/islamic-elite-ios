import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AUTO_SCROLL_LEVELS, AUTO_SCROLL_SECONDS_PER_PAGE, DEFAULT_AUTO_SCROLL_LEVEL, autoScrollSpeed, clampAutoScrollLevel,
  createAutoScroller, loadAutoScrollLevel, saveAutoScrollLevel,
} from "@/components/mushaf/autoScroll";

/** A deterministic frame clock: frames only run when the test steps them. */
function frames() {
  let t = 0;
  let nextId = 1;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    raf: (cb: FrameRequestCallback) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    caf: (id: number) => void queue.delete(id),
    now: () => t,
    pending: () => queue.size,
    /** Advance time by `ms` in 16 ms frames. */
    run(ms: number) {
      for (let i = 0; i < Math.round(ms / 16); i++) {
        t += 16;
        const due = [...queue.entries()];
        queue.clear();
        for (const [, cb] of due) cb(t);
      }
    },
  };
}

const view = (scrollTop = 0) => ({ scrollTop }) as unknown as HTMLElement;
const MAX = 50_000;
const clamp = (y: number) => Math.min(MAX, Math.max(0, y));

function setup(start = 1000, extra: Record<string, unknown> = {}) {
  const f = frames();
  const el = view(start);
  const onStateChange = vi.fn();
  const onEnd = vi.fn();
  const onUserScroll = vi.fn();
  const a = createAutoScroller(() => el, { clamp, raf: f.raf, caf: f.caf, now: f.now, onStateChange, onEnd, onUserScroll, ...extra });
  return { f, el, a, onStateChange, onEnd, onUserScroll };
}

afterEach(() => vi.restoreAllMocks());

describe("speed levels", () => {
  it("slow, medium, fast … as seconds per page, each level faster than the one before", () => {
    expect(AUTO_SCROLL_LEVELS).toBeGreaterThanOrEqual(3);
    for (let l = 2; l <= AUTO_SCROLL_LEVELS; l++) {
      expect(AUTO_SCROLL_SECONDS_PER_PAGE[l - 1]).toBeLessThan(AUTO_SCROLL_SECONDS_PER_PAGE[l - 2]);
    }
    expect(DEFAULT_AUTO_SCROLL_LEVEL).toBe(3);
  });

  it("px/s follows the page height on screen, so every device reads at the same pace", () => {
    const pageH = 605;
    expect(autoScrollSpeed(pageH, 3)).toBeCloseTo(pageH / AUTO_SCROLL_SECONDS_PER_PAGE[2], 9);
    expect(autoScrollSpeed(1210, 3)).toBeCloseTo(2 * autoScrollSpeed(605, 3), 9);
    expect(clampAutoScrollLevel(0)).toBe(1);
    expect(clampAutoScrollLevel(99)).toBe(AUTO_SCROLL_LEVELS);
    expect(clampAutoScrollLevel(Number.NaN)).toBe(DEFAULT_AUTO_SCROLL_LEVEL);
  });

  it("the chosen level is remembered", () => {
    localStorage.clear();
    expect(loadAutoScrollLevel()).toBe(DEFAULT_AUTO_SCROLL_LEVEL);
    saveAutoScrollLevel(5);
    expect(loadAutoScrollLevel()).toBe(5);
    saveAutoScrollLevel(42);
    expect(loadAutoScrollLevel()).toBe(AUTO_SCROLL_LEVELS);
  });
});

describe("auto-scroll engine", () => {
  it("starts smoothly (the speed eases up, never jumps) and then moves continuously", () => {
    const { f, el, a, onStateChange } = setup();
    a.setSpeed(60);
    a.play();
    expect(onStateChange).toHaveBeenCalledWith(true);
    f.run(16);
    expect(a.velocity()).toBeGreaterThan(0);
    expect(a.velocity()).toBeLessThan(10); // first frame: a fraction of the target
    f.run(3000);
    expect(a.velocity()).toBeCloseTo(60, 0);
    const y = el.scrollTop;
    f.run(1000);
    expect(el.scrollTop - y).toBeCloseTo(60, 0); // steady 60 px/s, no snapping
  });

  it("moves in small continuous steps — each frame far less than a page", () => {
    const { f, el, a } = setup();
    a.setSpeed(autoScrollSpeed(605, AUTO_SCROLL_LEVELS));
    a.play();
    f.run(3000);
    let prev = el.scrollTop;
    for (let i = 0; i < 30; i++) {
      f.run(16);
      const step = el.scrollTop - prev;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(2);
      prev = el.scrollTop;
    }
  });

  it("changing the speed is gradual", () => {
    const { f, a } = setup();
    a.setSpeed(10);
    a.play();
    f.run(3000);
    a.setSpeed(40);
    f.run(16);
    expect(a.velocity()).toBeGreaterThan(10);
    expect(a.velocity()).toBeLessThan(15);
    f.run(3000);
    expect(a.velocity()).toBeCloseTo(40, 0);
  });

  it("pause keeps the place; play continues from it", () => {
    const { f, el, a, onStateChange } = setup();
    a.setSpeed(30);
    a.play();
    f.run(2000);
    a.pause();
    expect(onStateChange).toHaveBeenLastCalledWith(false);
    f.run(2000); // eases out, then stops for good
    expect(a.active()).toBe(false);
    expect(f.pending()).toBe(0);
    const here = el.scrollTop;
    f.run(1000);
    expect(el.scrollTop).toBe(here);
    a.play();
    f.run(1000);
    expect(el.scrollTop).toBeGreaterThan(here);
    expect(el.scrollTop - here).toBeLessThan(30); // resumed from the same spot, easing back up
  });

  it("someone else moving the view (a finger, go-to-page) stops it and hands over", () => {
    const { f, el, a, onUserScroll } = setup();
    a.setSpeed(30);
    a.play();
    f.run(500);
    el.scrollTop += 200; // the user scrolls
    f.run(16);
    expect(onUserScroll).toHaveBeenCalledTimes(1);
    expect(a.playing()).toBe(false);
    expect(a.active()).toBe(false);
    expect(el.scrollTop).toBeGreaterThan(1150); // the user's position is kept, not undone
  });

  it("stops at the end of the Mushaf", () => {
    const { f, el, a, onEnd } = setup(MAX - 10);
    a.setSpeed(60);
    a.play();
    f.run(3000);
    expect(el.scrollTop).toBe(MAX);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(a.playing()).toBe(false);
    expect(f.pending()).toBe(0);
  });

  it("only ever changes the vertical position", () => {
    const el = { scrollTop: 0, scrollLeft: 0 } as unknown as HTMLElement;
    const f = frames();
    const a = createAutoScroller(() => el, { clamp, raf: f.raf, caf: f.caf, now: f.now });
    a.setSpeed(40);
    a.play();
    f.run(2000);
    expect(el.scrollTop).toBeGreaterThan(0);
    expect(el.scrollLeft).toBe(0);
  });

  it("destroy leaves nothing running (no frame, no timer, no interval)", () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    const { f, a } = setup();
    a.setSpeed(30);
    a.play();
    f.run(100);
    expect(f.pending()).toBe(1);
    a.destroy();
    expect(f.pending()).toBe(0);
    expect(a.active()).toBe(false);
    expect(interval).not.toHaveBeenCalled();
  });

  it("a view that disappears (reader closed) ends the loop instead of spinning", () => {
    const f = frames();
    let el: HTMLElement | null = view(0);
    const a = createAutoScroller(() => el, { clamp, raf: f.raf, caf: f.caf, now: f.now });
    a.setSpeed(30);
    a.play();
    f.run(100);
    el = null;
    f.run(100);
    expect(f.pending()).toBe(0);
    expect(a.playing()).toBe(false);
  });
});
