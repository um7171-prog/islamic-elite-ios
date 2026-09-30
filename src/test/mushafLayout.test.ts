import { describe, it, expect } from "vitest";
import { PAGE_IMAGE_HEIGHT, PAGE_IMAGE_WIDTH, PAGE_RATIO, TOTAL_PAGES } from "@/lib/mushaf";
import {
  EDGE_GAP, MAX_PAGE_WIDTH, SIDE_GUTTER, computeLayout, pageAtScroll, pageAtY, pageTop, readingAnchor,
  scrollStep, scrollTopForAnchor, scrollTopForPage, visiblePart, visibleRange, type ReaderViewport,
} from "@/components/mushaf/readerLayout";
import { createScrollAnimator, HOLD_PX_PER_S } from "@/components/mushaf/smoothScroll";

const vp = (width: number, height: number, safe: Partial<ReaderViewport> = {}): ReaderViewport => ({
  width, height, safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0, ...safe,
});

/** Portrait iPhones (CSS px, with their real safe areas), an iPad both ways, a desktop window. */
const DEVICES: Record<string, ReaderViewport> = {
  "iPhone SE": vp(375, 667, { safeTop: 20 }),
  "iPhone 13 mini": vp(375, 812, { safeTop: 50, safeBottom: 34 }),
  "iPhone 15": vp(390, 844, { safeTop: 47, safeBottom: 34 }),
  "iPhone 15 Pro": vp(393, 852, { safeTop: 59, safeBottom: 34 }),
  "iPhone 15 Pro Max": vp(430, 932, { safeTop: 59, safeBottom: 34 }),
  "iPad Air portrait": vp(820, 1180, { safeTop: 24, safeBottom: 20 }),
  "iPad Air landscape": vp(1180, 820, { safeTop: 24, safeBottom: 20 }),
  "phone landscape (notch sides)": vp(844, 390, { safeLeft: 47, safeRight: 47, safeBottom: 21 }),
  "desktop": vp(1440, 900),
};
const IPHONES = Object.keys(DEVICES).filter((k) => k.startsWith("iPhone"));

describe("fit width: the whole page width is on screen, centred, in its own proportions", () => {
  for (const [name, v] of Object.entries(DEVICES)) {
    it(name, () => {
      const L = computeLayout(v);
      const readingW = v.width - v.safeLeft - v.safeRight;
      // Never wider than the space it has: no horizontal overflow, nothing to pan sideways.
      expect(L.pageW).toBeLessThanOrEqual(readingW - 2 * SIDE_GUTTER);
      expect(L.left).toBeGreaterThanOrEqual(v.safeLeft);
      expect(L.left + L.pageW).toBeLessThanOrEqual(v.width - v.safeRight);
      // Centred between the safe areas (±1 px of rounding).
      const before = L.left - v.safeLeft;
      const after = v.width - v.safeRight - (L.left + L.pageW);
      expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
      // Original aspect ratio (height rounded to a whole pixel; object-fit: contain covers it).
      expect(Math.abs(L.pageW / L.pageH - PAGE_RATIO)).toBeLessThan(0.002);
      expect(L.pageW).toBeLessThanOrEqual(MAX_PAGE_WIDTH);
    });
  }

  it("on every iPhone the page uses the full reading width, and a whole page fits between the safe areas", () => {
    for (const name of IPHONES) {
      const v = DEVICES[name];
      const L = computeLayout(v);
      expect(L.pageW, name).toBe(v.width - 2 * SIDE_GUTTER);
      expect(L.pageH, name).toBeLessThanOrEqual(v.height - v.safeTop - v.safeBottom - 2 * EDGE_GAP);
    }
  });

  it("is computed from the real width, not a fixed number (different phones → different sizes)", () => {
    const widths = IPHONES.map((n) => computeLayout(DEVICES[n]).pageW);
    expect(new Set(widths).size).toBeGreaterThan(2);
  });

  it("matches the real page images (1280×2071)", () => {
    expect(PAGE_IMAGE_WIDTH / PAGE_IMAGE_HEIGHT).toBe(PAGE_RATIO);
    expect(TOTAL_PAGES).toBe(604);
  });
});

describe("vertical column: pages top to bottom, never overlapping, inside the safe areas", () => {
  const v = DEVICES["iPhone 15"];
  const L = computeLayout(v);

  it("pages follow each other downwards at a fixed stride with a gap", () => {
    for (let p = 1; p < TOTAL_PAGES; p++) {
      expect(pageTop(L, p + 1) - pageTop(L, p)).toBe(L.stride);
    }
    expect(L.stride).toBeGreaterThan(L.pageH); // a real gap: pages never overlap
    expect(L.contentH).toBe(pageTop(L, TOTAL_PAGES) + L.pageH + EDGE_GAP + v.safeBottom);
  });

  it("the first page starts below the Dynamic Island; the last one ends above the Home Indicator", () => {
    expect(scrollTopForPage(L, 1)).toBe(0);
    expect(pageTop(L, 1)).toBe(v.safeTop + EDGE_GAP);
    const lastBottomOnScreen = pageTop(L, TOTAL_PAGES) + L.pageH - L.maxScroll;
    expect(lastBottomOnScreen).toBe(v.height - v.safeBottom - EDGE_GAP);
  });

  it("scroll targets never leave the column (first and last page)", () => {
    expect(scrollTopForPage(L, 0)).toBe(0);
    expect(scrollTopForPage(L, -40)).toBe(0);
    expect(scrollTopForPage(L, TOTAL_PAGES)).toBe(L.maxScroll);
    expect(scrollTopForPage(L, 9999)).toBe(L.maxScroll);
    expect(visibleRange(L, 0, 3).first).toBe(1);
    expect(visibleRange(L, L.maxScroll, 3).last).toBe(TOTAL_PAGES);
  });

  it("a page opened by number sits at the top, shown whole", () => {
    for (const p of [1, 2, 250, 603]) {
      const st = scrollTopForPage(L, p);
      expect(pageTop(L, p) - st).toBe(L.top);
      expect(visiblePart(L, st, p)).toBe(L.pageH);
      expect(pageAtScroll(L, st)).toBe(p);
    }
    expect(pageAtScroll(L, scrollTopForPage(L, TOTAL_PAGES))).toBe(TOTAL_PAGES);
  });
});

