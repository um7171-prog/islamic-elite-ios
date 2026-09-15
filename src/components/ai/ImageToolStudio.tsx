import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { BeforeAfter } from "./BeforeAfter";
import { downloadBlob, exportImage, type Progress } from "@/lib/aiImage";

interface Props {
  hint: string;
  fileBase: string;
  transparent?: boolean;
  formats?: ("png" | "jpg")[];
  run: (file: File, onProgress: Progress) => Promise<Blob>;
}

type Phase = "idle" | "uploading" | "working" | "done" | "error";

/** Full-screen image-in / image-out studio: upload → progress → compare → save. */
export function ImageToolStudio({ hint, fileBase, transparent, formats = ["png", "jpg"], run }: Props) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const resultRef = useRef<Blob | null>(null);
  const urls = useRef<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const track = (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    urls.current.push(u);
    return u;
  };

  const reset = () => {
    setPhase("idle");
    setProgress(0);
    setError(null);
    setBefore(null);
    setAfter(null);
    resultRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  };

  const start = async (file?: File | null) => {
    if (!file) return;
    setError(null);
    setAfter(null);
    setPhase("uploading");
    setProgress(4);
    setLabel(t("Uploading image", "رفع الصورة"));
    setBefore(track(file));
    await new Promise((r) => setTimeout(r, 120));
    setPhase("working");
    try {
      const blob = await run(file, (p, l) => {
        setProgress(Math.min(99, Math.round(p)));
        if (l) setLabel(l);
      });
      resultRef.current = blob;
      setAfter(track(blob));
      setProgress(100);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message || t("Processing failed", "فشلت المعالجة"));
      setPhase("error");
    }
  };

  const save = async (format: "png" | "jpg") => {
    if (!resultRef.current) return;
    setSaving(true);
    try {
      const out = await exportImage(resultRef.current, format);
      await downloadBlob(out, `${fileBase}-${Date.now()}.${format}`);
    } catch (e) {
      setError((e as Error).message || t("Save failed", "تعذر الحفظ"));
    } finally {
      setSaving(false);
    }
  };

  const busy = phase === "uploading" || phase === "working";

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => start(e.target.files?.[0])}
      />

      {phase === "idle" && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-3xl border-2 border-dashed border-foreground/20 bg-foreground/5 py-16 grid place-items-center gap-3 transition active:scale-[0.99] hover:bg-foreground/10"
        >
          <span className="h-16 w-16 rounded-2xl grid place-items-center bg-accent/15">
            <ImagePlus className="h-7 w-7 text-accent" />
          </span>
          <span className="text-base font-bold">{t("Choose an image", "اختر صورة")}</span>
          <span className="text-[12px] text-foreground/60 px-8 text-center leading-relaxed">{hint}</span>
        </button>
      )}

      {busy && (
        <div className="rounded-3xl border border-foreground/10 glass p-6 space-y-4">
          {before && (
            <img
              src={before}
              alt={t("Original", "الأصلية")}
              className="mx-auto max-h-56 rounded-2xl object-contain animate-pulse"
            />
          )}
          <div className="flex items-center justify-center gap-2 text-sm font-semibold">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            {label || t("Processing…", "جاري المعالجة…")}
          </div>
          <div className="h-2.5 w-full rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${progress}%`, background: "var(--gradient-gold)" }}
            />
          </div>
          <p className="text-center text-[11px] text-foreground/55">{progress}%</p>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-2xl bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {phase === "done" && before && after && (
        <>
          <div className="rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-3 text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {t("Done successfully", "تمت المعالجة بنجاح")}
          </div>
          <BeforeAfter before={before} after={after} transparent={transparent} />
        </>
      )}

      {(phase === "done" || phase === "error") && (
        <div className="space-y-2 pt-1">
          {phase === "done" && (
            <div className="flex gap-2">
              {formats.map((f) => (
                <button
                  key={f}
                  disabled={saving}
                  onClick={() => save(f)}
                  className="flex-1 h-14 rounded-2xl text-sm font-bold text-accent-foreground flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60"
                  style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t("Save", "حفظ")} {f.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={reset}
            className="w-full h-13 min-h-[52px] rounded-2xl glass text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <RotateCcw className="h-4 w-4" /> {t("New image", "صورة جديدة")}
          </button>
        </div>
      )}
    </div>
  );
}
