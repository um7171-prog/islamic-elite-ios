/**
 * Document-scanner geometry — pure functions on RGBA pixel arrays (no DOM), so
 * the algorithms can be unit-tested with synthetic images:
 *
 *   detectDocumentQuad  find the four corners of a page in a CAPTURED photo
 *   solveProjective     homography from 4 point pairs
 *   warpToRect          real perspective correction (bilinear) of a quad → rectangle
 *   quadOutputSize      output size that preserves the page's real proportions
 *   isConvexQuad / defaultQuad  validation + the "whole image" fallback
 *
 * Detection is only ever run on a captured still, never on the live preview.
 */

export type Pt = { x: number; y: number };
/** TL, TR, BR, BL — normalised 0..1 in the image's own coordinates. */
export type Quad = [Pt, Pt, Pt, Pt];

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Whole-image rectangle (small inset) used when nothing could be detected. */
export function defaultQuad(inset = 0.03): Quad {
  return [
    { x: inset, y: inset },
    { x: 1 - inset, y: inset },
    { x: 1 - inset, y: 1 - inset },
    { x: inset, y: 1 - inset },
  ];
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** True when the four points form a simple convex quadrilateral (any winding). */
export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < 1e-9) return false;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Polygon area of a quad (normalised units², shoelace). */
export function quadArea(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Output rectangle size (px) for a quad drawn on an image of size iw×ih, keeping
 * the page's proportions; the long side is capped to `maxSide`. */
export function quadOutputSize(q: Quad, iw: number, ih: number, maxSide = 2400): { w: number; h: number } {
  const d = (a: Pt, b: Pt) => Math.hypot((a.x - b.x) * iw, (a.y - b.y) * ih);
  let w = Math.max(d(q[0], q[1]), d(q[3], q[2]));
  let h = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const k = Math.min(1, maxSide / Math.max(w, h, 1));
  w = Math.max(64, Math.round(w * k));
  h = Math.max(64, Math.round(h * k));
  return { w, h };
}

/** 8-parameter homography mapping src[i] → dst[i] (returned as 9 numbers, last = 1). */
export function solveProjective(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }
  const n = 8;
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[max][i])) max = k;
    [A[i], A[max]] = [A[max], A[i]];
    [b[i], b[max]] = [b[max], b[i]];
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return [...x, 1];
}

/** Perspective-correct the quad region of `src` into an outW×outH rectangle
 * (inverse mapping + bilinear sampling). */
export function warpToRect(src: Raster, quad: Quad, outW: number, outH: number): Raster {
  const { data: sd, width: iw, height: ih } = src;
  const dstPts: Pt[] = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
  const srcPts: Pt[] = quad.map((p) => ({ x: p.x * iw, y: p.y * ih }));
  const H = solveProjective(dstPts, srcPts); // dst → src
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = H[6] * x + H[7] * y + H[8];
      let sx = (H[0] * x + H[1] * y + H[2]) / w - 0.5;
      let sy = (H[3] * x + H[4] * y + H[5]) / w - 0.5;
      sx = Math.max(0, Math.min(iw - 1, sx));
      sy = Math.max(0, Math.min(ih - 1, sy));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(iw - 1, x0 + 1), y1 = Math.min(ih - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * iw + x0) * 4, i10 = (y0 * iw + x1) * 4, i01 = (y1 * iw + x0) * 4, i11 = (y1 * iw + x1) * 4;
      const di = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
        const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
        out[di + c] = top * (1 - fy) + bot * fy;
      }
      out[di + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

/** Otsu's threshold on a 0..255 luminance histogram. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/**
 * Find the page in a captured photo. Works on a downscaled copy: Otsu-threshold
 * the luminance, take the largest connected region (page brighter than its
 * surroundings, or darker), and read its four extreme corners. Returns null when
 * no plausible page is found — the caller then falls back to the whole image so
 * the user can still place the four corners by hand.
 */
export function detectDocumentQuad(img: Raster): Quad | null {
  const { data, width: W, height: H } = img;
  if (W < 16 || H < 16) return null;
  const n = W * H;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const g = (299 * data[i] + 587 * data[i + 1] + 114 * data[i + 2]) / 1000;
    gray[j] = g;
  }
  // 3×3 box blur (denoise text / paper grain)
  const blur = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          s += gray[yy * W + xx];
          c++;
        }
      }
      const v = s / c;
      blur[y * W + x] = v;
      hist[v | 0]++;
    }
  }
  const thr = otsu(hist, n);

  let best: { q: Quad; score: number } | null = null;
  for (const bright of [true, false]) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = (blur[i] > thr) === bright ? 1 : 0;

    // largest 4-connected component
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    let bestIdx: number[] | null = null;
    for (let start = 0; start < n; start++) {
      if (!mask[start] || seen[start]) continue;
      let sp = 0;
      stack[sp++] = start;
      seen[start] = 1;
      const comp: number[] = [];
      while (sp > 0) {
        const p = stack[--sp];
        comp.push(p);
        const x = p % W, y = (p / W) | 0;
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
        if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
      }
      if (!bestIdx || comp.length > bestIdx.length) bestIdx = comp;
    }
    if (!bestIdx) continue;
    const areaRatio = bestIdx.length / n;
    if (areaRatio < 0.1 || areaRatio > 0.92) continue;

    // extreme corners
    let tl = Infinity, tr = -Infinity, br = -Infinity, bl = Infinity;
    let pTL = 0, pTR = 0, pBR = 0, pBL = 0;
    let touch = 0;
    for (const p of bestIdx) {
      const x = p % W, y = (p / W) | 0;
      const s = x + y, d = x - y;
      if (s < tl) { tl = s; pTL = p; }
      if (d > tr) { tr = d; pTR = p; }
      if (s > br) { br = s; pBR = p; }
      if (d < bl) { bl = d; pBL = p; }
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touch++;
    }
    // A region hugging the frame edges is the background, not the page.
    if (touch / (2 * (W + H)) > 0.5) continue;
    const at = (p: number): Pt => ({ x: ((p % W) + 0.5) / W, y: (((p / W) | 0) + 0.5) / H });
    const q: Quad = [at(pTL), at(pTR), at(pBR), at(pBL)];
    if (!isConvexQuad(q)) continue;
    const qa = quadArea(q);
    if (qa < 0.1) continue;
    const fill = areaRatio / qa; // how completely the region fills its quad
    if (fill < 0.72 || fill > 1.15) continue;
    const side = (a: Pt, b: Pt) => Math.hypot((a.x - b.x), (a.y - b.y));
    if (Math.min(side(q[0], q[1]), side(q[3], q[2]), side(q[0], q[3]), side(q[1], q[2])) < 0.15) continue;
    const score = Math.min(fill, 1) * Math.sqrt(qa);
    if (!best || score > best.score) best = { q, score };
  }
  return best ? best.q : null;
}
