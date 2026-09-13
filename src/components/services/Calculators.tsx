import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw } from "lucide-react";
import {
  ageBreakdown, convertTemperature, convertUnit, dateToHijri, formatDate, formatHijri,
  hijriToDate, HIJRI_MONTHS_AR, HIJRI_MONTHS_EN, loanPayment, UNIT_GROUPS,
} from "@/lib/dailyTools";
import { calculateInheritance } from "@/lib/inheritance";
import { Field, NumberField, ResultCard, num, useLocalState, useMoneyFormat } from "./ToolKit";

const CURRENCIES = ["SAR", "USD", "EUR", "GBP", "AED", "KWD", "EGP", "JOD", "QAR", "BHD", "OMR", "TRY", "INR", "PKR"];

/* ---------------- Age ---------------- */
export function AgeCalculator() {
  const { t, lang } = useLocale();
  const [birth, setBirth] = useLocalState("tool.age.birth", "1990-01-01");
  const d = new Date(birth);
  const valid = !Number.isNaN(d.getTime());
  const a = useMemo(() => (valid ? ageBreakdown(d) : null), [birth]);

  return (
    <div className="space-y-4">
      <Field label={t("Date of birth", "تاريخ الميلاد")}>
        <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className="h-11 bg-input/60" />
      </Field>
      {a && (
        <>
          <ResultCard
            title={t("Gregorian age", "العمر بالميلادي")}
            highlight={`${a.gregorian.years} ${t("y", "سنة")} · ${a.gregorian.months} ${t("m", "شهر")} · ${a.gregorian.days} ${t("d", "يوم")}`}
            rows={[
              { label: t("Total days", "إجمالي الأيام"), value: a.totalDays.toLocaleString("en-US") },
              { label: t("Total weeks", "إجمالي الأسابيع"), value: a.totalWeeks.toLocaleString("en-US") },
              { label: t("Total hours", "إجمالي الساعات"), value: a.totalHours.toLocaleString("en-US") },
              { label: t("Next birthday", "الميلاد القادم"), value: formatDate(a.nextBirthday, lang as "ar" | "en") },
            ]}
          />
          <ResultCard
            title={t("Hijri age", "العمر بالهجري")}
            highlight={`${a.hijri.years} ${t("y", "سنة")} · ${a.hijri.months} ${t("m", "شهر")} · ${a.hijri.days} ${t("d", "يوم")}`}
            rows={[{ label: t("Hijri birth date", "تاريخ الميلاد الهجري"), value: formatHijri(d, lang as "ar" | "en") }]}
          />
        </>
      )}
    </div>
  );
}

/* ---------------- Hijri converter ---------------- */
export function HijriConverter() {
  const { t, lang } = useLocale();
  const [mode, setMode] = useState<"g2h" | "h2g">("g2h");
  const [g, setG] = useState(() => new Date().toISOString().slice(0, 10));
  const today = dateToHijri(new Date());
  const [hy, setHy] = useState(String(today.hy));
  const [hm, setHm] = useState(String(today.hm));
  const [hd, setHd] = useState(String(today.hd));
  const months = lang === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;

  let out: { a: string; b: string } | null = null;
  try {
    if (mode === "g2h") {
      const d = new Date(g);
      if (!Number.isNaN(d.getTime())) out = { a: formatHijri(d, lang as "ar" | "en"), b: formatDate(d, lang as "ar" | "en") };
    } else {
      const d = hijriToDate(num(hy), num(hm), num(hd));
      out = { a: formatDate(d, lang as "ar" | "en"), b: formatHijri(d, lang as "ar" | "en") };
    }
  } catch { out = null; }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3">
        <span className="text-sm font-semibold">{mode === "g2h" ? t("Gregorian → Hijri", "ميلادي ← هجري") : t("Hijri → Gregorian", "هجري ← ميلادي")}</span>
        <Switch checked={mode === "h2g"} onCheckedChange={(v) => setMode(v ? "h2g" : "g2h")} />
      </div>
      {mode === "g2h" ? (
        <Field label={t("Gregorian date", "التاريخ الميلادي")}>
          <Input type="date" value={g} onChange={(e) => setG(e.target.value)} className="h-11 bg-input/60" />
        </Field>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <NumberField label={t("Day", "اليوم")} value={hd} onChange={setHd} />
          <Field label={t("Month", "الشهر")}>
            <Select value={hm} onValueChange={setHm}>
              <SelectTrigger className="h-11 bg-input/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <NumberField label={t("Year", "السنة")} value={hy} onChange={setHy} />
        </div>
      )}
      {out && <ResultCard title={t("Result", "النتيجة")} highlight={out.a} rows={[{ label: t("Equivalent", "المقابل"), value: out.b }]} />}
    </div>
  );
}

