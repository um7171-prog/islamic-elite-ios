import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, FileDown, Loader2, Plus, ScanLine, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/contexts/LocaleContext";
import { uid } from "@/lib/id";
import { downloadBlob } from "@/lib/aiImage";
import { cancelScan, isScannerAvailable, scanDocument, type ScannedPage } from "@/lib/scanner/nativeScanner";
import { buildScanPdf } from "@/lib/scanner/scanPdf";
import { applyFilterToDataUrl } from "@/lib/scanner/applyFilter";
import { SCAN_FILTERS, type ScanFilter } from "@/lib/scanner/imageProcessing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Variant {
  dataUrl: string;
  width: number;
  height: number;
}

interface Page {
  id: string;
  /** The untouched image the native scanner returned — every filter is (re)computed from this. */
  raw: ScannedPage;
  filter: ScanFilter;
  /** The current (selected-filter) result — what the PDF and the thumbnail use. */
  current: Variant;
  variants: Partial<Record<ScanFilter, Variant>>;
  processing: boolean;
}

const DEFAULT_FILTER: ScanFilter = "magic";

/**
 * Document scanner screen. The camera, capture, document detection, corner overlay and the "التالي"
 * step are all native (DocumentScannerPlugin); this dialog owns the scanned pages, the real
 * per-page enhancement (Original / Magic / Grayscale / B&W — lib/scanner/imageProcessing.ts,
 * applied to the full-resolution image, not a preview-only CSS filter) and the PDF export/share.
 * Opening it goes straight to the native camera.
 */
