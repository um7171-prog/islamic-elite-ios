import { applyScanFilter, type ScanFilter } from "./imageProcessing";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Runs a real filter (imageProcessing.ts) over the FULL-resolution scanned page and returns a new
 * JPEG data URL — this is what goes into the PDF, not a CSS filter on the preview. Kept separate
 * from the pure algorithms so those stay unit-testable without a DOM/canvas.
 */
export async function applyFilterToDataUrl(dataUrl: string, filter: ScanFilter): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = applyScanFilter({ data: src.data, width: src.width, height: src.height }, filter);
  ctx.putImageData(new ImageData(out.data as unknown as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width: canvas.width, height: canvas.height };
}
