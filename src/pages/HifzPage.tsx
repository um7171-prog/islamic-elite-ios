import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Play, RotateCcw, Search } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { ChipPicker, Segmented, SettingsGroup, SettingsSection } from "@/components/site/SettingsUI";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SURAHS } from "@/lib/mushafData";
import { loadSessions, practiceStats, type MemorizationLevel } from "@/lib/recitePractice";
import { DAILY_AYAH_OPTIONS, PRESETS, clearPlan, loadPlan, orderSurahs, planProgress, reciteLink, savePlan, type HifzPlan, type PlanOrder } from "@/lib/hifzPlan";
import { searchSurahs } from "@/lib/surahPlayer";

type T = (en: string, ar: string) => string;
type Preset = "juz30" | "juz29" | "custom";

const levelLabel = (l: MemorizationLevel, t: T) =>
  ({ "not-started": t("Not started", "لم يبدأ"), learning: t("Learning", "قيد الحفظ"), "needs-review": t("Needs review", "يحتاج مراجعة"), memorized: t("Memorized", "محفوظة") })[l];

/**
 * «خطة الحفظ والمراجعة»: what to memorize and how much per day, over the recitation self-practice.
 * Every figure is computed from the user's saved practice sessions (see src/lib/hifzPlan.ts).
 */
export default function HifzPage() {
  const { t, lang } = useLocale();
  const [plan, setPlan] = useState<HifzPlan | null>(() => loadPlan());
  const [editing, setEditing] = useState(false);

  return (
    <PageShell titleAr="خطة الحفظ والمراجعة" titleEn="Memorization plan" fallback="/more">
      <SEO
        title={t("Memorization plan — Elite Islamic", "خطة الحفظ والمراجعة — النخبة الإسلامية")}
        description={t("A daily memorization and review plan built on your own practice.", "خطة يومية للحفظ والمراجعة مبنية على تدريبك.")}
        path="/hifz"
        lang={lang === "ar" ? "ar" : "en"}
      />
      {plan && !editing
        ? <PlanView plan={plan} t={t} lang={lang} onEdit={() => setEditing(true)} onDelete={() => { clearPlan(); setPlan(null); }} />
        : <PlanSetup t={t} lang={lang} initial={plan} onSaved={(p) => { setPlan(p); setEditing(false); }} onCancel={plan ? () => setEditing(false) : undefined} />}
    </PageShell>
  );
}

function PlanSetup({ t, lang, initial, onSaved, onCancel }: { t: T; lang: string; initial: HifzPlan | null; onSaved: (p: HifzPlan) => void; onCancel?: () => void }) {
  const [preset, setPreset] = useState<Preset>("juz30");
  const [order, setOrder] = useState<PlanOrder>("descending");
  const [custom, setCustom] = useState<number[]>(() => initial?.surahs ?? []);
  const [daily, setDaily] = useState<number>(initial?.dailyAyahs ?? 5);
  const [query, setQuery] = useState("");

  const chosen = preset === "custom" ? custom : [...PRESETS[preset]];
  const ordered = orderSurahs(chosen, order);
  const toggle = (n: number) => setCustom((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]));

  return (
    <div className="space-y-6" data-hifz="setup">
      <SettingsSection id="hifz-what" title={t("What will you memorize?", "ماذا ستحفظ؟")}>
        <SettingsGroup className="space-y-3 p-4">
          <Segmented<Preset>
            fullWidth
            value={preset}
            onChange={setPreset}
            ariaLabel={t("Portion", "المقدار")}
            options={[{ value: "juz30", label: t("Juz Amma", "جزء عمّ") }, { value: "juz29", label: t("Juz Tabarak", "جزء تبارك") }, { value: "custom", label: t("Choose surahs", "سور مختارة") }]}
          />
          <Segmented<PlanOrder>
            fullWidth
            value={order}
            onChange={setOrder}
            ariaLabel={t("Order", "الترتيب")}
            options={[{ value: "descending", label: t("From the end of the Mushaf", "من آخر المصحف") }, { value: "ascending", label: t("In Mushaf order", "بترتيب المصحف") }]}
          />
          <p className="text-body-sm text-foreground/65" data-hifz="summary">
            {ordered.length
              ? t(`${ordered.length} surahs · starts with ${SURAHS[ordered[0] - 1].en}`, `${ordered.length} سورة · تبدأ بسورة ${SURAHS[ordered[0] - 1].ar}`)
              : t("Choose at least one surah.", "اختر سورة واحدة على الأقل.")}
          </p>
        </SettingsGroup>
      </SettingsSection>

      {preset === "custom" && (
        <SettingsSection id="hifz-surahs" title={t("Surahs", "السور")}>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-foreground/40" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search surahs…", "ابحث عن سورة…")} className="ps-11" />
          </div>
          <SettingsGroup>
            {searchSurahs(query).map((s) => {
              const on = custom.includes(s.n);
              return (
                <button key={s.n} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s.n)} className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-start" data-pick={s.n}>
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25")}>{on && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1 truncate text-body">{s.n}. {lang === "ar" ? s.ar : s.en}</span>
                  <span className="shrink-0 text-caption text-foreground/50">{t(`${s.ayahs} ayahs`, `${s.ayahs} آية`)}</span>
                </button>
              );
            })}
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection id="hifz-daily" title={t("Daily goal (ayahs)", "الهدف اليومي (آيات)")}>
        <SettingsGroup className="pt-3.5">
          <ChipPicker<number> value={daily} onChange={setDaily} options={DAILY_AYAH_OPTIONS.map((n) => ({ value: n, label: String(n) }))} />
        </SettingsGroup>
      </SettingsSection>

      <div className="space-y-2">
        <Button type="button" disabled={!ordered.length} onClick={() => onSaved(savePlan(ordered, daily))} className="h-12 w-full text-base font-bold" data-hifz="save">
          {t("Save plan", "احفظ الخطة")}
        </Button>
        {onCancel && <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>{t("Cancel", "إلغاء")}</Button>}
      </div>
    </div>
  );
}