/* ---------------- Zakat ---------------- */
export function ZakatCalculator() {
  const { t } = useLocale();
  const money = useMoneyFormat();
  const [cash, setCash] = useLocalState("tool.zakat.cash", "0");
  const [gold, setGold] = useLocalState("tool.zakat.gold", "0");
  const [goldPrice, setGoldPrice] = useLocalState("tool.zakat.goldPrice", "300");
  const [trade, setTrade] = useLocalState("tool.zakat.trade", "0");
  const [debts, setDebts] = useLocalState("tool.zakat.debts", "0");

  const goldValue = num(gold) * num(goldPrice);
  const base = num(cash) + goldValue + num(trade) - num(debts);
  const nisab = 85 * num(goldPrice);
  const due = base >= nisab ? base * 0.025 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t("Cash & savings", "النقد والمدخرات")} value={cash} onChange={setCash} suffix="SAR" />
        <NumberField label={t("Trade goods", "عروض التجارة")} value={trade} onChange={setTrade} suffix="SAR" />
        <NumberField label={t("Gold (grams, 24k)", "الذهب (غرام ٢٤)")} value={gold} onChange={setGold} suffix="g" />
        <NumberField label={t("Gold price / gram", "سعر غرام الذهب")} value={goldPrice} onChange={setGoldPrice} suffix="SAR" />
        <NumberField label={t("Debts due", "الديون المستحقة")} value={debts} onChange={setDebts} suffix="SAR" />
      </div>
      <ResultCard
        title={t("Zakat due (2.5%)", "الزكاة الواجبة (٢٫٥٪)")}
        highlight={money(due)}
        rows={[
          { label: t("Zakatable wealth", "وعاء الزكاة"), value: money(base) },
          { label: t("Nisab (85g gold)", "النصاب (٨٥غ ذهب)"), value: money(nisab) },
          { label: t("Status", "الحالة"), value: base >= nisab ? t("Zakat is due", "بلغ النصاب") : t("Below nisab", "أقل من النصاب"), strong: true },
        ]}
      />
    </div>
  );
}

/* ---------------- Commission (السعي) ---------------- */
export function CommissionCalculator() {
  const { t } = useLocale();
  const money = useMoneyFormat();
  const [amount, setAmount] = useLocalState("tool.saai.amount", "500000");
  const [rate, setRate] = useLocalState("tool.saai.rate", "2.5");
  const [vat, setVat] = useLocalState("tool.saai.vat", "15");

  const fee = (num(amount) * num(rate)) / 100;
  const vatAmount = (fee * num(vat)) / 100;

  return (
    <div className="space-y-4">
      <NumberField label={t("Deal amount", "قيمة الصفقة")} value={amount} onChange={setAmount} suffix="SAR" />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t("Commission rate", "نسبة السعي")} value={rate} onChange={setRate} suffix="%" />
        <NumberField label={t("VAT", "ضريبة القيمة المضافة")} value={vat} onChange={setVat} suffix="%" />
      </div>
      <ResultCard
        title={t("Brokerage commission", "سعي الوساطة")}
        highlight={money(fee + vatAmount)}
        rows={[
          { label: t("Commission", "السعي"), value: money(fee) },
          { label: t("VAT", "الضريبة"), value: money(vatAmount) },
          { label: t("Total with VAT", "الإجمالي شامل الضريبة"), value: money(fee + vatAmount), strong: true },
        ]}
      />
    </div>
  );
}

/* ---------------- Loan ---------------- */
export function LoanCalculator() {
  const { t } = useLocale();
  const money = useMoneyFormat();
  const [amount, setAmount] = useLocalState("tool.loan.amount", "100000");
  const [rate, setRate] = useLocalState("tool.loan.rate", "5");
  const [years, setYears] = useLocalState("tool.loan.years", "5");
  const r = loanPayment(num(amount), num(rate), num(years));

  return (
    <div className="space-y-4">
      <NumberField label={t("Financing amount", "مبلغ التمويل")} value={amount} onChange={setAmount} suffix="SAR" />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t("Annual rate", "النسبة السنوية")} value={rate} onChange={setRate} suffix="%" />
        <NumberField label={t("Years", "عدد السنوات")} value={years} onChange={setYears} suffix={t("yr", "سنة")} />
      </div>
      <ResultCard
        title={t("Monthly installment", "القسط الشهري")}
        highlight={money(r.monthly)}
        rows={[
          { label: t("Number of installments", "عدد الأقساط"), value: String(r.months) },
          { label: t("Total cost of finance", "تكلفة التمويل"), value: money(r.interest) },
          { label: t("Total repayment", "إجمالي المسدد"), value: money(r.total), strong: true },
        ]}
      />
    </div>
  );
}

