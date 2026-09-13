import { useCallback, useEffect, useRef, useState } from "react";
import type { SunnahTimes } from "adhan";
import type { CalcOptions, MadhabPref, PrayerEntry } from "@/lib/prayer";
import { scheduleAthan } from "@/lib/athan";
import type { AthanSettings } from "@/lib/athanSettings";
import {
  attachNotificationDiagnostics,
  bootstrapNativeNotifications,
  isNativeApp,
  rescheduleNativeAthan,
} from "@/lib/nativeAthan";

export interface NativeContext {
  lat: number;
  lng: number;
  madhab: MadhabPref;
  /** Calculation method + manual offsets, kept in sync with the displayed times. */
  calc?: CalcOptions;
  /** Any value that should force a full reschedule (city id, method, offsets…). */
  signature?: string;
}

export function useAthanScheduler(
  entries: PrayerEntry[],
  settings: AthanSettings,
  lang: "en" | "ar",
  sunnah?: SunnahTimes | null,
  native?: NativeContext,
) {
  const [scheduledCount, setScheduledCount] = useState(0);
  const handleRef = useRef<{ cancel: () => void } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const nativeMode = isNativeApp();
  const settingsSignature = JSON.stringify(settings);

  const rescheduleNative = useCallback(async () => {
    if (!nativeMode || !native) return 0;
    const res = await rescheduleNativeAthan({
      lat: native.lat,
      lng: native.lng,
      madhab: native.madhab,
      calc: native.calc,
      settings: settingsRef.current,
      lang,
    });
    if (import.meta.env.DEV) console.info("[athan] scheduled", res.scheduled, res.reason ?? "");
    setScheduledCount(res.scheduled);
    return res.scheduled;
  }, [nativeMode, native?.lat, native?.lng, native?.madhab, native?.signature, settingsSignature, lang]);

  // ---- Native (iPhone app): real OS-level local notifications ----
  // Startup path: checkPermissions() → requestPermissions() → schedule().
  useEffect(() => {
    if (!nativeMode) return;
    let cancelled = false;
    void attachNotificationDiagnostics();
    (async () => {
      const boot = await bootstrapNativeNotifications();
      if (cancelled) return;
      if (boot.granted) await rescheduleNative();
    })();
    return () => {
      cancelled = true;
    };
  }, [nativeMode, rescheduleNative]);

  // Native: iOS caps pending local notifications (64), so top the queue back up
  // every time the app returns to the foreground.
  useEffect(() => {
    if (!nativeMode) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void rescheduleNative();
        });

        if (cancelled) handle.remove();
        else remove = () => handle.remove();
      } catch {
        /* plugin unavailable (web build) */
      }
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [nativeMode, rescheduleNative]);

  // ---- Web: in-page timers (unchanged behaviour) ----
  useEffect(() => {
    if (nativeMode) return;
    handleRef.current?.cancel();
    const handle = scheduleAthan({ entries, settings, lang, sunnah });
    handleRef.current = handle;
    setScheduledCount(handle.scheduledCount);

    // re-sync at next midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0);
    const midnightTimer = window.setTimeout(() => {
      setScheduledCount((c) => c);
    }, midnight.getTime() - now.getTime());

    return () => {
      handle.cancel();
      clearTimeout(midnightTimer);
    };
  }, [nativeMode, entries, settings, lang, sunnah]);

  return { scheduledCount, rescheduleNative, nativeMode };
}
