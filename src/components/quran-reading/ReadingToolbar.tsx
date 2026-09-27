import { ArrowRight, BookOpen } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { FONT_SIZE } from "./readingPrefs";

const iconBtn = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/12 text-white transition active:scale-90 disabled:opacity-35";

/** Reading-mode top bar: back · surah · A− / A+ · switch to the Mushaf. Same dark-emerald chrome as the Mushaf bars. */
export function ReadingToolbar({
  title, fontSize, onBack, onSmaller, onLarger, onMushaf,
}: {
  title: string;
  fontSize: number;
  onBack: () => void;
  onSmaller: () => void;
  onLarger: () => void;
  onMushaf: () => void;
}) {
  const { t } = useLocale();
  return (
    <div dir="rtl" className="bg-header shrink-0 text-white shadow-md" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex min-w-0 items-center gap-1.5 px-2 py-2">
        <button type="button" onClick={onBack} data-testid="reading-back" aria-label={t("Back", "رجوع")} className={iconBtn}>
          <ArrowRight className="h-6 w-6" />
        </button>
        <h1 className="min-w-0 flex-1 truncate px-1 font-arabic text-body-lg" data-testid="reading-title">{title}</h1>
        <button type="button" onClick={onSmaller} disabled={fontSize <= FONT_SIZE.min} data-testid="font-smaller" aria-label={t("Smaller text", "تصغير الخط")} className={`${iconBtn} text-body font-bold`}>
          A−
        </button>
        <button type="button" onClick={onLarger} disabled={fontSize >= FONT_SIZE.max} data-testid="font-larger" aria-label={t("Larger text", "تكبير الخط")} className={`${iconBtn} text-body-lg font-bold`}>
          A+
        </button>
        <button type="button" onClick={onMushaf} data-testid="to-mushaf" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/12 px-3 text-body-sm font-semibold text-white transition active:scale-95">
          <BookOpen className="h-4 w-4" />
          {t("Mushaf", "المصحف")}
        </button>
      </div>
    </div>
  );
}
