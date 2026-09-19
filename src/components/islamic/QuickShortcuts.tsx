import { useNavigate } from "react-router-dom";
import { BookOpen, Heart, Compass, CalendarHeart, Sparkles, Calculator, Repeat, LayoutGrid } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

// Same gradient palette used for these exact tools in ServicesHub.tsx (the
// Services grid), repeated here rather than imported so this component
// doesn't require any change to that file. Every route below is a real,
// already-working page — nothing here is a placeholder.
const GOLD = "linear-gradient(135deg, hsl(42 85% 55%), hsl(38 90% 65%))";
const EMERALD = "linear-gradient(135deg, hsl(158 70% 35%), hsl(168 75% 45%))";
const BLUE = "linear-gradient(135deg, hsl(200 70% 45%), hsl(195 80% 60%))";
const PURPLE = "linear-gradient(135deg, hsl(280 50% 40%), hsl(260 60% 55%))";

interface Shortcut {
  en: string;
  ar: string;
  Icon: React.ElementType;
  gradient: string;
  to: string;
}

const SHORTCUTS: Shortcut[] = [
  { en: "Quran", ar: "القرآن الكريم", Icon: BookOpen, gradient: PURPLE, to: "/mushaf" },
  { en: "Athkar", ar: "الأذكار", Icon: Heart, gradient: EMERALD, to: "/athkar" },
  { en: "Qibla", ar: "القبلة", Icon: Compass, gradient: BLUE, to: "/qibla" },
  { en: "Calendar", ar: "التقويم", Icon: CalendarHeart, gradient: EMERALD, to: "/calendar" },
  { en: "99 Names", ar: "أسماء الله الحسنى", Icon: Sparkles, gradient: GOLD, to: "/asma-al-husna" },
  { en: "Calculators", ar: "الحاسبات", Icon: Calculator, gradient: GOLD, to: "/tools" },
  { en: "Converter", ar: "تحويل الملفات", Icon: Repeat, gradient: EMERALD, to: "/convert" },
  { en: "More", ar: "المزيد", Icon: LayoutGrid, gradient: BLUE, to: "/tools" },
];

/** Quick-access shortcut grid for the Home page, matching the reference
 * design's 4x2 icon grid. Every tile navigates to a real, existing route —
 * no new pages or logic, this only adds fast entry points to features that
 * already work (most already live inside the unified Services grid). */
export function QuickShortcuts() {
  const { t, dir } = useLocale();
  const navigate = useNavigate();

  return (
    <div dir={dir} className="grid grid-cols-4 gap-x-2 gap-y-4">
      {SHORTCUTS.map((s) => (
        <button
          key={s.en}
          onClick={() => navigate(s.to)}
          className="flex flex-col items-center gap-1.5 group"
          style={{ touchAction: "manipulation" }}
        >
          <span
            className="h-12 w-12 rounded-full grid place-items-center text-accent-foreground border-2 transition-transform group-active:scale-95 group-hover:scale-105"
            style={{
              background: s.gradient,
              borderColor: "hsl(var(--elite-gold-start))",
              boxShadow: "var(--shadow-glow-gold)",
            }}
          >
            <s.Icon className="h-5 w-5" />
          </span>
          <span className="text-[10.5px] font-semibold text-foreground/80 text-center leading-tight break-words">
            {t(s.en, s.ar)}
          </span>
        </button>
      ))}
    </div>
  );
}
