import { useNavigate } from "react-router-dom";
import { BookOpen, CalendarClock, CalendarDays, Calculator, Clock, Compass, Heart, LayoutGrid, Repeat } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { IconBadge } from "@/components/site/IconBadge";

interface Shortcut {
  en: string;
  ar: string;
  Icon: React.ElementType;
  to: string;
}

// Every tile opens a real, already-working screen — nothing here is a placeholder.
const SHORTCUTS: Shortcut[] = [
  { en: "Quran", ar: "القرآن الكريم", Icon: BookOpen, to: "/quran" },
  { en: "Prayer Times", ar: "أوقات الصلاة", Icon: Clock, to: "/prayer-times" },
  { en: "Qibla", ar: "القبلة", Icon: Compass, to: "/qibla" },
  { en: "Calendar", ar: "التقويم", Icon: CalendarDays, to: "/calendar" },
  { en: "Appointments", ar: "المواعيد", Icon: CalendarClock, to: "/calendar?add=1" },
  { en: "Athkar", ar: "الأذكار", Icon: Heart, to: "/athkar" },
  { en: "File Converter", ar: "تحويل الملفات", Icon: Repeat, to: "/convert" },
  { en: "Tools", ar: "أدوات عامة", Icon: Calculator, to: "/calculators" },
  { en: "More", ar: "المزيد", Icon: LayoutGrid, to: "/more" },
];

/** Home shortcut grid (3 columns): emerald/gold icon badge + Arabic label with
 * the English name under it (Arabic UI) or the English label alone (English UI). */
export function QuickShortcuts() {
  const { t, dir, lang } = useLocale();
  const navigate = useNavigate();

  return (
    <div dir={dir} className="grid grid-cols-3 gap-x-3 gap-y-5">
      {SHORTCUTS.map((s) => (
        <button
          key={s.to}
          type="button"
          data-shortcut={s.to}
          onClick={() => navigate(s.to)}
          className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl py-1 transition active:scale-95"
          style={{ touchAction: "manipulation" }}
        >
          <IconBadge icon={s.Icon} size="lg" className="shadow-[0_4px_12px_-4px_hsl(160_50%_15%/0.5)]" />
          <span className="w-full text-center leading-tight">
            <span className="block break-words text-body-sm font-semibold text-foreground">{t(s.en, s.ar)}</span>
            {lang === "ar" && (
              <span className="mt-0.5 block break-words text-[12px] text-foreground/55" dir="ltr">
                {s.en}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
