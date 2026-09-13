import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Camera, Flashlight, FlashlightOff, X, Trash2, FileDown, Wand2, RotateCw,
  Loader2, Share2, Plus, Check, ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Filter = "original" | "enhance" | "gray" | "bw";
type TorchTrack = MediaStreamTrack & { getCapabilities?: () => Record<string, unknown> };
type Pt = { x: number; y: number };
type Quad = [Pt, Pt, Pt, Pt]; // TL, TR, BR, BL (normalized 0..1)

interface ScanPage {
  id: string;
  dataUrl: string;        // processed
  croppedDataUrl: string; // after perspective crop, before filter
  filter: Filter;
  rotation: number;
}

// ---------- image helpers ----------
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.src = src;
  });
}

function applyFilter(srcDataUrl: string, filter: Filter, rotation: number): Promise<string> {
  return new Promise(async (resolve) => {
    const img = await loadImage(srcDataUrl);
    const rotated = rotation % 180 !== 0;
    const w = rotated ? img.height : img.width;
    const h = rotated ? img.width : img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    if (filter !== "original") {
      const data = ctx.getImageData(0, 0, w, h);
      const d = data.data;
      if (filter === "gray") {
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
          d[i] = d[i+1] = d[i+2] = g;
        }
        ctx.putImageData(data, 0, 0);
      } else if (filter === "bw") {
        // Adaptive threshold using local mean (integral image)
        const gray = new Float32Array(w * h);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) {
          gray[j] = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        }
        const integ = new Float64Array((w + 1) * (h + 1));
        for (let y = 0; y < h; y++) {
          let rs = 0;
          for (let x = 0; x < w; x++) {
            rs += gray[y * w + x];
            integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + rs;
          }
        }
        const s = Math.max(15, Math.round(Math.min(w, h) / 24));
        const T = 0.15;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - s), y1 = Math.max(0, y - s);
            const x2 = Math.min(w - 1, x + s), y2 = Math.min(h - 1, y + s);
            const count = (x2 - x1) * (y2 - y1);
            const sum = integ[(y2 + 1) * (w + 1) + (x2 + 1)]
                      - integ[y1 * (w + 1) + (x2 + 1)]
                      - integ[(y2 + 1) * (w + 1) + x1]
                      + integ[y1 * (w + 1) + x1];
            const mean = sum / count;
            const v = gray[y * w + x] * (1 - T) < mean ? 0 : 255;
            const idx = (y * w + x) * 4;
            d[idx] = d[idx+1] = d[idx+2] = v;
          }
        }
        ctx.putImageData(data, 0, 0);
      } else if (filter === "enhance") {
        // 1) Auto white balance using top-percentile luminance
        const N = w * h;
        const lum = new Float32Array(N);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) {
          lum[j] = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        }
        // find 95th percentile brightness (approx via histogram)
        const hist = new Uint32Array(256);
        for (let i = 0; i < N; i++) hist[Math.min(255, Math.max(0, lum[i] | 0))]++;
        let acc = 0; const target = N * 0.95; let p95 = 220;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) { p95 = v; break; } }
        const gain = 255 / Math.max(160, p95);
        // 2) Apply gain + contrast, keep on original array
        const contrast = 1.35;
        const intercept = 128 * (1 - contrast) + 6;
        for (let i = 0; i < d.length; i += 4) {
          d[i]   = Math.max(0, Math.min(255, d[i]   * gain * contrast + intercept));
          d[i+1] = Math.max(0, Math.min(255, d[i+1] * gain * contrast + intercept));
          d[i+2] = Math.max(0, Math.min(255, d[i+2] * gain * contrast + intercept));
        }
        // 3) Unsharp mask: subtract 3x3 box blur, add scaled difference
        const src = new Uint8ClampedArray(d);
        const amount = 0.6;
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;
            for (let k = 0; k < 3; k++) {
              let sum = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  sum += src[((y + dy) * w + (x + dx)) * 4 + k];
                }
              }
              const avg = sum / 9;
              const val = src[i + k] + (src[i + k] - avg) * amount;
              d[i + k] = Math.max(0, Math.min(255, val));
            }
          }
        }
        ctx.putImageData(data, 0, 0);
      }
    }
    resolve(canvas.toDataURL("image/jpeg", 0.95));
  });
}

// ---------- perspective transform (inverse mapping) ----------
// Solve 8x8 for projective matrix from 4 src points to 4 dst points
function solveProjective(src: Pt[], dst: Pt[]): number[] {
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
  // Gaussian elimination
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
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return [...x, 1];
}

