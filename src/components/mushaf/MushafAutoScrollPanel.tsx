import { Minus, Pause, Play, Plus, X } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { toArabicDigits } from "@/lib/mushaf";
import { AUTO_SCROLL_LEVELS } from "./autoScroll";

interface Props {
  playing: boolean;
  level: number;
  onToggle: () => void;
  onSlower: () => void;
  onFaster: () => void;
  onClose: () => void;
}

const btn = "grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition active:scale-90 disabled:opacity-35";

/** The small control bar of the Mushaf's auto-scroll: stop/close, slower, play/pause, faster. */
export function MushafAutoScrollPanel({ playing, level, onToggle, onSlower, onFaster, onClose }: Props) {
  const { t, lang } = useLocale();
  const speed = [
    t("Very slow", "بطيء جدًا"),
    t("Slow", "بطيء"),
    t("Medium", "متوسط"),
    t("Fast", "سريع"),
    t("Very fast", "سريع جدًا"),
  ][level - 1];
  const n = (v: number) => (lang === "ar" ? toArabicDigits(v) : String(v));
  return (
    <div
      role="toolbar"
      dir="rtl"
      aria-label={t("Auto scroll", "التمرير التلقائي")}
      data-testid="mushaf-autoscroll"
      className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-black/75 px-1.5 py-1 shadow-lg"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", touchAction: "manipulation" }}
    >
      <button type="button" onClick={onClose} aria-label={t("Close auto scroll", "إغلاق التمرير التلقائي")} data-testid="mushaf-autoscroll-close" className={btn}>
        <X className="h-5 w-5" />
      </button>
      <button type="button" onClick={onSlower} disabled={level <= 1} aria-label={t("Slower", "أبطأ")} data-testid="mushaf-autoscroll-slower" className={btn}>
        <Minus className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? t("Pause", "إيقاف مؤقت") : t("Play", "تشغيل")}
        aria-pressed={playing}
        data-testid="mushaf-autoscroll-toggle"
        className={`${btn} h-12 w-12 bg-white/15`}
      >
        {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
      </button>
      <button type="button" onClick={onFaster} disabled={level >= AUTO_SCROLL_LEVELS} aria-label={t("Faster", "أسرع")} data-testid="mushaf-autoscroll-faster" className={btn}>
        <Plus className="h-5 w-5" />
      </button>
      <span className="px-2.5 text-label text-white/90 whitespace-nowrap" data-testid="mushaf-autoscroll-speed" aria-live="polite">
        {speed} · {n(level)}/{n(AUTO_SCROLL_LEVELS)}
      </span>
    </div>
  );
}
