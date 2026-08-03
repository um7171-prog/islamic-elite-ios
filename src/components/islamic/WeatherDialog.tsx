import { useState } from "react";
import { Radar, CloudSun, CloudRain, Cloud, Wind, Thermometer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { DesertModePanel } from "./DesertModePanel";

type Overlay = "rain" | "clouds" | "wind" | "temp" | "radar";

const OVERLAYS: { id: Overlay; en: string; ar: string; icon: typeof CloudRain; overlay: string; product: string }[] = [
  { id: "rain",   en: "Rain",        ar: "أمطار",  icon: CloudRain,   overlay: "rain",      product: "ecmwf" },
  { id: "clouds", en: "Clouds",      ar: "سحب",    icon: Cloud,       overlay: "clouds",    product: "ecmwf" },
  { id: "wind",   en: "Wind",        ar: "رياح",   icon: Wind,        overlay: "wind",      product: "ecmwf" },
  { id: "temp",   en: "Temperature", ar: "حرارة",  icon: Thermometer, overlay: "temp",      product: "ecmwf" },
  { id: "radar",  en: "Live Radar",  ar: "رادار مباشر", icon: Radar,  overlay: "radar",     product: "radar" },
];

export function WeatherDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, dir } = useLocale();
  const { city } = useCity();
  const [tab, setTab] = useState<"weather" | "radar">("weather");
  const [overlay, setOverlay] = useState<Overlay>("rain");

  const o = OVERLAYS.find((x) => x.id === overlay)!;
  // Closer zoom (8) + accurate marker centered on city; ECMWF model has global coverage
  const radarUrl =
    `https://embed.windy.com/embed2.html?` +
    `lat=${city.lat}&lon=${city.lng}` +
    `&detailLat=${city.lat}&detailLon=${city.lng}` +
    `&zoom=8&level=surface` +
    `&overlay=${o.overlay}&product=${o.product}` +
    `&menu=&message=true&marker=true&calendar=now` +
    `&pressure=&type=map&location=coordinates&detail=true` +
    `&metricWind=km/h&metricTemp=%C2%B0C&radarRange=-1`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Weather", "الطقس")}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 p-1 bg-muted/40 rounded-xl mb-3">
          <button
            onClick={() => setTab("weather")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
              tab === "weather" ? "bg-background shadow text-foreground" : "text-foreground/60"
            }`}
          >
            <CloudSun className="h-4 w-4" />
            {t("Weather", "الطقس")}
          </button>
          <button
            onClick={() => setTab("radar")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
              tab === "radar" ? "bg-background shadow text-foreground" : "text-foreground/60"
            }`}
          >
            <Radar className="h-4 w-4" />
            {t("Live Map", "الخريطة")}
          </button>
        </div>

        {tab === "weather" ? (
          <DesertModePanel />
        ) : (
          <div className="space-y-2">
            {/* Overlay switcher */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {OVERLAYS.map((opt) => {
                const Icon = opt.icon;
                const active = opt.id === overlay;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setOverlay(opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                      active
                        ? "bg-elite-gold text-elite-deep-green"
                        : "bg-muted/40 text-foreground/70 hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(opt.en, opt.ar)}
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl overflow-hidden border border-border bg-black">
              <iframe
                key={`${city.lat}-${city.lng}-${overlay}`}
                title="Live Weather Map"
                src={radarUrl}
                className="w-full h-[420px] border-0"
                loading="lazy"
              />
              <div className="px-3 py-2 text-[11px] text-foreground/60 bg-card flex items-center justify-between">
                <span>{t(`${o.en} · ${city.en}`, `${o.ar} · ${city.ar}`)}</span>
                <span className="text-foreground/40">
                  {overlay === "radar"
                    ? t("Radar coverage limited outside US/EU", "الرادار محدود خارج أمريكا/أوروبا")
                    : t("ECMWF model · global", "نموذج ECMWF · عالمي")}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
