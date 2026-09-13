import { useEffect, useState } from "react";
import { AlertTriangle, Wind, CloudRain, Thermometer, Sun, Snowflake } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { fetchLiveWeather, deriveWeatherAlerts, type WeatherAlert } from "@/lib/weather";

const ICONS = {
  dust: Wind,
  wind: Wind,
  rain: CloudRain,
  heat: Thermometer,
  cold: Snowflake,
  uv: Sun,
} as const;

const SEVERITY_STYLES: Record<WeatherAlert["severity"], string> = {
  info: "ring-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  warning: "ring-orange-500/40 text-orange-300 bg-orange-500/10",
  severe: "ring-red-500/50 text-red-300 bg-red-500/15",
};

export function WeatherAlerts() {
  const { t, dir } = useLocale();
  const { city } = useCity();
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchLiveWeather(city.lat, city.lng, ctrl.signal)
      .then((w) => setAlerts(deriveWeatherAlerts(w)))
      .catch(() => setAlerts([]))
      .finally(() => setLoaded(true));
    return () => ctrl.abort();
  }, [city.id, city.lat, city.lng]);

  if (loaded && alerts.length === 0) {
    return (
      <div
        dir={dir}
        className="glass rounded-2xl px-4 py-3 flex items-center gap-3 text-xs text-foreground/70"
      >
        <span className="h-8 w-8 rounded-lg grid place-items-center bg-emerald-500/15 text-emerald-300">
          <Wind className="h-4 w-4" />
        </span>
        <div>
          <div className="font-semibold text-foreground/90">
            {t("No active alerts", "لا توجد تنبيهات حالياً")}
          </div>
          <div className="text-[11px] text-foreground/55">
            {t(`Conditions are normal in ${city.en}`, `الأحوال طبيعية في ${city.ar}`)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="space-y-2">
      {alerts.map((a, i) => {
        const Icon = ICONS[a.kind] ?? AlertTriangle;
        return (
          <div
            key={i}
            className={`glass rounded-2xl px-4 py-3 flex items-center gap-3 text-xs ring-1 ${SEVERITY_STYLES[a.severity]}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-foreground/90">{t(a.en, a.ar)}</span>
          </div>
        );
      })}
    </div>
  );
}
