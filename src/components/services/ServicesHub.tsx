import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Baby, BadgeDollarSign, Bookmark, BookOpen, Briefcase, CalendarDays, CalendarHeart, CalendarRange,
  Clock4, Cloud, Coins, Compass, Download, Flag, GraduationCap, Heart, Landmark, Languages, Moon,
  PiggyBank, Repeat, Ruler, Scale, ScanLine, ScanText, Search, Sparkles, Star, Sun, Timer, X,
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
import { AthkarDialog } from "@/components/islamic/AthkarDialog";
import { QiblaDialog } from "@/components/islamic/QiblaDialog";
import { QuranDialog } from "@/components/islamic/QuranDialog";
import { TranslatorDialog } from "@/components/islamic/TranslatorDialog";
import { WeatherDialog } from "@/components/islamic/WeatherDialog";
import { QRScannerDialog } from "@/components/islamic/QRScannerDialog";
import { DocumentScannerDialog } from "@/components/islamic/DocumentScannerDialog";
import { AsmaAlHusnaDialog } from "@/components/islamic/AsmaAlHusnaDialog";
import { TasbeehWidget } from "@/components/islamic/TasbeehWidget";
import { isIOSNativeApp } from "@/lib/platform";

type CategoryKey = "religious" | "utility" | "calc" | "counters" | "school" | "islamic" | "national";

const CATEGORIES: { key: CategoryKey; en: string; ar: string; emoji: string }[] = [
  { key: "religious", en: "Worship", ar: "العبادات", emoji: "🕌" },
  { key: "utility", en: "Tools", ar: "أدوات", emoji: "🛠️" },
  { key: "calc", en: "Calculators", ar: "الحاسبات", emoji: "🧮" },
  { key: "counters", en: "Counters", ar: "العدادات", emoji: "📅" },
  { key: "school", en: "Education", ar: "التعليم والإجازات", emoji: "🏫" },
  { key: "islamic", en: "Islamic", ar: "المناسبات الإسلامية", emoji: "☪️" },
  { key: "national", en: "National", ar: "المناسبات الوطنية", emoji: "🇸🇦" },
];

/** How tapping a tile behaves. "inline" reuses this component's own shared
 * dialog+render() pattern (calculators/counters). "dialog" opens one of the
 * app's existing self-contained Dialog components (Athkar, Qibla, …) — those
 * already own their own <Dialog>, so they render outside this component's
 * shared wrapper, not inside it. "route" navigates to a real, existing page. */
type ToolAction =
  | { kind: "inline"; render: () => JSX.Element }
  | { kind: "dialog" }
  | { kind: "route"; to: string };

interface Tool {
  id: string;
  en: string; ar: string;
  descEn: string; descAr: string;
  category: CategoryKey;
  Icon: React.ElementType;
  gradient: string;
  keywords: string;
  action: ToolAction;
}

const GOLD = "linear-gradient(135deg, hsl(42 85% 55%), hsl(38 90% 65%))";
const EMERALD = "linear-gradient(135deg, hsl(158 70% 35%), hsl(168 75% 45%))";
const BLUE = "linear-gradient(135deg, hsl(200 70% 45%), hsl(195 80% 60%))";
const PURPLE = "linear-gradient(135deg, hsl(280 50% 40%), hsl(260 60% 55%))";
const ROSE = "linear-gradient(135deg, hsl(0 70% 50%), hsl(15 80% 60%))";

