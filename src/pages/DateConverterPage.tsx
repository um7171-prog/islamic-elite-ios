import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, CalendarPlus } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SEO } from "@/components/SEO";
import { dateToHijri, formatDate, formatHijri, hijriToDate, HIJRI_MONTHS_AR, HIJRI_MONTHS_EN } from "@/lib/dailyTools";
import { pad2, ymd } from "@/lib/events";

type Direction = "g2h" | "h2g";
const num = (s: string) => Number.parseInt(s, 10);

/**
 * Hijri ↔ Gregorian converter. The left/right fields swap roles with the
 * swap button (the input side is editable, the other side shows the live
 * conversion). "Convert" reveals the full result; "Add to Calendar" opens the
 * calendar's add-appointment form on the converted Gregorian date.
 */
export default function DateConverterPage() {
  const { t, lang, dir } = useLocale();
  const L: "ar" | "en" = lang === "ar" ? "ar" : "en";
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayH = useMemo(() => dateToHijri(today), [today]);
  const [direction, setDirection] = useState<Direction>("g2h");
  const [g, setG] = useState(() => ymd(today));
  const [hy, setHy] = useState(String(todayH.hy));
  const [hm, setHm] = useState(String(todayH.hm));
  const [hd, setHd] = useState(String(todayH.hd));
  const [shown, setShown] = useState(true);
  const months = L === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;

  // Resolve both sides from the active input.
  const resolved = useMemo(() => {
    try {
      if (direction === "g2h") {
        const [y, m, d] = g.split("-").map(Number);
        if (!y || !m || !d) return null;
        const date = new Date(y, m - 1, d);
        const h = dateToHijri(date);
        return { date, h };
      }
      const y = num(hy), m = num(hm), d = num(hd);
      if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 30) return null;
      const date = hijriToDate(y, m, d);
      if (Number.isNaN(date.getTime())) return null;
      return { date, h: { hy: y, hm: m, hd: d } };
    } catch {
      return null;
    }
  }, [direction, g, hy, hm, hd]);

  const swap = () => {
    // Carry the current conversion over so the fields stay consistent.
    if (resolved) {
      setG(ymd(resolved.date));
      setHy(String(resolved.h.hy));
      setHm(String(resolved.h.hm));
      setHd(String(resolved.h.hd));
    }
    setDirection((d) => (d === "g2h" ? "h2g" : "g2h"));
  };

  const gregInput = (
    <input
      type="date"
      aria-label={t("Gregorian date", "التاريخ الميلادي")}
      value={direction === "g2h" ? g : resolved ? ymd(resolved.date) : g}
      readOnly={direction !== "g2h"}
      onChange={(e) => setG(e.target.value)}
      className="h-12 w-full min-w-0 rounded-xl bg-foreground/[0.05] px-2 text-center text-body font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:opacity-70"
    />
  );

  const hijriShown = direction === "h2g" ? { hy, hm, hd } : resolved ? { hy: String(resolved.h.hy), hm: String(resolved.h.hm), hd: String(resolved.h.hd) } : { hy, hm, hd };
  const hijriInputs = (
    <div dir="ltr" className="flex w-full min-w-0 items-center gap-1">
      {(
        [
          ["hd", hijriShown.hd, setHd, t("Day", "اليوم"), "w-[28%]"],
          ["hm", hijriShown.hm, setHm, t("Month", "الشهر"), "w-[28%]"],
          ["hy", hijriShown.hy, setHy, t("Year", "السنة"), "w-[44%]"],
        ] as const
      ).map(([id, value, setter, label, w]) => (
        <input
          key={id}
          inputMode="numeric"
          aria-label={`${t("Hijri", "هجري")} ${label}`}
          value={value}
          readOnly={direction !== "h2g"}
          onChange={(e) => setter(e.target.value.replace(/\D/g, "").slice(0, id === "hy" ? 4 : 2))}
          className={`h-12 ${w} min-w-0 rounded-xl bg-foreground/[0.05] px-1 text-center text-body font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:opacity-70`}
        />
      ))}
    </div>
  );

  const Field = ({ title, subtitle, children, active }: { title: string; subtitle: string; children: React.ReactNode; active: boolean }) => (
    <div className={`min-w-0 flex-1 rounded-2xl p-3 transition ${active ? "bg-card ring-2 ring-primary/50 shadow-sm" : "bg-card/70 ring-1 ring-foreground/[0.07]"}`}>
      <div className="mb-2 text-center leading-tight">
        <div className="text-body font-bold">{title}</div>
        {lang === "ar" && (
          <div className="text-[12px] text-foreground/55" dir="ltr">
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );

  return (
    <PageShell titleAr="تحويل التاريخ" titleEn="Date Converter" fallback="/calculators">
      <SEO
        title={t("Date Converter — Elite Islamic", "تحويل التاريخ — النخبة الإسلامية")}
        description={t("Convert between Hijri and Gregorian dates.", "حوّل بين التاريخ الهجري والميلادي.")}
        path="/date-converter"
        lang={L}
      />
      <div className="space-y-5">
        <div className="flex items-stretch gap-2" data-testid="date-fields" dir={dir}>
          <Field title={t("Gregorian Date", "التاريخ الميلادي")} subtitle="Gregorian Date" active={direction === "g2h"}>
            {gregInput}
          </Field>
          <button
            type="button"
            onClick={swap}
            aria-label={t("Swap direction", "تبديل الاتجاه")}
            data-testid="date-swap"
            className="grid h-11 w-11 shrink-0 place-items-center self-center rounded-full bg-card text-primary shadow-sm ring-1 ring-foreground/[0.08] transition active:scale-95"
          >
            <ArrowLeftRight className="h-5 w-5" />
          </button>
          <Field title={t("Hijri Date", "التاريخ الهجري")} subtitle="Hijri Date" active={direction === "h2g"}>
            {hijriInputs}
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setShown(true)}
          data-testid="date-convert"
          className="flex min-h-[52px] w-full flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition active:scale-[0.98]"
        >
          <span className="text-body font-bold">{t("Convert", "تحويل")}</span>
          {lang === "ar" && <span className="text-[12px] opacity-80" dir="ltr">Convert</span>}
        </button>

        {shown && resolved && (
          <div className="glass space-y-3 rounded-3xl p-4" data-testid="date-result">
            <h2 className="text-body font-bold text-foreground/70">{t("Result", "النتيجة")}</h2>
            <div className="space-y-1 leading-snug">
              <div className="font-arabic text-h3 font-bold text-primary" data-testid="result-hijri">
                {formatHijri(resolved.date, L)}
              </div>
              <div className="text-body font-semibold" data-testid="result-greg">
                {formatDate(resolved.date, L)}
              </div>
              <div className="text-body-sm text-foreground/60" dir="ltr" data-testid="result-numeric">
                {pad2(resolved.date.getDate())}/{pad2(resolved.date.getMonth() + 1)}/{resolved.date.getFullYear()} · {resolved.h.hd}/{resolved.h.hm}/{resolved.h.hy}
                {" "}({months[resolved.h.hm - 1]})
              </div>
            </div>
            <button
              type="button"
              data-testid="date-add-calendar"
              onClick={() => navigate(`/calendar?add=${ymd(resolved.date)}`)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-accent/15 text-body font-semibold text-[hsl(var(--elite-gold-start))] transition active:scale-[0.98]"
            >
              <CalendarPlus className="h-5 w-5" />
              {t("Add to Calendar", "إضافة إلى التقويم")}
            </button>
          </div>
        )}
        {shown && !resolved && (
          <p className="rounded-2xl bg-destructive/10 p-4 text-center text-body-sm text-destructive">
            {t("Enter a valid date.", "أدخل تاريخاً صحيحاً.")}
          </p>
        )}
      </div>
    </PageShell>
  );
}
