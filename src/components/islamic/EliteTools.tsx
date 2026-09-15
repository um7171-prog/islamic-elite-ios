import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import { jsPDF } from "jspdf";
import { toGregorian, toHijri } from "hijri-converter";
import mammoth from "mammoth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { toast } from "@/hooks/use-toast";
import { DownloadManager } from "./DownloadManager";
import { AdSlot } from "@/components/ads/AdSlot";
import { isIOSNativeApp } from "@/lib/platform";

// ---------- helpers ----------
const imageMimes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp", "image/svg+xml"]);

function safeName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "elite-file";
}
type Result = { name: string; blob: Blob };
let captureSink: Result[] | null = null;
function setCapture(sink: Result[] | null) { captureSink = sink; }

/**
 * A plain `<a download>` click is silently a no-op inside a Capacitor iOS
 * WKWebView — there is no OS download manager to catch it, so the user sees
 * "conversion done" but nothing ever reaches Files/Photos/Mail. The only
 * reliable way to get a produced file OUT of the app on iOS is the native
 * Share Sheet (`navigator.share` with a `File`, which WKWebView on iOS 15+
 * supports). On web this stays the ordinary `<a download>` link.
 */
async function saveOrShareBlob(blob: Blob, filename: string): Promise<void> {
  if (isIOSNativeApp()) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[] }) => Promise<void> };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share!({ files: [file] });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // user cancelled the share sheet
      console.info("[convert] native share failed, falling back to <a download>", e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadBlob(blob: Blob, filename: string) {
  if (captureSink) { captureSink.push({ name: filename, blob }); return; }
  void saveOrShareBlob(blob, filename);
}
async function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return img;
}
async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, q = 0.96): Promise<Blob> {
  return await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("encode failed")), mime, q));
}
function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = "high";
  return { c, ctx };
}

