import { describe, it, expect } from "vitest";
import { defaultQuad, detectDocument, isFullImageQuad, quadArea, type Pt, type Quad, type Raster } from "@/lib/docScan";

/** Deterministic PRNG so fixtures are stable. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

interface Opts {
  bg: [number, number, number];
  paper: [number, number, number];
  texture?: number; // background texture amplitude
  noise?: number;
  art?: boolean; // printed artwork / text blocks inside the object
  shadow?: boolean;
  seed?: number;
}

/** Photo-like still: gradient + textured background, object with artwork, shadow, noise, soft edges. */
function photo(W: number, H: number, quad: Quad, o: Opts): Raster {
  const rand = rng(o.seed ?? 7);
  const data = new Uint8ClampedArray(W * H * 4);
  const P = quad.map((p) => ({ x: p.x * W, y: p.y * H }));
  const edgeDist = (x: number, y: number) => {
    // signed distance-ish (positive inside) to convex quad
    let m = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      m = Math.min(m, ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / l);
    }
    return m;
  };
  const cx = P.reduce((s, p) => s + p.x, 0) / 4, cy = P.reduce((s, p) => s + p.y, 0) / 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = edgeDist(x, y);
      const dd = d * (edgeDist(cx, cy) > 0 ? 1 : -1);
      const t = Math.max(0, Math.min(1, dd / 1.5 + 0.5)); // ~2px soft edge
      const grad = 1 + 0.12 * ((x / W - 0.5) + (y / H - 0.5));
      const tex = (o.texture ?? 0) * (Math.sin(x * 0.9) * Math.cos(y * 0.7) + (rand() - 0.5));
      let sh = 1;
      if (o.shadow && dd < 0 && dd > -8) sh = 0.75 + 0.25 * (-dd / 8);
      let art = 0;
      if (o.art && dd > 3) {
        const u = Math.floor((x + y * 0.3) / 14), v = Math.floor(y / 11);
        const hsh = Math.abs(Math.sin(u * 12.9898 + v * 78.233) * 43758.5453) % 1;
        art = hsh < 0.35 ? -110 : hsh > 0.9 ? -50 : 0;
      }
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const bgv = (o.bg[c] * grad + tex) * sh;
        const pv = o.paper[c] + art;
        const nz = (rand() - 0.5) * 2 * (o.noise ?? 0);
        data[i + c] = bgv * (1 - t) + pv * t + nz;
      }
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const near = (a: Pt, b: Pt, tol: number) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
function expectCorners(q: Quad, want: Quad, tol = 0.05) {
  want.forEach((c, i) => expect(near(q[i], c, tol), `corner ${i}: got ${JSON.stringify(q[i])} want ${JSON.stringify(c)}`).toBe(true));
}
const q4 = (a: number[]): Quad => [{ x: a[0], y: a[1] }, { x: a[2], y: a[3] }, { x: a[4], y: a[5] }, { x: a[6], y: a[7] }];

const W = 240, H = 320;