/* ---------------- Currency ---------------- */
export function CurrencyConverter() {
  const { t } = useLocale();
  const [from, setFrom] = useLocalState("tool.fx.from", "SAR");
  const [to, setTo] = useLocalState("tool.fx.to", "USD");
  const [amount, setAmount] = useLocalState("tool.fx.amount", "100");
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (from === to) { setRate(1); return; }
    setLoading(true); setErr(null);
    fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setRate(d?.rates?.[to] ?? null); })
      .catch(() => alive && setErr(t("Could not load live rates", "تعذر جلب أسعار الصرف")))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [from, to, tick]);

  const converted = rate != null ? num(amount) * rate : null;

  return (
    <div className="space-y-4">
      <NumberField label={t("Amount", "المبلغ")} value={amount} onChange={setAmount} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("From", "من")}>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger className="h-11 bg-input/60"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("To", "إلى")}>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="h-11 bg-input/60"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <Button variant="outline" className="w-full h-10 gap-2" onClick={() => setTick((x) => x + 1)} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {t("Refresh rate", "تحديث السعر")}
      </Button>
      {err && <p className="text-xs text-destructive text-center">{err}</p>}
      {converted != null && (
        <ResultCard
          title={t("Converted amount", "المبلغ المحوَّل")}
          highlight={`${converted.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${to}`}
          rows={[{ label: t("Exchange rate", "سعر الصرف"), value: `1 ${from} = ${rate?.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${to}` }]}
        />
      )}
    </div>
  );
}