// Every "dialog"-kind tool id below MUST have a matching self-contained
// dialog rendered in the JSX further down — see DIALOG_TOOL_IDS check in
// src/test/servicesGrid.test.tsx, which fails loudly if the two drift apart.
const TOOLS: Tool[] = [
  // 🕌 Worship — confirmed-working religious tools, unified from the old
  // QuickServices grid. Quran intentionally still opens the Mushaf reader
  // (not QuranDialog) — an existing, deliberate product decision kept as-is.
  { id: "quran", en: "Quran", ar: "القرآن الكريم", descEn: "Uthmani script, with recitations", descAr: "الرسم العثماني مع التلاوات", category: "religious", Icon: BookOpen, gradient: PURPLE, keywords: "قرآن مصحف تلاوة quran mushaf", action: { kind: "route", to: "/mushaf" } },
  { id: "athkar", en: "Athkar", ar: "الأذكار", descEn: "Morning, evening & more", descAr: "الصباح والمساء وغيرها", category: "religious", Icon: Heart, gradient: EMERALD, keywords: "أذكار athkar", action: { kind: "dialog" } },
  // Title unified to "القبلة" (was "اتجاه القبلة") to match the same
  // feature's label on the Home QuickShortcuts tile — same dialog/route,
  // was just displayed under two different Arabic names across the app.
  { id: "qibla", en: "Qibla", ar: "القبلة", descEn: "Compass to the Kaaba", descAr: "بوصلة نحو الكعبة", category: "religious", Icon: Compass, gradient: BLUE, keywords: "قبلة بوصلة اتجاه القبلة qibla compass", action: { kind: "dialog" } },
  { id: "prayer-times", en: "Prayer Times", ar: "مواقيت الصلاة", descEn: "Today's five prayers", descAr: "أوقات الصلوات الخمس اليوم", category: "religious", Icon: Sun, gradient: GOLD, keywords: "صلاة مواقيت أذان prayer times", action: { kind: "route", to: "/" } },
  { id: "calendar", en: "Calendar", ar: "التقويم", descEn: "Hijri & Gregorian events", descAr: "الأحداث الهجرية والميلادية", category: "religious", Icon: CalendarHeart, gradient: EMERALD, keywords: "تقويم مناسبات موعد calendar", action: { kind: "route", to: "/calendar" } },
  { id: "asmaAlHusna", en: "99 Names of Allah", ar: "أسماء الله الحسنى", descEn: "Names, transliteration & meaning", descAr: "الأسماء واللفظ والمعنى", category: "religious", Icon: Sparkles, gradient: GOLD, keywords: "أسماء الله الحسنى names of allah asma husna", action: { kind: "dialog" } },
  { id: "tasbeeh", en: "Tasbeeh", ar: "السبحة الرقمية", descEn: "Digital dhikr counter", descAr: "عداد ذكر رقمي", category: "religious", Icon: Bookmark, gradient: GOLD, keywords: "سبحة تسبيح ذكر tasbeeh dhikr", action: { kind: "dialog" } },

  // 🛠️ Tools — confirmed-working general utilities.
  { id: "translate", en: "Translate", ar: "الترجمة", descEn: "Instant translation", descAr: "ترجمة فورية", category: "utility", Icon: Languages, gradient: BLUE, keywords: "ترجمة translate", action: { kind: "dialog" } },
  { id: "weather", en: "Weather", ar: "الطقس", descEn: "Live weather & radar", descAr: "الطقس المباشر والرادار", category: "utility", Icon: Cloud, gradient: GOLD, keywords: "طقس رادار weather", action: { kind: "dialog" } },
  { id: "scanner", en: "QR Scanner", ar: "ماسح QR", descEn: "Scan codes & barcodes", descAr: "مسح الرموز والباركود", category: "utility", Icon: ScanLine, gradient: BLUE, keywords: "qr رمز باركود scanner", action: { kind: "dialog" } },
  { id: "docscan", en: "Document Scanner", ar: "ماسح المستندات", descEn: "Scan to PDF", descAr: "مسح إلى PDF", category: "utility", Icon: ScanText, gradient: BLUE, keywords: "مسح مستندات pdf scanner docs", action: { kind: "dialog" } },
  { id: "convert", en: "File Converter", ar: "تحويل الملفات", descEn: "Images, PDF & more", descAr: "صور وPDF وأكثر", category: "utility", Icon: Repeat, gradient: EMERALD, keywords: "تحويل ملفات pdf convert", action: { kind: "route", to: "/convert" } },
  { id: "jobs", en: "Saudi Jobs", ar: "وظائف السعودية", descEn: "Latest job openings", descAr: "أحدث الوظائف الشاغرة", category: "utility", Icon: Briefcase, gradient: EMERALD, keywords: "وظائف عمل jobs", action: { kind: "route", to: "/saudi-jobs" } },
  { id: "gov-jobs", en: "Government Jobs", ar: "الوظائف الحكومية", descEn: "Public sector openings", descAr: "وظائف القطاع الحكومي", category: "utility", Icon: Landmark, gradient: EMERALD, keywords: "وظائف حكومية government jobs", action: { kind: "route", to: "/government-jobs" } },
  // Not shown on iOS native (filtered out below) — matches the pre-existing
  // rule that hid this same feature from the old bottom-nav Media tab there.
  { id: "media", en: "Media Downloader", ar: "تنزيل الوسائط", descEn: "Download & manage saved files", descAr: "تنزيل وإدارة الملفات المحفوظة", category: "utility", Icon: Download, gradient: BLUE, keywords: "تنزيل وسائط فيديو media download", action: { kind: "route", to: "/media" } },

  // 🧮 Calculators
  { id: "age", en: "Age calculator", ar: "حاسبة العمر", descEn: "Gregorian & Hijri", descAr: "ميلادي وهجري", category: "calc", Icon: Baby, gradient: GOLD, keywords: "عمر age birthday ميلاد", action: { kind: "inline", render: () => <AgeCalculator /> } },
  { id: "inheritance", en: "Inheritance", ar: "حاسبة المواريث", descEn: "Fara'id shares", descAr: "الفرائض والأنصبة", category: "calc", Icon: Scale, gradient: EMERALD, keywords: "مواريث ارث فرائض inheritance", action: { kind: "inline", render: () => <InheritanceCalculator /> } },
  { id: "commission", en: "Brokerage fee", ar: "حاسبة السعي", descEn: "Adjustable rate (2.5%)", descAr: "نسبة قابلة للتعديل ٢٫٥٪", category: "calc", Icon: BadgeDollarSign, gradient: GOLD, keywords: "سعي عمولة عقار commission", action: { kind: "inline", render: () => <CommissionCalculator /> } },
  { id: "zakat", en: "Zakat", ar: "حاسبة الزكاة", descEn: "Nisab & 2.5%", descAr: "النصاب و٢٫٥٪", category: "calc", Icon: PiggyBank, gradient: EMERALD, keywords: "زكاة zakat نصاب", action: { kind: "inline", render: () => <ZakatCalculator /> } },
  { id: "loan", en: "Finance & loans", ar: "حاسبة التمويل والقروض", descEn: "Monthly installment", descAr: "القسط الشهري", category: "calc", Icon: Landmark, gradient: BLUE, keywords: "تمويل قرض قسط loan finance", action: { kind: "inline", render: () => <LoanCalculator /> } },
  { id: "currency", en: "Currency converter", ar: "تحويل العملات", descEn: "Live exchange rates", descAr: "أسعار صرف مباشرة", category: "calc", Icon: Coins, gradient: GOLD, keywords: "عملات صرف دولار currency", action: { kind: "inline", render: () => <CurrencyConverter /> } },
  { id: "units", en: "Unit converter", ar: "تحويل الوحدات", descEn: "Length, weight, speed…", descAr: "طول، وزن، سرعة…", category: "calc", Icon: Ruler, gradient: PURPLE, keywords: "وحدات تحويل متر كيلو unit", action: { kind: "inline", render: () => <UnitConverter /> } },
  { id: "hijri", en: "Hijri converter", ar: "تحويل التاريخ", descEn: "Hijri ↔ Gregorian", descAr: "هجري ↔ ميلادي", category: "calc", Icon: CalendarRange, gradient: BLUE, keywords: "تاريخ هجري ميلادي تحويل hijri", action: { kind: "inline", render: () => <HijriConverter /> } },

  // 📅 Counters
  { id: "all-payouts", en: "All payouts", ar: "كل مواعيد الصرف", descEn: "Every deposit date — tap one to expand", descAr: "جميع مواعيد الإيداع — اضغط أي موعد لتفاصيله", category: "counters", Icon: CalendarDays, gradient: GOLD, keywords: "راتب رواتب حكومي قطاع خاص حساب المواطن ضمان اجتماعي تقاعد معاش صرف مواعيد payouts salary citizen pension", action: { kind: "inline", render: () => <PayoutCountdowns /> } },
  { id: "retirement", en: "Retirement", ar: "كم باقي على التقاعد", descEn: "Based on your birth date", descAr: "حسب تاريخ ميلادك", category: "counters", Icon: Clock4, gradient: BLUE, keywords: "تقاعد retirement معاش", action: { kind: "inline", render: () => <RetirementCountdown /> } },
  { id: "custom", en: "Custom countdown", ar: "عداد لأي تاريخ", descEn: "Any date you choose", descAr: "أي تاريخ تختاره", category: "counters", Icon: Timer, gradient: ROSE, keywords: "عداد تاريخ مخصص countdown", action: { kind: "inline", render: () => <CustomCountdown /> } },

  // 🏫 Education (academic calendar — Saudi school dates, not Islamic teaching content)
  { id: "school-all", en: "Academic calendar", ar: "التقويم الدراسي", descEn: "All school dates — tap one to expand", descAr: "كل مواعيد الدراسة — اضغط أي موعد لتفاصيله", category: "school", Icon: GraduationCap, gradient: EMERALD, keywords: "دراسة مدرسة تقويم بداية الدراسة إجازة خريف نهاية الفصل منتصف العام صيفية school start break term midyear summer", action: { kind: "inline", render: () => <SchoolCountdowns /> } },
  { id: "holidays", en: "Official holidays", ar: "الإجازات الرسمية", descEn: "All Saudi holidays", descAr: "كل إجازات المملكة", category: "school", Icon: Flag, gradient: EMERALD, keywords: "إجازات رسمية holidays", action: { kind: "inline", render: () => <OfficialHolidays /> } },

  // ☪️ Islamic occasions — includes Ramadan as a countdown entry alongside
  // Eid al-Fitr/al-Adha, Arafah, Ashura, and the Hijri new year. There is no
  // separate, dedicated "Ramadan mode" page in the app (confirmed in the
  // Phase 2 audit) — this tile surfaces what genuinely exists.
  { id: "islamic-all", en: "Islamic occasions", ar: "كل المناسبات الإسلامية", descEn: "Ramadan, Eid & more — sorted by nearest", descAr: "رمضان والعيد وغيرها — مرتبة حسب الأقرب", category: "islamic", Icon: Moon, gradient: EMERALD, keywords: "مناسبات إسلامية رمضان عيد الفطر عيد الأضحى عرفة عاشوراء رأس السنة الهجرية محرم islamic ramadan eid arafah ashura hijri new year", action: { kind: "inline", render: () => <IslamicCountdowns /> } },

  // 🇸🇦 National
  { id: "national-all", en: "National occasions", ar: "كل المناسبات الوطنية", descEn: "Upcoming events", descAr: "المناسبات القادمة", category: "national", Icon: Flag, gradient: EMERALD, keywords: "وطنية national", action: { kind: "inline", render: () => <NationalCountdowns /> } },
  { id: "national-day", en: "National Day", ar: "اليوم الوطني", descEn: "23 September", descAr: "٢٣ سبتمبر", category: "national", Icon: Flag, gradient: EMERALD, keywords: "اليوم الوطني national day", action: { kind: "inline", render: () => <SingleCountdown id="national-day" /> } },
  { id: "founding-day", en: "Founding Day", ar: "يوم التأسيس", descEn: "22 February", descAr: "٢٢ فبراير", category: "national", Icon: Flag, gradient: GOLD, keywords: "التأسيس founding", action: { kind: "inline", render: () => <SingleCountdown id="founding-day" /> } },
];

