import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { formatCountdown, getNextPrayer, type PrayerEntry } from "@/lib/prayer";

interface Props { entries: PrayerEntry[]; active: boolean; }

export function NextAthanBanner({ entries, active }: Props) {
  const { t, dir } = useLocale();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!active) return null;
  const { next, msUntilNext } = getNextPrayer(entries, now);

  return (
    <div
      dir={dir}
      className="flex items-center justify-center gap-2 rounded-full glass px-4 py-2 text-xs text-foreground/80 mb-3 mx-auto w-fit"
    >
      <Bell className="h-3.5 w-3.5 text-accent animate-pulse" />
      <span>
        {t(`Athan in ${formatCountdown(msUntilNext)} · ${next.nameEn}`,
           `الأذان بعد ${formatCountdown(msUntilNext)} · ${next.nameAr}`)}
      </span>
    </div>
  );
}