describe("realistic capture detection", () => {
  it("REGRESSION: a small object well inside the frame never yields the four image corners", () => {
    const want = q4([0.3, 0.32, 0.66, 0.31, 0.67, 0.68, 0.29, 0.69]);
    const r = detectDocument(photo(W, H, want, { bg: [120, 105, 90], paper: [225, 220, 210], texture: 10, noise: 6, art: true, shadow: true }));
    expect(r.detectionFailed).toBe(false);
    expect(isFullImageQuad(r.quad)).toBe(false);
    expect(quadArea(r.quad)).toBeLessThan(0.4);
    expectCorners(r.quad, want);
  });

  it("small pack-like object with colourful artwork on a light table (smaller than the image)", () => {
    const want = q4([0.34, 0.4, 0.62, 0.4, 0.62, 0.72, 0.34, 0.72]);
    const r = detectDocument(photo(W, H, want, { bg: [205, 200, 195], paper: [60, 70, 150], texture: 8, noise: 5, art: true, shadow: true, seed: 3 }));
    expect(r.detectionFailed).toBe(false);
    expect(isFullImageQuad(r.quad)).toBe(false);
    expectCorners(r.quad, want);
  });

  it("rotated document", () => {
    const want = q4([0.5, 0.1, 0.9, 0.5, 0.5, 0.9, 0.1, 0.5]);
    const r = detectDocument(photo(W, H, want, { bg: [60, 62, 66], paper: [235, 235, 228], texture: 6, noise: 5, art: true }));
    expect(r.detectionFailed).toBe(false);
    // a diamond has no natural "top-left": compare as an unordered set
    want.forEach((c, i) => expect(r.quad.some((p) => near(p, c, 0.07)), `diamond corner ${i}`).toBe(true));
  });

  it("perspective-skewed document", () => {
    const want = q4([0.22, 0.18, 0.8, 0.26, 0.86, 0.84, 0.14, 0.74]);
    const r = detectDocument(photo(W, H, want, { bg: [90, 70, 55], paper: [240, 238, 230], texture: 10, noise: 6, art: true, shadow: true }));
    expect(r.detectionFailed).toBe(false);
    expectCorners(r.quad, want);
  });

  it("document near an edge", () => {
    const want = q4([0.05, 0.08, 0.55, 0.06, 0.56, 0.5, 0.06, 0.52]);
    const r = detectDocument(photo(W, H, want, { bg: [70, 90, 80], paper: [235, 230, 220], noise: 5, art: true }));
    expect(r.detectionFailed).toBe(false);
    expect(isFullImageQuad(r.quad)).toBe(false);
    expectCorners(r.quad, want, 0.06);
  });

  it("textured busy background", () => {
    const want = q4([0.2, 0.25, 0.8, 0.22, 0.82, 0.75, 0.18, 0.78]);
    const r = detectDocument(photo(W, H, want, { bg: [130, 100, 70], paper: [238, 236, 228], texture: 26, noise: 8, art: true, shadow: true, seed: 11 }));
    expect(r.detectionFailed).toBe(false);
    expectCorners(r.quad, want, 0.06);
  });

  it("dark document on dark background", () => {
    const want = q4([0.25, 0.28, 0.75, 0.27, 0.76, 0.72, 0.24, 0.73]);
    const r = detectDocument(photo(W, H, want, { bg: [25, 25, 28], paper: [78, 80, 86], noise: 3, art: true }));
    expect(r.detectionFailed).toBe(false);
    expect(isFullImageQuad(r.quad)).toBe(false);
    expectCorners(r.quad, want, 0.06);
  });

  it("low contrast document", () => {
    const want = q4([0.22, 0.2, 0.78, 0.22, 0.8, 0.8, 0.2, 0.78]);
    const r = detectDocument(photo(W, H, want, { bg: [170, 168, 162], paper: [205, 203, 196], noise: 3 }));
    expect(r.detectionFailed).toBe(false);
    expectCorners(r.quad, want, 0.06);
  });

  it("four detected corners are distinct and independent", () => {
    const want = q4([0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7]);
    const r = detectDocument(photo(W, H, want, { bg: [110, 100, 90], paper: [230, 225, 215], texture: 8, noise: 5 }));
    expect(new Set(r.quad.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size).toBe(4);
  });

  it("no object at all: explicit fallback flag, whole-image rectangle, not reported as success", () => {
    const flat = photo(W, H, q4([0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7]), { bg: [140, 140, 140], paper: [140, 140, 140], texture: 5, noise: 4, seed: 5 });
    const r = detectDocument(flat);
    expect(r.detectionFailed).toBe(true);
    expect(r.method).toBe("fallback");
    expect(isFullImageQuad(r.quad, 0.05)).toBe(true);
    expect(r.quad).toEqual(defaultQuad());
  });

  it("a page that truly fills the frame is treated as fallback, never as a detection", () => {
    const full = q4([0.0, 0.0, 1, 0, 1, 1, 0, 1]);
    const r = detectDocument(photo(W, H, full, { bg: [90, 90, 90], paper: [230, 230, 225] }));
    expect(r.detectionFailed).toBe(true);
  });
});
