import { useRef, useState } from "react";
import { Languages, ArrowLeftRight, Copy, Check, Loader2, Sparkles, Image as ImageIcon, Camera, X, ArrowLeft, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { requestTranslation } from "@/lib/translation/translateClient";
import { toast } from "sonner";
import { ensureExternalAIConsent } from "@/lib/aiConsent";

const LANGS: { code: string; ar: string; en: string }[] = [
  { code: "auto", ar: "تلقائي", en: "Auto-detect" },
  { code: "ar", ar: "العربية", en: "Arabic" },
  { code: "en", ar: "الإنجليزية", en: "English" },
  { code: "fr", ar: "الفرنسية", en: "French" },
  { code: "es", ar: "الإسبانية", en: "Spanish" },
  { code: "de", ar: "الألمانية", en: "German" },
  { code: "tr", ar: "التركية", en: "Turkish" },
  { code: "ur", ar: "الأردية", en: "Urdu" },
  { code: "id", ar: "الإندونيسية", en: "Indonesian" },
  { code: "ms", ar: "الملايو", en: "Malay" },
  { code: "hi", ar: "الهندية", en: "Hindi" },
  { code: "fa", ar: "الفارسية", en: "Persian" },
  { code: "ru", ar: "الروسية", en: "Russian" },
  { code: "zh", ar: "الصينية", en: "Chinese" },
  { code: "ja", ar: "اليابانية", en: "Japanese" },
  { code: "ko", ar: "الكورية", en: "Korean" },
  { code: "pt", ar: "البرتغالية", en: "Portuguese" },
  { code: "it", ar: "الإيطالية", en: "Italian" },
  { code: "nl", ar: "الهولندية", en: "Dutch" },
  { code: "bn", ar: "البنغالية", en: "Bengali" },
  { code: "sw", ar: "السواحلية", en: "Swahili" },
];

const RTL = new Set(["ar", "ur", "fa"]);

/** Phone photos are several MB; the server takes at most ~4 MB per request, and text in an image
 * reads fine at 1600 px. Falls back to the original if the image can't be redrawn. */
async function shrinkImage(dataUrl: string, maxSide = 1600): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return dataUrl;
  }
}

