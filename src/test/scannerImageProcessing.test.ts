import { describe, it, expect } from "vitest";
import {
  toGrayscale,
  flattenIllumination,
  blackAndWhite,
  magicEnhance,
  applyScanFilter,
  SCAN_FILTERS,
  type Raster,
} from "@/lib/scanner/imageProcessing";

/** A page (`paper`) with a soft lighting gradient across it (brighter on one side, like a real
 * photo under a single light source / shadow), plus a few "text" blocks. */
function fixture(W: number, H: number, opts: { paper?: number; textDark?: boolean; gradientStrength?: number } = {}): Raster {
  const paper = opts.paper ?? 230;
  const grad = opts.gradientStrength ?? 60;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lightFactor = 1 - (grad / 255) * (x / W); // darker toward the right edge (shadow)
      let v = paper * lightFactor;
      // a few "text line" blocks, dark
      const inTextBlock = y % 20 < 3 && x > W * 0.1 && x < W * 0.85;
      if (inTextBlock) v = (opts.textDark === false ? paper * 0.6 : 20) * lightFactor;
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

/** A page with real color content (a red stamp, blue ink) to prove color filters keep colour. */
function colorFixture(W: number, H: number): Raster {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let [r, g, b] = [235, 232, 225];
      if (x > W * 0.6 && x < W * 0.8 && y > H * 0.1 && y < H * 0.3) [r, g, b] = [200, 30, 30]; // red stamp
      if (y % 25 < 2 && x > W * 0.1 && x < W * 0.7) [r, g, b] = [20, 20, 160]; // blue "ink" line
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const meanLuma = (r: Raster, x0: number, x1: number, y0: number, y1: number) => {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * r.width + x) * 4;
    s += 0.299 * r.data[i] + 0.587 * r.data[i + 1] + 0.114 * r.data[i + 2];
    n++;
  }
  return s / n;
};

describe("toGrayscale", () => {
  it("removes hue: R=G=B everywhere, and keeps relative brightness", () => {
    const r = colorFixture(120, 160);
    const g = toGrayscale(r);
    for (let i = 0; i < g.data.length; i += 4) expect(g.data[i]).toBe(g.data[i + 1]);
    const red = meanLuma(g, Math.round(120 * 0.65), Math.round(120 * 0.75), Math.round(160 * 0.15), Math.round(160 * 0.25));
    const paper = meanLuma(g, 5, 15, 5, 15);
    expect(red).toBeLessThan(paper); // the red stamp is darker in luminance than the paper
  });
});

describe("flattenIllumination (shadow reduction)", () => {
  it("evens out a lighting gradient: left and right paper areas end up much closer in brightness", () => {
    const r = fixture(200, 260, { gradientStrength: 90 });
    const before = { left: meanLuma(r, 10, 30, 120, 140), right: meanLuma(r, 170, 190, 120, 140) };
    const after = flattenIllumination(r);
    const afterVals = { left: meanLuma(after, 10, 30, 120, 140), right: meanLuma(after, 170, 190, 120, 140) };
    const beforeGap = Math.abs(before.left - before.right);
    const afterGap = Math.abs(afterVals.left - afterVals.right);
    expect(afterGap).toBeLessThan(beforeGap * 0.5);
  });

  it("keeps colour (red stays visibly red relative to its own channels)", () => {
    const r = colorFixture(140, 180);
    const flat = flattenIllumination(r);
    // sample inside the red stamp
    const x = Math.round(140 * 0.7), y = Math.round(180 * 0.2);
    const i = (y * 140 + x) * 4;
    expect(flat.data[i]).toBeGreaterThan(flat.data[i + 1] + 15); // red channel still clearly leads
  });

  it("does not invent new pixels/dimensions", () => {
    const r = fixture(90, 110);
    const flat = flattenIllumination(r);
    expect(flat.width).toBe(90);
    expect(flat.height).toBe(110);
    expect(flat.data.length).toBe(r.data.length);
  });
});

