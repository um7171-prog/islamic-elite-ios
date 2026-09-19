import { useEffect, useMemo, useState } from "react";
import { MoonStar } from "lucide-react";
import { formatCountdown, getNextPrayer, getPrayerTimes } from "@/lib/prayer";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { CitySelector } from "./CitySelector";

export function HeroPrayerCard() {
  const { t, dir } = useLocale();
  const { city } = useCity();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { entries } = useMemo(
    () => getPrayerTimes(now, city.lat, city.lng, madhab, { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [now.toDateString(), city.id, madhab, calcSignature],
  );
  const { current, next, msUntilNext } = getNextPrayer(entries, now);
  const msSinceCurrent = Math.max(0, now.getTime() - current.time.getTime());

  const formatHM = (ms: number) => {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const formatHMS = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const showElapsed = msSinceCurrent < 45 * 60 * 1000;

  return (
    <div
      className="relative overflow-hidden rounded-[1.75rem] px-5 py-6 md:px-8 md:py-7 border border-white/10 shadow-[var(--shadow-elevated)]"
      style={{ background: "var(--gradient-hero)" }}
      dir={dir}
    >
      <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl animate-float" style={{ animationDelay: "2s" }} />

      {/* This card is always the deep-green brand color regardless of the
          app's light/dark theme, so text here is hardcoded to light shades
          rather than the theme-flipping text-foreground token (which turns
          dark brown in light mode and would be unreadable on this background). */}
      <div className="relative z-10 flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
          <MoonStar className="h-3.5 w-3.5 text-elite-gold" />
          {t("Next Prayer", "الصلاة القادمة")}
        </span>
        <div className="mt-2 font-arabic text-xl md:text-3xl font-extrabold text-white">
          {t(next.nameEn, next.nameAr)}
        </div>
      </div>

      <div className={`relative z-10 mt-3 grid ${showElapsed ? "grid-cols-2" : "grid-cols-1"} gap-3 items-start text-center`}>
        {/* Next prayer countdown */}
        <div className="flex flex-col items-center">
          <div className="font-time text-4xl md:text-5xl font-bold text-elite-gold tracking-tight tabular-nums">
            {formatHMS(msUntilNext)}
          </div>
          <div className="mt-1 font-arabic text-[11px] md:text-xs text-white/60">
            {t("remaining", "متبقٍ")}
          </div>
        </div>

        {/* Elapsed since current prayer — only first 45 minutes */}
        {showElapsed && (
          <div className="flex flex-col items-center border-s border-white/15">
            <div className="font-arabic text-sm md:text-lg font-semibold text-white/90">
              {t(`Since ${current.nameEn}`, `${current.nameAr} منذ`)}
            </div>
            <div className="mt-1 font-time text-2xl md:text-4xl font-bold text-white tracking-tight tabular-nums">
              {formatHMS(msSinceCurrent)}
            </div>
            <div className="mt-1 font-arabic text-[11px] md:text-xs text-white/60">
              {t("elapsed", "مضت")}
            </div>
          </div>
        )}
      </div>

      {/* City pill */}
      <div className="relative z-10 mt-4 flex justify-center">
        <CitySelector />
      </div>
    </div>
  );
}
