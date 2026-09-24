import { useEffect, useMemo, useState } from "react";
import { MoonStar } from "lucide-react";
import { formatTime, getNextPrayer, getPrayerTimes, type PrayerEntry, type PrayerKey } from "@/lib/prayer";
import { getAtmospherePeriod } from "@/lib/prayerAtmosphere";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { MosqueArt } from "@/components/site/MosqueArt";

/** How long the "منذ MM:SS" line stays under the countdown after a prayer's time enters. */
export const SINCE_WINDOW_MINUTES = 45;

/**
 * Shared prayer-card state (ticks every second). With `selectedKey` the countdown targets that
 * prayer (today's time, or tomorrow's once today's has passed); without it, the next prayer.
 * `since` is the time elapsed since the adhan — of the selected prayer when one is selected,
 * otherwise of the prayer that entered most recently — while under SINCE_WINDOW_MINUTES.
 */
function usePrayerCountdown(selectedKey: PrayerKey | null) {
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

  const calc = { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 };
  const { entries } = useMemo(
    () => getPrayerTimes(now, city.lat, city.lng, madhab, calc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now.toDateString(), city.id, madhab, calcSignature],
  );
  // Yesterday's times too, so "منذ" still works just after midnight (yesterday's Isha).
  const yesterdayEntries = useMemo(() => {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return getPrayerTimes(y, city.lat, city.lng, madhab, calc).entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.toDateString(), city.id, madhab, calcSignature]);
  // Tomorrow's real times, so a chosen prayer that already passed today counts down to tomorrow's.
  const tomorrowEntries = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return getPrayerTimes(d, city.lat, city.lng, madhab, calc).entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.toDateString(), city.id, madhab, calcSignature]);

  const { next, msUntilNext } = getNextPrayer(entries, now);
  const chosen = selectedKey ? entries.find((e) => e.key === selectedKey) : undefined;

  let target: PrayerEntry = next;
  let ms = msUntilNext;
  if (chosen) {
    const upcoming = chosen.time.getTime() > now.getTime() ? chosen : tomorrowEntries.find((e) => e.key === chosen.key) ?? chosen;
    target = upcoming;
    ms = upcoming.time.getTime() - now.getTime();
  }

  // Straight from the current time and the real prayer times (never from notifications or tick counts).
  let since: { entry: PrayerEntry; ms: number } | null = null;
  for (const e of [...yesterdayEntries, ...entries]) {
    if (e.key === "sunrise") continue; // not a prayer
    if (chosen && e.key !== chosen.key) continue;
    const age = now.getTime() - e.time.getTime();
    if (age < 0 || age >= SINCE_WINDOW_MINUTES * 60_000) continue;
    if (!since || age < since.ms) since = { entry: e, ms: age };
  }

  return { now, entries, chosen, target, ms, since };
}

const formatHMS = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** Minutes and seconds only (the window is under an hour): 00:00 … 44:59. */
const formatMS = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
};

/** "منذ 15:32" — shown under the countdown, never instead of it. */
function SinceLine({ ms, className }: { ms: number; className: string }) {
  const { t } = useLocale();
  return (
    <div data-testid="adhan-since" data-seconds={Math.floor(ms / 1000)} className={className}>
      <span className="font-arabic">{t("Since", "منذ")}</span>{" "}
      <span dir="ltr" className="font-time tabular-nums">{formatMS(ms)}</span>
    </div>
  );
}

/**
 * "Next prayer" card (Home). Only the five prayers can be next (sunrise never is).
 * The prayer name appears exactly once, inside the single phrase "متبقي على <الصلاة>", which sits
 * directly above its countdown. `selectedKey` (a prayer tapped in Home's strip) points the
 * countdown at that prayer instead.
 */
