import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Baby, BadgeDollarSign, Bookmark, BookOpen, CalendarDays, CalendarHeart, CalendarRange,
  Clock4, Coins, Compass, Download, Flag, GraduationCap, Heart, Landmark, Languages, Moon,
  PiggyBank, Repeat, Ruler, Scale, ScanLine, ScanText, Search, Sparkles, Star, Sun, Timer, X,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AgeCalculator, CommissionCalculator, CurrencyConverter, InheritanceCalculator,
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
import { TranslatorDialog } from "@/components/islamic/TranslatorDialog";
import { QRScannerDialog } from "@/components/islamic/QRScannerDialog";
import { DocumentScannerDialog } from "@/components/islamic/DocumentScannerDialog";
import { AsmaAlHusnaDialog } from "@/components/islamic/AsmaAlHusnaDialog";
import { TasbeehWidget } from "@/components/islamic/TasbeehWidget";
import { isIOSNativeApp } from "@/lib/platform";
import { IconBadge } from "@/components/site/IconBadge";

type CategoryKey = "religious" | "docs" | "calc" | "events";

const CATEGORIES: { key: CategoryKey; en: string; ar: string; emoji: string }[] = [
  { key: "religious", en: "Prayer & Worship", ar: "الصلاة والعبادة", emoji: "🕌" },
  { key: "docs", en: "Documents & Files", ar: "المستندات والملفات", emoji: "📄" },
  { key: "calc", en: "Calculators", ar: "الحاسبات", emoji: "🧮" },
  { key: "events", en: "Occasions & Countdowns", ar: "المناسبات والعدادات", emoji: "📅" },
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

// Display order inside a section (ids not listed keep their declaration order).
const DISPLAY_ORDER = [
  "prayer-times", "qibla", "athkar", "quran", "tasbeeh", "calendar", "asmaAlHusna",
  "docscan", "scanner", "convert", "media", "translate",
  "zakat", "inheritance", "age", "loan", "commission", "currency", "units", "retirement", "hijri",
];
const rank = (id: string) => { const i = DISPLAY_ORDER.indexOf(id); return i === -1 ? 1000 : i; };

const GOLD = "linear-gradient(135deg, hsl(42 85% 55%), hsl(38 90% 65%))";
const EMERALD = "linear-gradient(135deg, hsl(158 70% 35%), hsl(168 75% 45%))";
const BLUE = "linear-gradient(135deg, hsl(200 70% 45%), hsl(195 80% 60%))";
const PURPLE = "linear-gradient(135deg, hsl(280 50% 40%), hsl(260 60% 55%))";
const ROSE = "linear-gradient(135deg, hsl(0 70% 50%), hsl(15 80% 60%))";

// Every "dialog"-kind tool id below MUST have a matching self-contained
// dialog rendered in the JSX further down — see DIALOG_TOOL_IDS check in
// src/test/servicesGrid.test.tsx, which fails loudly if the two drift apart.
const TOOLS: Tool[] = [
  // 🕌 Worship — confirmed-working religious tools. Quran opens its own index
  // page (/quran: surahs / juz / saved), which leads into the Mushaf reader.
  { id: "prayer-times", en: "Prayer Times", ar: "مواقيت الصلاة", descEn: "Today's five prayers", descAr: "أوقات الصلوات الخمس اليوم", category: "religious", Icon: Sun, gradient: GOLD, keywords: "صلاة مواقيت أذان prayer times", action: { kind: "route", to: "/prayer-times" } },
  { id: "quran", en: "Quran", ar: "القرآن الكريم", descEn: "Uthmani script, with recitations", descAr: "الرسم العثماني مع التلاوات", category: "religious", Icon: BookOpen, gradient: PURPLE, keywords: "قرآن مصحف تلاوة quran mushaf", action: { kind: "route", to: "/quran" } },
  { id: "athkar", en: "Athkar", ar: "الأذكار", descEn: "Morning, evening & more", descAr: "الصباح والمساء وغيرها", category: "religious", Icon: Heart, gradient: EMERALD, keywords: "أذكار athkar", action: { kind: "dialog" } },
  // Title unified to "القبلة" (was "اتجاه القبلة") to match the same
  // feature's label on the Home QuickShortcuts tile — same dialog/route,
  // was just displayed under two different Arabic names across the app.
  { id: "qibla", en: "Qibla", ar: "القبلة", descEn: "Compass to the Kaaba", descAr: "بوصلة نحو الكعبة", category: "religious", Icon: Compass, gradient: BLUE, keywords: "قبلة بوصلة اتجاه القبلة qibla compass", action: { kind: "dialog" } },
  { id: "calendar", en: "Calendar", ar: "التقويم", descEn: "Hijri & Gregorian, appointments", descAr: "هجري وميلادي ومواعيدك", category: "religious", Icon: CalendarHeart, gradient: EMERALD, keywords: "تقويم مناسبات موعد calendar", action: { kind: "route", to: "/calendar" } },
  { id: "asmaAlHusna", en: "99 Names of Allah", ar: "أسماء الله الحسنى", descEn: "Names, transliteration & meaning", descAr: "الأسماء واللفظ والمعنى", category: "religious", Icon: Sparkles, gradient: GOLD, keywords: "أسماء الله الحسنى names of allah asma husna", action: { kind: "dialog" } },
  { id: "tasbeeh", en: "Tasbeeh", ar: "السبحة الرقمية", descEn: "Digital dhikr counter", descAr: "عداد ذكر رقمي", category: "religious", Icon: Bookmark, gradient: GOLD, keywords: "سبحة تسبيح ذكر tasbeeh dhikr", action: { kind: "dialog" } },

  // 🗂️ Calendar & documents — calendar, scanners, converters, media.
  { id: "translate", en: "Translate", ar: "الترجمة", descEn: "Instant translation", descAr: "ترجمة فورية", category: "docs", Icon: Languages, gradient: BLUE, keywords: "ترجمة translate", action: { kind: "dialog" } },
  { id: "scanner", en: "QR Scanner", ar: "ماسح QR", descEn: "Scan codes & barcodes", descAr: "مسح الرموز والباركود", category: "docs", Icon: ScanLine, gradient: BLUE, keywords: "qr رمز باركود scanner", action: { kind: "dialog" } },
  { id: "docscan", en: "Document Scanner", ar: "ماسح المستندات", descEn: "Scan to PDF", descAr: "مسح إلى PDF", category: "docs", Icon: ScanText, gradient: BLUE, keywords: "مسح مستندات pdf scanner docs", action: { kind: "dialog" } },
  { id: "convert", en: "File Converter", ar: "تحويل الملفات", descEn: "Images, PDF & more", descAr: "صور وPDF وأكثر", category: "docs", Icon: Repeat, gradient: EMERALD, keywords: "تحويل ملفات pdf convert", action: { kind: "route", to: "/convert" } },
  // Not shown on iOS native (filtered out below) — matches the pre-existing
  // rule that hid this same feature from the old bottom-nav Media tab there.
  { id: "media", en: "Media Downloader", ar: "تنزيل الوسائط", descEn: "Download & manage saved files", descAr: "تنزيل وإدارة الملفات المحفوظة", category: "docs", Icon: Download, gradient: BLUE, keywords: "تنزيل وسائط فيديو media download", action: { kind: "route", to: "/media" } },

  // 🧮 Calculators
  { id: "age", en: "Age calculator", ar: "حاسبة العمر", descEn: "Gregorian & Hijri", descAr: "ميلادي وهجري", category: "calc", Icon: Baby, gradient: GOLD, keywords: "عمر age birthday ميلاد", action: { kind: "inline", render: () => <AgeCalculator /> } },
  { id: "inheritance", en: "Inheritance", ar: "حاسبة المواريث", descEn: "Fara'id shares", descAr: "الفرائض والأنصبة", category: "calc", Icon: Scale, gradient: EMERALD, keywords: "مواريث ارث فرائض inheritance", action: { kind: "inline", render: () => <InheritanceCalculator /> } },
  { id: "commission", en: "Brokerage fee", ar: "حاسبة السعي", descEn: "Adjustable rate (2.5%)", descAr: "نسبة قابلة للتعديل ٢٫٥٪", category: "calc", Icon: BadgeDollarSign, gradient: GOLD, keywords: "سعي عمولة عقار commission", action: { kind: "inline", render: () => <CommissionCalculator /> } },
  { id: "zakat", en: "Zakat", ar: "حاسبة الزكاة", descEn: "Nisab & 2.5%", descAr: "النصاب و٢٫٥٪", category: "calc", Icon: PiggyBank, gradient: EMERALD, keywords: "زكاة zakat نصاب", action: { kind: "inline", render: () => <ZakatCalculator /> } },
  { id: "loan", en: "Finance & loans", ar: "حاسبة التمويل والقروض", descEn: "Monthly installment", descAr: "القسط الشهري", category: "calc", Icon: Landmark, gradient: BLUE, keywords: "تمويل قرض قسط loan finance", action: { kind: "inline", render: () => <LoanCalculator /> } },
  { id: "currency", en: "Currency converter", ar: "تحويل العملات", descEn: "Live exchange rates", descAr: "أسعار صرف مباشرة", category: "calc", Icon: Coins, gradient: GOLD, keywords: "عملات صرف دولار currency", action: { kind: "inline", render: () => <CurrencyConverter /> } },
  { id: "units", en: "Unit converter", ar: "تحويل الوحدات", descEn: "Length, weight, speed…", descAr: "طول، وزن، سرعة…", category: "calc", Icon: Ruler, gradient: PURPLE, keywords: "وحدات تحويل متر كيلو unit", action: { kind: "inline", render: () => <UnitConverter /> } },
  { id: "hijri", en: "Hijri converter", ar: "تحويل التاريخ", descEn: "Hijri ↔ Gregorian", descAr: "هجري ↔ ميلادي", category: "calc", Icon: CalendarRange, gradient: BLUE, keywords: "تاريخ هجري ميلادي تحويل hijri", action: { kind: "route", to: "/date-converter" } },

  // 📅 Counters
  { id: "all-payouts", en: "All payouts", ar: "كل مواعيد الصرف", descEn: "Every deposit date — tap one to expand", descAr: "جميع مواعيد الإيداع — اضغط أي موعد لتفاصيله", category: "events", Icon: CalendarDays, gradient: GOLD, keywords: "راتب رواتب حكومي قطاع خاص حساب المواطن ضمان اجتماعي تقاعد معاش صرف مواعيد payouts salary citizen pension", action: { kind: "inline", render: () => <PayoutCountdowns /> } },
  { id: "retirement", en: "Retirement", ar: "كم باقي على التقاعد", descEn: "Based on your birth date", descAr: "حسب تاريخ ميلادك", category: "calc", Icon: Clock4, gradient: BLUE, keywords: "تقاعد retirement معاش", action: { kind: "inline", render: () => <RetirementCountdown /> } },
  { id: "custom", en: "Custom countdown", ar: "عداد لأي تاريخ", descEn: "Any date you choose", descAr: "أي تاريخ تختاره", category: "events", Icon: Timer, gradient: ROSE, keywords: "عداد تاريخ مخصص countdown", action: { kind: "inline", render: () => <CustomCountdown /> } },

  // 🏫 Education (academic calendar — Saudi school dates, not Islamic teaching content)
  { id: "school-all", en: "Academic calendar", ar: "التقويم الدراسي", descEn: "All school dates — tap one to expand", descAr: "كل مواعيد الدراسة — اضغط أي موعد لتفاصيله", category: "events", Icon: GraduationCap, gradient: EMERALD, keywords: "دراسة مدرسة تقويم بداية الدراسة إجازة خريف نهاية الفصل منتصف العام صيفية school start break term midyear summer", action: { kind: "inline", render: () => <SchoolCountdowns /> } },
  { id: "holidays", en: "Official holidays", ar: "الإجازات الرسمية", descEn: "All Saudi holidays", descAr: "كل إجازات المملكة", category: "events", Icon: Flag, gradient: EMERALD, keywords: "إجازات رسمية holidays", action: { kind: "inline", render: () => <OfficialHolidays /> } },

  // ☪️ Islamic occasions — includes Ramadan as a countdown entry alongside
  // Eid al-Fitr/al-Adha, Arafah, Ashura, and the Hijri new year. There is no
  // separate, dedicated "Ramadan mode" page in the app (confirmed in the
  // Phase 2 audit) — this tile surfaces what genuinely exists.
  { id: "islamic-all", en: "Islamic occasions", ar: "كل المناسبات الإسلامية", descEn: "Ramadan, Eid & more — sorted by nearest", descAr: "رمضان والعيد وغيرها — مرتبة حسب الأقرب", category: "events", Icon: Moon, gradient: EMERALD, keywords: "مناسبات إسلامية رمضان عيد الفطر عيد الأضحى عرفة عاشوراء رأس السنة الهجرية محرم islamic ramadan eid arafah ashura hijri new year", action: { kind: "inline", render: () => <IslamicCountdowns /> } },

  // 🇸🇦 National
  { id: "national-all", en: "National occasions", ar: "كل المناسبات الوطنية", descEn: "Upcoming events", descAr: "المناسبات القادمة", category: "events", Icon: Flag, gradient: EMERALD, keywords: "وطنية national", action: { kind: "inline", render: () => <NationalCountdowns /> } },
  { id: "national-day", en: "National Day", ar: "اليوم الوطني", descEn: "23 September", descAr: "٢٣ سبتمبر", category: "events", Icon: Flag, gradient: EMERALD, keywords: "اليوم الوطني national day", action: { kind: "inline", render: () => <SingleCountdown id="national-day" /> } },
  { id: "founding-day", en: "Founding Day", ar: "يوم التأسيس", descEn: "22 February", descAr: "٢٢ فبراير", category: "events", Icon: Flag, gradient: GOLD, keywords: "التأسيس founding", action: { kind: "inline", render: () => <SingleCountdown id="founding-day" /> } },
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
   * /athkar, /qibla (see App.tsx TOOL_PATHS + Index.tsx PATH_MAP). */
  initialOpen?: string | null;
  /** Pre-selects a category chip — used by the bottom nav's Favorites tab
   * (/favorites) to land directly on the "fav" filter. */
  initialCategory?: "fav" | null;
}

export function ServicesHub({ initialOpen = null, initialCategory = null }: Props) {
  const { t, lang, dir } = useLocale();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Deep link: /tools?tool=<id> opens an inline tool (calculator/counter)
  // directly, e.g. the Home "Zakat" shortcut.
  useEffect(() => {
    const id = searchParams.get("tool");
    if (!id) return;
    const tool = TOOLS.find((x) => x.id === id && x.action.kind === "inline");
    if (tool) setOpenId(id);
  }, [searchParams]);

  const closeInline = () => {
    setOpenId(null);
    if (searchParams.has("tool")) {
      const next = new URLSearchParams(searchParams);
      next.delete("tool");
      setSearchParams(next, { replace: true });
    }
  };

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

  // Services are shown grouped by section (in CATEGORIES order) instead of one
  // undifferentiated grid; empty sections are dropped.
  const groups = useMemo(
    () =>
      CATEGORIES.map((c) => ({ ...c, tools: filtered.filter((tool) => tool.category === c.key) }))
        .map((g) => ({ ...g, tools: [...g.tools].sort((a, b) => rank(a.id) - rank(b.id)) }))
        .filter((g) => g.tools.length > 0),
    [filtered],
  );

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
        <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-foreground/40" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search services…", "ابحث في الخدمات…")}
          className="h-12 rounded-2xl border-0 bg-card ps-10 pe-10 text-body shadow-sm ring-1 ring-foreground/[0.07]"
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
            aria-pressed={cat === c.key}
            className={cn(
              "min-h-[40px] shrink-0 rounded-full px-4 text-body-sm font-semibold transition",
              cat === c.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-foreground/75 ring-1 ring-foreground/[0.08] hover:text-foreground",
            )}
          >
            <span className="me-1.5">{c.emoji}</span>{c.label}
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
                className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-card py-1 ps-1 pe-3.5 shadow-sm ring-1 ring-foreground/[0.07] transition active:scale-95"
              >
                <IconBadge icon={tool.Icon} size="sm" />
                <span className="whitespace-nowrap text-body-sm font-medium">{lang === "ar" ? tool.ar : tool.en}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`svc-${group.key}`} data-testid={`svc-group-${group.key}`}>
          <h3 id={`svc-${group.key}`} className="mb-3 flex items-center gap-2 px-1 font-display text-body-lg font-bold text-foreground">
            <span aria-hidden>{group.emoji}</span>
            <span>{lang === "ar" ? group.ar : group.en}</span>
            <span className="h-px flex-1 bg-foreground/10" />
          </h3>
          <div className="grid grid-cols-3 gap-3 min-w-0">
            {group.tools.map((tool) => (
              <div key={tool.id} className="relative min-w-0">
                <button
                  onClick={() => onTap(tool)}
                  data-tool-id={tool.id}
                  className="flex h-full w-full min-w-0 flex-col items-center gap-2 rounded-2xl bg-card px-2 pb-3 pt-4 text-center shadow-sm ring-1 ring-foreground/[0.06] transition active:scale-[0.97]"
                >
                  <IconBadge icon={tool.Icon} size="lg" />
                  <span className="w-full leading-tight">
                    <span className="block break-words text-body-sm font-semibold">{lang === "ar" ? tool.ar : tool.en}</span>
                    {lang === "ar" && (
                      <span className="mt-0.5 block break-words text-[12px] text-foreground/55" dir="ltr">
                        {tool.en}
                      </span>
                    )}
                  </span>
                  {days[tool.id] !== undefined && (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      <span className="truncate">
                        {days[tool.id] === 0
                          ? t("Today", "اليوم")
                          : t(`${days[tool.id]} days`, `${days[tool.id]} يوم`)}
                      </span>
                    </span>
                  )}
                </button>
                <button
                  onClick={() => toggleFav(tool.id)}
                  className="absolute end-0.5 top-0.5 grid h-9 w-9 place-items-center rounded-full"
                  aria-label={t("Favorite", "المفضلة")}
                  aria-pressed={favorites.includes(tool.id)}
                >
                  <Star className={cn("h-[15px] w-[15px]", favorites.includes(tool.id) ? "fill-[hsl(var(--elite-gold-start))] text-[hsl(var(--elite-gold-start))]" : "text-foreground/25")} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-foreground/50">
          <Search className="h-8 w-8 opacity-40" />
          <p className="text-center text-body-sm">{t("No services match your search", "لا توجد خدمات مطابقة للبحث")}</p>
        </div>
      )}

      {/* Shared wrapper dialog for "inline" tools (calculators/counters). */}
      <Dialog open={!!active} onOpenChange={(v) => !v && closeInline()}>
        <DialogContent dir={dir} className="w-[calc(100vw-1.5rem)] max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2.5 text-h3">
              {active && (
                <IconBadge icon={active.Icon} size="sm" />
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
      <TranslatorDialog open={openDialog === "translate"} onOpenChange={(v) => !v && setOpenDialog(null)} hideTrigger />
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
