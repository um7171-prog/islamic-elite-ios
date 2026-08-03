import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Flashlight, FlashlightOff, Copy, ExternalLink, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type TorchTrack = MediaStreamTrack & { getCapabilities?: () => { torch?: boolean } };

export function QRScannerDialog({ open, onOpenChange }: Props) {
  const { t, dir } = useLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [inAppUrl, setInAppUrl] = useState<string | null>(null);

  const stop = () => {
    try { controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = async () => {
    setError(null);
    setResult(null);
    setTorchOn(false);
    try {
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0] as TorchTrack;
      const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
      setTorchSupported(Boolean(caps.torch));

      controlsRef.current = await reader.decodeFromVideoElement(videoRef.current!, (res) => {
        if (res) {
          const text = res.getText();
          setResult(text);
          stop();
        }
      });
    } catch (e: any) {
      setError(e?.message || t("Camera permission denied", "تم رفض إذن الكاميرا"));
    }
  };

  useEffect(() => {
    if (open) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    if (!result) return;
    if (isUrl) setInAppUrl(result.trim());
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    toast.success(t("Copied", "تم النسخ"));
  };

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
                className="h-10 w-10 rounded-full bg-black/60 backdrop-blur grid place-items-center text-white border border-white/20"
                aria-label={t("Back", "رجوع")}
              >
                <X className="h-5 w-5" />
              </button>
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className="h-10 w-10 rounded-full bg-black/60 backdrop-blur grid place-items-center text-white border border-white/20"
                  aria-label={t("Flashlight", "الفلاش")}
                >
                  {torchOn ? <Flashlight className="h-5 w-5 text-yellow-400" /> : <FlashlightOff className="h-5 w-5" />}
                </button>
              )}
            </div>

            {error && (
              <div className="absolute inset-x-4 bottom-4 rounded-xl bg-destructive/90 text-destructive-foreground p-3 text-sm text-center">
                {error}
              </div>
            )}
          </div>

          {/* Result */}
          <div className="p-4 space-y-3">
            {result ? (
              <>
                <div className="rounded-xl border bg-muted/40 p-3 text-sm break-all">{result}</div>
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
                {t("Point the camera at a QR code", "وجّه الكاميرا نحو الرمز")}
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