async function warpQuadToRect(srcDataUrl: string, quad: Quad, outW: number, outH: number): Promise<string> {
  const img = await loadImage(srcDataUrl);
  const src = document.createElement("canvas");
  src.width = img.width; src.height = img.height;
  src.getContext("2d")!.drawImage(img, 0, 0);
  const srcData = src.getContext("2d")!.getImageData(0, 0, img.width, img.height).data;

  const dstPts: Pt[] = [
    { x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH },
  ];
  const srcPts: Pt[] = quad.map((p) => ({ x: p.x * img.width, y: p.y * img.height }));
  // We need inverse: dst -> src
  const H = solveProjective(dstPts, srcPts);

  const out = document.createElement("canvas");
  out.width = outW; out.height = outH;
  const outCtx = out.getContext("2d")!;
  const outImg = outCtx.createImageData(outW, outH);
  const od = outImg.data;
  const iw = img.width, ih = img.height;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = H[6]*x + H[7]*y + H[8];
      const sx = (H[0]*x + H[1]*y + H[2]) / w;
      const sy = (H[3]*x + H[4]*y + H[5]) / w;
      const xi = Math.max(0, Math.min(iw - 1, Math.round(sx)));
      const yi = Math.max(0, Math.min(ih - 1, Math.round(sy)));
      const si = (yi * iw + xi) * 4;
      const di = (y * outW + x) * 4;
      od[di]   = srcData[si];
      od[di+1] = srcData[si+1];
      od[di+2] = srcData[si+2];
      od[di+3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);
  return out.toDataURL("image/jpeg", 0.92);
}

// ---------- edge detection (Sobel + gradient boundary search) ----------
// Downscale frame, compute Sobel magnitude, then for each column find the
// topmost/bottom-most strong edge (and per-row for left/right) to fit a quad.
function detectDocumentQuad(video: HTMLVideoElement): Quad | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const W = 200;
  const H = Math.round((vh / vw) * W);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(video, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;

  // Grayscale
  const gray = new Float32Array(W * H);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
  }
  // 3x3 box blur to denoise
  const blur = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) s += gray[(y + dy) * W + (x + dx)];
      blur[y * W + x] = s / 9;
    }
  }
  // Sobel magnitude
  const mag = new Float32Array(W * H);
  let magSum = 0, magMax = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx =
        -blur[i - W - 1] + blur[i - W + 1]
        - 2 * blur[i - 1] + 2 * blur[i + 1]
        - blur[i + W - 1] + blur[i + W + 1];
      const gy =
        -blur[i - W - 1] - 2 * blur[i - W] - blur[i - W + 1]
        + blur[i + W - 1] + 2 * blur[i + W] + blur[i + W + 1];
      const m = Math.abs(gx) + Math.abs(gy);
      mag[i] = m;
      magSum += m;
      if (m > magMax) magMax = m;
    }
  }
  const mean = magSum / (W * H);
  const thr = Math.max(35, Math.min(magMax * 0.35, mean * 3.2));

  // Search inward from each side, per row / per column, for the first strong edge
  const marginX = Math.floor(W * 0.02);
  const marginY = Math.floor(H * 0.02);

  const topRow = new Int16Array(W).fill(-1);
  const botRow = new Int16Array(W).fill(-1);
  const leftCol = new Int16Array(H).fill(-1);
  const rightCol = new Int16Array(H).fill(-1);
  for (let x = marginX; x < W - marginX; x++) {
    for (let y = marginY; y < H / 2; y++) if (mag[y * W + x] > thr) { topRow[x] = y; break; }
    for (let y = H - 1 - marginY; y > H / 2; y--) if (mag[y * W + x] > thr) { botRow[x] = y; break; }
  }
  for (let y = marginY; y < H - marginY; y++) {
    for (let x = marginX; x < W / 2; x++) if (mag[y * W + x] > thr) { leftCol[y] = x; break; }
    for (let x = W - 1 - marginX; x > W / 2; x--) if (mag[y * W + x] > thr) { rightCol[y] = x; break; }
  }

  // Fit a line y = a*x + b via least squares to top edge, etc.
  const fitLine = (xs: number[], ys: number[]) => {
    const n = xs.length;
    if (n < 8) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-6) return null;
    const a = (n * sxy - sx * sy) / den;
    const b = (sy - a * sx) / n;
    return { a, b };
  };

  const collect = (arr: Int16Array, indexIsX: boolean) => {
    const xs: number[] = [], ys: number[] = [];
    for (let k = 0; k < arr.length; k++) {
      if (arr[k] < 0) continue;
      if (indexIsX) { xs.push(k); ys.push(arr[k]); }
      else { xs.push(arr[k]); ys.push(k); }
    }
    return { xs, ys };
  };

  const topPts = collect(topRow, true);
  const botPts = collect(botRow, true);
  const leftPts = collect(leftCol, false);
  const rightPts = collect(rightCol, false);
  const top = fitLine(topPts.xs, topPts.ys);
  const bot = fitLine(botPts.xs, botPts.ys);
  const left = fitLine(leftPts.ys, leftPts.xs);   // x = a*y + b
  const right = fitLine(rightPts.ys, rightPts.xs);
  if (!top || !bot || !left || !right) return null;

  // Intersections
  // horizontal line: y = a*x + b   → parameterized
  // vertical line:   x = a2*y + b2
  const intersect = (h: { a: number; b: number }, v: { a: number; b: number }) => {
    // y = h.a * x + h.b ; x = v.a * y + v.b
    // x = v.a * (h.a * x + h.b) + v.b → x (1 - v.a * h.a) = v.a * h.b + v.b
    const den = 1 - v.a * h.a;
    if (Math.abs(den) < 1e-6) return null;
    const x = (v.a * h.b + v.b) / den;
    const y = h.a * x + h.b;
    return { x, y };
  };
  const tl = intersect(top, left);
  const tr = intersect(top, right);
  const br = intersect(bot, right);
  const bl = intersect(bot, left);
  if (!tl || !tr || !br || !bl) return null;

  const norm = (p: { x: number; y: number }): Pt => ({
    x: Math.max(0, Math.min(1, p.x / W)),
    y: Math.max(0, Math.min(1, p.y / H)),
  });
  const q: Quad = [norm(tl), norm(tr), norm(br), norm(bl)];

  // Sanity: area covers ≥25% of frame
  const area = Math.abs(((q[1].x - q[0].x) + (q[2].x - q[3].x)) * 0.5
             * ((q[3].y - q[0].y) + (q[2].y - q[1].y)) * 0.5);
  if (area < 0.25) return null;
  // Sanity: sides not degenerate
  const side = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  if (side(q[0], q[1]) < 0.25 || side(q[3], q[2]) < 0.25) return null;
  if (side(q[0], q[3]) < 0.25 || side(q[1], q[2]) < 0.25) return null;
  return q;
}

