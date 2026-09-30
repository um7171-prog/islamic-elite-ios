import { describe, it, expect } from "vitest";
import {
  EDGE_SNAP, FIT, MAX_ZOOM, TEXT_MARGIN_PX, clampPan, comfortableZoom, isZoomed, panBy, pinchZoom, zoomAt, type ZoomState,
} from "@/components/mushaf/pageZoom";
import { INK_PAGES, inkBounds } from "@/components/mushaf/pageInk";
import { TOTAL_PAGES } from "@/lib/mushaf";

// A phone page box (iPhone 15 fit width) and a typical page's measured ink.
const W = 374;
const H = 605;
const INK = inkBounds(300);

/** The part of the page (unzoomed px) visible at zoom z. */
const view = (z: ZoomState) => ({ from: -z.x / z.scale, to: (W - z.x) / z.scale });

describe("zoom levels 1x … 3x", () => {
  for (const s of [1, 1.5, 2, 2.5, 3]) {
    it(`${s}x: around the fingers, inside the page`, () => {
      const px = 150;
      const py = 260;
      const z = zoomAt(FIT, s, px, py, W, H);
      expect(z.scale).toBe(s);
      // The point under the fingers stays under them.
      expect((px - z.x) / z.scale).toBeCloseTo(px, 9);
      expect((py - z.y) / z.scale).toBeCloseTo(py, 9);
      // The image covers its box: no empty band, nothing past the page's own edges.
      expect(z.x).toBeLessThanOrEqual(0);
      expect(z.x + W * s).toBeGreaterThanOrEqual(W - 1e-9);
      expect(z.y + H * s).toBeGreaterThanOrEqual(H - 1e-9);
      expect(isZoomed(z)).toBe(s > 1);
    });
  }

  it("never beyond 3x or below fit", () => {
    expect(zoomAt(FIT, 9, 10, 10, W, H).scale).toBe(MAX_ZOOM);
    expect(zoomAt({ scale: 2, x: -100, y: -100 }, 0.3, 10, 10, W, H)).toEqual(FIT);
  });

  it("pinch then pan: the pan continues from where the pinch left the page, within bounds", () => {
    const pinched = pinchZoom(FIT, 2, { x: 180, y: 300 }, { x: 180, y: 300 }, W, H);
    const panned = panBy(pinched, -60, 40, W, H).zoom;
    expect(panned.x).toBeCloseTo(pinched.x - 60, 9);
    expect(panned.y).toBeCloseTo(pinched.y + 40, 9);
    expect(clampPan(panned, W, H)).toEqual(panned);
  });
});

describe("comfortable position when a gesture ends", () => {
  it("barely zoomed → back to fit width", () => {
    expect(comfortableZoom({ scale: 1.04, x: -10, y: -10 }, W, H, INK)).toEqual(FIT);
  });

  it("the whole line fits on screen → the text is centred, nothing cut on either side", () => {
    // At 1.08x the visible width (≈ 92.6% of the page) holds the text column (≈ 90%).
    const offCentre = clampPan({ scale: 1.08, x: 0, y: -20 }, W, H); // parked at the left edge
    const z = comfortableZoom(offCentre, W, H, INK);
    const v = view(z);
    expect(v.from).toBeLessThanOrEqual(INK.left * W);
    expect(v.to).toBeGreaterThanOrEqual(INK.right * W);
    const centreText = ((INK.left + INK.right) / 2) * W;
    expect((v.from + v.to) / 2).toBeCloseTo(centreText, 6);
    expect(z.y).toBe(-20); // vertical position untouched
  });

  it("pan to the far right and lift → the start of the lines is fully shown, aligned to the text", () => {
    const farRight = clampPan({ scale: 2, x: -W, y: -200 }, W, H); // view's right edge on the image edge
    const z = comfortableZoom(farRight, W, H, INK);
    const v = view(z);
    expect(v.to).toBeCloseTo(INK.right * W + TEXT_MARGIN_PX / 2, 6);
    expect(z.y).toBe(farRight.y);
  });

  it("pan to the far left and lift → the end of the lines is fully shown, aligned to the text", () => {
    const farLeft = clampPan({ scale: 2, x: 0, y: -200 }, W, H);
    const z = comfortableZoom(farLeft, W, H, INK);
    expect(view(z).from).toBeCloseTo(INK.left * W - TEXT_MARGIN_PX / 2, 6);
  });

  it("a word cut by accident near a text edge is brought fully into view", () => {
    // The view's right edge stopped 20 px (page) short of the text's right edge: first words cut.
    const s = 2;
    const viewW = W / s;
    const cutFrom = INK.right * W - 20 - viewW;
    const z = comfortableZoom({ scale: s, x: -cutFrom * s, y: 0 }, W, H, INK);
    expect(view(z).to).toBeGreaterThanOrEqual(INK.right * W);
  });

  it("mid-line reading is kept exactly where the user left it", () => {
    const s = 2.5;
    const viewW = W / s;
    const mid = ((INK.left + INK.right) / 2) * W - viewW / 2; // far from both text edges
    const z0 = { scale: s, x: -mid * s, y: -300 };
    expect(Math.abs(mid - INK.left * W)).toBeGreaterThan(viewW * EDGE_SNAP);
    expect(comfortableZoom(z0, W, H, INK)).toEqual(clampPan(z0, W, H));
  });

  it("at every zoom level the result stays inside the page", () => {
    for (const s of [1.2, 1.5, 2, 2.5, 3]) {
      for (const x of [0, -W * (s - 1) / 2, -W * (s - 1)]) {
        const z = comfortableZoom({ scale: s, x, y: -40 }, W, H, INK);
        expect(clampPan(z, W, H)).toEqual(z);
      }
    }
  });
});

describe("ink bounds measured from the page images", () => {
  it("one entry per page, each a plausible text column", () => {
    expect(INK_PAGES).toBe(TOTAL_PAGES);
    for (let p = 1; p <= TOTAL_PAGES; p++) {
      const b = inkBounds(p);
      expect(b.left, `page ${p}`).toBeGreaterThan(0);
      expect(b.left, `page ${p}`).toBeLessThan(0.1);
      expect(b.right, `page ${p}`).toBeGreaterThan(0.9);
      expect(b.right, `page ${p}`).toBeLessThanOrEqual(1);
    }
  });

  it("an unknown page falls back to the whole width", () => {
    expect(inkBounds(0)).toEqual({ left: 0, right: 1 });
    expect(inkBounds(605)).toEqual({ left: 0, right: 1 });
  });
});