export function DocumentScannerDialog({ open, onOpenChange }: Props) {
  const { t, dir, lang } = useLocale();
  const available = isScannerAvailable();
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const scanningRef = useRef(false);
  const openedRef = useRef(false);
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  const buildVariant = useCallback(async (raw: ScannedPage, filter: ScanFilter): Promise<Variant> => {
    if (filter === "original") return { dataUrl: raw.dataUrl, width: raw.width, height: raw.height };
    const r = await applyFilterToDataUrl(raw.dataUrl, filter);
    return r;
  }, []);

  const startScan = useCallback(async () => {
    if (scanningRef.current) return; // never two cameras
    scanningRef.current = true;
    setScanning(true);
    try {
      const raw = await scanDocument(lang === "ar" ? "ar" : "en");
      if (raw) {
        const id = uid();
        // Show the raw capture immediately, then swap in the real Magic-enhanced result.
        setPages((prev) => [...prev, { id, raw, filter: DEFAULT_FILTER, current: { dataUrl: raw.dataUrl, width: raw.width, height: raw.height }, variants: {}, processing: true }]);
        setSelectedId(id);
        try {
          const variant = await buildVariant(raw, DEFAULT_FILTER);
          setPages((prev) => prev.map((p) => (p.id === id ? { ...p, current: variant, variants: { ...p.variants, [DEFAULT_FILTER]: variant }, processing: false } : p)));
        } catch {
          setPages((prev) => prev.map((p) => (p.id === id ? { ...p, processing: false } : p)));
        }
      } else if (pagesRef.current.length === 0) {
        onOpenChange(false); // backed out of the very first scan
      }
    } catch (e) {
      const message = (e as Error)?.message || "";
      if (!/BUSY/.test(message)) toast.error(t("The scanner could not be opened. Please try again.", "تعذّر فتح الماسح. حاول مرة أخرى."));
      if (pagesRef.current.length === 0) onOpenChange(false);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [lang, t, onOpenChange, buildVariant]);

  // Opening the screen opens the native camera straight away (once per opening).
  useEffect(() => {
    if (open && available && !openedRef.current) {
      openedRef.current = true;
      void startScan();
    }
    if (!open) {
      openedRef.current = false;
      setPages([]);
      setSelectedId(null);
      void cancelScan();
    }
  }, [open, available, startScan]);

  const selectedPage = pages.find((p) => p.id === selectedId) ?? null;

  const chooseFilter = useCallback(async (filter: ScanFilter) => {
    const page = pagesRef.current.find((p) => p.id === selectedId);
    if (!page || page.filter === filter) return;
    const cached = page.variants[filter];
    if (cached) {
      setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, filter, current: cached } : p)));
      return;
    }
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, filter, processing: true } : p)));
    try {
      const variant = await buildVariant(page.raw, filter);
      setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, current: variant, variants: { ...p.variants, [filter]: variant }, processing: false } : p)));
    } catch {
      toast.error(t("Couldn't apply that effect.", "تعذّر تطبيق هذا التأثير."));
      setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, processing: false } : p)));
    }
  }, [selectedId, buildVariant, t]);

  const savePdf = async () => {
    if (!pages.length || exporting) return;
    setExporting(true);
    try {
      const blob = await buildScanPdf(pages.map((p) => p.current));
      await downloadBlob(blob, `scan-${Date.now()}.pdf`);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error(t("Failed to create the PDF. Please try again.", "تعذّر إنشاء ملف PDF. حاول مرة أخرى."));
    } finally {
      setExporting(false);
    }
  };

  const sharePdf = async () => {
    if (!pages.length || exporting) return;
    setExporting(true);
    try {
      const blob = await buildScanPdf(pages.map((p) => p.current));
      const file = new File([blob], `scan-${Date.now()}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: t("Scanned document", "مستند ممسوح") });
      else await downloadBlob(blob, file.name);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error(t("Sharing failed. Try saving instead.", "فشلت المشاركة. جرّب الحفظ بدلاً من ذلك."));
    } finally {
      setExporting(false);
    }
  };

  const removePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full screen — the same space as the native camera screen it continues from, not a card. */}
      <DialogContent
        dir={dir}
        aria-describedby={undefined}
        className="!left-0 !top-0 !flex h-[100dvh] !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white sm:!rounded-none [&>button]:hidden"
        data-testid="doc-scanner"
      >
        <div className="flex shrink-0 items-center gap-3 px-4 pb-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.625rem)" }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("Back", "رجوع")}
            data-testid="scan-close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-white active:scale-95"
          >
            <Back className="h-6 w-6" />
          </button>
          <DialogTitle className="min-w-0 flex-1 truncate text-center text-base font-semibold text-white">
            {t("Document Scanner", "ماسح المستندات")}
          </DialogTitle>
          <span className="w-11 shrink-0 text-center text-xs text-white/70">
            {pages.length > 0 ? t(`${pages.length} p.`, `${pages.length} صفحة`) : ""}
          </span>
        </div>

        {!available ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="scanner-unavailable">
            <ScanLine className="h-10 w-10 text-primary" />
            <p className="text-body font-semibold">{t("The document scanner works in the iPhone app", "ماسح المستندات يعمل داخل تطبيق iPhone")}</p>
            <p className="text-body-sm text-white/70">
              {t("It uses the iPhone camera to detect the page and flatten it. Open the app on your iPhone to scan.", "يستخدم كاميرا iPhone لاكتشاف الورقة وتسويتها. افتح التطبيق على جهاز iPhone للمسح.")}
            </p>
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="scanner-opening">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-body-sm text-white/70">{t("Opening the camera…", "جارٍ فتح الكاميرا…")}</p>
          </div>
        ) : (
          <>
            {/* The selected page, as large as the screen allows. */}
            <div className="relative min-h-0 flex-1 px-3" data-testid="scan-preview">
              {selectedPage ? (
                <>
                  <img
                    src={selectedPage.current.dataUrl}
                    data-filter={selectedPage.filter}
                    alt={t("Selected page", "الصفحة المحددة")}
                    className="h-full w-full object-contain"
                  />
                  {selectedPage.processing && (
                    <span className="absolute inset-0 grid place-items-center">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </span>
                  )}
                </>
              ) : (
                <p className="grid h-full place-items-center text-body-sm text-white/70">{t("Choose a page below", "اختر صفحة من الأسفل")}</p>
              )}
            </div>

            <div className="shrink-0 space-y-3 px-4 pt-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}>
              {selectedPage && (
                <div className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 p-1.5" data-testid="scan-filters">
                  {SCAN_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => void chooseFilter(f.id)}
                      disabled={selectedPage.processing}
                      data-testid={`scan-filter-${f.id}`}
                      data-active={selectedPage.filter === f.id}
                      className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                        selectedPage.filter === f.id ? "bg-primary text-primary-foreground" : "text-white/80"
                      }`}
                    >
                      {t(f.en, f.ar)}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-1" data-testid="scan-pages">
                {pages.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    data-testid="scan-page"
                    data-selected={p.id === selectedId}
                    className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white/10 ${p.id === selectedId ? "border-primary" : "border-transparent"}`}
                  >
                    <img src={p.current.dataUrl} data-filter={p.filter} alt={t(`Page ${i + 1}`, `صفحة ${i + 1}`)} className="h-full w-full object-cover" />
                    <span className="absolute bottom-0.5 start-0.5 rounded-full bg-black/60 px-1.5 text-[10px] text-white">{i + 1}</span>
                    {p.processing && (
                      <span className="absolute inset-0 grid place-items-center bg-black/30">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); removePage(p.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removePage(p.id); } }}
                      aria-label={t("Delete page", "حذف الصفحة")}
                      data-testid="scan-page-delete"
                      className="absolute end-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void startScan()}
                  disabled={scanning}
                  data-testid="scan-add"
                  className="flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-white/30 text-[10px] leading-tight text-white/80 disabled:opacity-50"
                >
                  {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  {t("Add page", "إضافة صفحة")}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void savePdf()} disabled={exporting} data-testid="scan-save-pdf" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  <FileDown className="h-4 w-4" />{t("Save PDF", "حفظ PDF")}
                </button>
                <button type="button" onClick={() => void sharePdf()} disabled={exporting} data-testid="scan-share-pdf" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/15 text-sm font-medium text-white disabled:opacity-50">
                  <Share2 className="h-4 w-4" />{t("Share", "مشاركة")}
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