/** Every "dialog"-kind tool id, exported for a test that verifies each one
 * actually has a matching self-contained dialog rendered below. */
export const DIALOG_TOOL_IDS = TOOLS.filter((t) => t.action.kind === "dialog").map((t) => t.id);
/** Every "route"-kind tool's target, exported so a test can verify each one
 * is a real route registered in App.tsx. */
export const ROUTE_TOOL_TARGETS = TOOLS.filter((t): t is Tool & { action: { kind: "route"; to: string } } => t.action.kind === "route").map((t) => t.action.to);
export { TOOLS as SERVICE_TOOLS };

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

interface Props {
  /** Opens a dialog-kind tool immediately — used for direct/SEO URLs like
   * /athkar, /qibla, /quran (see App.tsx TOOL_PATHS + Index.tsx PATH_MAP).
   * "quran" is a deliberate, pre-existing exception: the tile itself
   * navigates to the Mushaf reader, but the direct /quran URL still opens
   * QuranDialog — kept exactly as it already worked, unchanged. */
  initialOpen?: string | null;
  /** Pre-selects a category chip — used by the bottom nav's Favorites tab
   * (/favorites) to land directly on the "fav" filter. */
  initialCategory?: "fav" | null;
}

export function ServicesHub({ initialOpen = null, initialCategory = null }: Props) {
  const { t, lang, dir } = useLocale();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryKey | "all" | "fav">(initialCategory ?? "all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState<string | null>(initialOpen);
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAV_KEY));
  const [recents, setRecents] = useState<string[]>(() => readList(RECENT_KEY));
  const days = useDaysBadges();

  useEffect(() => {
    if (initialOpen) setOpenDialog(initialOpen);
  }, [initialOpen]);

  useEffect(() => {
    if (initialCategory) setCat(initialCategory);
  }, [initialCategory]);

  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); }, [recents]);

  const toggleFav = (id: string) =>
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const remember = (id: string) => setRecents((r) => [id, ...r.filter((x) => x !== id)].slice(0, 8));

  const onTap = (tool: Tool) => {
    remember(tool.id);
    if (tool.action.kind === "route") { navigate(tool.action.to); return; }
    if (tool.action.kind === "dialog") { setOpenDialog(tool.id); return; }
    setOpenId(tool.id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const iosNative = isIOSNativeApp();
    return TOOLS.filter((tool) => {
      if (tool.id === "media" && iosNative) return false;
      if (cat === "fav" && !favorites.includes(tool.id)) return false;
      if (cat !== "all" && cat !== "fav" && tool.category !== cat) return false;
      if (!q) return true;
      return `${tool.en} ${tool.ar} ${tool.descEn} ${tool.descAr} ${tool.keywords}`.toLowerCase().includes(q);
    });
  }, [query, cat, favorites]);

  const recentTools = recents.map((id) => TOOLS.find((x) => x.id === id)).filter(Boolean) as Tool[];
  const active = TOOLS.find((x) => x.id === openId && x.action.kind === "inline") ?? null;
  const activeRender = active && active.action.kind === "inline" ? active.action.render : null;

  const chips: { key: CategoryKey | "all" | "fav"; label: string; emoji: string }[] = [
    { key: "all", label: t("All", "الكل"), emoji: "✨" },
    { key: "fav", label: t("Favorites", "المفضلة"), emoji: "⭐" },
    ...CATEGORIES.map((c) => ({ key: c.key, label: lang === "ar" ? c.ar : c.en, emoji: c.emoji })),
  ];

  return (
    <div dir={dir} className="space-y-4 min-w-0">
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-foreground/40" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search services…", "ابحث في الخدمات…")}
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
              "shrink-0 rounded-full px-3.5 py-1.5 text-label border transition",
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
          <h3 className="text-label uppercase tracking-widest text-foreground/50 mb-2">
            {t("Recently used", "آخر استخدام")}
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {recentTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onTap(tool)}
                className="shrink-0 flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 hover:border-primary/50 transition"
              >
                <span className="h-7 w-7 rounded-lg grid place-items-center text-accent-foreground" style={{ background: tool.gradient }}>
                  <tool.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-label whitespace-nowrap">{lang === "ar" ? tool.ar : tool.en}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 min-w-0">
        {filtered.map((tool) => (
          <div key={tool.id} className="relative min-w-0">
            <button
              onClick={() => onTap(tool)}
              className="w-full h-full min-w-0 text-start rounded-2xl border border-foreground/10 bg-card p-3.5 sm:p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
            >
              <span
                className="h-12 w-12 rounded-full grid place-items-center text-accent-foreground mb-3 border-2"
                style={{ background: tool.gradient, borderColor: "hsl(var(--elite-gold-start))", boxShadow: "var(--shadow-glow-gold)" }}
              >
                <tool.Icon className="h-5 w-5" />
              </span>
              <p className="text-body font-bold leading-tight pe-6 break-words">{lang === "ar" ? tool.ar : tool.en}</p>
              <p className="text-caption text-foreground/55 mt-1.5 leading-snug break-words">{lang === "ar" ? tool.descAr : tool.descEn}</p>
              {days[tool.id] !== undefined && (
                <span className="mt-2.5 inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-caption text-primary">
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
        <div className="flex flex-col items-center gap-2 py-10 text-foreground/50">
          <Search className="h-8 w-8 opacity-40" />
          <p className="text-center text-body-sm">{t("No services match your search", "لا توجد خدمات مطابقة للبحث")}</p>
        </div>
      )}

      {/* Shared wrapper dialog for "inline" tools (calculators/counters). */}
      <Dialog open={!!active} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent dir={dir} className="w-[calc(100vw-1.5rem)] max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2.5 text-h3">
              {active && (
                <span className="h-9 w-9 rounded-xl grid place-items-center text-accent-foreground shrink-0" style={{ background: active.gradient }}>
                  <active.Icon className="h-4.5 w-4.5" />
                </span>
              )}
              <span>{active ? (lang === "ar" ? active.ar : active.en) : ""}</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[72vh]">
            <div className="p-5">{activeRender?.()}</div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Self-contained dialogs for "dialog" tools — each already owns its
          own <Dialog>, so these render as siblings, not nested inside the
          shared wrapper above. Reused as-is from the rest of the app. */}
      <AthkarDialog open={openDialog === "athkar"} onOpenChange={(v) => !v && setOpenDialog(null)} />
      <QiblaDialog open={openDialog === "qibla"} onOpenChange={(v) => !v && setOpenDialog(null)} />
      {/* No tile opens this — Quran's tile navigates to /mushaf instead, a
          pre-existing decision kept as-is. This exists only so the direct
          /quran URL (see PATH_MAP) still opens it, exactly as before. */}
      <QuranDialog open={openDialog === "quran"} onOpenChange={(v) => !v && setOpenDialog(null)} />
      <TranslatorDialog open={openDialog === "translate"} onOpenChange={(v) => !v && setOpenDialog(null)} hideTrigger />
      <WeatherDialog open={openDialog === "weather"} onOpenChange={(v) => !v && setOpenDialog(null)} />
      <QRScannerDialog open={openDialog === "scanner"} onOpenChange={(v) => !v && setOpenDialog(null)} />
      <DocumentScannerDialog open={openDialog === "docscan"} onOpenChange={(v) => !v && setOpenDialog(null)} />
      <AsmaAlHusnaDialog open={openDialog === "asmaAlHusna"} onOpenChange={(v) => !v && setOpenDialog(null)} />
      <Dialog open={openDialog === "tasbeeh"} onOpenChange={(v) => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-md p-0 border-0 bg-transparent shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("Digital Tasbeeh", "السبحة الرقمية")}</DialogTitle>
          </DialogHeader>
          <TasbeehWidget />
        </DialogContent>
      </Dialog>
    </div>
  );
}
