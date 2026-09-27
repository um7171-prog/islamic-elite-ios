import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Footprints, MoonStar, Play, Sparkles, Timer } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useJourneyNow, type JourneyNow } from "@/hooks/useJourney";
import { activityProgressText, durationText } from "@/lib/journey/format";
import { SESSION_LENGTHS } from "@/lib/journey/types";

/**
 * Home's journey section: «يومك في النخبة» (the day + one suggestion) and «أكمل رحلتي» (the last
 * open activity). Both read ONE shared snapshot (useJourneyNow: one minute clock, recomputed only
 * when the minute or the Journey changes).
 */
export function JourneyHome() {
  const data = useJourneyNow();
  return (
    <div className="space-y-4">
      <YourDayCard data={data} />
      <ContinueJourneyCard data={data} />
    </div>
  );
}

function YourDayCard({ data }: { data: JourneyNow }) {
  const { t, dir } = useLocale();
  const navigate = useNavigate();
  const { context: c, suggestion: s, summary } = data;
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;
  const last = summary.last;

  return (
    <section
      dir={dir}
      data-testid="your-day"
      data-suggestion={s.kind}
      aria-label={t("Your day in Elite", "يومك في النخبة")}
      className="relative overflow-hidden rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/[0.07]"
    >
      <div className="pointer-events-none absolute -top-16 end-[-40px] h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-body-sm font-semibold text-[hsl(var(--elite-gold-start))]">
          <Sparkles className="h-4 w-4" />
          {t("Your day in Elite", "يومك في النخبة")}
        </span>
        {c.nextPrayer && c.minutesToNext !== null && (
          <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-foreground/65" data-testid="your-day-next">
            <MoonStar className="h-4 w-4 text-primary" />
            {t(`${c.nextPrayer.nameEn} in ${durationText(c.minutesToNext).en}`, `${c.nextPrayer.nameAr} بعد ${durationText(c.minutesToNext).ar}`)}
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <h2 className="font-display text-h3 font-bold text-foreground" data-testid="your-day-title">{t(s.title.en, s.title.ar)}</h2>
        <p className="mt-1 text-body text-foreground/70" data-testid="your-day-body">{t(s.body.en, s.body.ar)}</p>
        <button
          type="button"
          onClick={() => navigate(s.route)}
          data-testid="your-day-action"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-body font-bold text-primary-foreground shadow-sm transition active:scale-95"
        >
          {t(s.action.en, s.action.ar)}
          <Arrow className="h-4 w-4" />
        </button>
      </div>

      {last && s.kind !== "continue" && s.kind !== "resume-session" && (
        <p className="relative mt-4 truncate text-body-sm text-foreground/55" data-testid="your-day-last">
          {t("Last activity: ", "آخر نشاط: ")}
          <span className="font-semibold text-foreground/75">{t(last.title.en, last.title.ar)}</span>
        </p>
      )}

      {!c.hasActiveSession && (
        <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-foreground/[0.07] pt-3" data-testid="your-day-session">
          <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-foreground/60">
            <Timer className="h-4 w-4" />
            {t("Session now", "جلسة الآن")}
          </span>
          {SESSION_LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => navigate(`/session?m=${m}`)}
              data-session-length={m}
              className="min-h-9 rounded-full bg-foreground/[0.06] px-3 text-body-sm font-semibold text-foreground/80 transition active:scale-95"
            >
              {t(`${m} min`, `${m} د`)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ContinueJourneyCard({ data }: { data: JourneyNow }) {
  const { t, dir } = useLocale();
  const navigate = useNavigate();
  const current = data.summary.current;
  const progress = current ? activityProgressText(current) : null;

  return (
    <section
      dir={dir}
      data-testid="continue-journey"
      data-state={current ? "active" : "empty"}
      aria-label={t("Continue my journey", "أكمل رحلتي")}
      className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/[0.07]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-display text-body-lg font-bold text-foreground">
          <Footprints className="h-5 w-5 text-primary" />
          {t("Continue my journey", "أكمل رحلتي")}
        </h2>
        <button type="button" onClick={() => navigate("/journey")} data-testid="open-journey" className="min-h-9 rounded-full px-3 text-body-sm font-bold text-primary transition active:scale-95">
          {t("My journey", "رحلتي")}
        </button>
      </div>

      {current ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-foreground" data-testid="continue-title">{t(current.title.en, current.title.ar)}</p>
            {progress && <p className="text-body-sm text-foreground/60" data-testid="continue-progress">{t(progress.en, progress.ar)}</p>}
            {current.progress !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(current.progress * 100)}%` }} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate(current.route)}
            data-testid="continue-action"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-body-sm font-bold text-primary-foreground transition active:scale-95"
          >
            <Play className="h-4 w-4" />
            {t("Continue", "متابعة")}
          </button>
        </div>
      ) : (
        <div className="mt-3" data-testid="continue-empty">
          <p className="text-body text-foreground/70">
            {t(
              "Your journey starts with one step. Whatever you begin here — a page of the Mushaf, Athkar, a short session — waits for you to continue.",
              "رحلتك تبدأ بخطوة. ما تبدؤه هنا — صفحة من المصحف، أذكار، جلسة قصيرة — ينتظرك لتكمله.",
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate("/quran")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-4 text-body-sm font-semibold text-foreground/80 transition active:scale-95">
              <BookOpen className="h-4 w-4" />
              {t("Open the Quran", "افتح القرآن")}
            </button>
            <button type="button" onClick={() => navigate("/session")} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-4 text-body-sm font-semibold text-foreground/80 transition active:scale-95">
              <Timer className="h-4 w-4" />
              {t("Start a session", "ابدأ جلسة")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
