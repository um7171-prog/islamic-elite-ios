import { useEffect, useMemo, useState } from "react";
import { MoonStar } from "lucide-react";
import { formatTime, getNextPrayer, getPrayerTimes } from "@/lib/prayer";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { MosqueArt } from "@/components/site/MosqueArt";

/**
 * "Next prayer" card. Only the five prayers can be next (sunrise never is).
 * The prayer name appears exactly once, inside the single phrase
 * "متبقي على <الصلاة>", which sits directly above its countdown.
 */
/** Shared next-prayer state (ticks every second). */
function useNextPrayer() {
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
  // Raw (unclamped) diff: before today's Fajr, `current` is today's (still
  // upcoming) Isha entry, so a negative diff must not read as "just arrived".
  const rawSinceCurrent = now.getTime() - current.time.getTime();
  const justArrived = rawSinceCurrent >= 0 && rawSinceCurrent < 60_000;
  return { current, next, msUntilNext, justArrived };
}

const formatHMS = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export function HeroPrayerCard({ className = "" }: { className?: string }) {
  const { t, dir, lang } = useLocale();
  const { current, next, msUntilNext, justArrived } = useNextPrayer();

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-[0_6px_24px_-8px_hsl(160_40%_20%/0.25)] ${className}`}
      dir={dir}
    >
      <MosqueArt className="pointer-events-none absolute -bottom-4 end-[-12px] w-52 text-primary/[0.08]" />
      <div className="pointer-events-none absolute -top-16 start-[-40px] h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-body-sm font-semibold text-[hsl(var(--elite-gold-start))]">
          <MoonStar className="h-4 w-4" />
          {justArrived ? t("Prayer time", "وقت الصلاة") : t("Next Prayer", "الصلاة القادمة")}
        </span>
        {!justArrived && (
          <span dir="ltr" className="font-time text-body font-bold tabular-nums text-foreground/70" data-testid="hero-prayer-time">
            {formatTime(next.time, lang === "ar" ? "ar-SA" : "en-US")}
          </span>
        )}
      </div>

      {/* One unit: "متبقي على الظهر" is a single phrase, directly above its own
          countdown. The prayer name appears exactly once in this card. */}
      <div className="relative mt-4 flex flex-col items-center text-center" aria-live="off">
        {justArrived ? (
          <div className="py-3 font-arabic text-h1 font-bold text-primary">
            {t(`It's now ${current.nameEn} time`, `حان الآن وقت ${current.nameAr}`)}
          </div>
        ) : (
          <>
            <div className="font-arabic text-h3 font-semibold text-foreground">
              {t(`Remaining until ${next.nameEn}`, `متبقي على ${next.nameAr}`)}
            </div>
            <div
              dir="ltr"
              className="mt-1 font-time text-[44px] font-bold leading-tight tracking-tight tabular-nums text-primary"
              data-testid="hero-countdown"
            >
              {formatHMS(msUntilNext)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Compact "time until the next prayer" bar (Prayer Times screen, under the list). */
export function NextPrayerBar({ className = "" }: { className?: string }) {
  const { t, dir } = useLocale();
  const { current, next, msUntilNext, justArrived } = useNextPrayer();
  return (
    <div dir={dir} className={`bg-header relative overflow-hidden rounded-2xl p-4 shadow-sm ${className}`}>
      <div className="relative flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[hsl(var(--elite-gold-end))] ring-[1.5px] ring-inset ring-[hsl(var(--elite-gold-start)/0.7)]">
          <MoonStar className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          {justArrived ? (
            <div className="font-arabic text-h3 font-bold text-[hsl(var(--elite-gold-end))]">
              {t(`It's now ${current.nameEn} time`, `حان الآن وقت ${current.nameAr}`)}
            </div>
          ) : (
            <>
              <div className="font-arabic text-body-lg font-semibold text-white">
                {t(`Remaining until ${next.nameEn}`, `متبقي على ${next.nameAr}`)}
              </div>
              <div dir="ltr" className="rtl:text-right ltr:text-left font-time text-[32px] font-bold leading-tight tabular-nums text-[hsl(var(--elite-gold-end))]" data-testid="hero-countdown">
                {formatHMS(msUntilNext)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