function PlanView({ plan, t, lang, onEdit, onDelete }: { plan: HifzPlan; t: T; lang: string; onEdit: () => void; onDelete: () => void }) {
  const navigate = useNavigate();
  const sessions = useMemo(() => loadSessions(), []);
  const p = useMemo(() => planProgress(plan, sessions), [plan, sessions]);
  const streak = practiceStats(sessions).streakDays;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = (n: number) => (lang === "ar" ? SURAHS[n - 1].ar : SURAHS[n - 1].en);

  return (
    <div className="space-y-6" data-hifz="plan">
      <SettingsGroup className="space-y-3 p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-display text-h2 font-bold tabular-nums text-primary" data-hifz="percent">{p.percent}%</div>
            <div className="text-body-sm text-foreground/60">{t(`${p.memorizedAyahs} of ${p.totalAyahs} ayahs memorized`, `${p.memorizedAyahs} من ${p.totalAyahs} آية محفوظة`)}</div>
          </div>
          <div className="text-end text-body-sm text-foreground/60">{t(`${streak}-day streak`, `${streak} أيام متتالية`)}</div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${p.percent}%` }} />
        </div>
        <p className={cn("text-body-sm font-semibold", p.todayDone ? "text-primary" : "text-foreground/70")} data-hifz="today">
          {p.todayDone ? t("Today's goal is done", "أنجزت هدف اليوم") : t(`Today: ${p.todayAyahs} of ${p.dailyAyahs} ayahs`, `اليوم: ${p.todayAyahs} من ${p.dailyAyahs} آيات`)}
        </p>
      </SettingsGroup>

      <SettingsSection id="hifz-next" title={t("Today's portion", "ورد اليوم")}>
        <SettingsGroup className="space-y-3 p-4">
          {p.next ? (
            <>
              <p className="text-body font-semibold" data-hifz="next">{t(`${name(p.next.surah)} · ayahs ${p.next.fromAyah}–${p.next.toAyah}`, `سورة ${name(p.next.surah)} · الآيات ${p.next.fromAyah}–${p.next.toAyah}`)}</p>
              <Button type="button" className="h-11 w-full font-bold" onClick={() => navigate(reciteLink(p.next!))} data-hifz="start">
                <Play className="me-2 h-4 w-4" />{t("Start", "ابدأ")}
              </Button>
            </>
          ) : (
            <p className="text-body font-semibold text-primary" data-hifz="complete">{t("You have memorized the whole plan. Keep reviewing it.", "أتممت حفظ الخطة كاملة. واصل مراجعتها.")}</p>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection id="hifz-review" title={t("Due for review", "للمراجعة")}>
        <SettingsGroup>
          {p.reviewDue.length === 0 && <p className="px-4 py-4 text-body-sm text-foreground/60">{t("Nothing due for review.", "لا شيء للمراجعة الآن.")}</p>}
          {p.reviewDue.map((s) => (
            <div key={s.surah} className="flex items-center gap-3 px-4 py-3" data-review={s.surah}>
              <span className="min-w-0 flex-1 truncate text-body font-medium">{name(s.surah)}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => navigate(reciteLink({ surah: s.surah, fromAyah: 1, toAyah: s.ayahs }, "review"))}>
                <RotateCcw className="me-1.5 h-3.5 w-3.5" />{t("Review", "راجع")}
              </Button>
            </div>
          ))}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        id="hifz-surahs"
        title={t("Plan surahs", "سور الخطة")}
        footer={t("Figures come from your sessions saved in «Recite with a Teacher».", "الأرقام من جلساتك المحفوظة في «القراءة مع المعلم».")}
      >
        <SettingsGroup>
          {p.surahs.map((s) => (
            <div key={s.surah} className="flex items-center gap-3 px-4 py-3" data-plan-surah={s.surah}>
              <span className="min-w-0 flex-1 truncate text-body font-medium">{name(s.surah)}</span>
              <span className="shrink-0 text-caption tabular-nums text-foreground/55">{s.memorizedAyahs}/{s.ayahs}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-caption", s.level === "memorized" ? "bg-primary/10 text-primary" : "bg-foreground/[0.06] text-foreground/60")}>{levelLabel(s.level, t)}</span>
            </div>
          ))}
        </SettingsGroup>
      </SettingsSection>

      <div className="space-y-2">
        <Button type="button" variant="outline" className="w-full" onClick={onEdit} data-hifz="edit">{t("Edit plan", "تعديل الخطة")}</Button>
        {confirmDelete
          ? <Button type="button" variant="destructive" className="w-full" onClick={onDelete} data-hifz="delete-confirm">{t("Delete the plan (your sessions are kept)", "احذف الخطة (جلساتك تبقى)")}</Button>
          : <Button type="button" variant="ghost" className="w-full text-destructive" onClick={() => setConfirmDelete(true)} data-hifz="delete">{t("Delete plan", "حذف الخطة")}</Button>}
      </div>
    </div>
  );
}
