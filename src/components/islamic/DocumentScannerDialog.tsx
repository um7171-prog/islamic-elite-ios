import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Camera, Flashlight, FlashlightOff, X, Trash2, FileDown, Wand2, RotateCw,
  Loader2, Share2, Plus, Check, ScanLine, Image as ImageIcon, Crop,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { openNativeAppSettings, isIOSNativeApp } from "@/lib/platform";
import { uid } from "@/lib/id";
import {
  defaultQuad, detectDocumentQuad, isConvexQuad, quadOutputSize, warpToRect,
  type Pt, type Quad,
} from "@/lib/docScan";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Filter = "original" | "enhance" | "gray" | "bw";
type TorchTrack = MediaStreamTrack & { getCapabilities?: () => Record<string, unknown> };

interface ScanPage {
  id: string;
  dataUrl: string;        // processed
  croppedDataUrl: string; // after perspective crop, before filter
  rawDataUrl: string;     // original uncropped capture — needed to re-open the crop editor later
  quad: Quad;             // the quad used for this page's crop — re-crop starts from here
  filter: Filter;
  rotation: number;
}

// ---------- image helpers ----------
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image load failed"));
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

// ---------- perspective correction / detection (pure maths lives in lib/docScan) ----------
async function warpQuadToRect(srcDataUrl: string, quad: Quad, outW: number, outH: number): Promise<string> {
  const img = await loadImage(srcDataUrl);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const cx = c.getContext("2d")!;
  cx.drawImage(img, 0, 0);
  const src = cx.getImageData(0, 0, img.width, img.height);
  const res = warpToRect({ data: src.data, width: src.width, height: src.height }, quad, outW, outH);
  const out = document.createElement("canvas");
  out.width = outW; out.height = outH;
  const octx = out.getContext("2d")!;
  const outData = octx.createImageData(outW, outH);
  outData.data.set(res.data);
  octx.putImageData(outData, 0, 0);
  return out.toDataURL("image/jpeg", 0.92);
}

/** Detect the page in a CAPTURED photo (never the live preview). Null → caller falls back to the whole frame. */
async function detectInCapture(dataUrl: string): Promise<Quad | null> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, 240 / Math.max(img.width, img.height));
  const w = Math.max(16, Math.round(img.width * scale)), h = Math.max(16, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h);
  return detectDocumentQuad({ data: d.data, width: d.width, height: d.height });
}

