/** Shared client-side image AI helpers: high-quality matting, enhancement, export. */

export type Progress = (p: number, label?: string) => void;

export async function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Downscale huge uploads before heavy work to keep memory and speed sane. */
export async function normalizeInput(file: File, maxSide = 2200): Promise<Blob> {
  const img = await fileToImage(file);
  const side = Math.max(img.naturalWidth, img.naturalHeight);
  if (side <= maxSide) return file;
  const scale = maxSide / side;
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return await canvasToBlob(c, "image/png");
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("تعذر إنشاء الصورة"))), type, quality),
  );
}

/**
 * High-quality AI matting using the full-precision ISNet model (better hair /
 * fine-edge preservation than the default quantized model).
 */
export async function removeBackgroundHQ(file: File, onProgress: Progress): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  const input = await normalizeInput(file, 2048);
  onProgress(8, "تجهيز الصورة");
  const blob = await removeBackground(input, {
    model: "isnet", // full-precision model = best quality
    output: { format: "image/png", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      const ratio = total ? current / total : 0;
      if (key.startsWith("fetch")) onProgress(10 + ratio * 55, "تحميل نموذج الذكاء الاصطناعي");
      else onProgress(70 + ratio * 25, "معالجة الصورة");
    },
  });
  onProgress(97, "تحسين الحواف");
  return blob;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Upscale (max 2x / 2800px) + unsharp mask, chunked so the UI never freezes. */
export async function enhanceImage(file: File, onProgress: Progress): Promise<Blob> {
  const img = await fileToImage(file);
  onProgress(10, "تجهيز الصورة");
  const scale = Math.max(1, Math.min(2, 2800 / Math.max(img.naturalWidth, img.naturalHeight, 1)));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("تعذر تجهيز الصورة");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "saturate(1.08) contrast(1.06) brightness(1.02)";
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = "none";
  onProgress(30, "رفع الدقة");

  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const k = [0, -0.6, 0, -0.6, 3.4, -0.6, 0, -0.6, 0];
  const d = src.data;
  const o = out.data;
  const CHUNK = 64;
  for (let y0 = 0; y0 < h; y0 += CHUNK) {
    const yEnd = Math.min(h, y0 + CHUNK);
    for (let y = y0; y < yEnd; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let ki = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            for (let dx = -1; dx <= 1; dx++, ki++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx));
              sum += d[(yy * w + xx) * 4 + c] * k[ki];
            }
          }
          o[i + c] = sum < 0 ? 0 : sum > 255 ? 255 : sum;
        }
        o[i + 3] = d[i + 3];
      }
    }
    onProgress(30 + (yEnd / h) * 62, "تحسين التفاصيل");
    await nextFrame();
  }
  ctx.putImageData(out, 0, 0);
  onProgress(96, "إنهاء");
  return canvasToBlob(canvas, "image/png");
}

/** Re-encode a result blob to the requested format (JPG gets a white matte). */
export async function exportImage(blob: Blob, format: "png" | "jpg"): Promise<Blob> {
  if (format === "png") return blob;
  const img = await fileToImage(blob);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("تعذر تجهيز الصورة");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return canvasToBlob(c, "image/jpeg", 0.95);
}

/** Reliable download that works on iOS Safari and Android Chrome. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}
