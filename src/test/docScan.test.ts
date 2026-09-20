import { describe, it, expect } from "vitest";
import {
  defaultQuad,
  detectDocumentQuad,
  isConvexQuad,
  quadArea,
  quadOutputSize,
  solveProjective,
  warpToRect,
  type Pt,
  type Quad,
  type Raster,
} from "@/lib/docScan";

/** A photo-like fixture: `bg` colour with a tilted `paper` quadrilateral (+ some "text"). */
function fixture(W: number, H: number, quad: Quad, paper: number, bg: number): Raster {
  const data = new Uint8ClampedArray(W * H * 4);
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i], b = quad[(i + 1) % 4];
      const c = (b.x * W - a.x * W) * (y - a.y * H) - (b.y * H - a.y * H) * (x - a.x * W);
      const s = c >= 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = inside(x, y) ? paper : bg;
      if (inside(x, y) && (x + y) % 23 < 2) v = paper - 90; // faint "text" lines
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const TILTED: Quad = [
  { x: 0.2, y: 0.12 }, { x: 0.86, y: 0.2 }, { x: 0.8, y: 0.88 }, { x: 0.12, y: 0.78 },
];
const near = (a: Pt, b: Pt, tol = 0.035) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

describe("detectDocumentQuad (runs on a captured still)", () => {
  it("finds the four corners of a tilted white page on a dark desk", () => {
    const q = detectDocumentQuad(fixture(180, 240, TILTED, 235, 60))!;
    expect(q).toBeTruthy();
    TILTED.forEach((c, i) => expect(near(q[i], c), `corner ${i}: ${JSON.stringify(q[i])} vs ${JSON.stringify(c)}`).toBe(true));
  });

  it("also finds a dark page on a light surface", () => {
    const q = detectDocumentQuad(fixture(180, 240, TILTED, 40, 225))!;
    expect(q).toBeTruthy();
    TILTED.forEach((c, i) => expect(near(q[i], c)).toBe(true));
  });

  it("returns four DISTINCT corners forming a convex quad", () => {
    const q = detectDocumentQuad(fixture(180, 240, TILTED, 235, 60))!;
    const keys = new Set(q.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(keys.size).toBe(4);
    expect(isConvexQuad(q)).toBe(true);
  });

  it("returns null when there is no page (flat image) so the UI falls back to the whole frame", () => {
    expect(detectDocumentQuad(fixture(120, 160, TILTED, 100, 100))).toBeNull();
  });

  it("fallback rectangle covers (almost) the whole image", () => {
    const q = defaultQuad();
    expect(quadArea(q)).toBeGreaterThan(0.85);
    expect(isConvexQuad(q)).toBe(true);
  });
});

describe("perspective correction", () => {
  it("solveProjective maps each corner exactly", () => {
    const src: Pt[] = [{ x: 10, y: 5 }, { x: 90, y: 15 }, { x: 80, y: 95 }, { x: 5, y: 80 }];
    const dst: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 120 }, { x: 0, y: 120 }];
    const H = solveProjective(src, dst);
    src.forEach((p, i) => {
      const w = H[6] * p.x + H[7] * p.y + H[8];
      expect((H[0] * p.x + H[1] * p.y + H[2]) / w).toBeCloseTo(dst[i].x, 4);
      expect((H[3] * p.x + H[4] * p.y + H[5]) / w).toBeCloseTo(dst[i].y, 4);
    });
  });

  it("warps a tilted page into an upright rectangle (content lands where it should)", () => {
    // Page: left half red, right half blue, drawn on the tilted quad.
    const W = 200, H = 260;
    const img = fixture(W, H, TILTED, 255, 30);
    // colour the paper by its position along the top→right axis
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (img.data[i] === 255) {
        // barycentric-ish: project onto TL→TR
        const ax = TILTED[0].x * W, ay = TILTED[0].y * H, bx = TILTED[1].x * W, by = TILTED[1].y * H;
        const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
        img.data[i] = t < 0.5 ? 255 : 0; img.data[i + 1] = 0; img.data[i + 2] = t < 0.5 ? 0 : 255;
      }
    }
    const { w, h } = quadOutputSize(TILTED, W, H);
    const out = warpToRect(img, TILTED, w, h);
    expect(out.width).toBe(w);
    expect(out.height).toBe(h);
    const px = (x: number, y: number) => { const i = (y * out.width + x) * 4; return [out.data[i], out.data[i + 1], out.data[i + 2]]; };
    const l = px(Math.round(w * 0.2), Math.round(h * 0.5));
    const r = px(Math.round(w * 0.8), Math.round(h * 0.5));
    expect(l[0]).toBeGreaterThan(200); expect(l[2]).toBeLessThan(60);   // left = red
    expect(r[2]).toBeGreaterThan(200); expect(r[0]).toBeLessThan(60);   // right = blue
    // no dark desk background leaks into the interior of the result
    let dark = 0;
    for (let y = 4; y < h - 4; y += 3) for (let x = 4; x < w - 4; x += 3) if (px(x, y)[0] + px(x, y)[2] < 90) dark++;
    expect(dark).toBeLessThan(6);
  });

  it("moving ONE corner changes the output (dimensions and content)", () => {
    const img = fixture(200, 260, TILTED, 235, 60);
    const a = quadOutputSize(TILTED, 200, 260);
    const moved: Quad = [{ ...TILTED[0] }, { ...TILTED[1] }, { x: 0.95, y: 0.97 }, { ...TILTED[3] }];
    const b = quadOutputSize(moved, 200, 260);
    expect(`${a.w}x${a.h}`).not.toBe(`${b.w}x${b.h}`);
    const oa = warpToRect(img, TILTED, 120, 160);
    const ob = warpToRect(img, moved, 120, 160);
    let diff = 0;
    for (let i = 0; i < oa.data.length; i += 4) diff += Math.abs(oa.data[i] - ob.data[i]);
    expect(diff).toBeGreaterThan(1000);
  });

  it("rejects a self-intersecting (bow-tie) corner arrangement", () => {
    const bow: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 }];
    expect(isConvexQuad(bow)).toBe(false);
  });
});
