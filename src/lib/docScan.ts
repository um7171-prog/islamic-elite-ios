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

// ---------- detection ----------

export interface DetectionResult {
  quad: Quad;
  /** true = nothing plausible found; `quad` is the whole-image fallback. */
  detectionFailed: boolean;
  method: string;
  score: number;
}

type Mask = Uint8Array;

function boxCount(src: Mask, W: number, H: number, r: number): Uint16Array {
  const tmp = new Uint16Array(W * H);
  const out = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < W) acc += src[y * W + x];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc;
      const add = x + r + 1, rem = x - r;
      if (add < W) acc += src[y * W + add];
      if (rem >= 0) acc -= src[y * W + rem];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < H) acc += tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc;
      const add = y + r + 1, rem = y - r;
      if (add < H) acc += tmp[add * W + x];
      if (rem >= 0) acc -= tmp[rem * W + x];
    }
  }
  return out;
}

function dilate(m: Mask, W: number, H: number, r: number): Mask {
  const c = boxCount(m, W, H, r);
  const o = new Uint8Array(W * H);
  for (let i = 0; i < o.length; i++) o[i] = c[i] > 0 ? 1 : 0;
  return o;
}

/** Erosion; pixels outside the frame count as foreground so objects at the border survive. */
function erode(m: Mask, W: number, H: number, r: number): Mask {
  const c = boxCount(m, W, H, r);
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = Math.min(x + r, W - 1) - Math.max(x - r, 0) + 1;
      const cy = Math.min(y + r, H - 1) - Math.max(y - r, 0) + 1;
      o[y * W + x] = c[y * W + x] >= cx * cy ? 1 : 0;
    }
  }
  return o;
}

