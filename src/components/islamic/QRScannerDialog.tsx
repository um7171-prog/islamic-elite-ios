import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Flashlight, FlashlightOff, Copy, ExternalLink, RotateCcw, X, Camera, SearchX } from "lucide-react";
import { toast } from "sonner";
import { openNativeAppSettings } from "@/lib/nativeAthan";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type TorchTrack = MediaStreamTrack & { getCapabilities?: () => { torch?: boolean } };
type ScanStatus = "starting" | "scanning" | "denied" | "unavailable" | "not-found" | "error";

const NOT_FOUND_TIMEOUT_MS = 15000;

export function QRScannerDialog({ open, onOpenChange }: Props) {
  const { t, dir } = useLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const notFoundTimerRef = useRef<number | null>(null);
  // Bumped every time the dialog opens/closes. A pending getUserMedia()/reader
  // setup that resolves after the generation moved on is stale and must be
  // torn down immediately instead of being wired up as the live stream —
  // otherwise closing the dialog mid-permission-prompt leaks the camera.
  const genRef = useRef(0);

  const [result, setResult] = useState<string | null>(null);
  // Tracked separately from `result`: a QR code can legitimately encode an
  // empty string, and every truthy-check on `result` alone would then treat
  // a real (empty) scan as "no scan yet" — leaving a dead camera on screen
  // with no way to reach the Rescan button.
  const [hasScanned, setHasScanned] = useState(false);
  const [status, setStatus] = useState<ScanStatus>("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [inAppUrl, setInAppUrl] = useState<string | null>(null);

  const clearNotFoundTimer = () => {
    if (notFoundTimerRef.current) {
      window.clearTimeout(notFoundTimerRef.current);
      notFoundTimerRef.current = null;
    }
  };

  const armNotFoundTimer = () => {
    clearNotFoundTimer();
    notFoundTimerRef.current = window.setTimeout(() => {
      setStatus((s) => (s === "scanning" ? "not-found" : s));
    }, NOT_FOUND_TIMEOUT_MS);
  };

  const stop = () => {
    clearNotFoundTimer();
    try { controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const start = async () => {
    const myGen = ++genRef.current;
    setErrorMsg(null);
    setResult(null);
    setHasScanned(false);
    setTorchOn(false);
    setStatus("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(t("Camera not supported", "الكاميرا غير مدعومة"));
      }
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (genRef.current !== myGen) {
        // Dialog was closed (or restarted) while waiting for the permission
        // prompt — this stream must never become the "live" one.
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (genRef.current !== myGen) { stop(); return; }

      const track = stream.getVideoTracks()[0] as TorchTrack;
      const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
      setTorchSupported(Boolean(caps.torch));

      const controls = await reader.decodeFromVideoElement(videoRef.current!, (res) => {
        if (genRef.current !== myGen || !res) return;
        clearNotFoundTimer();
        setResult(res.getText());
        setHasScanned(true);
        stop();
      });
      if (genRef.current !== myGen) { stop(); return; }
      controlsRef.current = controls;
      setStatus("scanning");
      armNotFoundTimer();
    } catch (e: any) {
      if (genRef.current !== myGen) return;
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
        setErrorMsg(t(
          "Camera permission denied. Enable it from your device Settings.",
          "تم رفض إذن الكاميرا. فعّله من إعدادات جهازك.",
        ));
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("unavailable");
        setErrorMsg(t("No camera found on this device", "لا توجد كاميرا متاحة على هذا الجهاز"));
      } else if (name === "NotReadableError") {
        setStatus("unavailable");
        setErrorMsg(t("Camera is in use by another app", "الكاميرا مستخدمة من تطبيق آخر"));
      } else {
        setStatus("error");
        setErrorMsg(e?.message || t("Unable to access camera", "تعذّر الوصول إلى الكاميرا"));
      }
    }
  };

  useEffect(() => {
    if (open) start();
    return () => { genRef.current++; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRetry = () => {
    if (status === "not-found") {
      setStatus("scanning");
      armNotFoundTimer();
      return;
    }
    start();
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as TorchTrack | undefined;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch {
      toast.error(t("Flashlight unsupported", "الفلاش غير مدعوم"));
    }
  };

  const isUrl = result ? /^https?:\/\//i.test(result.trim()) : false;

  const handleOpen = () => {
    if (result == null) return;
    if (isUrl) setInAppUrl(result.trim());
  };

  const handleCopy = async () => {
    if (result == null) return;
    await navigator.clipboard.writeText(result);
    toast.success(t("Copied", "تم النسخ"));
  };

  const blockingStatus = status === "denied" || status === "unavailable" || status === "error";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) stop(); onOpenChange(v); }}>
        <DialogContent dir={dir} className="max-w-md p-0 overflow-hidden bg-background">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{t("QR Scanner", "ماسح ضوئي")}</DialogTitle>
          </DialogHeader>

          <div className="relative aspect-square w-full bg-black">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
            {/* Overlay frame */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-2/3 w-2/3 rounded-2xl">
                <span className="absolute -top-px -start-px h-8 w-8 rounded-tl-2xl border-s-4 border-t-4 border-accent" />
                <span className="absolute -top-px -end-px h-8 w-8 rounded-tr-2xl border-e-4 border-t-4 border-accent" />
                <span className="absolute -bottom-px -start-px h-8 w-8 rounded-bl-2xl border-s-4 border-b-4 border-accent" />
                <span className="absolute -bottom-px -end-px h-8 w-8 rounded-br-2xl border-e-4 border-b-4 border-accent" />
                <span className="absolute inset-x-4 top-1/2 h-0.5 bg-accent/80 animate-pulse" />
              </div>
            </div>

            {/* Top controls */}
            <div className="absolute inset-x-0 top-0 flex justify-between p-3">
              <button
                onClick={() => { stop(); onOpenChange(false); }}
                className="h-11 w-11 rounded-full bg-black/60 backdrop-blur grid place-items-center text-white border border-white/20"
                aria-label={t("Back", "رجوع")}
              >
                <X className="h-5 w-5" />
              </button>
              {status === "scanning" && torchSupported && (
                <button
                  onClick={toggleTorch}
                  className="h-11 w-11 rounded-full bg-black/60 backdrop-blur grid place-items-center text-white border border-white/20"
                  aria-label={t("Flashlight", "الفلاش")}
                >
                  {torchOn ? <Flashlight className="h-5 w-5 text-yellow-400" /> : <FlashlightOff className="h-5 w-5" />}
                </button>
              )}
            </div>

            {/* Blocking states: permission denied / camera unavailable / generic error */}
            {blockingStatus && !hasScanned && (
              <div className="absolute inset-4 rounded-xl bg-background/95 backdrop-blur p-4 flex flex-col items-center justify-center text-center gap-3">
                <Camera className="h-10 w-10 text-accent" />
                <p className="text-sm text-foreground">{errorMsg}</p>
                {status === "denied" ? (
                  <button
                    onClick={() => void openNativeAppSettings()}
                    className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-medium flex items-center gap-2"
                  >
                    {t("Open Settings", "فتح الإعدادات")}
                  </button>
                ) : (
                  <button
                    onClick={handleRetry}
                    className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-medium flex items-center gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("Try again", "إعادة المحاولة")}
                  </button>
                )}
              </div>
            )}

            {/* Soft hint after scanning for a while with no match — camera keeps running */}
            {status === "not-found" && !hasScanned && (
              <div className="absolute inset-x-4 bottom-4 rounded-xl bg-background/90 backdrop-blur p-3 flex items-center gap-3 text-start">
                <SearchX className="h-5 w-5 text-accent shrink-0" />
                <p className="flex-1 text-xs text-foreground">
                  {t(
                    "No code found yet. Try better lighting or moving closer.",
                    "لم يتم العثور على رمز بعد. حاول تحسين الإضاءة أو الاقتراب أكثر.",
                  )}
                </p>
                <button
                  onClick={handleRetry}
                  className="h-8 px-3 rounded-lg bg-accent text-accent-foreground text-xs font-medium shrink-0"
                >
                  {t("Retry", "إعادة")}
                </button>
              </div>
            )}
          </div>

          {/* Result */}
          <div className="p-4 space-y-3">
            {hasScanned ? (
              <>
                <div className="rounded-xl border bg-muted/40 p-3 text-sm break-all">
                  {result || t("(Empty QR code)", "(رمز QR فارغ)")}
                </div>
                <div className="flex gap-2">
                  {isUrl && (
                    <button onClick={handleOpen} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      {t("Open", "فتح")}
                    </button>
                  )}
                  <button onClick={handleCopy} className="flex-1 h-10 rounded-xl bg-secondary text-secondary-foreground font-medium flex items-center justify-center gap-2">
                    <Copy className="h-4 w-4" />
                    {t("Copy", "نسخ")}
                  </button>
                  <button onClick={start} className="h-10 px-3 rounded-xl bg-accent text-accent-foreground font-medium flex items-center justify-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    {t("Rescan", "مسح جديد")}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-center text-muted-foreground">
                {status === "starting" && t("Starting camera…", "جارٍ تشغيل الكاميرا…")}
                {status === "scanning" && t("Point the camera at a QR code", "وجّه الكاميرا نحو الرمز")}
                {status === "not-found" && t("Still scanning…", "لا يزال البحث جاريًا…")}
                {blockingStatus && t("Camera unavailable — see instructions above", "الكاميرا غير متاحة — راجع التعليمات أعلاه")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* In-app browser */}
      <Dialog open={!!inAppUrl} onOpenChange={(v) => !v && setInAppUrl(null)}>
        <DialogContent dir={dir} className="max-w-3xl h-[80vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="truncate text-sm font-mono">{inAppUrl}</DialogTitle>
          </DialogHeader>
          {inAppUrl && (
            <iframe
              src={inAppUrl}
              className="w-full flex-1 h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer"
              title="in-app-browser"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