interface TranslatorDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function TranslatorDialog({ open: openProp, onOpenChange, hideTrigger }: TranslatorDialogProps = {}) {
  const { t, dir, lang } = useLocale();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  // Default pair on every first open: Arabic -> English.
  const [from, setFrom] = useState("ar");
  const [to, setTo] = useState("en");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const outputIsRtl = RTL.has(to);

  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t("Image too large (max 8MB)", "الصورة كبيرة جداً (الحد 8MB)"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const labelFor = (code: string) => {
    const l = LANGS.find((x) => x.code === code)!;
    return lang === "ar" ? l.ar : l.en;
  };

  const swap = () => {
    if (from === "auto") return;
    setFrom(to);
    setTo(from);
    setInput(output);
    setOutput(input);
  };

  const translate = async () => {
    const text = input.trim();
    if (!text && !imageDataUrl) return;
    if (!ensureExternalAIConsent(lang === "ar" ? "ar" : "en")) return;
    setLoading(true);
    setOutput("");
    try {
      const image = imageDataUrl ? await shrinkImage(imageDataUrl) : null;
      const { translation, error: failure } = await requestTranslation({ text, from, to, imageDataUrl: image });
      if (failure || !translation) {
        // Never a fake success: no real translated text -> a clear error, and the output stays empty.
        if (failure === "rate_limit") toast.error(t("Too many requests, try again shortly.", "طلبات كثيرة، حاول بعد قليل."));
        else if (failure === "credits") toast.error(t("AI credits exhausted.", "نفدت رصيد الذكاء الاصطناعي."));
        else if (failure === "image_unavailable") toast.error(t("Translating images isn't available right now. Type the text instead.", "ترجمة الصور غير متاحة حالياً. اكتب النص بدلاً من ذلك."));
        else if (failure === "unreachable") toast.error(t("The translation service can't be reached. Check your internet connection and try again.", "تعذّر الوصول إلى خدمة الترجمة. تحقّق من الاتصال بالإنترنت وحاول مرة أخرى."));
        else toast.error(t("Translation failed.", "فشلت الترجمة."));
        return;
      }
      setOutput(translation);
    } catch {
      toast.error(t("Translation failed.", "فشلت الترجمة."));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("Translator", "المترجم")}
          className="relative h-9 w-9 grid place-items-center rounded-xl border border-foreground/10 bg-secondary/40 hover:bg-secondary transition"
        >
          <Languages className="h-4 w-4 text-foreground/80" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={dir} className="max-w-3xl w-[96vw] h-[92vh] sm:h-[88vh] overflow-hidden flex flex-col p-4 sm:p-6">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-elite-gold flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {t("Smart Translator", "المترجم الذكي")}
              </DialogTitle>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 px-3 rounded-lg border border-foreground/10 bg-secondary/40 hover:bg-secondary text-xs flex items-center gap-1.5 transition"
                aria-label={t("Back", "رجوع")}
              >
                {dir === "rtl" ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                {t("Back", "رجوع")}
              </button>
            </div>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 min-w-0 h-9 rounded-lg border border-foreground/10 bg-secondary/40 px-2 text-xs text-foreground"
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {labelFor(l.code)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={swap}
              disabled={from === "auto"}
              aria-label={t("Swap", "تبديل")}
              className="h-9 w-9 grid place-items-center rounded-lg border border-foreground/10 bg-secondary/40 hover:bg-secondary transition disabled:opacity-40"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 min-w-0 h-9 rounded-lg border border-foreground/10 bg-secondary/40 px-2 text-xs text-foreground"
            >
              {LANGS.filter((l) => l.code !== "auto").map((l) => (
                <option key={l.code} value={l.code}>
                  {labelFor(l.code)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pe-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("Enter text or add an image…", "اكتب النص أو أضف صورة…")}
              dir={RTL.has(from) ? "rtl" : from === "auto" ? "auto" : "ltr"}
              rows={imageDataUrl ? 2 : 5}
              className="w-full rounded-xl border border-foreground/10 bg-background p-3 text-sm text-foreground placeholder:text-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-elite-gold/60"
            />

            {imageDataUrl && (
              <div className="relative rounded-xl overflow-hidden border border-elite-gold/40 bg-black/20">
                <img src={imageDataUrl} alt="" className="w-full max-h-48 object-contain" />
                <button
                  type="button"
                  onClick={() => setImageDataUrl(null)}
                  aria-label={t("Remove image", "إزالة الصورة")}
                  className="absolute top-2 end-2 h-10 w-10 grid place-items-center rounded-md bg-background/80 hover:bg-background border border-foreground/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
              />
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex-1 h-9 rounded-lg border border-foreground/10 bg-secondary/40 hover:bg-secondary text-xs flex items-center justify-center gap-1.5 transition"
              >
                <ImageIcon className="h-4 w-4" />
                {t("Gallery", "الاستوديو")}
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex-1 h-9 rounded-lg border border-foreground/10 bg-secondary/40 hover:bg-secondary text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Camera className="h-4 w-4" />
                {t("Camera", "الكاميرا")}
              </button>
            </div>

            <button
              type="button"
              onClick={translate}
              disabled={loading || (!input.trim() && !imageDataUrl)}
              className="w-full h-10 rounded-xl font-semibold text-sm text-accent-foreground disabled:opacity-50 flex items-center justify-center gap-2 transition active:scale-[0.98]"
              style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("Translating…", "جارٍ الترجمة…")}
                </>
              ) : (
                <>
                  <Languages className="h-4 w-4" />
                  {t("Translate", "ترجمة")}
                </>
              )}
            </button>

            <div className="relative">
              <textarea
                value={output}
                readOnly
                placeholder={t("Translation will appear here", "ستظهر الترجمة هنا")}
                dir={outputIsRtl ? "rtl" : "ltr"}
                rows={5}
                className={`w-full rounded-xl border border-elite-gold/40 bg-background p-3 ${outputIsRtl ? "pl-14" : "pr-14"} text-sm text-foreground placeholder:text-foreground/40 resize-none`}
              />
              {output && (
                <button
                  type="button"
                  onClick={copy}
                  aria-label={t("Copy", "نسخ")}
                  className={`absolute top-2 ${outputIsRtl ? "left-2" : "right-2"} h-10 w-10 grid place-items-center rounded-md bg-background/70 hover:bg-background border border-foreground/10 transition`}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-foreground/70" />
                  )}
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
