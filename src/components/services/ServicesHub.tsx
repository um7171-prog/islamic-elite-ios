import { useEffect, useMemo, useState } from "react";
import {
  Baby, BadgeDollarSign, CalendarDays, CalendarRange, Clock4, Coins,
  Flag, GraduationCap, Landmark, Moon, PiggyBank, Ruler, Scale, Search, Star, Timer,
  X,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AgeCalculator, CommissionCalculator, CurrencyConverter, HijriConverter, InheritanceCalculator,
  LoanCalculator, UnitConverter, ZakatCalculator,
} from "./Calculators";
import {
  countdown, ISLAMIC_EVENTS, NATIONAL_EVENTS, PAYOUT_EVENTS, SCHOOL_COUNTDOWNS,
} from "@/lib/dailyTools";
import {
  CustomCountdown, IslamicCountdowns, NationalCountdowns, OfficialHolidays, PayoutCountdowns,
  RetirementCountdown, SchoolCountdowns, SingleCountdown,
} from "./Counters";

type CategoryKey = "calc" | "counters" | "school" | "islamic" | "national";

const CATEGORIES: { key: CategoryKey; en: string; ar: string; emoji: string }[] = [
  { key: "calc", en: "Calculators", ar: "الحاسبات", emoji: "🧮" },
  { key: "counters", en: "Counters", ar: "العدادات", emoji: "📅" },
  { key: "school", en: "Education", ar: "التعليم والإجازات", emoji: "🏫" },
  { key: "islamic", en: "Islamic", ar: "المناسبات الإسلامية", emoji: "🕌" },
  { key: "national", en: "National", ar: "المناسبات الوطنية", emoji: "🇸🇦" },
];

interface Tool {
  id: string;
  en: string; ar: string;
  descEn: string; descAr: string;
  category: CategoryKey;
  Icon: React.ElementType;
  gradient: string;
  keywords: string;
  render: () => JSX.Element;
}

const GOLD = "linear-gradient(135deg, hsl(42 85% 55%), hsl(38 90% 65%))";
const EMERALD = "linear-gradient(135deg, hsl(158 70% 35%), hsl(168 75% 45%))";
const BLUE = "linear-gradient(135deg, hsl(200 70% 45%), hsl(195 80% 60%))";
const PURPLE = "linear-gradient(135deg, hsl(280 50% 40%), hsl(260 60% 55%))";
const ROSE = "linear-gradient(135deg, hsl(0 70% 50%), hsl(15 80% 60%))";

