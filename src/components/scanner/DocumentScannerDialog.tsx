import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, Loader2, Plus, ScanLine, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/contexts/LocaleContext";
import { uid } from "@/lib/id";
import { downloadBlob } from "@/lib/aiImage";
import { cancelScan, isScannerAvailable, scanDocument, type ScannedPage } from "@/lib/scanner/nativeScanner";
import { buildScanPdf } from "@/lib/scanner/scanPdf";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Page = ScannedPage & { id: string };

/**
 * Document scanner screen. The camera, the capture, the document detection, the corner overlay and
 * the "مسح" step are all native (DocumentScannerPlugin); this dialog only owns the list of scanned
 * pages and the PDF export/share. Opening it goes straight to the native camera.
 */
export function DocumentScannerDialog({ open, onOpenChange }: Props) {
  const { t, dir, lang } = useLocale();
  const available = isScannerAvailable();
  const [pages, setPages] = useState<Page[]>([]);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const scanningRef = useRef(false);
  const openedRef = useRef(false);
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  const startScan = useCallback(async () => {
    if (scanningRef.current) return; // never two cameras
    scanningRef.current = true;
    setScanning(true);
    try {
      const page = await scanDocument(lang === "ar" ? "ar" : "en");
      if (page) setPages((prev) => [...prev, { ...page, id: uid() }]);
      else if (pagesRef.current.length === 0) onOpenChange(false); // backed out of the very first scan
    } catch (e) {
      const message = (e as Error)?.message || "";
      if (!/BUSY/.test(message)) toast.error(t("The scanner could not be opened. Please try again.", "تعذّر فتح الماسح. حاول مرة أخرى."));
      if (pagesRef.current.length === 0) onOpenChange(false);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [lang, t, onOpenChange]);

  // Opening the screen opens the native camera straight away (once per opening).
  useEffect(() => {
    if (open && available && !openedRef.current) {
      openedRef.current = true;
      void startScan();
    }
    if (!open) {
      openedRef.current = false;
      setPages([]);
      void cancelScan();
    }
  }, [open, available, startScan]);

  const savePdf = async () => {
    if (!pages.length || exporting) return;
    setExporting(true);
    try {
      const blob = await buildScanPdf(pages);
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
      const blob = await buildScanPdf(pages);
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

  const removePage = (id: string) => setPages((prev) => prev.filter((p) => p.id !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-md overflow-hidden bg-background p-0" data-testid="doc-scanner">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center justify-between">
            <span>{t("Document Scanner", "ماسح المستندات")}</span>
            {pages.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">{t(`${pages.length} page(s)`, `${pages.length} صفحة`)}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!available ? (
          <div className="space-y-3 px-5 pb-6 pt-2 text-center" data-testid="scanner-unavailable">
            <ScanLine className="mx-auto h-10 w-10 text-primary" />
            <p className="text-body font-semibold">{t("The document scanner works in the iPhone app", "ماسح المستندات يعمل داخل تطبيق iPhone")}</p>
            <p className="text-body-sm text-muted-foreground">
              {t("It uses the iPhone camera to detect the page and flatten it. Open the app on your iPhone to scan.", "يستخدم كاميرا iPhone لاكتشاف الورقة وتسويتها. افتح التطبيق على جهاز iPhone للمسح.")}
            </p>
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 pb-8 pt-4 text-center" data-testid="scanner-opening">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-body-sm text-muted-foreground">{t("Opening the camera…", "جارٍ فتح الكاميرا…")}</p>
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-4">
            <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto" data-testid="scan-pages">
              {pages.map((p, i) => (
                <div key={p.id} className="relative overflow-hidden rounded-xl border border-border bg-muted" data-testid="scan-page">
                  <img src={p.dataUrl} alt={t(`Page ${i + 1}`, `صفحة ${i + 1}`)} className="h-40 w-full object-contain" />
                  <span className="absolute start-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removePage(p.id)}
                    aria-label={t("Delete page", "حذف الصفحة")}
                    data-testid="scan-page-delete"
                    className="absolute end-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void startScan()}
              disabled={scanning}
              data-testid="scan-add"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground disabled:opacity-50"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("Add page", "إضافة صفحة")}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void savePdf()} disabled={exporting} data-testid="scan-save-pdf" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
                <FileDown className="h-4 w-4" />{t("Save PDF", "حفظ PDF")}
              </button>
              <button type="button" onClick={() => void sharePdf()} disabled={exporting} data-testid="scan-share-pdf" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground disabled:opacity-50">
                <Share2 className="h-4 w-4" />{t("Share", "مشاركة")}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