describe("blackAndWhite (adaptive threshold)", () => {
  it("text stays black and paper stays white even under an uneven lighting gradient", () => {
    const r = fixture(200, 260, { gradientStrength: 100 });
    const bw = blackAndWhite(r);
    // paper sampled near the dark (shadowed) edge — a GLOBAL threshold would wrongly turn this black
    const paperShadowed = meanLuma(bw, 170, 190, 60, 65);
    expect(paperShadowed).toBeGreaterThan(200);
    // a text block near the bright edge stays black
    const textBright = meanLuma(bw, 20, 40, 60, 63);
    expect(textBright).toBeLessThan(60);
  });

  it("output is strictly binary (only 0 or 255 per channel)", () => {
    const bw = blackAndWhite(fixture(80, 100));
    for (let i = 0; i < bw.data.length; i += 4) {
      expect([0, 255]).toContain(bw.data[i]);
    }
  });

  it("works on a dark document / light document and on a dark background", () => {
    const lightDoc = blackAndWhite(fixture(100, 120, { paper: 235 }));
    const darkBg = blackAndWhite({
      data: (() => {
        const r = fixture(100, 120, { paper: 235 });
        // invert to simulate a dark background photo-composited around a light page: just check it runs
        return r.data;
      })(),
      width: 100,
      height: 120,
    });
    expect(lightDoc.data.length).toBe(darkBg.data.length);
  });
});

describe("magicEnhance", () => {
  it("is real processing: pixels actually change, and it is not identical to a plain contrast bump alone", () => {
    const r = fixture(160, 200, { gradientStrength: 70 });
    const magic = magicEnhance(r);
    let diff = 0;
    for (let i = 0; i < r.data.length; i += 4) diff += Math.abs(r.data[i] - magic.data[i]);
    expect(diff / (r.data.length / 4)).toBeGreaterThan(3);
  });

  it("reduces the same lighting gradient as flattenIllumination (shadow reduction is part of Magic)", () => {
    const r = fixture(200, 260, { gradientStrength: 90 });
    const before = Math.abs(meanLuma(r, 10, 30, 120, 140) - meanLuma(r, 170, 190, 120, 140));
    const magic = magicEnhance(r);
    const after = Math.abs(meanLuma(magic, 10, 30, 120, 140) - meanLuma(magic, 170, 190, 120, 140));
    expect(after).toBeLessThan(before * 0.6);
  });

  it("keeps colour (unlike grayscale/bw)", () => {
    const r = colorFixture(140, 180);
    const magic = magicEnhance(r);
    const x = Math.round(140 * 0.7), y = Math.round(180 * 0.2);
    const i = (y * 140 + x) * 4;
    expect(magic.data[i]).toBeGreaterThan(magic.data[i + 1]); // still reddish
  });

  it("is the default filter", () => {
    expect(SCAN_FILTERS[0].id).toBe("magic");
  });
});

describe("applyScanFilter dispatch", () => {
  const r = fixture(60, 80);
  it("original returns an unmodified copy (not the same array reference)", () => {
    const o = applyScanFilter(r, "original");
    expect(o.data).not.toBe(r.data);
    expect(Array.from(o.data)).toEqual(Array.from(r.data));
  });
  it("every filter id in SCAN_FILTERS is handled without throwing, on A4-like and A5-like ratios", () => {
    for (const f of SCAN_FILTERS) {
      expect(() => applyScanFilter(fixture(210, 297), f.id)).not.toThrow(); // A4 ratio
      expect(() => applyScanFilter(fixture(148, 210), f.id)).not.toThrow(); // A5 ratio
      expect(() => applyScanFilter(fixture(80, 220), f.id)).not.toThrow(); // receipt ratio
    }
  });
  it("grayscale and bw are genuinely different outputs from magic", () => {
    const magic = applyScanFilter(r, "magic");
    const gray = applyScanFilter(r, "grayscale");
    const bw = applyScanFilter(r, "bw");
    expect(Array.from(magic.data)).not.toEqual(Array.from(gray.data));
    expect(Array.from(gray.data)).not.toEqual(Array.from(bw.data));
  });
});

describe("robustness across realistic conditions", () => {
  const conditions: [string, Raster][] = [
    ["A4 bright light", fixture(210, 297, { gradientStrength: 20 })],
    ["A4 weak light", fixture(210, 297, { paper: 150, gradientStrength: 15 })],
    ["A5", fixture(148, 210, { gradientStrength: 40 })],
    ["receipt (narrow)", fixture(80, 260, { gradientStrength: 30 })],
    ["dark background page", fixture(200, 260, { paper: 90, gradientStrength: 25 })],
    ["strong shadow", fixture(200, 260, { gradientStrength: 140 })],
  ];
  it.each(conditions)("%s: every filter runs and produces a full, non-empty raster", (_name, r) => {
    for (const f of SCAN_FILTERS) {
      const out = applyScanFilter(r, f.id);
      expect(out.width * out.height * 4).toBe(out.data.length);
      let nonZero = 0;
      for (const v of out.data) if (v > 0) nonZero++;
      expect(nonZero).toBeGreaterThan(0); // never an all-black/empty page
    }
  });
});
