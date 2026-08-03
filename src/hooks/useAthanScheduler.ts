import { useEffect, useRef, useState } from "react";
import type { SunnahTimes } from "adhan";
import type { PrayerEntry } from "@/lib/prayer";
import { scheduleAthan } from "@/lib/athan";
import type { AthanSettings } from "@/lib/athanSettings";

export function useAthanScheduler(
  entries: PrayerEntry[],
  settings: AthanSettings,
  lang: "en" | "ar",
  sunnah?: SunnahTimes | null,
) {
  const [scheduledCount, setScheduledCount] = useState(0);
  const handleRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    handleRef.current?.cancel();
    const handle = scheduleAthan({ entries, settings, lang, sunnah });
    handleRef.current = handle;
    setScheduledCount(handle.scheduledCount);

    // re-sync at next midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0);
    const midnightTimer = window.setTimeout(() => {
      // trigger a no-op state to force consumer re-render via entries change upstream
      setScheduledCount((c) => c);
    }, midnight.getTime() - now.getTime());

    return () => {
      handle.cancel();
      clearTimeout(midnightTimer);
    };
    // entries identity changes daily via getPrayerTimes memo, settings on user edit
  }, [entries, settings, lang, sunnah]);

  return { scheduledCount };
}