function quadsClose(a: Quad, b: Quad, tol = 0.03): boolean {
  for (let i = 0; i < 4; i++) {
    if (Math.abs(a[i].x - b[i].x) > tol || Math.abs(a[i].y - b[i].y) > tol) return false;
  }
  return true;
}

// ---------- component ----------
export function DocumentScannerDialog({ open, onOpenChange }: Props) {
  const { t, dir } = useLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<number | null>(null);
  const lastQuadRef = useRef<Quad | null>(null);
  const stableCountRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [permission, setPermission] = useState<"idle"|"prompt"|"granted"|"denied">("idle");
  const [busy, setBusy] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [detected, setDetected] = useState(false);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [view, setView] = useState<"camera"|"review"|"gallery">("camera");

  // captured raw + working quad for review screen
  const [rawCapture, setRawCapture] = useState<string | null>(null);
  const [editQuad, setEditQuad] = useState<Quad>([
    { x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 },
  ]);
  const [reviewBusy, setReviewBusy] = useState(false);

  // -------- camera lifecycle --------
  // Bumped every time the dialog opens/closes. A pending getUserMedia() call
  // that resolves after the generation moved on is stale and must be torn
  // down immediately — otherwise closing the dialog mid-permission-prompt
  // leaks the camera stream (it stays lit with nothing to stop it).
  const genRef = useRef(0);

  const stop = useCallback(() => {
    if (detectRef.current) { cancelAnimationFrame(detectRef.current); detectRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const myGen = ++genRef.current;
    setError(null); setTorchOn(false); setPermission("prompt");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("Camera not supported", "الكاميرا غير مدعومة"));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 }, aspectRatio: { ideal: 3/4 } },
        audio: false,
      });
      if (genRef.current !== myGen) {
        // Dialog was closed (or restarted) while waiting for the permission
        // prompt — this stream must never become the "live" one.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setPermission("granted");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (genRef.current !== myGen) { stop(); return; }
      const track = stream.getVideoTracks()[0] as TorchTrack;
      const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
      setTorchSupported(Boolean(caps.torch));
    } catch (e: any) {
      if (genRef.current !== myGen) return;
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermission("denied");
        setError(t("Camera permission denied. Enable it from your device Settings.", "تم رفض إذن الكاميرا. فعّله من إعدادات جهازك."));
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError(t("No camera found", "لا توجد كاميرا"));
      } else if (name === "NotReadableError") {
        setError(t("Camera is in use by another app", "الكاميرا مستخدمة من تطبيق آخر"));
      } else {
        setError(e?.message || t("Unable to access camera", "تعذّر الوصول إلى الكاميرا"));
      }
    }
  }, [t, stop]);

  useEffect(() => {
    if (open) {
      setPages([]); setView("camera"); setRawCapture(null);
      stableCountRef.current = 0; lastQuadRef.current = null; setDetected(false);
      start();
    }
    return () => { genRef.current++; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // -------- realtime detection loop --------
  useEffect(() => {
    if (view !== "camera" || permission !== "granted") return;
    let running = true;
    const tick = () => {
      if (!running) return;
      const video = videoRef.current;
      const cv = overlayRef.current;
      if (video && cv && video.videoWidth) {
        const rect = video.getBoundingClientRect();
        cv.width = rect.width; cv.height = rect.height;
        const ctx = cv.getContext("2d")!;
        ctx.clearRect(0, 0, cv.width, cv.height);

        const quad = detectDocumentQuad(video);
        if (quad) {
          // draw quad
          ctx.strokeStyle = "hsl(var(--accent))";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(quad[0].x * cv.width, quad[0].y * cv.height);
          for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x * cv.width, quad[i].y * cv.height);
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = "hsl(var(--accent) / 0.15)";
          ctx.fill();
          setDetected(true);

          // stability
          if (lastQuadRef.current && quadsClose(lastQuadRef.current, quad)) {
            stableCountRef.current += 1;
          } else {
            stableCountRef.current = 1;
          }
          lastQuadRef.current = quad;
          if (autoCapture && stableCountRef.current >= 12 && !busy) {
            stableCountRef.current = 0;
            captureWithQuad(quad);
          }
        } else {
          setDetected(false);
          stableCountRef.current = 0;
          lastQuadRef.current = null;
        }
      }
      detectRef.current = requestAnimationFrame(tick);
    };
    detectRef.current = requestAnimationFrame(tick);
    return () => { running = false; if (detectRef.current) cancelAnimationFrame(detectRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, permission, autoCapture, busy]);

  // -------- torch --------
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as TorchTrack | undefined;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch { toast.error(t("Flashlight unsupported", "الفلاش غير مدعوم")); }
  };

  // -------- capture --------
  const grabFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext("2d")!.drawImage(video, 0, 0);
    return c.toDataURL("image/jpeg", 0.95);
  };

  // Manual shutter → capture frame, use detected quad (or default box), open review for corner tweak.
  const manualCapture = () => {
    if (busy) return;
    const raw = grabFrame();
    if (!raw) return;
    const q = lastQuadRef.current ?? ([
      { x: 0.06, y: 0.10 }, { x: 0.94, y: 0.10 }, { x: 0.94, y: 0.90 }, { x: 0.06, y: 0.90 },
    ] as Quad);
    setRawCapture(raw);
    setEditQuad(q);
    setView("review");
    stableCountRef.current = 0;
    lastQuadRef.current = null;
    setDetected(false);
  };

  // Auto-capture path: use detected quad, crop + enhance, add as page immediately.
  const captureWithQuad = async (quad?: Quad) => {
    if (busy) return;
    setBusy(true);
    try {
      const raw = grabFrame();
      if (!raw) return;
      const q: Quad = quad ?? [
        { x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 },
      ];
      const img = await loadImage(raw);
      const w1 = Math.hypot((q[1].x - q[0].x) * img.width, (q[1].y - q[0].y) * img.height);
      const w2 = Math.hypot((q[2].x - q[3].x) * img.width, (q[2].y - q[3].y) * img.height);
      const h1 = Math.hypot((q[3].x - q[0].x) * img.width, (q[3].y - q[0].y) * img.height);
      const h2 = Math.hypot((q[2].x - q[1].x) * img.width, (q[2].y - q[1].y) * img.height);
      const outW = Math.max(400, Math.round(Math.max(w1, w2)));
      const outH = Math.max(400, Math.round(Math.max(h1, h2)));
      const cropped = await warpQuadToRect(raw, q, outW, outH);
      const processed = await applyFilter(cropped, "enhance", 0);
      const page: ScanPage = {
        id: crypto.randomUUID(),
        dataUrl: processed,
        croppedDataUrl: cropped,
        filter: "enhance",
        rotation: 0,
      };
      setPages((p) => {
        const next = [...p, page];
        toast.success(t(`Page ${next.length} captured`, `تم التقاط الصفحة ${next.length}`));
        return next;
      });
      stableCountRef.current = 0;
      lastQuadRef.current = null;
      setDetected(false);
    } finally {
      setTimeout(() => setBusy(false), 800);
    }
  };

  // -------- review screen: corner & edge drag --------
  const reviewRef = useRef<HTMLDivElement | null>(null);
  // index 0..3 = corners (TL,TR,BR,BL); 4..7 = edges (T,R,B,L)
  const dragIdx = useRef<number | null>(null);

  const onCornerDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragIdx.current = i;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onCornerMove = (e: React.PointerEvent) => {
    if (dragIdx.current == null || !reviewRef.current) return;
    const r = reviewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    setEditQuad((q) => {
      const n = [...q] as Quad;
      const idx = dragIdx.current!;
      if (idx < 4) {
        n[idx] = { x, y };
      } else {
        // edge midpoints: T(0-1), R(1-2), B(2-3), L(3-0)
        const a = idx - 4;
        const b = (a + 1) % 4;
        const mx = (n[a].x + n[b].x) / 2;
        const my = (n[a].y + n[b].y) / 2;
        const dx = x - mx, dy = y - my;
        n[a] = { x: Math.max(0, Math.min(1, n[a].x + dx)), y: Math.max(0, Math.min(1, n[a].y + dy)) };
        n[b] = { x: Math.max(0, Math.min(1, n[b].x + dx)), y: Math.max(0, Math.min(1, n[b].y + dy)) };
      }
      return n;
    });
  };
  const onCornerUp = () => { dragIdx.current = null; };

  const confirmCrop = async () => {
    if (!rawCapture) return;
    setReviewBusy(true);
    try {
      const img = await loadImage(rawCapture);
      // estimate output dims from quad
      const w1 = Math.hypot((editQuad[1].x - editQuad[0].x) * img.width, (editQuad[1].y - editQuad[0].y) * img.height);
      const w2 = Math.hypot((editQuad[2].x - editQuad[3].x) * img.width, (editQuad[2].y - editQuad[3].y) * img.height);
      const h1 = Math.hypot((editQuad[3].x - editQuad[0].x) * img.width, (editQuad[3].y - editQuad[0].y) * img.height);
      const h2 = Math.hypot((editQuad[2].x - editQuad[1].x) * img.width, (editQuad[2].y - editQuad[1].y) * img.height);
      const outW = Math.max(400, Math.round(Math.max(w1, w2)));
      const outH = Math.max(400, Math.round(Math.max(h1, h2)));
      const cropped = await warpQuadToRect(rawCapture, editQuad, outW, outH);
      const processed = await applyFilter(cropped, "enhance", 0);
      const page: ScanPage = {
        id: crypto.randomUUID(),
        dataUrl: processed,
        croppedDataUrl: cropped,
        filter: "enhance",
        rotation: 0,
      };
      setPages((p) => [...p, page]);
      setRawCapture(null);
      setView("gallery");
    } finally { setReviewBusy(false); }
  };

  const retake = () => {
    setRawCapture(null);
    setView("camera");
  };

  // -------- gallery actions --------
  const addAnother = () => setView("camera");

  const updateActiveFilter = async (id: string, filter: Filter) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    const dataUrl = await applyFilter(page.croppedDataUrl, filter, page.rotation);
    setPages((arr) => arr.map((p) => p.id === id ? { ...p, filter, dataUrl } : p));
  };
  const rotatePage = async (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    const rotation = (page.rotation + 90) % 360;
    const dataUrl = await applyFilter(page.croppedDataUrl, page.filter, rotation);
    setPages((arr) => arr.map((p) => p.id === id ? { ...p, rotation, dataUrl } : p));
  };
  const removePage = (id: string) => setPages((arr) => arr.filter((p) => p.id !== id));

  const buildPdf = async (): Promise<Blob> => {
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const img = await loadImage(pages[i].dataUrl);
      const ratio = Math.min(pageW / img.width, pageH / img.height);
      const w = img.width * ratio, h = img.height * ratio;
      pdf.addImage(pages[i].dataUrl, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
    }
    return pdf.output("blob");
  };

  // Returns true only once the PDF blob was actually built and the browser
  // download was handed off without throwing — as much certainty as a plain
  // <a download> click can give (there is no callback for "the OS finished
  // writing the file"). The wording below reflects that: "downloaded", not
  // an unconditional "saved".
  const savePdf = async (): Promise<boolean> => {
    if (!pages.length) return false;
    try {
      const blob = await buildPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `scan-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("PDF downloaded", "تم تنزيل PDF"));
      return true;
    } catch {
      toast.error(t("Failed to create the PDF. Please try again.", "تعذّر إنشاء ملف PDF. حاول مرة أخرى."));
      return false;
    }
  };

  const sharePdf = async () => {
    if (!pages.length) return;
    let blob: Blob;
    try {
      blob = await buildPdf();
    } catch {
      toast.error(t("Failed to prepare the PDF for sharing.", "تعذّر تجهيز PDF للمشاركة."));
      return;
    }
    const file = new File([blob], `scan-${Date.now()}.pdf`, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t("Scanned document", "مستند ممسوح") });
        toast.success(t("Shared successfully", "تمت المشاركة بنجاح"));
      } catch (e: any) {
        if (e?.name === "AbortError") return; // user canceled — not an error
        toast.error(t("Sharing failed. Try saving instead.", "فشلت المشاركة. جرّب الحفظ بدلاً من ذلك."));
      }
    } else {
      const saved = await savePdf();
      if (saved) {
        toast.info(t("Sharing not supported. File downloaded instead.", "المشاركة غير مدعومة. تم تنزيل الملف بدلاً من ذلك."));
      }
    }
  };

  // -------- render --------
  const corners: { i: number; label: string }[] = [
    { i: 0, label: "TL" }, { i: 1, label: "TR" }, { i: 2, label: "BR" }, { i: 3, label: "BL" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) stop(); onOpenChange(v); }}>
      <DialogContent dir={dir} className="max-w-md p-0 overflow-hidden bg-background">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center justify-between">
            <span>{t("Document Scanner", "ماسح المستندات")}</span>
            {pages.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {t(`Page ${pages.length}`, `صفحة ${pages.length}`)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {view === "camera" && (
          <>
            <div className="relative aspect-[3/4] w-full bg-black overflow-hidden">
              <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
              <canvas ref={overlayRef} className="absolute inset-0 h-full w-full pointer-events-none" />

              {/* Corner guides for framing */}
              <div className="pointer-events-none absolute inset-6">
                <span className="absolute -top-0.5 -left-0.5 h-7 w-7 border-t-4 border-l-4 border-white/80 rounded-tl-xl" />
                <span className="absolute -top-0.5 -right-0.5 h-7 w-7 border-t-4 border-r-4 border-white/80 rounded-tr-xl" />
                <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 border-b-4 border-l-4 border-white/80 rounded-bl-xl" />
                <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 border-b-4 border-r-4 border-white/80 rounded-br-xl" />
              </div>

              <div className="pointer-events-none absolute top-3 inset-x-0 text-center text-xs text-white/90 font-medium drop-shadow flex items-center justify-center gap-1.5">
                <ScanLine className="h-3.5 w-3.5" />
                {detected
                  ? (autoCapture
                      ? t("Hold steady… auto-capturing", "ثبّت الجهاز… جارٍ التقاط تلقائي")
                      : t("Document detected", "تم اكتشاف المستند"))
                  : t("Align the document inside the frame", "حاذِ المستند داخل الإطار")}
              </div>

              {pages.length > 0 && (
                <div className="pointer-events-none absolute top-14 inset-x-0 flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold shadow">
                    {t(`${pages.length} Page${pages.length>1?'s':''} Scanned`, `${pages.length} صفحة ممسوحة`)}
                  </span>
                </div>
              )}

              {busy && (
                <div className="pointer-events-none absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <p className="text-sm font-medium">{t("Processing…", "جارٍ المعالجة…")}</p>
                </div>
              )}

              <div className="absolute inset-x-0 top-0 flex justify-between p-3">
                <button onClick={() => { stop(); onOpenChange(false); }}
                  className="h-11 w-11 rounded-full bg-black/60 backdrop-blur grid place-items-center text-white border border-white/20"
                  aria-label={t("Close", "إغلاق")}>
                  <X className="h-5 w-5" />
                </button>
                {torchSupported && (
                  <button onClick={toggleTorch}
                    className="h-11 w-11 rounded-full bg-black/60 backdrop-blur grid place-items-center text-white border border-white/20"
                    aria-label={t("Flashlight", "الفلاش")}>
                    {torchOn ? <Flashlight className="h-5 w-5 text-yellow-400" /> : <FlashlightOff className="h-5 w-5" />}
                  </button>
                )}
              </div>

              {error && permission !== "granted" && (
                <div className="absolute inset-4 rounded-xl bg-background/95 backdrop-blur p-4 flex flex-col items-center justify-center text-center gap-3">
                  <Camera className="h-10 w-10 text-accent" />
                  <p className="text-sm text-foreground">{error}</p>
                  <button onClick={start} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-medium">
                    {t("Allow camera", "السماح بالكاميرا")}
                  </button>
                </div>
              )}
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-3 border-t">
              <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                <input type="checkbox" checked={autoCapture} onChange={(e) => setAutoCapture(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--accent))]" />
                {t("Auto-capture", "التقاط تلقائي")}
              </label>

              <button onClick={manualCapture}
                disabled={busy} aria-busy={busy}
                className={`relative h-16 w-16 rounded-full border-4 grid place-items-center shrink-0 transition ${
                  busy ? "border-muted-foreground/40 bg-muted/30 cursor-not-allowed" : "border-accent active:scale-95"
                }`}
                aria-label={t("Capture", "التقاط")}>
                {busy ? <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /> : <Camera className="h-6 w-6 text-accent" />}
              </button>

              {pages.length > 0 ? (
                <button onClick={() => setView("gallery")}
                  className="h-12 px-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center gap-1.5">
                  <Check className="h-4 w-4" />{t(`Finish (${pages.length})`, `إنهاء (${pages.length})`)}
                </button>
              ) : (
                <span className="w-[68px]" />
              )}
            </div>
          </>
        )}

        {view === "review" && rawCapture && (
          <div className="space-y-3">
            <div
              ref={reviewRef}
              className="relative bg-black aspect-[3/4] w-full overflow-hidden touch-none select-none"
              onPointerMove={onCornerMove}
              onPointerUp={onCornerUp}
              onPointerCancel={onCornerUp}
            >
              <img src={rawCapture} alt="captured" className="absolute inset-0 h-full w-full object-contain" />
              <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon
                  points={editQuad.map(p => `${p.x*100},${p.y*100}`).join(" ")}
                  fill="hsl(var(--accent) / 0.12)"
                  stroke="hsl(var(--accent))"
                  strokeWidth="0.4"
                />
              </svg>
              {corners.map(({ i }) => (
                <div
                  key={`c${i}`}
                  onPointerDown={onCornerDown(i)}
                  className="absolute h-6 w-6 -ml-3 -mt-3 rounded-full bg-white border-2 border-accent shadow-lg cursor-grab active:cursor-grabbing touch-none"
                  style={{ left: `${editQuad[i].x * 100}%`, top: `${editQuad[i].y * 100}%` }}
                />
              ))}
              {[0,1,2,3].map((a) => {
                const b = (a + 1) % 4;
                const mx = (editQuad[a].x + editQuad[b].x) / 2;
                const my = (editQuad[a].y + editQuad[b].y) / 2;
                const horizontal = a === 0 || a === 2;
                return (
                  <div
                    key={`e${a}`}
                    onPointerDown={onCornerDown(4 + a)}
                    className={`absolute rounded-full bg-white border-2 border-accent shadow-md cursor-grab active:cursor-grabbing touch-none ${
                      horizontal ? "h-2 w-8 -ml-4 -mt-1" : "h-8 w-2 -ml-1 -mt-4"
                    }`}
                    style={{ left: `${mx * 100}%`, top: `${my * 100}%` }}
                  />
                );
              })}

              {reviewBusy && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <p className="text-sm font-medium">{t("Cropping & enhancing…", "جارٍ القص والتحسين…")}</p>
                </div>
              )}
            </div>
            <p className="px-4 text-[11px] text-center text-muted-foreground">
              {t("Drag the corners or edges to fit the document", "اسحب الزوايا أو الحواف لمطابقة المستند")}
            </p>
            <div className="px-4 grid grid-cols-4 gap-2">
              <button onClick={retake} disabled={reviewBusy}
                className="h-14 rounded-xl bg-secondary text-secondary-foreground font-medium flex flex-col items-center justify-center gap-1 text-[11px] disabled:opacity-50">
                <X className="h-4 w-4" />{t("Retake", "إعادة")}
              </button>
              <button
                onClick={() => setEditQuad((q) => [q[1], q[2], q[3], q[0]] as Quad)}
                disabled={reviewBusy}
                className="h-14 rounded-xl bg-secondary text-secondary-foreground font-medium flex flex-col items-center justify-center gap-1 text-[11px] disabled:opacity-50">
                <RotateCw className="h-4 w-4 -scale-x-100" />{t("Left", "اليسار")}
              </button>
              <button
                onClick={() => setEditQuad((q) => [q[3], q[0], q[1], q[2]] as Quad)}
                disabled={reviewBusy}
                className="h-14 rounded-xl bg-secondary text-secondary-foreground font-medium flex flex-col items-center justify-center gap-1 text-[11px] disabled:opacity-50">
                <RotateCw className="h-4 w-4" />{t("Right", "الأيمن")}
              </button>
              <button
                onClick={() => setEditQuad([
                  { x: 0.02, y: 0.02 }, { x: 0.98, y: 0.02 }, { x: 0.98, y: 0.98 }, { x: 0.02, y: 0.98 },
                ])}
                disabled={reviewBusy}
                className="h-14 rounded-xl bg-secondary text-secondary-foreground font-medium flex flex-col items-center justify-center gap-1 text-[11px] disabled:opacity-50">
                <ScanLine className="h-4 w-4" />{t("All", "الكل")}
              </button>
            </div>
            <div className="px-4 pb-4">
              <button onClick={confirmCrop} disabled={reviewBusy}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                <Check className="h-4 w-4" />{t("Keep scan", "اعتماد المسح")}
              </button>
            </div>
          </div>
        )}

        {view === "gallery" && (
          <div className="space-y-3">
            <div className="px-4 text-xs text-muted-foreground text-center">
              {pages.length > 0 && t(`Page ${1} of ${pages.length}`, `صفحة 1 من ${pages.length}`)}
            </div>
            <div className="px-4 max-h-[55vh] overflow-y-auto space-y-3">
              {pages.map((p, i) => (
                <div key={p.id} className="rounded-xl border border-border bg-card p-2">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t(`Page ${i+1} of ${pages.length}`, `صفحة ${i+1} من ${pages.length}`)}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => rotatePage(p.id)} className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted" aria-label="تدوير الصفحة" title="تدوير">
                        <RotateCw className="h-4 w-4" />
                      </button>
                      <button onClick={() => removePage(p.id)} className="h-10 w-10 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive" aria-label="حذف الصفحة" title="حذف">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-black rounded-lg overflow-hidden grid place-items-center aspect-[3/4]">
                    <img src={p.dataUrl} alt={`page ${i+1}`} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {(["original","enhance","gray","bw"] as Filter[]).map((f) => (
                      <button key={f} onClick={() => updateActiveFilter(p.id, f)}
                        className={`h-8 rounded-md text-[11px] font-medium border ${p.filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border"}`}>
                        {f === "original" ? t("Original","أصلي") : f === "enhance" ? t("Enhance","تحسين") : f === "gray" ? t("Gray","رمادي") : t("B&W","أبيض/أسود")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 pb-4 grid grid-cols-3 gap-2">
              <button onClick={addAnother}
                className="h-11 rounded-xl bg-secondary text-secondary-foreground font-medium flex items-center justify-center gap-1.5 text-sm">
                <Plus className="h-4 w-4" />{t("Add page", "صفحة")}
              </button>
              <button onClick={sharePdf} disabled={!pages.length}
                className="h-11 rounded-xl bg-accent text-accent-foreground font-medium flex items-center justify-center gap-1.5 text-sm disabled:opacity-50">
                <Share2 className="h-4 w-4" />{t("Share", "مشاركة")}
              </button>
              <button onClick={savePdf} disabled={!pages.length}
                className="h-11 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-1.5 text-sm disabled:opacity-50">
                <FileDown className="h-4 w-4" />{t("Save", "حفظ")}
              </button>
            </div>
            <p className="px-4 pb-4 text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
              <Wand2 className="h-3 w-3" /> {t("Auto-enhanced for clean white background.", "تم تحسين الصور تلقائياً لخلفية بيضاء واضحة.")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