// ---------- conversion implementations ----------
async function imagesToPdf(files: File[]) {
  if (!files.length) return;
  const first = await fileToImage(files[0]);
  const orientation = first.width >= first.height ? "l" : "p";
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 24;
  const place = (img: HTMLImageElement, file: File) => {
    const ratio = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
    const w = img.width * ratio, h = img.height * ratio;
    const isPng = file.type.includes("png");
    doc.addImage(img, isPng ? "PNG" : "JPEG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "SLOW");
  };
  place(first, files[0]);
  for (let i = 1; i < files.length; i++) {
    const img = await fileToImage(files[i]);
    doc.addPage("a4", img.width >= img.height ? "l" : "p");
    place(img, files[i]);
  }
  const baseName = files.length === 1 ? safeName(files[0].name) : `images-${files.length}`;
  downloadBlob(doc.output("blob"), `${baseName}.pdf`);
}
async function imageToPdf(file: File) { return imagesToPdf([file]); }

async function mergePdfs(files: File[]) {
  if (!files.length) return;
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const bytes = await out.save();
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  downloadBlob(blob, `merged-${files.length}.pdf`);
}

async function compressImage(file: File, quality = 0.85, maxDim = 2560) {
  const img = await fileToImage(file);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const { c: canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  downloadBlob(blob, `${safeName(file.name)}-compressed.jpg`);
}

async function compressPdf(file: File) {
  const { PDFDocument } = await import("pdf-lib");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  const saved = await out.save({ useObjectStreams: true });
  const blob = new Blob([saved.buffer as ArrayBuffer], { type: "application/pdf" });
  downloadBlob(blob, `${safeName(file.name)}-compressed.pdf`);
}

async function docxToPdf(file: File) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 48;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  const lines = doc.splitTextToSize(result.value || " ", pw - margin * 2);
  let y = margin;
  for (const line of lines) {
    if (y > ph - margin) { doc.addPage(); y = margin; }
    doc.text(String(line), margin, y); y += 14;
  }
  downloadBlob(doc.output("blob"), `${safeName(file.name)}.pdf`);
}

async function textToPdf(file: File) {
  const text = await file.text();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 48;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  const lines = doc.splitTextToSize(text || " ", pw - margin * 2);
  let y = margin;
  for (const line of lines) {
    if (y > ph - margin) { doc.addPage(); y = margin; }
    doc.text(String(line), margin, y); y += 14;
  }
  downloadBlob(doc.output("blob"), `${safeName(file.name)}.pdf`);
}

async function imageConvert(file: File, targetMime: "image/png" | "image/jpeg" | "image/webp") {
  const img = await fileToImage(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const { c: canvas, ctx } = makeCanvas(w, h);
  if (targetMime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(img, 0, 0, w, h);
  const q = targetMime === "image/png" ? 1 : 0.96;
  const blob = await canvasToBlob(canvas, targetMime, q);
  const ext = targetMime.split("/")[1].replace("jpeg", "jpg");
  downloadBlob(blob, `${safeName(file.name)}.${ext}`);
}

async function svgConvert(file: File, targetMime: "image/png" | "image/jpeg") {
  const svgText = await file.text();
  const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
  const img = await fileToImage(svgBlob);
  // Render SVG at higher resolution for crisp output
  const baseW = img.naturalWidth || 1024, baseH = img.naturalHeight || 1024;
  const scale = Math.max(2, Math.min(4, 2048 / Math.max(baseW, baseH)));
  const w = Math.round(baseW * scale), h = Math.round(baseH * scale);
  const { c: canvas, ctx } = makeCanvas(w, h);
  if (targetMime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, targetMime, targetMime === "image/jpeg" ? 0.96 : 1);
  const ext = targetMime.split("/")[1].replace("jpeg", "jpg");
  downloadBlob(blob, `${safeName(file.name)}.${ext}`);
}

async function pdfToImages(file: File, mime: "image/jpeg" | "image/png") {
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const base = safeName(file.name);
  // Higher DPI (scale 3 ≈ 216 dpi) for sharper output
  const scale = 3;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const { c: canvas, ctx } = makeCanvas(viewport.width, viewport.height);
    if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvasToBlob(canvas, mime, mime === "image/jpeg" ? 0.96 : 1);
    downloadBlob(blob, `${base}-p${i}.${mime === "image/jpeg" ? "jpg" : "png"}`);
  }
}

// ---------- catalog ----------
type Conversion = {
  id: string;
  labelEn: string;
  labelAr: string;
  accept: string;
  badge: string;
  badgeBg: string;
  multi?: boolean;
  run: (file: File) => Promise<void>;
  runMany?: (files: File[]) => Promise<void>;
};

const CONVERSIONS: Conversion[] = [
  { id: "img-to-pdf", labelEn: "Images → PDF", labelAr: "صور إلى PDF", accept: "image/*", badge: "PDF", badgeBg: "#E53935", multi: true, run: (f) => imageToPdf(f), runMany: (files) => imagesToPdf(files) },
  { id: "merge-pdf", labelEn: "Merge PDFs", labelAr: "دمج ملفات PDF", accept: "application/pdf", badge: "PDF", badgeBg: "#2E7D32", multi: true, run: (f) => mergePdfs([f]), runMany: (files) => mergePdfs(files) },
  { id: "compress-img", labelEn: "Compress Image", labelAr: "ضغط الصور", accept: "image/*", badge: "ZIP", badgeBg: "#FB8C00", multi: true, run: (f) => compressImage(f) },
  { id: "compress-pdf", labelEn: "Compress PDF", labelAr: "ضغط PDF", accept: "application/pdf", badge: "ZIP", badgeBg: "#FB8C00", multi: true, run: (f) => compressPdf(f) },
  { id: "word-to-pdf", labelEn: "WORD → PDF", labelAr: "WORD إلى PDF", accept: ".docx", badge: "PDF", badgeBg: "#E53935", run: (f) => docxToPdf(f) },
  { id: "txt-to-pdf", labelEn: "Text → PDF", labelAr: "نص إلى PDF", accept: ".txt,.md,.csv,.json,text/*", badge: "PDF", badgeBg: "#E53935", run: (f) => textToPdf(f) },
  { id: "pdf-to-jpg", labelEn: "PDF → JPG", labelAr: "PDF إلى JPG", accept: "application/pdf", badge: "JPG", badgeBg: "#0097A7", run: (f) => pdfToImages(f, "image/jpeg") },
  { id: "pdf-to-png", labelEn: "PDF → PNG", labelAr: "PDF إلى PNG", accept: "application/pdf", badge: "PNG", badgeBg: "#0097A7", run: (f) => pdfToImages(f, "image/png") },
  { id: "png-to-jpg", labelEn: "PNG → JPG", labelAr: "PNG إلى JPG", accept: "image/png", badge: "JPG", badgeBg: "#0097A7", multi: true, run: (f) => imageConvert(f, "image/jpeg") },
  { id: "jpg-to-png", labelEn: "JPG → PNG", labelAr: "JPG إلى PNG", accept: "image/jpeg", badge: "PNG", badgeBg: "#0097A7", multi: true, run: (f) => imageConvert(f, "image/png") },
  { id: "webp-to-png", labelEn: "WEBP → PNG", labelAr: "WEBP إلى PNG", accept: "image/webp", badge: "PNG", badgeBg: "#0097A7", multi: true, run: (f) => imageConvert(f, "image/png") },
  { id: "webp-to-jpg", labelEn: "WEBP → JPG", labelAr: "WEBP إلى JPG", accept: "image/webp", badge: "JPG", badgeBg: "#0097A7", multi: true, run: (f) => imageConvert(f, "image/jpeg") },
  { id: "png-to-webp", labelEn: "PNG → WEBP", labelAr: "PNG إلى WEBP", accept: "image/png", badge: "WEBP", badgeBg: "#6D4C41", multi: true, run: (f) => imageConvert(f, "image/webp") },
  { id: "jpg-to-webp", labelEn: "JPG → WEBP", labelAr: "JPG إلى WEBP", accept: "image/jpeg", badge: "WEBP", badgeBg: "#6D4C41", multi: true, run: (f) => imageConvert(f, "image/webp") },
  { id: "svg-to-png", labelEn: "SVG → PNG", labelAr: "SVG إلى PNG", accept: "image/svg+xml,.svg", badge: "PNG", badgeBg: "#0097A7", run: (f) => svgConvert(f, "image/png") },
  { id: "svg-to-jpg", labelEn: "SVG → JPG", labelAr: "SVG إلى JPG", accept: "image/svg+xml,.svg", badge: "JPG", badgeBg: "#0097A7", run: (f) => svgConvert(f, "image/jpeg") },
];

// ---------- card icon ----------
function FileBadge({ label, color }: { label: string; color: string }) {
  return (
    <div className="relative h-12 w-10 shrink-0 grid place-items-end pb-1.5 rounded-md text-[10px] font-bold text-white shadow-md"
         style={{ background: color }}>
      <span className="absolute top-0 right-0 h-3 w-3 bg-white/30 rounded-bl-md" />
      <span className="w-full text-center leading-none">{label}</span>
    </div>
  );
}

// ---------- runner dialog ----------
function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) {
    return (
      <div className="h-full w-full grid place-items-center bg-secondary/60 text-foreground/40">
        <FileText className="h-6 w-6" />
      </div>
    );
  }
  return <img src={url} alt={file.name} className="h-full w-full object-cover" />;
}

