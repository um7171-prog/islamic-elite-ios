import { useEffect, useMemo, useState } from "react";
import { Sunrise, Sun, CloudSun, Sunset, Moon, MoonStar, Hourglass, Volume2, VolumeX } from "lucide-react";
import { formatTime, getNextPrayer, getPrayerTimes, type PrayerKey } from "@/lib/prayer";
import { useNotificationsOptional } from "@/components/notifications/NotificationsProvider";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";

type StripItem = {
  key: string;
  Icon: React.ElementType;
  iconClass: string;
};

const STYLES: Record<string, StripItem> = {
  fajr:    { key: "fajr",    Icon: CloudSun, iconClass: "text-sky-500" },
  sunrise: { key: "sunrise", Icon: Sunrise,  iconClass: "text-orange-400" },
  dhuhr:   { key: "dhuhr",   Icon: Sun,      iconClass: "text-amber-400" },
  asr:     { key: "asr",     Icon: CloudSun, iconClass: "text-violet-400" },
  maghrib: { key: "maghrib", Icon: Sunset,   iconClass: "text-orange-500" },
  isha:    { key: "isha",    Icon: Moon,     iconClass: "text-indigo-600" },
};

export function PrayerStrip({ variant = "strip" }: { variant?: "strip" | "list" }) {
  const { lang, t, dir } = useLocale();
  const notif = useNotificationsOptional();
  const { city } = useCity();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { entries, sunnah } = useMemo(
    () => getPrayerTimes(now, city.lat, city.lng, madhab, { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [now.toDateString(), city.id, madhab, calcSignature],
  );
  const { next, progress } = getNextPrayer(entries, now);

  const locale = lang === "ar" ? "ar-SA" : "en-US";

  const sunnahTiles = (
      <div className="grid grid-cols-2 gap-2">
        <div className="glass rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-body-sm text-foreground/70">
            <MoonStar className="h-3.5 w-3.5 text-accent" />
            {t("Midnight", "منتصف الليل")}
          </span>
          <span className="font-time text-body-sm font-semibold text-foreground">
            {formatTime(sunnah.middleOfTheNight, locale)}
          </span>
        </div>
        <div className="glass rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-body-sm text-foreground/70">
            <Hourglass className="h-3.5 w-3.5 text-accent" />
            {t("Last Third", "الثلث الأخير")}
          </span>
          <span className="font-time text-body-sm font-semibold text-elite-gold">
            {formatTime(sunnah.lastThirdOfTheNight, locale)}
          </span>
        </div>
      </div>
  );

  if (variant === "list") {
    return (
      <div dir={dir} className="space-y-3">
        <ul className="glass overflow-hidden rounded-2xl divide-y divide-foreground/[0.07]" data-testid="prayer-list">
          {entries.map((p) => {
            const style = STYLES[p.key] ?? STYLES.dhuhr;
            const Icon = style.Icon;
            const isNext = p.key === next.key;
            const alertOn = p.key !== "sunrise" && notif ? notif.prayerSettings.perPrayerEnabled[p.key as Exclude<PrayerKey, "sunrise">] !== false : null;
            return (
              <li
                key={p.key}
                data-prayer={p.key}
                className={`flex min-h-[64px] items-center gap-3 px-4 py-2.5 ${isNext ? "bg-primary/10" : ""}`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10">
                  <Icon className={`h-[18px] w-[18px] ${style.iconClass}`} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={`block text-body font-semibold ${isNext ? "text-primary" : "text-foreground"}`}>
                    {t(p.nameEn, p.nameAr)}
                  </span>
                  {lang === "ar" && (
                    <span dir="ltr" className="block text-start text-[12px] text-foreground/55 rtl:text-right">{p.nameEn}</span>
                  )}
                </span>
                {isNext && (
                  <span className="shrink-0 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--elite-gold-start))]">
                    {t("Next", "القادمة")}
                  </span>
                )}
                <span dir="ltr" className={`font-time text-body font-bold tabular-nums whitespace-nowrap ${isNext ? "text-primary" : "text-foreground"}`}>
                  {formatTime(p.time, locale)}
                </span>
                {alertOn !== null && (
                  <span
                    data-alert={alertOn ? "on" : "off"}
                    aria-label={alertOn ? t("Alert on", "التنبيه مفعّل") : t("Alert off", "التنبيه متوقف")}
                    className={alertOn ? "text-primary" : "text-foreground/30"}
                  >
                    {alertOn ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {sunnahTiles}
      </div>
    );
  }

  return (
    <div dir={dir} className="space-y-3">
      {/* Horizontal strip */}
      <div className="glass rounded-2xl p-2 border border-foreground/10 shadow-sm">
        <div className="flex items-stretch gap-1 w-full">
          {entries.map((p) => {
            const style = STYLES[p.key] ?? STYLES.dhuhr;
            const Icon = style.Icon;
            const isNext = p.key === next.key;
            return (
              <div
                key={p.key}
                className={`flex-1 min-w-0 flex flex-col items-center px-0.5 py-2.5 rounded-xl transition ${
                  isNext ? "bg-accent/15 ring-1 ring-accent" : "opacity-60"
                }`}
              >
                <div className={`text-[11px] min-[400px]:text-label mb-1.5 whitespace-nowrap max-w-full ${isNext ? "text-accent" : "text-foreground/85"}`}>
                  {t(p.nameEn, p.nameAr)}
                </div>
                <div className="relative h-10 w-10 mb-1.5">
                  {isNext && (
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--elite-gold-start) / 0.2)" strokeWidth="2.5" />
                      <circle
                        cx="18" cy="18" r="16" fill="none"
                        stroke="hsl(var(--elite-gold-start))"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={`${progress * 100.5} 100.5`}
                        style={{ transition: "stroke-dasharray 600ms linear" }}
                      />
                    </svg>
                  )}
                  <div className="absolute inset-[3px] rounded-full bg-card shadow-md grid place-items-center ring-1 ring-foreground/10">
                    <Icon className={`h-4 w-4 ${style.iconClass}`} strokeWidth={2.2} />
                  </div>
                </div>
                <div
                  className={`font-time text-[12px] sm:text-body-sm font-bold tabular-nums whitespace-nowrap ${
                    isNext ? "text-elite-gold" : "text-foreground"
                  }`}
                >
                  {formatTime(p.time, locale)}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {sunnahTiles}
    </div>
  );
}
