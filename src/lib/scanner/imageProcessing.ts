/**
 * Real per-pixel document enhancement — pure functions on raw RGBA pixels (no DOM), so they can be
 * unit-tested directly and reused by the DOM wrapper (applyFilter.ts) that feeds the scanner's
 * "original / magic / grayscale / bw" picker. Every filter here is applied to the FULL-resolution
 * scanned page before it goes into the PDF — never a CSS/canvas display-only filter on the preview.
 *
 * Algorithms:
 *  - toGrayscale        luminance conversion (ITU-R BT.601)
 *  - flattenIllumination "shadow reduction": divides the image by a heavily blurred copy of itself
 *                         (estimated local background), which evens out uneven lighting/shadows —
 *                         the standard "background subtraction" trick document scanners use.
 *  - blackAndWhite       adaptive local threshold (Bradley/Wellner-style: compare each pixel to the
 *                         mean of its neighbourhood) — a true per-region binarisation, not a single
 *                         global cutoff, so it works on unevenly lit pages.
 *  - magicEnhance        flattenIllumination + a contrast/white-balance lift, colour kept.
 */

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ScanFilter = "original" | "magic" | "grayscale" | "bw";

function cloneRaster(r: Raster): Raster {
  return { data: new Uint8ClampedArray(r.data), width: r.width, height: r.height };
}

export function toGrayscale(r: Raster): Raster {
  const out = cloneRaster(r);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  return out;
}

/** Box blur via two separable passes — fast, no external dependency. */
function boxBlur(gray: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -radius; x <= radius; x++) acc += gray[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / (2 * radius + 1);
      const addX = Math.min(w - 1, x + radius + 1);
      const remX = Math.max(0, x - radius);
      acc += gray[row + addX] - gray[row + remX];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * radius + 1);
      const addY = Math.min(h - 1, y + radius + 1);
      const remY = Math.max(0, y - radius);
      acc += tmp[addY * w + x] - tmp[remY * w + x];
    }
  }
  return out;
}

/** Estimated local background (illumination) per channel, via a wide box blur. */
function estimateBackground(r: Raster, channel: 0 | 1 | 2, radius: number): Float32Array {
  const { data, width, height } = r;
  const chan = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) chan[j] = data[i + channel];
  return boxBlur(chan, width, height, radius);
}

/** "Shadow reduction": divide by the estimated local background, then renormalise to keep the
 * page reading as white paper instead of flat grey. Works per-channel, so colour is kept. */
export function flattenIllumination(r: Raster): Raster {
  const out = cloneRaster(r);
  const { width, height } = r;
  const radius = Math.max(8, Math.round(Math.min(width, height) / 10));
  const bg = [0, 1, 2].map((c) => estimateBackground(r, c as 0 | 1 | 2, radius));
  const d = out.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    for (let c = 0; c < 3; c++) {
      const b = Math.max(bg[c][j], 1);
      d[i + c] = Math.min(255, (d[i + c] / b) * 245);
    }
  }
  return out;
}

/** Contrast + slight saturation lift, used by magicEnhance after flattening. */
function boostContrast(r: Raster, amount = 1.18, saturation = 1.08): Raster {
  const out = cloneRaster(r);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let c = 0; c < 3; c++) {
      let v = (d[i + c] - 128) * amount + 128; // contrast around mid-grey
      v = gray + (v - gray) * saturation; // push each channel away from grey a bit
      d[i + c] = Math.max(0, Math.min(255, v));
    }
  }
  return out;
}

/** "Magic": the closest thing to a professional scanner app's auto-enhance — flattens uneven
 * lighting/shadows, then lifts contrast, while keeping colour (so stamps/highlighter/photos on the
 * page stay meaningful). This is the default filter right after a scan. */
export function magicEnhance(r: Raster): Raster {
  return boostContrast(flattenIllumination(r), 1.16, 1.1);
}

/** Adaptive (local-mean) threshold: black text stays black, uneven paper/shadow becomes white,
 * because each pixel is compared to the AVERAGE of its own neighbourhood, not one global cutoff. */
export function blackAndWhite(r: Raster, sensitivity = 12): Raster {
  const { width, height } = r;
  const gray = new Float32Array(width * height);
  const d = r.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const radius = Math.max(6, Math.round(Math.min(width, height) / 16));
  const mean = boxBlur(gray, width, height, radius);
  const out = cloneRaster(r);
  const od = out.data;
  for (let i = 0, j = 0; i < od.length; i += 4, j++) {
    const v = gray[j] > mean[j] - sensitivity ? 255 : 0;
    od[i] = od[i + 1] = od[i + 2] = v;
  }
  return out;
}

export function applyScanFilter(r: Raster, filter: ScanFilter): Raster {
  switch (filter) {
    case "magic":
      return magicEnhance(r);
    case "grayscale":
      return toGrayscale(r);
    case "bw":
      return blackAndWhite(r);
    default:
      return cloneRaster(r);
  }
}

export const SCAN_FILTERS: { id: ScanFilter; ar: string; en: string }[] = [
  { id: "magic", ar: "سحري", en: "Magic" },
  { id: "original", ar: "الأصل", en: "Original" },
  { id: "grayscale", ar: "رمادي", en: "Grayscale" },
  { id: "bw", ar: "أبيض وأسود", en: "B&W" },
];