const TOOLS: Tool[] = [
  // 🧮 Calculators
  { id: "age", en: "Age calculator", ar: "حاسبة العمر", descEn: "Gregorian & Hijri", descAr: "ميلادي وهجري", category: "calc", Icon: Baby, gradient: GOLD, keywords: "عمر age birthday ميلاد", render: () => <AgeCalculator /> },
  { id: "inheritance", en: "Inheritance", ar: "حاسبة المواريث", descEn: "Fara'id shares", descAr: "الفرائض والأنصبة", category: "calc", Icon: Scale, gradient: EMERALD, keywords: "مواريث ارث فرائض inheritance", render: () => <InheritanceCalculator /> },
  { id: "commission", en: "Brokerage fee", ar: "حاسبة السعي", descEn: "Adjustable rate (2.5%)", descAr: "نسبة قابلة للتعديل ٢٫٥٪", category: "calc", Icon: BadgeDollarSign, gradient: GOLD, keywords: "سعي عمولة عقار commission", render: () => <CommissionCalculator /> },
  { id: "zakat", en: "Zakat", ar: "حاسبة الزكاة", descEn: "Nisab & 2.5%", descAr: "النصاب و٢٫٥٪", category: "calc", Icon: PiggyBank, gradient: EMERALD, keywords: "زكاة zakat نصاب", render: () => <ZakatCalculator /> },
  { id: "loan", en: "Finance & loans", ar: "حاسبة التمويل والقروض", descEn: "Monthly installment", descAr: "القسط الشهري", category: "calc", Icon: Landmark, gradient: BLUE, keywords: "تمويل قرض قسط loan finance", render: () => <LoanCalculator /> },
  { id: "currency", en: "Currency converter", ar: "تحويل العملات", descEn: "Live exchange rates", descAr: "أسعار صرف مباشرة", category: "calc", Icon: Coins, gradient: GOLD, keywords: "عملات صرف دولار currency", render: () => <CurrencyConverter /> },
  { id: "units", en: "Unit converter", ar: "تحويل الوحدات", descEn: "Length, weight, speed…", descAr: "طول، وزن، سرعة…", category: "calc", Icon: Ruler, gradient: PURPLE, keywords: "وحدات تحويل متر كيلو unit", render: () => <UnitConverter /> },
  { id: "hijri", en: "Hijri converter", ar: "تحويل التاريخ", descEn: "Hijri ↔ Gregorian", descAr: "هجري ↔ ميلادي", category: "calc", Icon: CalendarRange, gradient: BLUE, keywords: "تاريخ هجري ميلادي تحويل hijri", render: () => <HijriConverter /> },

  // 📅 Counters
  { id: "all-payouts", en: "All payouts", ar: "كل مواعيد الصرف", descEn: "Every deposit date — tap one to expand", descAr: "جميع مواعيد الإيداع — اضغط أي موعد لتفاصيله", category: "counters", Icon: CalendarDays, gradient: GOLD, keywords: "راتب رواتب حكومي قطاع خاص حساب المواطن ضمان اجتماعي تقاعد معاش صرف مواعيد payouts salary citizen pension", render: () => <PayoutCountdowns /> },
  { id: "retirement", en: "Retirement", ar: "كم باقي على التقاعد", descEn: "Based on your birth date", descAr: "حسب تاريخ ميلادك", category: "counters", Icon: Clock4, gradient: BLUE, keywords: "تقاعد retirement معاش", render: () => <RetirementCountdown /> },
  { id: "custom", en: "Custom countdown", ar: "عداد لأي تاريخ", descEn: "Any date you choose", descAr: "أي تاريخ تختاره", category: "counters", Icon: Timer, gradient: ROSE, keywords: "عداد تاريخ مخصص countdown", render: () => <CustomCountdown /> },

  // 🏫 Education
  { id: "school-all", en: "Academic calendar", ar: "التقويم الدراسي", descEn: "All school dates — tap one to expand", descAr: "كل مواعيد الدراسة — اضغط أي موعد لتفاصيله", category: "school", Icon: GraduationCap, gradient: EMERALD, keywords: "دراسة مدرسة تقويم بداية الدراسة إجازة خريف نهاية الفصل منتصف العام صيفية school start break term midyear summer", render: () => <SchoolCountdowns /> },
  { id: "holidays", en: "Official holidays", ar: "الإجازات الرسمية", descEn: "All Saudi holidays", descAr: "كل إجازات المملكة", category: "school", Icon: Flag, gradient: EMERALD, keywords: "إجازات رسمية holidays", render: () => <OfficialHolidays /> },

  // 🕌 Islamic
  { id: "islamic-all", en: "Islamic occasions", ar: "كل المناسبات الإسلامية", descEn: "Sorted by nearest — tap one to expand", descAr: "مرتبة حسب الأقرب — اضغط أي مناسبة لتفاصيلها", category: "islamic", Icon: Moon, gradient: EMERALD, keywords: "مناسبات إسلامية رمضان عيد الفطر عيد الأضحى عرفة عاشوراء رأس السنة الهجرية محرم islamic ramadan eid arafah ashura hijri new year", render: () => <IslamicCountdowns /> },

  // 🇸🇦 National
  { id: "national-all", en: "National occasions", ar: "كل المناسبات الوطنية", descEn: "Upcoming events", descAr: "المناسبات القادمة", category: "national", Icon: Flag, gradient: EMERALD, keywords: "وطنية national", render: () => <NationalCountdowns /> },
  { id: "national-day", en: "National Day", ar: "اليوم الوطني", descEn: "23 September", descAr: "٢٣ سبتمبر", category: "national", Icon: Flag, gradient: EMERALD, keywords: "اليوم الوطني national day", render: () => <SingleCountdown id="national-day" /> },
  { id: "founding-day", en: "Founding Day", ar: "يوم التأسيس", descEn: "22 February", descAr: "٢٢ فبراير", category: "national", Icon: Flag, gradient: GOLD, keywords: "التأسيس founding", render: () => <SingleCountdown id="founding-day" /> },
];

const BADGE_EVENTS = [...PAYOUT_EVENTS, ...SCHOOL_COUNTDOWNS, ...ISLAMIC_EVENTS, ...NATIONAL_EVENTS];

/** Days remaining per tool id, refreshed every 30s. */
function useDaysBadges() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(i);
  }, []);
  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of BADGE_EVENTS) {
      const c = countdown(e.resolve());
      map[e.id] = c.past ? 0 : c.days;
    }
    return map;
  }, [tick]);
}

const FAV_KEY = "services.favorites";
const RECENT_KEY = "services.recents";

function readList(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}

