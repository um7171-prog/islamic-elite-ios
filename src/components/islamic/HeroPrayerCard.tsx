import { useEffect, useMemo, useState } from "react";
import { formatCountdown, getNextPrayer, getPrayerTimes } from "@/lib/prayer";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { CitySelector } from "./CitySelector";

const gradientFor = (key: string) => {
  switch (key) {
    case "fajr": return "var(--gradient-fajr)";
    case "dhuhr": return "var(--gradient-dhuhr)";
    case "asr": return "var(--gradient-asr)";
    case "maghrib": return "var(--gradient-maghrib)";
    case "isha":
    default: return "var(--gradient-isha)";
  }
};

export function HeroPrayerCard() {
  const { t, dir } = useLocale();
  const { city } = useCity();
  const { madhab } = usePrayerCalc();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { entries } = useMemo(
    () => getPrayerTimes(now, city.lat, city.lng, madhab),
    [now.toDateString(), city.id, madhab],
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
    <div className="relative overflow-hidden rounded-[1.75rem] glass-strong px-5 py-6 md:px-8 md:py-7" dir={dir}>
      <div
        className="absolute inset-0 opacity-60 transition-all duration-1000"
        style={{ background: gradientFor(current.key) }}
      />
      <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/30 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-primary/30 blur-3xl animate-float" style={{ animationDelay: "2s" }} />

      <div className={`relative z-10 grid ${showElapsed ? "grid-cols-2" : "grid-cols-1"} gap-3 items-start text-center`}>
        {/* Next prayer countdown */}
        <div className="flex flex-col items-center">
          <div className="font-arabic text-lg md:text-2xl font-bold text-foreground">
            {t(`${next.nameEn} in`, `${next.nameAr} بعد`)}
          </div>
          <div className="mt-1 font-time text-3xl md:text-5xl font-bold text-elite-gold tracking-tight tabular-nums">
            {formatHMS(msUntilNext)}
          </div>
        </div>

        {/* Elapsed since current prayer — only first 45 minutes */}
        {showElapsed && (
          <div className="flex flex-col items-center">
            <div className="font-arabic text-lg md:text-2xl font-bold text-foreground">
              {t(`Since ${current.nameEn}`, `${current.nameAr} منذ`)}
            </div>
            <div className="mt-1 font-time text-3xl md:text-5xl font-bold text-foreground tracking-tight tabular-nums">
              {formatHMS(msSinceCurrent)}
            </div>
            <div className="mt-1 font-arabic text-[11px] md:text-xs text-foreground/60">
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