export function HeroPrayerCard({ className = "", selectedKey = null }: { className?: string; selectedKey?: PrayerKey | null }) {
  const { t, dir, lang } = useLocale();
  const { chosen, target, ms, since } = usePrayerCountdown(selectedKey);

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-[0_6px_24px_-8px_hsl(160_40%_20%/0.25)] ${className}`}
      dir={dir}
      data-testid="hero-card"
      data-target={target.key}
    >
      <MosqueArt className="pointer-events-none absolute -bottom-4 end-[-12px] w-52 text-primary/[0.08]" />
      <div className="pointer-events-none absolute -top-16 start-[-40px] h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-body-sm font-semibold text-[hsl(var(--elite-gold-start))]">
          <MoonStar className="h-4 w-4" />
          {chosen ? t("Selected prayer", "الصلاة المختارة") : t("Next Prayer", "الصلاة القادمة")}
        </span>
        <span dir="ltr" className="font-time text-body font-bold tabular-nums text-foreground/70" data-testid="hero-prayer-time">
          {formatTime(target.time, lang === "ar" ? "ar-SA" : "en-US")}
        </span>
      </div>

      {/* One unit: "متبقي على الظهر" is a single phrase, directly above its own
          countdown. The prayer name appears exactly once in this card. */}
      <div className="relative mt-4 flex flex-col items-center text-center" aria-live="off">
        <div className="font-arabic text-h3 font-semibold text-foreground">
          {t(`Remaining until ${target.nameEn}`, `متبقي على ${target.nameAr}`)}
        </div>
        <div
          dir="ltr"
          className="mt-1 font-time text-[44px] font-bold leading-tight tracking-tight tabular-nums text-primary"
          data-testid="hero-countdown"
        >
          {formatHMS(ms)}
        </div>
        {since && (
          <SinceLine ms={since.ms} className="mt-2 rounded-full bg-primary/10 px-4 py-1.5 text-body-lg font-bold text-primary" />
        )}
      </div>
    </div>
  );
}

/** Compact countdown bar (Prayer Times screen, above the list), with the same behaviour as the
 * Home card: `selectedKey` counts down to that prayer, and "منذ MM:SS" appears under the countdown
 * for SINCE_WINDOW_MINUTES after a prayer's time. `atmosphere` paints the bar with the time-of-day
 * gradient of the shown prayer (the same `bg-fajr`/`bg-dhuhr`/… tokens as Home's strip). */
export function NextPrayerBar({
  className = "",
  selectedKey = null,
  atmosphere = false,
}: {
  className?: string;
  selectedKey?: PrayerKey | null;
  atmosphere?: boolean;
}) {
  const { t, dir } = useLocale();
  const { now, entries, chosen, target, ms, since } = usePrayerCountdown(selectedKey);

  const background = atmosphere ? (chosen ?? getAtmospherePeriod(entries, now)).gradient : "bg-header";

  return (
    <div
      dir={dir}
      data-testid="next-prayer-bar"
      data-target={target.key}
      className={`${background} relative overflow-hidden rounded-2xl p-4 shadow-sm transition-colors ${className}`}
    >
      {/* Keeps the white/gold text readable on the lighter daytime gradients (Dhuhr, Sunrise). */}
      {atmosphere && <div className="pointer-events-none absolute inset-0 bg-black/25" aria-hidden="true" />}
      <div className="relative flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[hsl(var(--elite-gold-end))] ring-[1.5px] ring-inset ring-[hsl(var(--elite-gold-start)/0.7)]">
          <MoonStar className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-arabic text-body-lg font-semibold text-white">
            {t(`Remaining until ${target.nameEn}`, `متبقي على ${target.nameAr}`)}
          </div>
          <div dir="ltr" className="rtl:text-right ltr:text-left font-time text-[32px] font-bold leading-tight tabular-nums text-[hsl(var(--elite-gold-end))]" data-testid="hero-countdown">
            {formatHMS(ms)}
          </div>
          {since && <SinceLine ms={since.ms} className="mt-1 text-body-lg font-bold text-white" />}
        </div>
      </div>
    </div>
  );
}