/* ---------------- Units ---------------- */
export function UnitConverter() {
  const { t, lang } = useLocale();
  const groups: typeof UNIT_GROUPS = {
    ...UNIT_GROUPS,
    temperature: {
      en: "Temperature", ar: "الحرارة",
      units: {
        c: { en: "Celsius", ar: "مئوية", factor: 1 },
        f: { en: "Fahrenheit", ar: "فهرنهايت", factor: 1 },
        k: { en: "Kelvin", ar: "كلفن", factor: 1 },
      },
    },
  };
  const [group, setGroup] = useLocalState("tool.unit.group", "length");
  const g = groups[group] ?? groups.length;
  const keys = Object.keys(g.units);
  const [from, setFrom] = useState(keys[0]);
  const [to, setTo] = useState(keys[1] ?? keys[0]);
  const [value, setValue] = useState("1");

  useEffect(() => { setFrom(keys[0]); setTo(keys[1] ?? keys[0]); }, [group]);

  const result = group === "temperature"
    ? convertTemperature(from, to, num(value))
    : convertUnit(group, from, to, num(value));

  const label = (k: string) => (lang === "ar" ? g.units[k as keyof typeof g.units].ar : g.units[k as keyof typeof g.units].en);

  return (
    <div className="space-y-4">
      <Field label={t("Category", "الفئة")}>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="h-11 bg-input/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(groups).map(([k, v]) => <SelectItem key={k} value={k}>{lang === "ar" ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <NumberField label={t("Value", "القيمة")} value={value} onChange={setValue} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("From", "من")}>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger className="h-11 bg-input/60"><SelectValue /></SelectTrigger>
            <SelectContent>{keys.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("To", "إلى")}>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="h-11 bg-input/60"><SelectValue /></SelectTrigger>
            <SelectContent>{keys.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <ResultCard
        title={t("Result", "النتيجة")}
        highlight={`${result.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${label(to)}`}
        rows={[{ label: t("Input", "المدخل"), value: `${num(value).toLocaleString("en-US")} ${label(from)}` }]}
      />
    </div>
  );
}

/* ---------------- Inheritance ---------------- */
export function InheritanceCalculator() {
  const { t, lang } = useLocale();
  const money = useMoneyFormat();
  const ar = lang === "ar";
  const [estate, setEstate] = useLocalState("tool.mirath.estate", "1000000");
  const [spouse, setSpouse] = useLocalState<"none" | "husband" | "wife">("tool.mirath.spouse", "none");
  const [wives, setWives] = useLocalState("tool.mirath.wives", "1");
  const [sons, setSons] = useLocalState("tool.mirath.sons", "0");
  const [daughters, setDaughters] = useLocalState("tool.mirath.daughters", "0");
  const [father, setFather] = useLocalState("tool.mirath.father", false);
  const [mother, setMother] = useLocalState("tool.mirath.mother", false);
  const [brothers, setBrothers] = useLocalState("tool.mirath.brothers", "0");
  const [sisters, setSisters] = useLocalState("tool.mirath.sisters", "0");

  const res = useMemo(
    () => calculateInheritance({
      estate: num(estate), spouse, wives: num(wives), sons: num(sons), daughters: num(daughters),
      father, mother, fullBrothers: num(brothers), fullSisters: num(sisters),
    }),
    [estate, spouse, wives, sons, daughters, father, mother, brothers, sisters],
  );

  const methodLabel = {
    awl: t("Awl (proportional reduction)", "عول — نقص الأنصبة بالتناسب"),
    radd: t("Radd (surplus returned)", "رد — إعادة الفائض على الورثة"),
    normal: t("Standard distribution", "قسمة عادية"),
    empty: "",
  }[res.method];

  const shareText = [
    `${t("Total estate", "إجمالي التركة")}: ${money(res.total)}`,
    ...res.shares.map((s) => `${ar ? s.ar : s.en} — ${s.fraction} — ${money(s.amount)}`),
    `${t("Sum of shares", "مجموع الأنصبة")}: ${money(res.distributed)}`,
  ].join("\n");

  return (
    <div className="space-y-4">
      <NumberField label={t("Net estate", "صافي التركة")} value={estate} onChange={setEstate} suffix="SAR" />
      <Field label={t("Spouse", "الزوجية")}>
        <Select value={spouse} onValueChange={(v) => setSpouse(v as typeof spouse)}>
          <SelectTrigger className="h-11 bg-input/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("None", "لا يوجد")}</SelectItem>
            <SelectItem value="husband">{t("Husband", "زوج")}</SelectItem>
            <SelectItem value="wife">{t("Wife / wives", "زوجة أو زوجات")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {spouse === "wife" && <NumberField label={t("Number of wives", "عدد الزوجات")} value={wives} onChange={setWives} min={1} step="1" />}
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t("Sons", "الأبناء")} value={sons} onChange={setSons} min={0} step="1" />
        <NumberField label={t("Daughters", "البنات")} value={daughters} onChange={setDaughters} min={0} step="1" />
        <NumberField label={t("Full brothers", "الإخوة الأشقاء")} value={brothers} onChange={setBrothers} min={0} step="1" />
        <NumberField label={t("Full sisters", "الأخوات الشقيقات")} value={sisters} onChange={setSisters} min={0} step="1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { on: father, set: setFather, label: t("Father alive", "الأب على قيد الحياة") },
          { on: mother, set: setMother, label: t("Mother alive", "الأم على قيد الحياة") },
        ].map((row) => (
          <button
            key={row.label}
            onClick={() => row.set(!row.on)}
            className={`h-11 rounded-xl border text-xs font-semibold transition ${row.on ? "border-primary/60 bg-primary/15 text-primary" : "border-border/60 bg-card/50 text-foreground/70"}`}
          >
            {row.label}
          </button>
        ))}
      </div>

      {res.method === "empty" ? (
        <p className="rounded-2xl border border-border/60 bg-card/60 p-4 text-xs text-foreground/60">
          {t("Please select at least one heir.", "الرجاء اختيار وارث واحد على الأقل.")}
        </p>
      ) : (
        <ResultCard
          title={t("Detailed shares", "الأنصبة التفصيلية")}
          highlight={money(res.total)}
          shareText={shareText}
          rows={[
            { label: t("Total estate", "إجمالي التركة"), value: money(res.total), strong: true },
            { label: t("Sum of shares", "مجموع الأنصبة"), value: money(res.distributed), strong: true },
            { label: t("Method", "طريقة القسمة"), value: methodLabel },
          ]}
        />
      )}

      {res.shares.length > 0 && (
        <div className="space-y-2">
          {res.shares.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border/60 bg-card/70 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold truncate">{ar ? s.ar : s.en}</p>
                  <p className="text-[10.5px] text-foreground/55 mt-0.5 leading-snug break-words">{ar ? s.reasonAr : s.reasonEn}</p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-[13px] font-extrabold tabular-nums" style={{ color: "hsl(var(--primary))" }}>{money(s.amount)}</p>
                  <p className="text-[10px] text-foreground/55 mt-0.5">{s.fraction} · {s.percent.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {res.blocked.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-3.5 space-y-1">
          <p className="text-[11px] font-bold text-foreground/70">{t("Blocked heirs (hajb)", "الورثة المحجوبون")}</p>
          {res.blocked.map((b, i) => (
            <p key={i} className="text-[10.5px] text-foreground/55 leading-snug">• {ar ? b.ar : b.en}</p>
          ))}
        </div>
      )}

      {res.notes.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3.5 space-y-1">
          {res.notes.map((n, i) => (
            <p key={i} className="text-[10.5px] leading-relaxed text-foreground/75">⚠️ {ar ? n.ar : n.en}</p>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-foreground/50">
        {t(
          "Educational estimate covering fixed shares, residuaries, blocking, awl and radd. For binding rulings consult a qualified scholar or the courts.",
          "حساب تعليمي يشمل أصحاب الفروض والعصبات والحجب والعول والرد. للفتوى الملزمة يُرجع إلى أهل العلم أو المحاكم المختصة.",
        )}
      </p>
    </div>
  );
}