describe("current page: the most visible page, from the geometry (not a raw scrollTop division)", () => {
  const L = computeLayout(DEVICES["iPhone 15"]);

  it("switches only once the next page is more visible than the current one", () => {
    const st5 = scrollTopForPage(L, 5);
    expect(pageAtScroll(L, st5)).toBe(5);
    expect(pageAtScroll(L, st5 + 150)).toBe(5); // page 6 creeping in, page 5 still dominates
    // Exactly where both show the same height, the earlier page wins; past it, the next one.
    let flip = st5;
    while (pageAtScroll(L, flip) === 5) flip++;
    expect(visiblePart(L, flip, 6)).toBeGreaterThan(visiblePart(L, flip, 5));
    expect(visiblePart(L, flip - 1, 6)).toBeLessThanOrEqual(visiblePart(L, flip - 1, 5) + 0.5);
  });

  it("the page at a height, with gaps belonging to the nearer page", () => {
    expect(pageAtY(L, pageTop(L, 7) + 10)).toBe(7);
    expect(pageAtY(L, pageTop(L, 7) + L.pageH + 1)).toBe(7); // first half of the gap
    expect(pageAtY(L, pageTop(L, 8) - 1)).toBe(8); // second half of the gap
  });

  it("the mounted window is the visible pages ± the buffer", () => {
    const st = scrollTopForPage(L, 300);
    const vis = visibleRange(L, st);
    expect(vis.first).toBeLessThanOrEqual(300);
    expect(vis.last).toBeGreaterThanOrEqual(301);
    // Every page with any part on screen is inside the range; nothing visible is left out.
    for (let p = vis.first - 3; p <= vis.last + 3; p++) {
      if (p < vis.first || p > vis.last) expect(visiblePart(L, st, p), `page ${p}`).toBe(0);
    }
    expect(visibleRange(L, st, 2)).toEqual({ first: vis.first - 2, last: vis.last + 2 });
    expect(vis.last - vis.first).toBeLessThanOrEqual(3); // a phone never needs more than a few pages
  });
});

describe("relayout keeps the reading place", () => {
  it("same page and same spot of it at the viewport centre after a size change", () => {
    const a = computeLayout(DEVICES["iPhone 15"]);
    const b = computeLayout(DEVICES["iPhone 15 Pro Max"]);
    const st = scrollTopForPage(a, 100) + 200;
    const anchor = readingAnchor(a, st);
    const st2 = scrollTopForAnchor(b, anchor);
    expect(readingAnchor(b, st2).page).toBe(anchor.page);
    expect(readingAnchor(b, st2).offset).toBeCloseTo(anchor.offset, 6);
    expect(pageAtScroll(b, st2)).toBe(pageAtScroll(a, st));
  });
});

describe("scroll step", () => {
  it("one step is a small move, far less than a page", () => {
    for (const name of Object.keys(DEVICES)) {
      const L = computeLayout(DEVICES[name]);
      expect(scrollStep(L), name).toBeGreaterThanOrEqual(56);
      expect(scrollStep(L), name).toBeLessThanOrEqual(160);
      expect(scrollStep(L), name).toBeLessThan(L.pageH / 3);
    }
  });
});

describe("smooth scroll animator", () => {
  const fakeEl = () => ({ scrollTop: 0 }) as unknown as HTMLElement;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("a step animates to its target; quick repeated steps accumulate instead of restarting", async () => {
    const el = fakeEl();
    const a = createScrollAnimator(() => el, (y) => Math.min(5000, Math.max(0, y)));
    a.by(100, 120);
    a.by(100, 120);
    expect(a.busy()).toBe(true);
    await wait(260);
    expect(el.scrollTop).toBe(200);
    expect(a.busy()).toBe(false);
  });

  it("never goes past the column's ends", async () => {
    const el = fakeEl();
    const a = createScrollAnimator(() => el, (y) => Math.min(300, Math.max(0, y)));
    a.to(-500, 60);
    await wait(120);
    expect(el.scrollTop).toBe(0);
    a.to(9999, 60);
    await wait(120);
    expect(el.scrollTop).toBe(300);
  });

  it("holding moves continuously at a readable speed and stops on release", async () => {
    const el = fakeEl();
    const a = createScrollAnimator(() => el, (y) => Math.min(10_000, Math.max(0, y)));
    a.hold(1);
    await wait(250);
    a.release();
    const moved = el.scrollTop;
    expect(moved).toBeGreaterThan(20);
    expect(moved).toBeLessThan(HOLD_PX_PER_S * 0.6);
    await wait(80);
    expect(el.scrollTop).toBe(moved);
  });

  it("reduced motion jumps instead of animating", () => {
    const el = fakeEl();
    const a = createScrollAnimator(() => el, (y) => y, { reducedMotion: () => true });
    a.by(140);
    expect(el.scrollTop).toBe(140);
    expect(a.busy()).toBe(false);
  });
});
