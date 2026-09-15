import { useRef, useState } from "react";
import { Upload, Loader2, Copy, Check, RotateCcw } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureExternalAIConsent } from "@/lib/aiConsent";

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("تعذر قراءة الصورة"));
    fr.readAsDataURL(file);
  });
}

export function OcrTool() {
  const { t, lang } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (file?: File | null) => {
    if (!file || busy) return;
    if (!ensureExternalAIConsent(lang === "ar" ? "ar" : "en")) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    setText("");
    setBusy(true);
    try {
      const dataUrl = await toDataUrl(file);
      setPreview(dataUrl);
      const { data, error: fnError } = await supabase.functions.invoke("ai-ocr", {
        body: { imageDataUrl: dataUrl },
      });
      if (fnError) throw new Error(fnError.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const extracted = (data as { text?: string })?.text?.trim();
      setText(extracted || "");
      if (!extracted) setError(t("No text detected.", "لم يتم العثور على نص في الصورة."));
    } catch (e) {
      setError((e as Error).message || t("Extraction failed", "فشل استخراج النص"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => run(e.target.files?.[0])}
      />

      {!preview ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl border border-dashed border-foreground/20 bg-foreground/5 py-10 grid place-items-center gap-2 transition hover:bg-foreground/10"
        >
          <Upload className="h-6 w-6 text-accent" />
          <span className="text-sm font-semibold">{t("Choose an image", "اختر صورة")}</span>
          <span className="text-[11px] text-foreground/60 px-6 text-center">
            {t("Supports Arabic and English text.", "يدعم النصوص العربية والإنجليزية.")}
          </span>
        </button>
      ) : (
        <img
          src={preview}
          alt={t("Selected image", "الصورة المختارة")}
          className="max-h-48 w-full rounded-xl border border-foreground/10 object-contain"
        />
      )}

      {busy && (
        <div className="flex items-center justify-center gap-2 text-xs text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          {t("Extracting text…", "جاري استخراج النص…")}
        </div>
      )}

      {error && <p className="rounded-xl bg-destructive/10 text-destructive text-xs px-3 py-2">{error}</p>}

      {text && (
        <div className="relative">
          <textarea
            readOnly
            value={text}
            dir="auto"
            rows={8}
            className="w-full rounded-xl border border-foreground/10 bg-background p-3 pt-9 text-sm text-foreground leading-relaxed"
          />
          <button
            onClick={copy}
            className="absolute top-2 end-2 h-7 px-2 rounded-lg glass text-[11px] font-semibold flex items-center gap-1"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {t("Copy", "نسخ")}
          </button>
        </div>
      )}

      {preview && (
        <button
          onClick={() => {
            setPreview(null);
            setText("");
            setError(null);
          }}
          className="w-full h-10 rounded-xl glass text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <RotateCcw className="h-4 w-4" /> {t("New image", "صورة جديدة")}
        </button>
      )}
    </div>
  );
}
