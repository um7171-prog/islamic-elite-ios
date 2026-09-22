import { useEffect, useMemo, useState } from "react";
import { Sunrise, Sun, CloudSun, Sunset, Moon, MoonStar, Hourglass, Volume2, VolumeX } from "lucide-react";
import { formatTime, getNextPrayer, getPrayerTimes, type PrayerKey } from "@/lib/prayer";
import { getAtmospherePeriod } from "@/lib/prayerAtmosphere";
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

/** How long a tap-preview of another prayer's atmosphere lasts before reverting to the real,
 * automatic, time-based one. */
const PREVIEW_MS = 5000;

export function PrayerStrip({ variant = "strip" }: { variant?: "strip" | "list" }) {
  const { lang, t, dir } = useLocale();
  const notif = useNotificationsOptional();
  const { city } = useCity();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    // Timers are throttled/paused in the background; recompute the moment the app is visible again
    // instead of waiting for the next tick, so the atmosphere is never stale after a resume.
    const onVisible = () => { if (document.visibilityState === "visible") setNow(new Date()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const { entries, sunnah } = useMemo(
    () => getPrayerTimes(now, city.lat, city.lng, madhab, { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [now.toDateString(), city.id, madhab, calcSignature],
  );
  const { next, progress } = getNextPrayer(entries, now);

  // The REAL, automatic atmosphere — always driven by the actual current time and the app's own
  // prayer times, recomputed every tick (and immediately on resume via the effect above).
  const realAtmosphere = useMemo(() => getAtmospherePeriod(entries, now), [entries, now]);

  // A tap on a specific prayer time previews ITS atmosphere for a few seconds without changing the
  // real, underlying state — when the preview ends (or the real period itself changes) it always
  // falls back to `realAtmosphere`, never the other way around.
  const [previewKey, setPreviewKey] = useState<PrayerKey | null>(null);
  useEffect(() => {
    if (!previewKey) return;
    const id = window.setTimeout(() => setPreviewKey(null), PREVIEW_MS);
    return () => window.clearTimeout(id);
  }, [previewKey]);
  useEffect(() => setPreviewKey(null), [realAtmosphere.key]); // the real time moved on — drop any stale preview

  const shownAtmosphere = (previewKey && entries.find((e) => e.key === previewKey)) || realAtmosphere;
  const previewing = previewKey !== null && previewKey !== realAtmosphere.key;

  // Cross-fade between gradients: CSS cannot interpolate one gradient into another directly, so the
  // new gradient fades in over the old one (a single opacity animation — no JS animation loop), then
  // becomes the base layer once the fade finishes. Under prefers-reduced-motion the fade is instant
  // (see index.css), so this still resolves to a plain swap with no motion.
  const [displayedGradient, setDisplayedGradient] = useState(shownAtmosphere.gradient);
  const [incomingGradient, setIncomingGradient] = useState<string | null>(null);
  useEffect(() => {
    if (shownAtmosphere.gradient !== displayedGradient) setIncomingGradient(shownAtmosphere.gradient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownAtmosphere.gradient]);

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
      {/* Horizontal strip, on a background that reflects the real time of day (Fajr/Sunrise/Dhuhr/
          Asr/Maghrib/Isha) — reuses the app's own gradient tokens (--gradient-fajr, …), transitions
          smoothly between them, and updates itself automatically as the real prayer time changes.
          Tapping a tile PREVIEWS that prayer's atmosphere for a few seconds without changing the
          real, underlying state. */}
      <div
        data-testid="prayer-atmosphere"
        data-atmosphere={shownAtmosphere.key}
        data-previewing={previewing}
        className="relative overflow-hidden rounded-2xl border border-white/10 shadow-sm"
      >
        <div className={`absolute inset-0 ${displayedGradient}`} aria-hidden="true" />
        {incomingGradient && (
          <div
            key={incomingGradient}
            className={`absolute inset-0 ${incomingGradient} atmosphere-fade-in`}
            aria-hidden="true"
            onAnimationEnd={() => { setDisplayedGradient(incomingGradient); setIncomingGradient(null); }}
          />
        )}
        <div className="relative flex items-stretch gap-1 w-full p-2">
          {entries.map((p) => {
            const style = STYLES[p.key] ?? STYLES.dhuhr;
            const Icon = style.Icon;
            const isNext = p.key === next.key;
            return (
              <button
                type="button"
                key={p.key}
                data-testid={`prayer-tile-${p.key}`}
                onClick={() => setPreviewKey((cur) => (cur === p.key ? null : p.key))}
                aria-pressed={previewKey === p.key}
                aria-label={t(`Preview ${p.nameEn} atmosphere`, `معاينة أجواء ${p.nameAr}`)}
                className={`flex-1 min-w-0 flex flex-col items-center px-0.5 py-2.5 rounded-xl transition ${
                  isNext ? "bg-white/15 ring-1 ring-accent" : "opacity-80 hover:opacity-100"
                }`}
              >
                <div className={`text-[11px] min-[400px]:text-label mb-1.5 whitespace-nowrap max-w-full ${isNext ? "text-accent" : "text-white/90"}`}>
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
                    isNext ? "text-elite-gold" : "text-white"
                  }`}
                >
                  {formatTime(p.time, locale)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {sunnahTiles}
    </div>
  );
}
