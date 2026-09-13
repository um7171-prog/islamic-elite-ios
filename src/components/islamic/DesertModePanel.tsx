import { useEffect, useMemo, useState } from "react";
import { Wind, Eye, Thermometer, Droplets, Sun, Tent } from "lucide-react";
import { getDesertConditions } from "@/lib/desert";
import { fetchLiveWeather, type LiveWeather } from "@/lib/weather";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";

const dustColor = (risk: string) => {
  switch (risk) {
    case "severe": return "text-red-400";
    case "high": return "text-orange-400";
    case "moderate": return "text-yellow-400";
    default: return "text-emerald-400";
  }
};

/** SVG moon disc — illumination 0..1 mirrors SwiftUI Canvas drawing for parity. */
function MoonDisc({ illumination, size = 56 }: { illumination: number; size?: number }) {
  const r = 28;
  const offset = (1 - illumination * 2) * r;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(45 80% 92%)" />
          <stop offset="100%" stopColor="hsl(45 40% 70%)" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r={r} fill="hsl(220 30% 14%)" />
      <clipPath id="moonClip">
        <circle cx="32" cy="32" r={r} />
      </clipPath>
      <g clipPath="url(#moonClip)">
        <ellipse cx={32 + offset / 2} cy="32" rx={Math.abs(r - Math.abs(offset) / 2)} ry={r} fill="url(#moonGlow)" />
        {illumination > 0.95 && <circle cx="32" cy="32" r={r} fill="url(#moonGlow)" />}
      </g>
      <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(45 40% 60% / 0.4)" strokeWidth="0.5" />
    </svg>
  );
}

export function DesertModePanel() {
  const { t, dir } = useLocale();
  const { city } = useCity();
  const base = useMemo(() => getDesertConditions(new Date()), []);
  const [live, setLive] = useState<LiveWeather | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchLiveWeather(city.lat, city.lng, ctrl.signal)
      .then(setLive)
      .catch(() => setLive(null));
    return () => ctrl.abort();
  }, [city.id, city.lat, city.lng]);

  // Merge live data over fallback climatology
  const c = {
    ...base,
    tempC: live?.tempC ?? base.tempC,
    feelsLikeC: live?.feelsLikeC ?? base.feelsLikeC,
    humidity: live?.humidity ?? base.humidity,
    windKph: live?.windKph ?? base.windKph,
    windDir: live?.windDir ?? base.windDir,
    visibilityKm: live?.visibilityKm ?? base.visibilityKm,
    uvIndex: live?.uvIndex ?? base.uvIndex,
  };

  const stats = [
    { icon: Thermometer, label: t("Temp", "الحرارة"), value: `${c.tempC}°C`, sub: `${t("feels", "محسوسة")} ${c.feelsLikeC}°` },
    { icon: Droplets,    label: t("Humidity", "الرطوبة"), value: `${c.humidity}%`, sub: "" },
    { icon: Wind,        label: t("Wind", "الرياح"), value: `${c.windKph} kph`, sub: c.windDir },
    { icon: Eye,         label: t("Visibility", "الرؤية"), value: `${c.visibilityKm} km`, sub: t(`${c.dustRisk} dust`, `غبار ${c.dustRisk}`) },
    { icon: Sun,         label: t("UV Index", "الأشعة"), value: `${c.uvIndex}`, sub: "" },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl glass-strong p-6 md:p-8" dir={dir}>
      <div className="absolute inset-0 opacity-40 bg-desert" />
      <div className="absolute -top-20 end-[-2.5rem] h-64 w-64 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-elite-gold font-semibold">
              {t(`Weather · ${city.en}`, `الطقس · ${city.ar}`)}
              {live && <span className="ms-2 text-[9px] text-primary/80 normal-case tracking-normal">● {t("live", "مباشر")}</span>}
            </div>
            <div className="mt-2 font-display text-2xl md:text-3xl font-bold text-foreground">
              {t(c.seasonEn, c.seasonAr)}
            </div>
          </div>
          <div className="glass rounded-2xl px-4 py-3 text-center min-w-[110px]">
            <div className="text-[10px] uppercase tracking-widest text-foreground/60">
              {t("Camping Score", "ملاءمة الكشتة")}
            </div>
            <div className="font-time text-3xl font-bold text-elite-gold">
              {c.campingScore}
            </div>
          </div>
        </div>

        {/* Moon phase hero row */}
        <div className="mt-6 glass rounded-2xl p-4 flex items-center gap-4">
          <MoonDisc illumination={c.astro.illumination} size={64} />
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-foreground/60">
              {t("Moon Phase", "طور القمر")}
            </div>
            <div className="font-display text-lg font-semibold text-foreground">
              {t(c.astro.moonPhaseEn, c.astro.moonPhaseAr)}
            </div>
            <div className="text-xs text-foreground/60 mt-0.5">
              {t("Illumination", "الإضاءة")} ·{" "}
              <span className="font-time text-foreground/90">{Math.round(c.astro.illumination * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Stats — compact horizontal row */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {stats.map(({ icon: Icon, label, value, sub }) => (
            <div
              key={label}
              className="glass rounded-xl px-3 py-2 flex items-center gap-2 shrink-0 snap-start"
            >
              <Icon className={`h-3.5 w-3.5 ${
                label === t("Visibility", "الرؤية") ? dustColor(c.dustRisk) : "text-foreground/60"
              }`} />
              <div className="leading-tight">
                <div className="font-time text-xs font-semibold text-foreground whitespace-nowrap">
                  {value}
                </div>
                <div className="text-[10px] text-foreground/55 whitespace-nowrap">
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recommendation */}
        <div className="mt-5 glass rounded-2xl p-4 flex gap-3 items-start">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-accent/20 text-accent shrink-0">
            <Tent className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-elite-gold font-semibold">
              {t("Recommendation", "التوصية")}
            </div>
            <div className="text-sm text-foreground/90 mt-1 leading-relaxed">
              {t(c.recommendation.en, c.recommendation.ar)}
            </div>
            <div className="text-xs text-foreground/60 mt-2 italic">
              {t(c.sunriseAdvice.en, c.sunriseAdvice.ar)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