function ConversionDialog({ conv, onClose }: { conv: Conversion | null; onClose: () => void }) {
  const { t, dir, lang } = useLocale();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const reset = () => { setFiles([]); setBusy(false); setResults([]); };
  const isMulti = !!conv?.multi;
  const canShare = typeof navigator !== "undefined" && !!(navigator as any).canShare;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    setFiles((prev) => isMulti ? [...prev, ...list] : list.slice(0, 1));
    e.target.value = "";
  };

  const removeAt = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const run = async () => {
    if (!files.length || !conv) return;
    setBusy(true);
    const sink: Result[] = [];
    setCapture(sink);
    try {
      if (isMulti && conv.runMany) {
        await conv.runMany(files);
      } else {
        for (const f of files) await conv.run(f);
      }
      setResults(sink);
      toast({
        title: t("Done", "تم"),
        description: t(`${sink.length} file(s) ready.`, `${sink.length} ملف جاهز.`),
      });
    } catch (e) {
      toast({ title: t("Conversion failed", "تعذر التحويل"), description: String((e as Error)?.message || e) });
    } finally {
      setCapture(null);
      setBusy(false);
    }
  };

  const downloadOne = (r: Result) => { void saveOrShareBlob(r.blob, r.name); };
  const downloadAll = () => {
    // On iOS native, one share sheet for every file at once (matches
    // shareAll's behaviour) instead of popping the sheet once per file.
    if (isIOSNativeApp() && results.length > 1) { void shareAll(); return; }
    results.forEach((r) => void saveOrShareBlob(r.blob, r.name));
  };

  const shareOne = async (r: Result) => {
    try {
      const file = new File([r.blob], r.name, { type: r.blob.type });
      const data: any = { files: [file], title: r.name };
      if ((navigator as any).canShare?.(data)) {
        await (navigator as any).share(data);
      } else {
        downloadOne(r);
        toast({ title: t("Saved instead", "تم الحفظ بدلاً من المشاركة"), description: r.name });
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast({ title: t("Share failed", "فشلت المشاركة"), description: String((e as Error)?.message || e) });
      }
    }
  };

  const shareAll = async () => {
    try {
      const fls = results.map(r => new File([r.blob], r.name, { type: r.blob.type }));
      const data: any = { files: fls, title: t("Converted files", "ملفات محوّلة") };
      if ((navigator as any).canShare?.(data)) {
        await (navigator as any).share(data);
      } else {
        toast({ title: t("Share not supported", "المشاركة غير مدعومة"), description: t("Use download instead.", "استخدم التنزيل بدلاً من ذلك.") });
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast({ title: t("Share failed", "فشلت المشاركة"), description: String((e as Error)?.message || e) });
      }
    }
  };

  return (
    <Dialog open={!!conv} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent dir={dir} className="max-w-sm">
        {conv && (
          <>
            <DialogHeader>
              <DialogTitle className="text-elite-gold flex items-center gap-2">
                <FileBadge label={conv.badge} color={conv.badgeBg} />
                <span>{lang === "ar" ? conv.labelAr : conv.labelEn}</span>
              </DialogTitle>
            </DialogHeader>

            {results.length === 0 ? (
              <>
                <label className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/20 bg-secondary/40 px-4 py-4 text-center transition hover:bg-secondary/60">
                  <UploadCloud className="h-7 w-7 text-accent" />
                  <span className="text-sm font-semibold text-foreground">
                    {isMulti
                      ? t(files.length ? "Add more files" : "Choose files", files.length ? "إضافة المزيد" : "اختر الملفات")
                      : t(files[0] ? files[0].name : "Choose a file", files[0] ? files[0].name : "اختر ملفاً")}
                  </span>
                  <span className="text-[11px] text-foreground/55">{conv.accept.replace(/,/g, " · ")}</span>
                  <Input
                    type="file"
                    accept={conv.accept}
                    multiple={isMulti}
                    className="sr-only"
                    onChange={onPick}
                  />
                </label>

                {files.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-foreground/65">
                      <span>{t(`${files.length} selected`, `تم اختيار ${files.length} ${files.length === 1 ? "ملف" : "ملفات"}`)}</span>
                      <button type="button" onClick={reset} className="text-destructive hover:underline">
                        {t("Clear all", "مسح الكل")}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto pr-1">
                      {files.map((f, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-foreground/10 bg-background/40 group">
                          <ImagePreview file={f} />
                          <button
                            type="button"
                            onClick={() => removeAt(i)}
                            aria-label={t("Remove", "إزالة")}
                            className="absolute top-1 end-1 h-9 w-9 grid place-items-center rounded-full bg-black/70 text-white hover:bg-destructive transition opacity-90"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5 text-[9px] text-white truncate">
                            {f.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button onClick={run} disabled={!files.length || busy} className="w-full gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t("Convert", "تحويل")}
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-700/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-300">
                  {t(`${results.length} file(s) ready`, `${results.length} ملف جاهز`)}
                </div>

                <AdSlot slot="fileConverterResult" />
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background/40 px-2.5 py-2">
                      <FileText className="h-4 w-4 text-accent shrink-0" />
                      <span className="text-xs flex-1 truncate">{r.name}</span>
                      <span className="text-[10px] text-foreground/50 tabular-nums shrink-0">
                        {(r.blob.size / 1024).toFixed(0)} KB
                      </span>
                      <button onClick={() => shareOne(r)} className="p-1 rounded hover:bg-secondary text-foreground/70 hover:text-accent" aria-label={t("Share", "إرسال")} title={t("Share", "إرسال")}>
                        <UploadCloud className="h-3.5 w-3.5 rotate-180" />
                      </button>
                      <button onClick={() => downloadOne(r)} className="p-1 rounded hover:bg-secondary text-foreground/70 hover:text-accent" aria-label={t("Download", "تنزيل")} title={t("Download", "تنزيل")}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={downloadAll} className="gap-2">
                    <Download className="h-4 w-4" />
                    {t("Download", "تنزيل")}
                  </Button>
                  <Button onClick={shareAll} variant="outline" className="gap-2" disabled={!canShare}>
                    <UploadCloud className="h-4 w-4 rotate-180" />
                    {t("Share", "إرسال")}
                  </Button>
                </div>
                <Button onClick={reset} variant="ghost" size="sm" className="w-full">
                  {t("Convert another", "تحويل ملف آخر")}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- list ----------
export function FileConverter() {
  const { t, dir, lang } = useLocale();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Conversion | null>(null);
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        dir={dir}
        className="glass group flex w-full items-center gap-3 rounded-2xl p-4 text-start transition hover:border-accent/40"
      >
        <span className="h-12 w-12 shrink-0 rounded-2xl grid place-items-center bg-primary/15 text-primary group-hover:bg-primary/25">
          <FileText className="h-6 w-6" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-elite-gold">{t("File Converter", "محول الملفات")}</h3>
          <p className="text-[11px] text-foreground/60 truncate">
            {t("Tap to open · all formats inside.", "اضغط للفتح · كل الصيغ بالداخل.")}
          </p>
        </div>
        <Chevron className="h-5 w-5 text-foreground/40 group-hover:text-accent" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={dir} className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-elite-gold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t("File Converter", "محول الملفات")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto pr-1 -mr-1">
            {CONVERSIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive(c)}
                className="group flex w-full items-center gap-3 rounded-xl border border-foreground/10 bg-background/40 px-3 py-2.5 transition hover:border-accent/40 hover:bg-background/70"
              >
                <Chevron className="h-4 w-4 text-foreground/40 group-hover:text-accent" />
                <span className="flex-1 text-start text-sm font-semibold text-foreground">
                  {lang === "ar" ? c.labelAr : c.labelEn}
                </span>
                <FileBadge label={c.badge} color={c.badgeBg} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ConversionDialog conv={active} onClose={() => setActive(null)} />
    </>
  );
}

// ---------- date converter ----------
function pad(value: number) { return String(value).padStart(2, "0"); }
function isValidGregorian(y: number, m: number, d: number) {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function isValidHijri(y: number, m: number, d: number) {
  return y >= 1356 && y <= 1500 && m >= 1 && m <= 12 && d >= 1 && d <= 30;
}
const HIJRI_MONTHS_AR = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
const HIJRI_MONTHS_EN = ["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani","Jumada al-Ula","Jumada al-Akhira","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];

function DateConverterTool() {
  const { t, dir, lang } = useLocale();
  const today = useMemo(() => new Date(), []);
  const todayHijri = useMemo(() => toHijri(today.getFullYear(), today.getMonth() + 1, today.getDate()), [today]);

  const [gregorian, setGregorian] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  const [hijriY, setHijriY] = useState(String(todayHijri.hy));
  const [hijriM, setHijriM] = useState(String(todayHijri.hm));
  const [hijriD, setHijriD] = useState(String(todayHijri.hd));

  const gToH = useMemo(() => {
    const [y, m, d] = gregorian.split("-").map(Number);
    if (!isValidGregorian(y, m, d)) return null;
    try {
      const h = toHijri(y, m, d);
      const monthName = lang === "ar" ? HIJRI_MONTHS_AR[h.hm - 1] : HIJRI_MONTHS_EN[h.hm - 1];
      return lang === "ar" ? `${h.hd} ${monthName} ${h.hy} هـ` : `${h.hd} ${monthName} ${h.hy} AH`;
    } catch { return null; }
  }, [gregorian, lang]);

  const hToG = useMemo(() => {
    const y = Number(hijriY), m = Number(hijriM), d = Number(hijriD);
    if (!isValidHijri(y, m, d)) return null;
    try {
      const g = toGregorian(y, m, d);
      const dt = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
      if (lang === "ar") {
        const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
        const weekdays = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
        return `${weekdays[dt.getUTCDay()]}، ${g.gd} ${months[g.gm - 1]} ${g.gy} م`;
      }
      return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(dt);
    } catch { return null; }
  }, [hijriY, hijriM, hijriD, lang]);

  return (
    <div dir={dir} className="glass rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-xl grid place-items-center bg-accent/15 text-accent"><CalendarClock className="h-5 w-5" /></span>
        <div>
          <h3 className="font-display text-base font-bold text-elite-gold">{t("Hijri / Gregorian", "محول هجري / ميلادي")}</h3>
          <p className="text-[11px] text-foreground/60">{t("Live conversion as you type.", "تحويل لحظي أثناء الكتابة.")}</p>
        </div>
      </div>

      <Tabs defaultValue="g-to-h" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-secondary/80 border border-border">
          <TabsTrigger
            value="g-to-h"
            className="font-semibold text-foreground/90 hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md"
          >
            {t("To Hijri", "إلى هجري")}
          </TabsTrigger>
          <TabsTrigger
            value="h-to-g"
            className="font-semibold text-foreground/90 hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md"
          >
            {t("To Gregorian", "إلى ميلادي")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="g-to-h" className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label className="text-xs text-foreground/65">{t("Gregorian date", "التاريخ الميلادي")}</Label>
            <Input type="date" value={gregorian} onChange={(e) => setGregorian(e.target.value)} />
          </div>
          <div className={`rounded-xl border px-3 py-3 text-center font-display text-sm font-bold ${gToH ? "bg-primary/10 border-primary/20 text-foreground" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
            {gToH || t("Invalid date", "تاريخ غير صحيح")}
          </div>
        </TabsContent>
        <TabsContent value="h-to-g" className="space-y-3 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label className="text-xs text-foreground/65">{t("Day", "اليوم")}</Label><Input inputMode="numeric" value={hijriD} onChange={(e) => setHijriD(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs text-foreground/65">{t("Month", "الشهر")}</Label><Input inputMode="numeric" value={hijriM} onChange={(e) => setHijriM(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs text-foreground/65">{t("Year", "السنة")}</Label><Input inputMode="numeric" value={hijriY} onChange={(e) => setHijriY(e.target.value)} /></div>
          </div>
          <div className={`rounded-xl border px-3 py-3 text-center font-display text-sm font-bold ${hToG ? "bg-primary/10 border-primary/20 text-foreground" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
            {hToG || t("Invalid Hijri date (1356–1500 AH)", "تاريخ هجري غير صحيح (1356–1500 هـ)")}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function EliteTools() {
  const { t, dir } = useLocale();
  const iosNative = isIOSNativeApp();
  return (
    <div dir={dir} className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60">{t("Elite Tools", "أدوات النخبة")}</h2>
          <p className="mt-1 text-[11px] text-foreground/50">{t("Professional utilities without leaving the app.", "أدوات احترافية دون مغادرة التطبيق.")}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {!iosNative && <DownloadManager />}
        <DateConverterTool />
      </div>
    </div>
  );
}
