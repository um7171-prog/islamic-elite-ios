import { useEffect, useMemo, useState } from "react";
import { Sunrise, Sun, CloudSun, Sunset, Moon, Star } from "lucide-react";
import { formatTime, getNextPrayer, getPrayerTimes } from "@/lib/prayer";
import { useLocale } from "@/contexts/LocaleContext";

const ICONS: Record<string, React.ElementType> = {
  fajr: Star,
  sunrise: Sunrise,
  dhuhr: Sun,
  asr: CloudSun,
  maghrib: Sunset,
  isha: Moon,
};

export function PrayerGrid() {
  const { lang, t, dir } = useLocale();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { entries } = useMemo(() => getPrayerTimes(now), [now.toDateString()]);
  const { next } = getNextPrayer(entries, now);
  const locale = lang === "ar" ? "ar-SA" : "en-US";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3" dir={dir}>
      {entries.map((p) => {
        const Icon = ICONS[p.key];
        const isNext = p.key === next.key;
        const isPast = p.time < now;
        return (
          <div
            key={p.key}
            className={`relative glass rounded-2xl p-4 transition-all duration-500 hover:scale-[1.02] ${
              isNext ? "ring-2 ring-accent glow-gold" : ""
            } ${isPast && !isNext ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className={`h-9 w-9 rounded-xl grid place-items-center ${
                isNext ? "bg-accent text-accent-foreground" : "bg-foreground/10 text-foreground/80"
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              {isNext && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                  {t("Next", "التالية")}
                </span>
              )}
            </div>
            <div className={`mt-3 font-display text-base font-semibold ${isNext ? "text-elite-gold" : "text-foreground"}`}>
              {t(p.nameEn, p.nameAr)}
            </div>
            <div className="font-time text-xl font-light text-foreground/90 mt-0.5">
              {formatTime(p.time, locale)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