export function ServicesHub() {
  const { t, lang, dir } = useLocale();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryKey | "all" | "fav">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAV_KEY));
  const [recents, setRecents] = useState<string[]>(() => readList(RECENT_KEY));
  const days = useDaysBadges();

  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); }, [recents]);

  const toggleFav = (id: string) =>
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const openTool = (id: string) => {
    setOpenId(id);
    setRecents((r) => [id, ...r.filter((x) => x !== id)].slice(0, 8));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      if (cat === "fav" && !favorites.includes(tool.id)) return false;
      if (cat !== "all" && cat !== "fav" && tool.category !== cat) return false;
      if (!q) return true;
      return `${tool.en} ${tool.ar} ${tool.descEn} ${tool.descAr} ${tool.keywords}`.toLowerCase().includes(q);
    });
  }, [query, cat, favorites]);

  const recentTools = recents.map((id) => TOOLS.find((x) => x.id === id)).filter(Boolean) as Tool[];
  const active = TOOLS.find((x) => x.id === openId) ?? null;

  const chips: { key: CategoryKey | "all" | "fav"; label: string; emoji: string }[] = [
    { key: "all", label: t("All", "الكل"), emoji: "✨" },
    { key: "fav", label: t("Favorites", "المفضلة"), emoji: "⭐" },
    ...CATEGORIES.map((c) => ({ key: c.key, label: lang === "ar" ? c.ar : c.en, emoji: c.emoji })),
  ];

  return (
    <div dir={dir} className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-foreground/40" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search tools…", "ابحث في الأدوات…")}
          className="h-11 ps-9 pe-9 bg-input/60 border-border/70"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute inset-y-0 end-3 my-auto text-foreground/40" aria-label={t("Clear", "مسح")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold border transition",
              cat === c.key
                ? "border-transparent text-accent-foreground shadow"
                : "border-border/60 bg-card/50 text-foreground/70 hover:text-foreground",
            )}
            style={cat === c.key ? { background: GOLD } : undefined}
          >
            <span className="me-1">{c.emoji}</span>{c.label}
          </button>
        ))}
      </div>

      {recentTools.length > 0 && cat === "all" && !query && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/50 mb-2">
            {t("Recently used", "آخر استخدام")}
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {recentTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => openTool(tool.id)}
                className="shrink-0 flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 hover:border-primary/50 transition"
              >
                <span className="h-7 w-7 rounded-lg grid place-items-center text-accent-foreground" style={{ background: tool.gradient }}>
                  <tool.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-semibold whitespace-nowrap">{lang === "ar" ? tool.ar : tool.en}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {filtered.map((tool) => (
          <div key={tool.id} className="relative min-w-0">
            <button
              onClick={() => openTool(tool.id)}
              className="w-full h-full min-w-0 text-start rounded-2xl border border-border/60 bg-card/70 p-3 sm:p-3.5 transition hover:border-primary/50 active:scale-[0.98]"
            >
              <span
                className="h-11 w-11 rounded-xl grid place-items-center text-accent-foreground mb-2.5"
                style={{ background: tool.gradient, boxShadow: "var(--shadow-glow-gold)" }}
              >
                <tool.Icon className="h-5 w-5" />
              </span>
              <p className="text-[12.5px] font-bold leading-tight pe-6 break-words">{lang === "ar" ? tool.ar : tool.en}</p>
              <p className="text-[10.5px] text-foreground/55 mt-1 leading-snug break-words">{lang === "ar" ? tool.descAr : tool.descEn}</p>
              {days[tool.id] !== undefined && (
                <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  <span>⏳</span>
                  <span className="truncate">
                    {days[tool.id] === 0
                      ? t("Today", "اليوم")
                      : t(`${days[tool.id]} days left`, `باقي ${days[tool.id]} يوم`)}
                  </span>
                </span>
              )}
            </button>
            <button
              onClick={() => toggleFav(tool.id)}
              className="absolute top-1.5 end-1.5 h-10 w-10 grid place-items-center rounded-full hover:bg-muted/60"
              aria-label={t("Favorite", "المفضلة")}
            >
              <Star className={cn("h-4 w-4", favorites.includes(tool.id) ? "fill-yellow-400 text-yellow-400" : "text-foreground/30")} />
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-xs text-foreground/50 py-8">{t("No tools match your search", "لا توجد أدوات مطابقة للبحث")}</p>
      )}

      <Dialog open={!!active} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent dir={dir} className="w-[calc(100vw-1.5rem)] max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              {active && (
                <span className="h-9 w-9 rounded-xl grid place-items-center text-accent-foreground shrink-0" style={{ background: active.gradient }}>
                  <active.Icon className="h-4.5 w-4.5" />
                </span>
              )}
              <span>{active ? (lang === "ar" ? active.ar : active.en) : ""}</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[72vh]">
            <div className="p-5">{active?.render()}</div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
