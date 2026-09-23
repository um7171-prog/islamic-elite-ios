import { useEffect, useMemo, useState } from "react";
import { MoonStar } from "lucide-react";
import { formatTime, getNextPrayer, getPrayerTimes, type PrayerEntry, type PrayerKey } from "@/lib/prayer";
import { getAtmospherePeriod } from "@/lib/prayerAtmosphere";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { MosqueArt } from "@/components/site/MosqueArt";
import { adhanElapsedLabel, getAdhanElapsed } from "@/lib/notifications/AdhanElapsed";

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
    // Timers are throttled/paused in the background: refresh the moment the app is visible again.
    const onVisible = () => { if (document.visibilityState === "visible") setNow(new Date()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const { entries } = useMemo(
    () => getPrayerTimes(now, city.lat, city.lng, madhab, { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [now.toDateString(), city.id, madhab, calcSignature],
  );
  // Yesterday's times too, so "الأذان منذ" still works just after midnight (yesterday's Isha).
  const yesterdayEntries = useMemo(() => {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return getPrayerTimes(y, city.lat, city.lng, madhab, { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }).entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.toDateString(), city.id, madhab, calcSignature]);
  // Tomorrow's real times, so a chosen prayer that already passed today counts down to tomorrow's.
  const tomorrowEntries = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return getPrayerTimes(d, city.lat, city.lng, madhab, { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }).entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.toDateString(), city.id, madhab, calcSignature]);
  const { current, next, msUntilNext } = getNextPrayer(entries, now);
  // Straight from the current time and the real prayer times (never from notifications or tick counts).
  const adhan = getAdhanElapsed(now, [...yesterdayEntries, ...entries]);
  // Raw (unclamped) diff: before today's Fajr, `current` is today's (still
  // upcoming) Isha entry, so a negative diff must not read as "just arrived".
  const rawSinceCurrent = now.getTime() - current.time.getTime();
  const justArrived = rawSinceCurrent >= 0 && rawSinceCurrent < 60_000;
  return { now, entries, yesterdayEntries, tomorrowEntries, current, next, msUntilNext, justArrived, adhan };
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
  const { current, next, msUntilNext, justArrived, adhan } = useNextPrayer();

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
        {adhan && (
          <div
            data-testid="adhan-elapsed"
            data-minutes={adhan.minutes}
            className="mt-2 rounded-full bg-primary/10 px-3 py-1 font-arabic text-body-sm font-semibold text-primary"
          >
            {adhanElapsedLabel(adhan.minutes, lang === "ar" ? "ar" : "en")}
          </div>
        )}
      </div>
    </div>
  );
}

/** "أذّن منذ دقيقة / دقيقتين / 3 دقائق … / 11 دقيقة" — minutes since a prayer's adhan time. */
function adhanSinceLabel(minutes: number, lang: "ar" | "en"): string {
  if (lang === "en") return minutes === 1 ? "Adhan 1 min ago" : `Adhan ${minutes} min ago`;
  if (minutes === 1) return "أذّن منذ دقيقة";
  if (minutes === 2) return "أذّن منذ دقيقتين";
  if (minutes <= 10) return `أذّن منذ ${minutes} دقائق`;
  return `أذّن منذ ${minutes} دقيقة`;
}

/** Compact "time until the next prayer" bar (Prayer Times screen, above the list).
 * `selectedKey` (optional) counts down to that specific prayer instead — today's time, or
 * tomorrow's once today's has passed. For the first 30 minutes after a prayer's adhan
 * (ADHAN_ELAPSED_WINDOW_MINUTES) the bar does not jump to the next prayer: it shows
 * "أذّن منذ N دقيقة" for that prayer (the selected one, when one is selected), then returns to the
 * normal countdown. `atmosphere` paints the bar with the time-of-day gradient of the shown prayer
 * (the same `bg-fajr`/`bg-dhuhr`/… tokens as Home's strip). */
export function NextPrayerBar({
  className = "",
  selectedKey = null,
  atmosphere = false,
}: {
  className?: string;
  selectedKey?: PrayerKey | null;
  atmosphere?: boolean;
}) {
  const { t, dir, lang } = useLocale();
  const { now, entries, yesterdayEntries, tomorrowEntries, next, msUntilNext, adhan } = useNextPrayer();

  let target: PrayerEntry = next;
  let ms = msUntilNext;
  // The prayer whose adhan passed within the window — for the selected prayer only, when one is selected.
  let since: { entry: PrayerEntry; minutes: number } | null = null;
  const chosen = selectedKey ? entries.find((e) => e.key === selectedKey) : undefined;
  if (chosen) {
    const upcoming = chosen.time.getTime() > now.getTime() ? chosen : tomorrowEntries.find((e) => e.key === chosen.key) ?? chosen;
    target = upcoming;
    ms = upcoming.time.getTime() - now.getTime();
    const own = getAdhanElapsed(now, [...yesterdayEntries, ...entries].filter((e) => e.key === chosen.key));
    if (own) since = { entry: chosen, minutes: own.minutes };
  } else if (adhan) {
    const entry = entries.find((e) => e.key === adhan.prayer);
    if (entry) since = { entry, minutes: adhan.minutes };
  }
  if (since) target = since.entry;

  const background = atmosphere ? (chosen ?? since?.entry ?? getAtmospherePeriod(entries, now)).gradient : "bg-header";

  return (
    <div
      dir={dir}
      data-testid="next-prayer-bar"
      data-target={target.key}
      data-mode={since ? "since" : "countdown"}
      className={`${background} relative overflow-hidden rounded-2xl p-4 shadow-sm transition-colors ${className}`}
    >
      {/* Keeps the white/gold text readable on the lighter daytime gradients (Dhuhr, Sunrise). */}
      {atmosphere && <div className="pointer-events-none absolute inset-0 bg-black/25" aria-hidden="true" />}
      <div className="relative flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[hsl(var(--elite-gold-end))] ring-[1.5px] ring-inset ring-[hsl(var(--elite-gold-start)/0.7)]">
          <MoonStar className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          {since && since.minutes === 0 ? (
            <div className="font-arabic text-h3 font-bold text-[hsl(var(--elite-gold-end))]" data-testid="adhan-since">
              {t(`It's now ${since.entry.nameEn} time`, `حان الآن وقت ${since.entry.nameAr}`)}
            </div>
          ) : since ? (
            <>
              <div className="font-arabic text-body-lg font-semibold text-white">{t(since.entry.nameEn, since.entry.nameAr)}</div>
              <div className="font-arabic text-[26px] font-bold leading-tight text-[hsl(var(--elite-gold-end))]" data-testid="adhan-since" data-minutes={since.minutes}>
                {adhanSinceLabel(since.minutes, lang === "ar" ? "ar" : "en")}
              </div>
            </>
          ) : (
            <>
              <div className="font-arabic text-body-lg font-semibold text-white">
                {t(`Remaining until ${target.nameEn}`, `متبقي على ${target.nameAr}`)}
              </div>
              <div dir="ltr" className="rtl:text-right ltr:text-left font-time text-[32px] font-bold leading-tight tabular-nums text-[hsl(var(--elite-gold-end))]" data-testid="hero-countdown">
                {formatHMS(ms)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