/** Fill enclosed holes (text, artwork, glare inside the page) via a border flood-fill of the background. */
function fillHoles(m: Mask, W: number, H: number): Mask {
  const bg = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let sp = 0;
  const push = (p: number) => { if (!m[p] && !bg[p]) { bg[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (y > 0) push(p - W);
    if (y < H - 1) push(p + W);
  }
  const o = new Uint8Array(W * H);
  for (let i = 0; i < o.length; i++) o[i] = bg[i] ? 0 : 1;
  return o;
}

function components(m: Mask, W: number, H: number, minArea: number): number[][] {
  const n = W * H;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const res: number[][] = [];
  for (let start = 0; start < n; start++) {
    if (!m[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    const comp: number[] = [];
    while (sp > 0) {
      const p = stack[--sp];
      comp.push(p);
      const x = p % W, y = (p / W) | 0;
      if (x > 0 && m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && m[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && m[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
    }
    if (comp.length >= minArea) res.push(comp);
  }
  return res.sort((a, b) => b.length - a.length).slice(0, 4);
}

/** Convex hull (monotone chain). */
function convexHull(pts: [number, number][]): [number, number][] {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const p of pts) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/** Reduce a convex polygon to 4 corners: repeatedly drop the vertex whose removal loses the least area. */
function hullToQuad(hull: [number, number][]): [number, number][] | null {
  if (hull.length < 4) return null;
  const h = hull.slice();
  while (h.length > 4) {
    let bi = 0, ba = Infinity;
    for (let i = 0; i < h.length; i++) {
      const a = h[(i + h.length - 1) % h.length], b = h[i], c = h[(i + 1) % h.length];
      const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (ar < ba) { ba = ar; bi = i; }
    }
    h.splice(bi, 1);
  }
  return h;
}

/**
 * Sharpen a hull-derived quad: the corner-dropping simplification clips real
 * corners a little. Fit a straight line (orthogonal regression) to the region's
 * boundary pixels along each side, ignoring the rounded stretch near each corner,
 * and intersect adjacent lines. Falls back to the input corner when a fit is
 * unreliable.
 */
function refineQuad(comp: number[], W: number, H: number, corners: [number, number][]): [number, number][] {
  const inComp = new Uint8Array(W * H);
  for (const p of comp) inComp[p] = 1;
  const boundary: [number, number][] = [];
  for (const p of comp) {
    const x = p % W, y = (p / W) | 0;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !inComp[p - 1] || !inComp[p + 1] || !inComp[p - W] || !inComp[p + W]) boundary.push([x, y]);
  }
  // order corners clockwise so side i runs corner i -> i+1
  const cx = corners.reduce((s, c) => s + c[0], 0) / 4, cy = corners.reduce((s, c) => s + c[1], 0) / 4;
  const cs = corners.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const sides: [number, number][][] = [[], [], [], []];
  for (const [x, y] of boundary) {
    let bi = -1, bd = Infinity, bt = 0, bl = 1;
    for (let i = 0; i < 4; i++) {
      const a = cs[i], b = cs[(i + 1) % 4];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy || 1;
      const t = ((x - a[0]) * dx + (y - a[1]) * dy) / len2;
      const tc = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (a[0] + dx * tc), y - (a[1] + dy * tc));
      if (d < bd) { bd = d; bi = i; bt = t; bl = Math.sqrt(len2); }
    }
    if (bd <= Math.max(3, bl * 0.06) && bt > 0.12 && bt < 0.88) sides[bi].push([x, y]);
  }
  const lines = sides.map((pts) => {
    if (pts.length < 8) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { px: mx, py: my, dx: Math.cos(ang), dy: Math.sin(ang) };
  });
  const out: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[(i + 3) % 4], l2 = lines[i];
    const fallback = cs[i];
    if (!l1 || !l2) { out.push(fallback); continue; }
    const det = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(det) < 0.2) { out.push(fallback); continue; }
    const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / det;
    const x = l1.px + l1.dx * t, y = l1.py + l1.dy * t;
    out.push(Math.hypot(x - fallback[0], y - fallback[1]) > Math.max(W, H) * 0.08 ? fallback : [x, y]);
  }
  return out;
}

/** Order 4 points TL, TR, BR, BL (clockwise on screen, starting nearest the top-left). */
function orderQuad(p: Pt[]): Quad {
  const cx = p.reduce((s, q) => s + q.x, 0) / 4, cy = p.reduce((s, q) => s + q.y, 0) / 4;
  const sorted = p.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let k = 0, bs = Infinity;
  sorted.forEach((q, i) => { const s = q.x + q.y; if (s < bs) { bs = s; k = i; } });
  return [sorted[k], sorted[(k + 1) % 4], sorted[(k + 2) % 4], sorted[(k + 3) % 4]] as Quad;
}

function cornerAnglesOk(q: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (deg < 50 || deg > 130) return false;
  }
  return true;
}

/** True when the quad is (about) the whole frame: the fallback, never a detection. */
export function isFullImageQuad(q: Quad, tol = 0.06): boolean {
  const c: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  return q.every((p, i) => Math.abs(p.x - c[i].x) < tol && Math.abs(p.y - c[i].y) < tol);
}

/**
 * Find the page/object in a captured photo. Several segmentation strategies each
 * yield candidate regions (background-colour distance, luminance Otsu in both
 * polarities, gradient edges). Every mask is closed and hole-filled so artwork or
 * text inside the object doesn't split it; each region's convex hull is reduced
 * to a quad, validated (convex, angles, area, fill) and scored by fill, size and
 * the contrast along its four edges. The whole-frame rectangle is rejected as a
 * candidate outright, so it can never win.
 */
export function detectDocument(img: Raster): DetectionResult {
  const fail = (): DetectionResult => ({ quad: defaultQuad(), detectionFailed: true, method: "fallback", score: 0 });
  const { data, width: W, height: H } = img;
  if (W < 16 || H < 16) return fail();
  const n = W * H;

  const gray = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) gray[j] = (299 * data[i] + 587 * data[i + 1] + 114 * data[i + 2]) / 1000;
  const blurF = (src: Float32Array): Float32Array => {
    const o = new Float32Array(n);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            s += src[yy * W + xx];
            c++;
          }
        }
        o[y * W + x] = s / c;
      }
    }
    return o;
  };
  const chan = [0, 1, 2].map((c) => {
    const f = new Float32Array(n);
    for (let j = 0; j < n; j++) f[j] = data[j * 4 + c];
    return blurF(f);
  });
  const bl = blurF(gray);

  const otsuOf = (vals: Float32Array): number => {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[Math.max(0, Math.min(255, vals[i] | 0))]++;
    return otsu(hist, n);
  };

  const masks: { name: string; m: Mask }[] = [];

  // A) distance from the border-ring background colour
  {
    const ring: number[][] = [[], [], []];
    const t = Math.max(2, Math.round(Math.min(W, H) * 0.03));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < t || y < t || x >= W - t || y >= H - t) for (let c = 0; c < 3; c++) ring[c].push(chan[c][y * W + x]);
      }
    }
    const med = ring.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) dist[i] = Math.max(Math.abs(chan[0][i] - med[0]), Math.abs(chan[1][i] - med[1]), Math.abs(chan[2][i] - med[2]));
    const thr = Math.max(22, otsuOf(dist));
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = dist[i] > thr ? 1 : 0;
    masks.push({ name: "bg-distance", m });
  }
  // B) luminance Otsu, both polarities
  {
    const thr = otsuOf(bl);
    for (const bright of [true, false]) {
      const m = new Uint8Array(n);
      for (let i = 0; i < n; i++) m[i] = (bl[i] > thr) === bright ? 1 : 0;
      masks.push({ name: bright ? "otsu-bright" : "otsu-dark", m });
    }
  }
  // C) gradient edges, dilated so the outline becomes a closed ring, then filled
  {
    const mag = new Float32Array(n);
    let sum = 0, sum2 = 0;
    const g = (x: number, y: number) => bl[y * W + x];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const gx = g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1) - g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1);
        const gy = g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1) - g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1);
        const v = Math.hypot(gx, gy);
        mag[y * W + x] = v;
        sum += v;
        sum2 += v * v;
      }
    }
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const thr = Math.max(40, mean + 1.2 * sd);
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = mag[i] > thr ? 1 : 0;
    masks.push({ name: "edges", m: dilate(m, W, H, 2) });
  }

  const sample = (x: number, y: number): number | null => {
    const xi = Math.round(x * W - 0.5), yi = Math.round(y * H - 0.5);
    return xi < 0 || yi < 0 || xi >= W || yi >= H ? null : bl[yi * W + xi];
  };
  /** Mean luminance step across the quad's four edges (0..1). */
  const edgeContrast = (q: Quad): number => {
    let tot = 0, cnt = 0;
    for (let e = 0; e < 4; e++) {
      const a = q[e], b = q[(e + 1) % 4];
      const nx = -(b.y - a.y) * H, ny = (b.x - a.x) * W;
      const len = Math.hypot(nx, ny) || 1;
      const ox = ((nx / len) * 3) / W, oy = ((ny / len) * 3) / H;
      for (let k = 1; k < 12; k++) {
        const t = k / 12;
        const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
        const i1 = sample(px - ox, py - oy), i2 = sample(px + ox, py + oy);
        if (i1 == null || i2 == null) continue;
        tot += Math.abs(i1 - i2) / 255;
        cnt++;
      }
    }
    return cnt ? tot / cnt : 0;
  };

  const r = Math.max(2, Math.round(Math.min(W, H) * 0.015));
  const side = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let best: DetectionResult | null = null;
  for (const { name, m: raw } of masks) {
    const m = fillHoles(erode(dilate(raw, W, H, r), W, H, r), W, H);
    for (const comp of components(m, W, H, n * 0.03)) {
      if (comp.length / n > 0.94) continue;
      const pts: [number, number][] = comp.map((p) => [p % W, (p / W) | 0]);
      const hq = hullToQuad(convexHull(pts));
      if (!hq) continue;
      const q = orderQuad(refineQuad(comp, W, H, hq).map(([x, y]) => ({ x: (x + 0.5) / W, y: (y + 0.5) / H })));
      if (!isConvexQuad(q) || !cornerAnglesOk(q) || isFullImageQuad(q)) continue;
      const qa = quadArea(q);
      if (qa < 0.04 || qa > 0.96) continue;
      const fill = comp.length / (qa * n);
      if (fill < 0.7 || fill > 1.2) continue;
      if (Math.min(side(q[0], q[1]), side(q[3], q[2]), side(q[0], q[3]), side(q[1], q[2])) < 0.12) continue;
      const ec = edgeContrast(q);
      if (ec < 0.04) continue;
      const score = Math.min(fill, 1) * (0.4 + Math.min(ec * 4, 1)) * Math.pow(qa, 0.35);
      if (!best || score > best.score) best = { quad: q, detectionFailed: false, method: name, score };
    }
  }
  return best ?? fail();
}

/** Back-compat: the detected quad, or null when detection failed. */
export function detectDocumentQuad(img: Raster): Quad | null {
  const r = detectDocument(img);
  return r.detectionFailed ? null : r.quad;
}
