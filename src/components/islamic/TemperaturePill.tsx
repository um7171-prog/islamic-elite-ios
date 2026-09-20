import { Thermometer } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { useTemperature } from "@/lib/temperature";

/** Small live-temperature pill for the city being used (automatic or manual). */
export function TemperaturePill() {
  const { t, lang } = useLocale();
  const { city } = useCity();
  const state = useTemperature(city.lat, city.lng);
  const cityName = lang === "ar" ? city.ar : city.en;

  const label =
    state.status === "ok"
      ? t(`Temperature in ${cityName}: ${Math.round(state.reading.tempC)}°C`, `درجة الحرارة في ${cityName}: ${Math.round(state.reading.tempC)}° مئوية`)
      : state.status === "loading"
        ? t("Loading temperature", "جارٍ تحميل درجة الحرارة")
        : t("Temperature unavailable", "درجة الحرارة غير متاحة");

  return (
    <span
      data-testid="temperature"
      data-status={state.status}
      role="status"
      aria-label={label}
      title={label}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-body-sm font-semibold text-white"
    >
      <Thermometer className="h-4 w-4 text-[hsl(var(--elite-gold-end))]" />
      {state.status === "ok" ? (
        <span dir="ltr" className="tabular-nums" data-testid="temperature-value">
          {Math.round(state.reading.tempC)}°
        </span>
      ) : state.status === "loading" ? (
        <span className="h-3 w-6 animate-pulse rounded bg-white/25" />
      ) : (
        <span dir="ltr" className="text-white/70">--°</span>
      )}
    </span>
  );
}
