import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Check, CheckCircle2, Footprints, Heart, Sparkles, Timer } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { useJourneyNow } from "@/hooks/useJourney";
import { ASMA_AL_HUSNA } from "@/lib/asmaAlHusna";
import { ATHKAR_LISTS, ATHKAR_LIST_KEYS, isAthkarListKey, loadAthkarCounts, saveAthkarCounts, athkarListProgress, type AthkarListKey } from "@/lib/athkarProgress";
import { minutesTextAr } from "@/lib/journey/format";
import { completeSessionStep, isSessionLength, startSession, stopSession, updateSessionStep } from "@/lib/journey/session";
import { getNamesCursor, getQuranProgress, noteAthkarProgress } from "@/lib/journey/sources";
import { sessionDhikrList } from "@/lib/journey/suggest";
import { SESSION_LENGTHS, type JourneySession, type SessionLength, type SessionStep } from "@/lib/journey/types";

const STEP_LABEL: Record<SessionStep["kind"], { ar: string; en: string }> = {
  quran: { ar: "قرآن", en: "Quran" },
  dhikr: { ar: "ذكر", en: "Dhikr" },
  names: { ar: "أسماء الله الحسنى", en: "Names of Allah" },
};
const STEP_ICON = { quran: BookOpen, dhikr: Heart, names: Sparkles } as const;

/**
 * «جلسة الآن»: pick 5/10/20/30 minutes, then go through short parts made of the app's own content.
 * Every part is saved in the Journey as it happens, so leaving and coming back resumes it.
 */
export default function SessionPage() {
  const { t, lang } = useLocale();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { context, summary } = useJourneyNow();
  const active = context.activeSession;
  const [finished, setFinished] = useState<JourneySession | null>(null);

  const begin = (minutes: SessionLength) => {
    setFinished(null);
    startSession(minutes, {
      dhikrList: sessionDhikrList(context),
      quranPage: getQuranProgress()?.page ?? 1,
      namesCursor: getNamesCursor(),
    });
  };

  // Home's "Session now" chips link here as /session?m=10: start that length unless one is open.
  const requested = Number(params.get("m"));
  const handled = useRef(false);
  useEffect(() => {
    if (!params.has("m") || handled.current) return;
    handled.current = true;
    if (isSessionLength(requested) && !active) begin(requested);
    setParams({}, { replace: true });
    // Handles the link's ?m= once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  return (
    <PageShell titleAr="جلسة الآن" titleEn="Session now" fallback="/">
      <SEO title={t("Session now", "جلسة الآن")} description={t("A short session from the app's own content.", "جلسة قصيرة من محتوى التطبيق.")} path="/session" lang={lang === "ar" ? "ar" : "en"} />
      <div className="space-y-4" data-testid="session-page">
        {active ? (
          <ActiveSession session={active} onFinished={setFinished} />
        ) : finished ? (
          <section className="rounded-3xl bg-card p-6 text-center shadow-sm ring-1 ring-foreground/[0.07]" data-testid="session-finished">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <h2 className="mt-3 font-display text-h3 font-bold">{t("Session complete", "أتممت الجلسة")}</h2>
            <p className="mt-1 text-body text-foreground/70">
              {t(`${finished.minutes}-minute session, ${finished.steps.length} parts.`, `جلسة ${minutesTextAr(finished.minutes)}، ${finished.steps.length} أجزاء.`)}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => navigate("/journey")} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-body font-bold text-primary-foreground active:scale-95">
                <Footprints className="h-4 w-4" />
                {t("My journey", "رحلتي")}
              </button>
              <button type="button" onClick={() => navigate("/")} className="min-h-11 rounded-full bg-foreground/[0.06] px-5 text-body font-semibold text-foreground/80 active:scale-95">
                {t("Home", "الرئيسية")}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/[0.07]" data-testid="session-picker">
            <h2 className="inline-flex items-center gap-2 font-display text-h3 font-bold">
              <Timer className="h-5 w-5 text-primary" />
              {t("How much time do you have?", "كم لديك من الوقت؟")}
            </h2>
            <p className="mt-1 text-body text-foreground/70">
              {t(
                "The session organises your time between parts of the app's content — your place in the Mushaf, Athkar and the Names of Allah. The minutes are only a guide for your own pace.",
                "الجلسة تنظّم وقتك بين أجزاء من محتوى التطبيق — موضعك في المصحف، والأذكار، وأسماء الله الحسنى. الدقائق مجرد دليل لوتيرتك.",
              )}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {SESSION_LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => begin(m)}
                  data-session-length={m}
                  className="min-h-16 rounded-2xl bg-primary/10 font-display text-h3 font-bold text-primary ring-1 ring-primary/20 transition active:scale-95"
                >
                  {t(`${m} min`, minutesTextAr(m))}
                </button>
              ))}
            </div>
            {summary.sessions.completed > 0 && (
              <p className="mt-4 text-body-sm text-foreground/60" data-testid="session-history">
                {t(`Sessions completed: ${summary.sessions.completed}`, `جلسات أتممتها: ${summary.sessions.completed}`)}
              </p>
            )}
          </section>
        )}
      </div>
    </PageShell>
  );
}

