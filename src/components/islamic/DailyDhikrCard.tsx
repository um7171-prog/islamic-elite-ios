import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Sparkles } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { dailyItem, SOURCE_LABEL } from "@/lib/dailyContent";

/**
 * Home "dhikr of the day". Content comes only from the app's own Athkar lists;
 * it is the same all day and changes only when the user taps Next. The Arabic is
 * set large and high-contrast on the deep-green surface.
 */
export function DailyDhikrCard({ className = "" }: { className?: string }) {
  const { t, lang, dir } = useLocale();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const item = useMemo(() => dailyItem(offset), [offset]);
  const src = SOURCE_LABEL[item.source];

  return (
    <section
      dir={dir}
      data-testid="daily-dhikr"
      aria-label={t("Dhikr of the day", "ذكر اليوم")}
      className={`bg-header relative overflow-hidden rounded-3xl p-5 shadow-[0_8px_28px_-10px_hsl(160_50%_10%/0.55)] ${className}`}
    >
      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-body-sm font-semibold text-[hsl(var(--elite-gold-end))]">
          <Sparkles className="h-4 w-4" />
          {t("Dhikr of the day", "ذكر اليوم")}
        </span>
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          data-testid="daily-next"
          aria-label={t("Next", "التالي")}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-body-sm font-semibold text-white transition active:scale-95"
        >
          <RefreshCw className="h-4 w-4" />
          {t("Next", "التالي")}
        </button>
      </div>

      <p
        dir="rtl"
        data-testid="daily-text"
        key={item.ar}
        className="relative mt-4 text-center font-arabic text-[24px] font-bold leading-[2.2] text-white"
      >
        {item.ar}
      </p>
      {lang === "en" && <p className="relative mt-2 text-center text-body leading-relaxed text-white/80">{item.en}</p>}

      <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-white/15 pt-3">
        <span className="text-body-sm text-white/70" data-testid="daily-source">{t(src.en, src.ar)}</span>
        <button
          type="button"
          onClick={() => navigate("/athkar")}
          className="min-h-[40px] rounded-full px-3 text-body-sm font-bold text-[hsl(var(--elite-gold-end))] transition active:scale-95"
        >
          {t("Open Athkar", "افتح الأذكار")}
        </button>
      </div>
    </section>
  );
}
