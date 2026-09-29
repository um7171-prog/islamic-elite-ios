import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/site/SettingsUI";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { personalStats } from "@/lib/personalStats";
import { BookOpenCheck, Target } from "lucide-react";

/** «إحصائياتك»: figures recorded on this device only (see src/lib/personalStats.ts). */
export default function StatsPage() {
  const { t, lang } = useLocale();
  const navigate = useNavigate();
  const s = useMemo(() => personalStats(), []);
  const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "short" });

  const Figures = ({ items }: { items: [string, number | string][] }) => (
    <SettingsGroup className="grid grid-cols-2 divide-y-0 p-2">
      {items.map(([label, value]) => (
        <div key={label} className="p-3 text-center" data-figure={label}>
          <div className="font-display text-h3 font-bold tabular-nums text-primary">{value}</div>
          <div className="text-caption text-foreground/60">{label}</div>
        </div>
      ))}
    </SettingsGroup>
  );

  return (
    <PageShell titleAr="إحصائياتك" titleEn="Your stats" fallback="/more">
      <SEO title={t("Your stats — Elite Islamic", "إحصائياتك — النخبة الإسلامية")} description={t("Your progress, from your own activity.", "تقدّمك من نشاطك الفعلي.")} path="/stats" lang={lang === "ar" ? "ar" : "en"} />
      <div className="space-y-6" data-stats>
        <SettingsSection id="stats-quran" title={t("Quran memorization", "حفظ القرآن")}>
          <Figures items={[
            [t("Plan completed", "إنجاز الخطة"), s.plan ? `${s.plan.percent}%` : "—"],
            [t("Memorized surahs", "سور محفوظة"), s.practice.memorized],
            [t("Practice sessions", "جلسات التدريب"), s.practice.sessions],
            [t("Need review", "تحتاج مراجعة"), s.practice.needsReview],
          ]} />
          <SettingsGroup>
            {s.plan
              ? <SettingsRow icon={Target} to="/hifz" label={t("Memorization plan", "خطة الحفظ والمراجعة")} value={t(`today ${s.plan.todayAyahs}/${s.plan.dailyAyahs}`, `اليوم ${s.plan.todayAyahs}/${s.plan.dailyAyahs}`)} />
              : <SettingsRow icon={Target} to="/hifz" label={t("Create a memorization plan", "أنشئ خطة حفظ")} />}
            <SettingsRow icon={BookOpenCheck} to="/recite" label={t("Recite with a Teacher", "القراءة مع المعلم")} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="stats-athkar" title={t("Athkar — last 7 days", "الأذكار — آخر 7 أيام")}>
          <SettingsGroup className="p-4">
            <div className="flex items-end justify-between gap-1" dir="ltr" data-athkar-week>
              {s.athkar.last7.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1" data-athkar-day={d.day}>
                  <span className="text-caption font-bold tabular-nums text-foreground/70">{d.completedLists}</span>
                  <div className={cn("w-full max-w-[28px] rounded-md", d.completedLists ? "bg-primary" : d.active ? "bg-primary/30" : "bg-foreground/[0.08]")} style={{ height: `${8 + d.completedLists * 14}px` }} />
                  <span className="text-[10px] text-foreground/50">{weekday(d.day)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-body-sm text-foreground/65">
              {t(`${s.athkar.completedLists7} lists completed · active on ${s.athkar.activeDays7} of 7 days`, `${s.athkar.completedLists7} قوائم مكتملة · نشاط في ${s.athkar.activeDays7} من 7 أيام`)}
            </p>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="stats-journey" title={t("Your journey", "رحلتك")}>
          <Figures items={[
            [t("Day streak", "أيام متتالية"), s.journey.streakDays],
            [t("Sessions completed", "جلسات مكتملة"), s.journey.completedSessions],
            [t("Recitation streak", "تتابع التلاوة"), s.practice.streakDays],
            [t("Tasbeeh counter now", "عدّاد المسبحة الآن"), s.tasbeehCounter],
          ]} />
        </SettingsSection>

        <SettingsSection
          id="stats-achievements"
          title={t("Achievements", "الإنجازات")}
          footer={t("Everything here is counted from your activity on this device only.", "كل ما هنا محسوب من نشاطك على هذا الجهاز فقط.")}
        >
          <SettingsGroup>
            {s.journey.achievements.map((a) => (
              <div key={a.id} className={cn("flex items-center gap-3 px-4 py-3", !a.unlocked && "opacity-60")} data-achievement={a.id} data-unlocked={a.unlocked ? "1" : "0"}>
                <span className="text-2xl" aria-hidden>{a.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium">{t(a.en, a.ar)}</span>
                  <span className="block text-caption text-foreground/55">{t(a.descriptionEn, a.descriptionAr)}</span>
                </span>
                <span className="shrink-0 text-caption tabular-nums text-foreground/60">{a.progress}/{a.target}</span>
              </div>
            ))}
          </SettingsGroup>
        </SettingsSection>

        <button type="button" onClick={() => navigate("/journey")} className="w-full text-center text-body-sm font-semibold text-primary">
          {t("Open My Journey", "افتح رحلتي")}
        </button>
      </div>
    </PageShell>
  );
}