function ActiveSession({ session, onFinished }: { session: JourneySession; onFinished: (s: JourneySession) => void }) {
  const { t } = useLocale();
  const step = session.steps[session.currentStep];

  const finishStep = (data: Record<string, number> = {}) => {
    const s = completeSessionStep(session.id, data);
    if (s && s.status === "completed") onFinished(s);
  };

  return (
    <>
      <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/[0.07]" data-testid="session-active" data-step={step.kind}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-h3 font-bold">{t(`${session.minutes}-minute session`, `جلسة ${minutesTextAr(session.minutes)}`)}</h2>
          <span className="text-body-sm font-semibold text-foreground/60" data-testid="session-step-index">
            {t(`Part ${session.currentStep + 1} of ${session.steps.length}`, `الجزء ${session.currentStep + 1} من ${session.steps.length}`)}
          </span>
        </div>
        <ol className="mt-4 flex gap-2" aria-label={t("Session parts", "أجزاء الجلسة")}>
          {session.steps.map((st, i) => {
            const Icon = STEP_ICON[st.kind];
            return (
              <li
                key={i}
                data-status={st.status}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-body-sm font-semibold",
                  st.status === "done" ? "bg-primary text-primary-foreground" : st.status === "active" ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-foreground/[0.06] text-foreground/55",
                )}
              >
                {st.status === "done" ? <Check className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
                <span className="truncate">{t(STEP_LABEL[st.kind].en, STEP_LABEL[st.kind].ar)}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-body-sm text-foreground/55">
          {t(`About ${step.minutes} min — at your own pace.`, `نحو ${minutesTextAr(step.minutes)} — بوتيرتك.`)}
        </p>
      </section>

      {step.kind === "quran" && <QuranPart step={step} onDone={finishStep} />}
      {step.kind === "dhikr" && <DhikrPart session={session} step={step} onDone={() => finishStep()} />}
      {step.kind === "names" && <NamesPart step={step} onDone={() => finishStep()} />}

      <button
        type="button"
        onClick={() => stopSession(session.id)}
        data-testid="session-stop"
        className="mx-auto block min-h-11 rounded-full px-5 text-body-sm font-semibold text-foreground/55 active:scale-95"
      >
        {t("End session without completing", "إنهاء الجلسة دون إكمال")}
      </button>
    </>
  );
}

const partCard = "rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/[0.07]";
const doneButton = "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-body font-bold text-primary-foreground active:scale-95";

function QuranPart({ step, onDone }: { step: SessionStep; onDone: (data: Record<string, number>) => void }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const startPage = typeof step.data.startPage === "number" ? step.data.startPage : 1;
  // The real position from the Mushaf itself (read on every render of this part — cheap).
  const position = getQuranProgress();
  const page = position?.page ?? startPage;

  return (
    <section className={partCard} data-testid="session-quran">
      <h3 className="font-display text-body-lg font-bold">{t("Quran — from your place in the Mushaf", "قرآن — من موضعك في المصحف")}</h3>
      <p className="mt-1 text-body text-foreground/70" data-testid="session-quran-range">
        {page > startPage
          ? t(`You read from page ${startPage} to page ${page}.`, `قرأت من صفحة ${startPage} إلى صفحة ${page}.`)
          : t(`Starts at page ${startPage}${position ? ` — ${position.surahEn}` : ""}.`, `تبدأ من صفحة ${startPage}${position ? ` — ${position.surahAr}` : ""}.`)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => navigate("/mushaf")} data-testid="session-open-mushaf" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-5 text-body font-semibold text-foreground/85 active:scale-95">
          <BookOpen className="h-4 w-4" />
          {t("Open the Mushaf", "افتح المصحف")}
        </button>
        <button type="button" onClick={() => onDone({ endPage: page })} data-testid="session-step-done" className={doneButton}>
          <Check className="h-4 w-4" />
          {t("Done with this part", "أنهيت هذا الجزء")}
        </button>
      </div>
    </section>
  );
}

function DhikrPart({ session, step, onDone }: { session: JourneySession; step: SessionStep; onDone: () => void }) {
  const { t, lang } = useLocale();
  const list: AthkarListKey = isAthkarListKey(step.data.list) ? step.data.list : "post-prayer";
  const items = ATHKAR_LISTS[list].items;
  // Shared with the Athkar screen: counting here is counting there.
  const [counts, setCounts] = useState<number[]>(() => loadAthkarCounts(list));
  useEffect(() => setCounts(loadAthkarCounts(list)), [list]);
  const progress = useMemo(() => athkarListProgress(list, counts), [list, counts]);

  const tap = (i: number) => {
    const next = counts.map((v, idx) => (idx === i ? Math.min(v + 1, items[i].count) : v));
    setCounts(next);
    saveAthkarCounts(list, next);
    noteAthkarProgress(list, next);
  };

  return (
    <section className={partCard} data-testid="session-dhikr" data-list={list}>
      <div className="flex flex-wrap gap-2">
        {ATHKAR_LIST_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => updateSessionStep(session.id, { list: k })}
            data-list-option={k}
            className={cn("min-h-9 rounded-full px-3 text-body-sm font-semibold active:scale-95", k === list ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground/75")}
          >
            {t(ATHKAR_LISTS[k].en, ATHKAR_LISTS[k].ar)}
          </button>
        ))}
      </div>
      <p className="mt-3 text-body-sm font-semibold text-foreground/60" data-testid="session-dhikr-progress">
        {t(`${progress.done} of ${progress.total} completed today`, `أنجزت ${progress.done} من ${progress.total} اليوم`)}
      </p>
      <div className="mt-3 space-y-2">
        {items.map((it, i) => {
          const done = counts[i] >= it.count;
          return (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              data-dhikr={i}
              data-done={done ? "1" : "0"}
              className={cn("w-full rounded-2xl p-4 text-start ring-1 transition active:scale-[0.99]", done ? "bg-primary/10 ring-primary/30" : "bg-background ring-foreground/[0.07]")}
            >
              <p dir="rtl" className="font-arabic text-[20px] font-bold leading-[2] text-foreground">{it.ar}</p>
              {lang === "en" && <p className="text-body-sm text-foreground/65">{it.en}</p>}
              <span dir="ltr" className="mt-1 inline-block font-display text-body font-bold tabular-nums text-primary">{counts[i]} / {it.count}</span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onDone} data-testid="session-step-done" className={cn(doneButton, "mt-4")}>
        <Check className="h-4 w-4" />
        {t("Done with this part", "أنهيت هذا الجزء")}
      </button>
    </section>
  );
}

function NamesPart({ step, onDone }: { step: SessionStep; onDone: () => void }) {
  const { t } = useLocale();
  const from = typeof step.data.from === "number" ? step.data.from : 0;
  const to = typeof step.data.to === "number" ? step.data.to : from;
  const names = ASMA_AL_HUSNA.slice(from, to);

  return (
    <section className={partCard} data-testid="session-names">
      <h3 className="font-display text-body-lg font-bold">{t("The Names of Allah", "أسماء الله الحسنى")}</h3>
      <p className="mt-1 text-body-sm text-foreground/60">
        {t(`Names ${from + 1}–${to} of ${ASMA_AL_HUSNA.length}; the next session continues after them.`, `الأسماء ${from + 1}–${to} من ${ASMA_AL_HUSNA.length}، والجلسة القادمة تكمل بعدها.`)}
      </p>
      <ul className="mt-3 space-y-2">
        {names.map((n) => (
          <li key={n.number} className="rounded-2xl bg-background p-4 ring-1 ring-foreground/[0.07]">
            <p className="font-arabic text-[22px] font-bold text-foreground">{n.ar}</p>
            <p className="text-body-sm text-foreground/65" dir="ltr">{n.transliteration} — {n.en}</p>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone} data-testid="session-step-done" className={cn(doneButton, "mt-4")}>
        <Check className="h-4 w-4" />
        {t("Done with this part", "أنهيت هذا الجزء")}
      </button>
    </section>
  );
}