// ---------- component ----------
export function DocumentScannerDialog({ open, onOpenChange }: Props) {
  const { t, dir } = useLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [permission, setPermission] = useState<"idle"|"prompt"|"granted"|"denied">("idle");
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [view, setView] = useState<"camera"|"review"|"gallery">("camera");

  // captured raw + working quad for review screen
  const [rawCapture, setRawCapture] = useState<string | null>(null);
  const [editQuad, setEditQuad] = useState<Quad>(() => defaultQuad());
  // "auto" = corners came from edge detection on the captured photo; "manual" =
  // nothing was found, the whole image is the starting rectangle.
  const [detectInfo, setDetectInfo] = useState<"auto" | "manual">("manual");
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  // Set when the review screen was opened to re-crop an already-saved page
  // (via the gallery's "Edit crop" action) rather than a fresh capture —
  // confirmCrop() replaces that page in place instead of appending a new one.
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  // -------- camera lifecycle --------
  // Bumped every time the dialog opens/closes. A pending getUserMedia() call
  // that resolves after the generation moved on is stale and must be torn
  // down immediately — otherwise closing the dialog mid-permission-prompt
  // leaks the camera stream (it stays lit with nothing to stop it).
  const genRef = useRef(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const myGen = ++genRef.current;
    setError(null); setTorchOn(false); setPermission("prompt");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("Camera not supported", "الكاميرا غير مدعومة"));
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2160 }, height: { ideal: 3840 }, aspectRatio: { ideal: 3/4 } },
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
      setPages([]); setView("camera"); setRawCapture(null); setEditingPageId(null);
      start();
    }
    return () => { genRef.current++; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Defensive re-attach: if start() resolved before the "camera" view's
  // <video> element had (re-)mounted — e.g. reopening the dialog right after
  // it was left on the gallery/review view, where no <video> exists — the
  // live stream would otherwise never reach the screen (camera light stays
  // on, preview stays black). Whenever the camera view becomes active with a
  // stream already acquired but not yet attached, bind it here.
  useEffect(() => {
    if (view === "camera" && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [view]);

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

  // Shutter: take the still, THEN analyse it (never the live preview). Detection
  // proposes the four corners; if it finds nothing the whole image is the
  // starting rectangle and the user places the corners by hand.
  const openReview = async (raw: string) => {
    setAnalyzing(true);
    setEditingPageId(null);
    try {
      const q = await detectInCapture(raw).catch(() => null);
      setDetectInfo(q ? "auto" : "manual");
      setEditQuad(q ?? defaultQuad());
    } finally {
      setRawCapture(raw);
      setView("review");
      setAnalyzing(false);
    }
  };

  const manualCapture = async () => {
    if (busy || analyzing) return;
    const raw = grabFrame();
    if (!raw) {
      toast.error(t("Camera not ready. Try again.", "الكاميرا غير جاهزة. حاول مرة أخرى."));
      return;
    }
    await openReview(raw);
  };

  // -------- review screen: four independent corner handles + magnifier --------
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const reviewImgRef = useRef<HTMLImageElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const dragIdx = useRef<number | null>(null);
  const [dragging, setDragging] = useState<{ i: number; x: number; y: number } | null>(null);

  const drawLoupe = (nx: number, ny: number) => {
    const cv = loupeRef.current, img = reviewImgRef.current;
    if (!cv || !img || !img.naturalWidth) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const size = cv.width;
    const zoom = 3;
    const span = size / zoom; // source px shown
    const scale = img.naturalWidth / (img.clientWidth || img.naturalWidth);
    const sx = nx * img.naturalWidth - (span * scale) / 2;
    const sy = ny * img.naturalHeight - (span * scale) / 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, span * scale, span * scale, 0, 0, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.strokeStyle = "hsl(45 90% 55%)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(size / 2, size / 2, 6, 0, Math.PI * 2); ctx.stroke();
  };

  const onCornerDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragIdx.current = i;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDragging({ i, x: editQuad[i].x, y: editQuad[i].y });
    requestAnimationFrame(() => drawLoupe(editQuad[i].x, editQuad[i].y));
  };
  const onCornerMove = (e: React.PointerEvent) => {
    if (dragIdx.current == null || !reviewRef.current) return;
    const r = reviewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const idx = dragIdx.current;
    setEditQuad((q) => {
      const n = [...q] as Quad;
      n[idx] = { x, y };
      return n;
    });
    setDragging({ i: idx, x, y });
    drawLoupe(x, y);
  };
  const onCornerUp = () => { dragIdx.current = null; setDragging(null); };

  const confirmCrop = async () => {
    if (!rawCapture) return;
    if (!isConvexQuad(editQuad)) {
      toast.error(t("The corners cross each other — drag them back to the page corners.", "الزوايا متقاطعة — اسحبها إلى زوايا المستند."));
      return;
    }
    setReviewBusy(true);
    try {
      const img = await loadImage(rawCapture);
      const { w: outW, h: outH } = quadOutputSize(editQuad, img.width, img.height);
      const cropped = await warpQuadToRect(rawCapture, editQuad, outW, outH);
      if (editingPageId) {
        // Re-crop of an existing page: keep its previously chosen filter/rotation.
        const existing = pages.find((p) => p.id === editingPageId);
        const filter = existing?.filter ?? "enhance";
        const rotation = existing?.rotation ?? 0;
        const processed = await applyFilter(cropped, filter, rotation);
        setPages((p) => p.map((pg) => pg.id === editingPageId
          ? { ...pg, dataUrl: processed, croppedDataUrl: cropped, rawDataUrl: rawCapture, quad: editQuad, filter, rotation }
          : pg));
        setEditingPageId(null);
      } else {
        const processed = await applyFilter(cropped, "enhance", 0);
        const page: ScanPage = {
          id: uid(),
          dataUrl: processed,
          croppedDataUrl: cropped,
          rawDataUrl: rawCapture,
          quad: editQuad,
          filter: "enhance",
          rotation: 0,
        };
        setPages((p) => [...p, page]);
      }
      setRawCapture(null);
      setView("gallery");
    } catch {
      toast.error(t("Failed to process the cropped image. Try again.", "تعذّرت معالجة الصورة المقصوصة. حاول مرة أخرى."));
    } finally { setReviewBusy(false); }
  };

  const retake = () => {
    setRawCapture(null);
    if (editingPageId) {
      // Re-crop was canceled — nothing to retake a photo of, just go back.
      setEditingPageId(null);
      setView("gallery");
    } else {
      setView("camera");
    }
  };

  // A picked (non-camera) image goes through the same analyse → adjust → correct flow.
  const openReviewForImage = (rawDataUrl: string) => { void openReview(rawDataUrl); };

  const handleLibraryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => openReviewForImage(reader.result as string);
    reader.onerror = () => toast.error(t("Failed to read the selected image.", "تعذّر قراءة الصورة المختارة."));
    reader.readAsDataURL(file);
  };

  // -------- gallery actions --------
  const addAnother = () => setView("camera");

  // Re-opens the crop editor for an already-saved page, starting from the
  // quad and raw capture it was created with, instead of forcing a rescan.
  const editPageCrop = (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    setEditingPageId(id);
    setRawCapture(page.rawDataUrl);
    setEditQuad(page.quad);
    setDetectInfo("manual");
    setView("review");
  };

  const updateActiveFilter = async (id: string, filter: Filter) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    try {
      const dataUrl = await applyFilter(page.croppedDataUrl, filter, page.rotation);
      setPages((arr) => arr.map((p) => p.id === id ? { ...p, filter, dataUrl } : p));
    } catch {
      toast.error(t("Failed to apply the filter. Try again.", "تعذّر تطبيق الفلتر. حاول مرة أخرى."));
    }
  };
  const rotatePage = async (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    const rotation = (page.rotation + 90) % 360;
    try {
      const dataUrl = await applyFilter(page.croppedDataUrl, page.filter, rotation);
      setPages((arr) => arr.map((p) => p.id === id ? { ...p, rotation, dataUrl } : p));
    } catch {
      toast.error(t("Failed to rotate the page. Try again.", "تعذّر تدوير الصفحة. حاول مرة أخرى."));
    }
  };
  const removePage = (id: string) => {
    const remaining = pages.filter((p) => p.id !== id);
    setPages(remaining);
    // Nothing left to review/export — return to the camera instead of
    // leaving an empty gallery with disabled Save/Share buttons.
    if (remaining.length === 0) setView("camera");
  };

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

  // A plain <a download> click is a silent no-op inside a Capacitor iOS
  // WKWebView — there is no OS download manager to catch it, so the previous
  // version of this function showed "PDF downloaded" on iOS even though
  // nothing actually reached Files/Photos. On iOS native this now opens the
  // real Share Sheet instead (the only reliable way off the WKWebView), and
  // only claims "downloaded" on web where the <a download> path is real.
  const savePdf = async (): Promise<boolean> => {
    if (!pages.length) return false;
    try {
      const blob = await buildPdf();
      const filename = `scan-${Date.now()}.pdf`;
      if (isIOSNativeApp()) {
        const file = new File([blob], filename, { type: "application/pdf" });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (nav.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: t("Scanned document", "مستند ممسوح") });
          toast.success(t("Choose where to save the PDF", "اختر مكان حفظ PDF"));
          return true;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("PDF downloaded", "تم تنزيل PDF"));
      return true;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return false; // user cancelled the share sheet
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
            {/* Plain live preview: no outlines, no auto-crop, no auto-capture.
                The page is analysed only after the shutter is pressed. */}
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-black" data-testid="scan-camera">
              <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />

              <div className="pointer-events-none absolute inset-x-0 top-14 flex items-center justify-center gap-1.5 px-4 text-center text-body-sm font-medium text-white/90 drop-shadow">
                <ScanLine className="h-4 w-4 shrink-0" />
                {t("Point the camera at the document, then tap capture", "وجّه الكاميرا نحو المستند ثم اضغط التقاط")}
              </div>

              {pages.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
                  <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground shadow">
                    {t(`${pages.length} Page${pages.length > 1 ? "s" : ""} Scanned`, `${pages.length} صفحة ممسوحة`)}
                  </span>
                </div>
              )}

              {(busy || analyzing) && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white backdrop-blur-sm" data-testid="scan-analyzing">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <p className="text-sm font-medium">{analyzing ? t("Detecting the page…", "جارٍ اكتشاف المستند…") : t("Processing…", "جارٍ المعالجة…")}</p>
                </div>
              )}

              {/* z-10: above the permission/error card so Close and the library
                  button stay usable when the camera fails. */}
              <div className="absolute inset-x-0 top-0 z-10 flex justify-between p-3">
                <button onClick={() => { stop(); onOpenChange(false); }}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur"
                  aria-label={t("Close", "إغلاق")}>
                  <X className="h-5 w-5" />
                </button>
                <div className="flex gap-2">
                  <input
                    ref={libraryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-testid="scan-library-input"
                    onChange={handleLibraryFile}
                  />
                  <button onClick={() => libraryInputRef.current?.click()}
                    className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur"
                    aria-label={t("Choose from library", "اختيار من الاستديو")}
                    title={t("Choose from library", "اختيار من الاستديو")}>
                    <ImageIcon className="h-5 w-5" />
                  </button>
                  {torchSupported && (
                    <button onClick={toggleTorch}
                      className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur"
                      aria-label={t("Flashlight", "الفلاش")}>
                      {torchOn ? <Flashlight className="h-5 w-5 text-yellow-400" /> : <FlashlightOff className="h-5 w-5" />}
                    </button>
                  )}
                </div>
              </div>

              {error && permission !== "granted" && (
                <div className="absolute inset-4 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/95 p-4 text-center backdrop-blur">
                  <Camera className="h-10 w-10 text-accent" />
                  <p className="text-sm text-foreground">{error}</p>
                  {permission === "denied" ? (
                    <button onClick={() => void openNativeAppSettings()} className="h-10 rounded-xl bg-primary px-4 font-medium text-primary-foreground">
                      {t("Open Settings", "فتح الإعدادات")}
                    </button>
                  ) : (
                    <button onClick={start} className="h-10 rounded-xl bg-primary px-4 font-medium text-primary-foreground">
                      {t("Allow camera", "السماح بالكاميرا")}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
              <span className="w-[68px]" />
              <button onClick={manualCapture}
                disabled={busy || analyzing} aria-busy={busy || analyzing}
                className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 transition ${
                  busy || analyzing ? "cursor-not-allowed border-muted-foreground/40 bg-muted/30" : "border-accent active:scale-95"
                }`}
                aria-label={t("Capture", "التقاط")}>
                {busy || analyzing ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Camera className="h-6 w-6 text-accent" />}
              </button>
              {pages.length > 0 ? (
                <button onClick={() => setView("gallery")}
                  className="flex h-12 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground">
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
            {/* The wrapper is EXACTLY the image's box, so the normalised corner
                coordinates (0..1 of the image) map 1:1 onto the handles — no
                letterboxing offset. */}
            <div className="flex justify-center bg-black">
              <div
                ref={reviewRef}
                data-testid="scan-review"
                data-detected={detectInfo}
                className="relative max-h-[62vh] touch-none select-none"
                style={{ maxWidth: "100%" }}
                onPointerMove={onCornerMove}
                onPointerUp={onCornerUp}
                onPointerCancel={onCornerUp}
              >
                <img
                  ref={reviewImgRef}
                  src={rawCapture}
                  alt={t("Captured document", "المستند الملتقط")}
                  draggable={false}
                  data-testid="scan-raw"
                  className="block max-h-[62vh] w-auto max-w-full select-none"
                />
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polygon
                    data-testid="scan-polygon"
                    points={editQuad.map((p) => `${(p.x * 100).toFixed(3)},${(p.y * 100).toFixed(3)}`).join(" ")}
                    fill="hsl(var(--accent) / 0.14)"
                    stroke="hsl(var(--accent))"
                    strokeWidth="0.5"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {(["tl", "tr", "br", "bl"] as const).map((name, i) => (
                  <div
                    key={name}
                    data-corner={name}
                    data-x={editQuad[i].x.toFixed(4)}
                    data-y={editQuad[i].y.toFixed(4)}
                    role="slider"
                    aria-label={t(`Corner ${i + 1}`, `الزاوية ${i + 1}`)}
                    onPointerDown={onCornerDown(i)}
                    className="absolute grid h-11 w-11 -ml-[22px] -mt-[22px] cursor-grab touch-none place-items-center active:cursor-grabbing"
                    style={{ left: `${editQuad[i].x * 100}%`, top: `${editQuad[i].y * 100}%` }}
                  >
                    <span className="h-6 w-6 rounded-full border-2 border-accent bg-white shadow-lg" />
                  </div>
                ))}

                {dragging && (
                  <canvas
                    ref={loupeRef}
                    width={112}
                    height={112}
                    data-testid="scan-loupe"
                    className="pointer-events-none absolute z-10 h-28 w-28 rounded-full border-2 border-white shadow-2xl"
                    style={{
                      left: `${Math.min(88, Math.max(12, dragging.x * 100))}%`,
                      top: dragging.y > 0.28 ? `calc(${dragging.y * 100}% - 96px)` : `calc(${dragging.y * 100}% + 64px)`,
                      transform: "translateX(-50%)",
                    }}
                  />
                )}

                {reviewBusy && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white backdrop-blur-sm">
                    <Loader2 className="h-8 w-8 animate-spin text-accent" />
                    <p className="text-sm font-medium">{t("Straightening the page…", "جارٍ تصحيح المنظور…")}</p>
                  </div>
                )}
              </div>
            </div>

            <p className="px-4 text-center text-body-sm text-muted-foreground" data-testid="scan-hint">
              {detectInfo === "auto"
                ? t("Page found. Drag any corner to fine-tune it.", "تم العثور على المستند. اسحب أي زاوية لضبطها.")
                : t("Drag the four corners to the page corners.", "اسحب الزوايا الأربع إلى زوايا المستند.")}
            </p>
            <div className="grid grid-cols-2 gap-2 px-4">
              <button onClick={retake} disabled={reviewBusy}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground disabled:opacity-50">
                <X className="h-4 w-4" />{editingPageId ? t("Cancel", "إلغاء") : t("Retake", "إعادة")}
              </button>
              <button
                onClick={() => { setEditQuad(defaultQuad()); setDetectInfo("manual"); }}
                disabled={reviewBusy}
                data-testid="scan-reset"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground disabled:opacity-50">
                <ScanLine className="h-4 w-4" />{t("Whole image", "الصورة كاملة")}
              </button>
            </div>
            <div className="px-4 pb-4">
              <button onClick={confirmCrop} disabled={reviewBusy}
                data-testid="scan-done"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-50">
                <Check className="h-4 w-4" />{editingPageId ? t("Save changes", "حفظ التعديل") : t("Done", "تم")}
              </button>
            </div>
          </div>
        )}

        {view === "gallery" && (
          <div className="space-y-3">
            <div className="px-4 text-xs text-muted-foreground text-center">
              {pages.length > 0 &&
                t(
                  pages.length === 1 ? "1 page scanned" : `${pages.length} pages scanned`,
                  pages.length === 1 ? "تم مسح صفحة واحدة" : `تم مسح ${pages.length} صفحات`,
                )}
            </div>
            <div className="px-4 max-h-[55vh] overflow-y-auto space-y-3">
              {pages.map((p, i) => (
                <div key={p.id} className="rounded-xl border border-border bg-card p-2">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t(`Page ${i+1} of ${pages.length}`, `صفحة ${i+1} من ${pages.length}`)}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => editPageCrop(p.id)} className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted" aria-label={t("Edit crop", "تعديل القص")} title={t("Edit crop", "تعديل القص")}>
                        <Crop className="h-4 w-4" />
                      </button>
                      <button onClick={() => rotatePage(p.id)} className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted" aria-label={t("Rotate page", "تدوير الصفحة")} title={t("Rotate page", "تدوير الصفحة")}>
                        <RotateCw className="h-4 w-4" />
                      </button>
                      <button onClick={() => removePage(p.id)} className="h-10 w-10 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive" aria-label={t("Delete page", "حذف الصفحة")} title={t("Delete page", "حذف الصفحة")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-black rounded-lg overflow-hidden grid place-items-center aspect-[3/4]">
                    <img src={p.dataUrl} alt={t(`Page ${i+1}`, `صفحة ${i+1}`)} data-testid="scan-processed" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {(["original","enhance","gray","bw"] as Filter[]).map((f) => (
                      <button key={f} onClick={() => updateActiveFilter(p.id, f)}
                        className={`h-8 rounded-md text-xs font-medium border ${p.filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border"}`}>
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
                <Plus className="h-4 w-4" />{t("Add page", "إضافة صفحة")}
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
            <p className="px-4 pb-4 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <Wand2 className="h-3 w-3" /> {t("Auto-enhanced for clean white background.", "تم تحسين الصور تلقائياً لخلفية بيضاء واضحة.")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
