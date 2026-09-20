import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { getGregorianDate, getHijriDate } from "@/lib/prayer";

export function DateHeader() {
  const { lang, dir, t } = useLocale();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      dir={dir}
      className="glass rounded-2xl px-4 py-3 border border-foreground/10 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="hidden min-[400px]:grid h-9 w-9 rounded-xl place-items-center text-accent-foreground shrink-0"
            style={{ background: "var(--gradient-gold)" }}
          >
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="leading-tight min-w-0">
            <div className="text-caption uppercase tracking-wider text-foreground/60">
              {t("Hijri", "هجري")}
            </div>
            <div className="font-arabic text-[15px] min-[400px]:text-body font-semibold text-elite-gold whitespace-nowrap" data-testid="hijri-date">
              {getHijriDate(now, lang)}
            </div>
          </div>
        </div>
        <div className="h-8 w-px bg-foreground/10 shrink-0" />
        <div className="text-end leading-tight min-w-0">
          <div className="text-caption uppercase tracking-wider text-foreground/60">
            {t("Gregorian", "ميلادي")}
          </div>
          <div className="text-[15px] min-[400px]:text-body font-semibold text-foreground whitespace-nowrap" data-testid="gregorian-date">
            {getGregorianDate(now, lang)}
          </div>
        </div>
      </div>
    </div>
  );
}
