import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, CheckCircle2, Footprints, Heart, History, Play, Sparkles, Timer } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SEO } from "@/components/SEO";
import { useJourneyNow } from "@/hooks/useJourney";
import { ASMA_AL_HUSNA } from "@/lib/asmaAlHusna";
import { ATHKAR_LISTS } from "@/lib/athkarProgress";
import { activityProgressText } from "@/lib/journey/format";
import { NAMES_CURSOR } from "@/lib/journey/sources";
import type { JourneyActivity } from "@/lib/journey/types";

/**
 * «رحلتي»: a calm view of the user's REAL activity — only numbers the app actually recorded or
 * reads from the features themselves (Mushaf position, today's Athkar tallies, sessions). No points,
 * no streaks, nothing estimated; where there is nothing yet, an honest empty state.
 */
export default function JourneyPage() {
  const { t, lang } = useLocale();
  const navigate = useNavigate();
  const { summary, quran, athkarToday, journey } = useJourneyNow();
  const current = summary.current;
  const namesCursor = journey.cursors[NAMES_CURSOR] ?? 0;
  const athkarStarted = athkarToday.filter((a) => a.started);
  const dateFmt = (ms: number) => new Date(ms).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", { weekday: "long", day: "numeric", month: "long" });

  return (
    <PageShell titleAr="رحلتي" titleEn="My journey" fallback="/">
      <SEO title={t("My journey", "رحلتي")} description={t("Your activity in the app, kept on this device.", "نشاطك في التطبيق، محفوظ على جهازك.")} path="/journey" lang={lang === "ar" ? "ar" : "en"} />
      <div className="space-y-4" data-testid="journey-page">
        <p className="text-body-sm text-foreground/60">{t("Kept only on this device.", "محفوظة على جهازك فقط.")}</p>

        <Block icon={Footprints} title={t("Now", "الآن")} testid="journey-current">
          {current ? (
            <ActivityRow activity={current} action={t("Continue", "متابعة")} onAction={() => navigate(current.route)} />
          ) : (
            <Empty text={t("Nothing open right now. Start something and it will wait for you here.", "لا شيء مفتوح الآن. ابدأ أي نشاط وسينتظرك هنا.")} />
          )}
        </Block>

        <Block icon={CheckCircle2} title={t("Last completed", "آخر ما أنجزته")} testid="journey-last-completed">
          {summary.lastCompleted ? (
            <ActivityRow activity={summary.lastCompleted} note={dateFmt(summary.lastCompleted.completedAt ?? summary.lastCompleted.updatedAt)} />
          ) : (
            <Empty text={t("Nothing completed yet.", "لم تُكمل نشاطًا بعد.")} />
          )}
        </Block>

        <Block icon={Timer} title={t("Sessions", "الجلسات")} testid="journey-sessions">
          {summary.sessions.started > 0 ? (
            <div className="grid grid-cols-2 gap-3 text-center">
              <Stat value={summary.sessions.started} label={t("Started", "بدأتها")} />
              <Stat value={summary.sessions.completed} label={t("Completed", "أتممتها")} />
            </div>
          ) : (
            <Empty text={t("No sessions yet.", "لا جلسات بعد.")} action={t("Start a session", "ابدأ جلسة")} onAction={() => navigate("/session")} />
          )}
        </Block>

        <Block icon={BookOpen} title={t("Quran", "القرآن")} testid="journey-quran">
          {quran ? (
            <div>
              <p className="text-body font-semibold text-foreground">
                {t(`Page ${quran.page} of ${quran.totalPages} — ${quran.surahEn}`, `صفحة ${quran.page} من ${quran.totalPages} — ${quran.surahAr}`)}
              </p>
              <p className="text-body-sm text-foreground/60">{t("Last opened: ", "آخر فتح: ")}{dateFmt(quran.at)}</p>
              <button type="button" onClick={() => navigate("/mushaf")} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-body-sm font-bold text-primary-foreground active:scale-95">
                <Play className="h-4 w-4" />
                {t("Continue reading", "تابع القراءة")}
              </button>
            </div>
          ) : (
            <Empty text={t("You haven't opened the Mushaf yet.", "لم تفتح المصحف بعد.")} action={t("Open the Quran", "افتح القرآن")} onAction={() => navigate("/quran")} />
          )}
        </Block>

        <Block icon={Heart} title={t("Today's Athkar", "أذكار اليوم")} testid="journey-athkar">
          {athkarStarted.length ? (
            <ul className="space-y-2">
              {athkarStarted.map((a) => (
                <li key={a.list} className="flex items-center justify-between gap-3">
                  <span className="text-body text-foreground">{t(ATHKAR_LISTS[a.list].en, ATHKAR_LISTS[a.list].ar)}</span>
                  <span dir="ltr" className="font-display text-body font-bold tabular-nums text-primary">{a.done} / {a.total}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={t("No Athkar counted today.", "لم تعدّ أذكارًا اليوم.")} action={t("Open Athkar", "افتح الأذكار")} onAction={() => navigate("/athkar")} />
          )}
        </Block>

        {namesCursor > 0 && (
          <Block icon={Sparkles} title={t("The Names of Allah", "أسماء الله الحسنى")} testid="journey-names">
            <p className="text-body text-foreground">
              {t(`Your sessions reached name ${namesCursor} of ${ASMA_AL_HUSNA.length}.`, `وصلت جلساتك إلى الاسم ${namesCursor} من ${ASMA_AL_HUSNA.length}.`)}
            </p>
          </Block>
        )}

        <Block icon={History} title={t("Recent activity", "نشاطك الأخير")} testid="journey-recent">
          {summary.recent.length ? (
            <ul className="divide-y divide-foreground/[0.07]">
              {summary.recent.map((a) => (
                <li key={a.id} className="py-2">
                  <ActivityRow activity={a} note={dateFmt(a.updatedAt)} compact />
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={t("Your activity will appear here.", "سيظهر نشاطك هنا.")} />
          )}
        </Block>
      </div>
    </PageShell>
  );
}

function Block({ icon: Icon, title, testid, children }: { icon: typeof Footprints; title: string; testid: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/[0.07]" data-testid={testid}>
      <h2 className="mb-3 inline-flex items-center gap-2 font-display text-body-lg font-bold text-foreground">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div data-empty="1">
      <p className="text-body text-foreground/60">{text}</p>
      {action && onAction && (
        <button type="button" onClick={onAction} className="mt-3 min-h-10 rounded-full bg-foreground/[0.06] px-4 text-body-sm font-semibold text-foreground/80 active:scale-95">
          {action}
        </button>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-primary/10 p-3">
      <div className="font-display text-h3 font-bold tabular-nums text-primary">{value}</div>
      <div className="text-body-sm text-foreground/65">{label}</div>
    </div>
  );
}

function ActivityRow({ activity, action, onAction, note, compact }: { activity: JourneyActivity; action?: string; onAction?: () => void; note?: string; compact?: boolean }) {
  const { t } = useLocale();
  const progress = activityProgressText(activity);
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className={compact ? "truncate text-body text-foreground" : "truncate text-body font-semibold text-foreground"}>{t(activity.title.en, activity.title.ar)}</p>
        <p className="text-body-sm text-foreground/60">
          {[progress ? t(progress.en, progress.ar) : null, note].filter(Boolean).join(" · ")}
        </p>
      </div>
      {action && onAction && (
        <button type="button" onClick={onAction} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-body-sm font-bold text-primary-foreground active:scale-95">
          <Play className="h-4 w-4" />
          {action}
        </button>
      )}
    </div>
  );
}
