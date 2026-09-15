import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCity } from "@/contexts/CityContext";
import { useLocale } from "@/contexts/LocaleContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { useAthanScheduler } from "@/hooks/useAthanScheduler";
import { loadAthanSettings, saveAthanSettings, type AthanSettings } from "@/lib/athanSettings";
import { getPrayerTimes } from "@/lib/prayer";
import { isNativeApp } from "@/lib/nativeNotify";
import { checkOrRequestNotificationPermission } from "@/lib/nativeAthan";
import { loadEvents, saveEvents, syncEventNotifications } from "@/lib/events";
import { loadAthkarSettings, saveAthkarSettings, syncAthkarReminders, type AthkarDayTimes } from "@/lib/athkarReminders";
import { registerNativeNotificationCoordinator } from "@/lib/nativeNotificationCoordinator";

// Must match NOTIFICATION_PERMISSION_ANSWERED_EVENT in NotificationPermissionPrompt.tsx.
// Kept as a literal (not imported) to avoid a circular import — that module
// imports useNativeAthanScheduler from this one.
const PERMISSION_ANSWERED_EVENT = "athan:notification-permission-answered";

interface SchedulerContextValue {
  settings: AthanSettings;
  setSettings: (settings: AthanSettings) => void;
  scheduledCount: number;
  reschedule: () => Promise<number>;
}

const SchedulerContext = createContext<SchedulerContextValue | null>(null);

export function NativeAthanScheduler({ children }: { children: ReactNode }) {
  const { city } = useCity();
  const { lang } = useLocale();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const [settings, setSettingsState] = useState<AthanSettings>(() => loadAthanSettings());
  const [today] = useState(() => new Date());
  const calc = useMemo(
    () => ({ method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [method, adjustments, prefs.ishaDelay30],
  );
  const { entries, sunnah } = useMemo(
    () => getPrayerTimes(today, city.lat, city.lng, madhab, calc),
    [today, city.lat, city.lng, madhab, calc],
  );
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "", []);
  const nativeContext = useMemo(
    () => ({ lat: city.lat, lng: city.lng, madhab, calc, signature: `${city.id}|${madhab}|${timezone}|${calcSignature}` }),
    [city.lat, city.lng, city.id, madhab, timezone, calc, calcSignature],
  );
  const { scheduledCount, rescheduleNative } = useAthanScheduler(entries, settings, lang, sunnah, nativeContext);

  // One-time repair for installs that kept old notification preferences in localStorage.
  // The app owner requested the five prayers + 5-minute pre-prayer reminder +
  // morning/evening athkar to be ON by default. This migration repairs existing
  // installs once, without repeatedly overriding later user choices.
  useEffect(() => {
    if (!isNativeApp()) return;
    const REPAIR_KEY = "elite.notification.repair.v5";
    try {
      if (localStorage.getItem(REPAIR_KEY) === "1") return;
      const current = loadAthanSettings();
      const repaired: AthanSettings = {
        ...current,
        preReminderMinutes: 5,
        nightAlertsEnabled: true,
        nightAlerts: {
          ...current.nightAlerts,
          midnight: { enabled: true, offsetMinutes: 0 },
        },
        perPrayerEnabled: {
          ...current.perPrayerEnabled,
          fajr: true,
          sunrise: false,
          dhuhr: true,
          asr: true,
          maghrib: true,
          isha: true,
        },
      };
      saveAthanSettings(repaired);
      setSettingsState(repaired);

      const athkar = loadAthkarSettings();
      saveAthkarSettings({ ...athkar, morningEnabled: true, eveningEnabled: true });

      // Existing calendar items that were accidentally left with notifications
      // disabled are repaired to notify at the event time. Future user changes
      // are respected because this migration runs once only.
      const events = loadEvents();
      const repairedEvents = events.map((ev) =>
        ev.remindMinutesBefore === null ? { ...ev, remindMinutesBefore: 0 } : ev,
      );
      if (repairedEvents.some((ev, i) => ev !== events[i])) saveEvents(repairedEvents);
      localStorage.setItem(REPAIR_KEY, "1");
    } catch (error) {
      console.error("[notify:repair] migration failed", error);
    }
  }, []);

  // One serialized owner for events + athkar native rebuilds.
  const groupRunRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    const l: "ar" | "en" = lang === "ar" ? "ar" : "en";
    let disposed = false;

    const perform = async () => {
      // CRITICAL: this runs automatically on every launch/foreground with no
      // user action. Never let it reach the native scheduler while
      // permission is still undecided — scheduleNativeGroup()'s iOS path
      // calls the custom plugin's ensurePermission(), which auto-prompts
      // Apple's real system dialog the instant status is "notDetermined".
      // That bypassed the "only two call sites may ever prompt" rule the
      // first-launch dialog and Settings button rely on. Read-only check;
      // skip entirely until permission is actually granted (the listener
      // below re-runs this the moment the user grants it).
      const { granted } = await checkOrRequestNotificationPermission(false);
      if (!granted || disposed) return;
      const days: AthkarDayTimes[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const { times } = getPrayerTimes(d, city.lat, city.lng, madhab, calc);
        days.push({ sunrise: times.sunrise, maghrib: times.maghrib });
      }
      await syncEventNotifications(loadEvents(), l);
      if (!disposed) await syncAthkarReminders(loadAthkarSettings(), days, l);
    };

    const requestRun = () => {
      if (disposed) return;
      if (groupRunRef.current) {
        rerunRef.current = true;
        return;
      }
      const run = (async () => {
        try {
          await perform();
        } finally {
          groupRunRef.current = null;
          if (!disposed && rerunRef.current) {
            rerunRef.current = false;
            window.setTimeout(requestRun, 300);
          }
        }
      })();
      groupRunRef.current = run;
    };

    const unregister = registerNativeNotificationCoordinator(requestRun);
    const startup = window.setTimeout(requestRun, 900);
    // Re-run the moment the user answers the first-launch dialog (or taps
    // "Enable notifications now" in Settings) so events/athkar are scheduled
    // right away when permission is freshly granted, instead of waiting for
    // the next foreground/city-change to notice.
    const onPermissionAnswered = () => requestRun();
    window.addEventListener(PERMISSION_ANSWERED_EVENT, onPermissionAnswered);

    let remove: (() => void) | undefined;
    let listenerCancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) window.setTimeout(requestRun, 500);
        });
        if (listenerCancelled) handle.remove();
        else remove = () => handle.remove();
      } catch {
        /* plugin unavailable */
      }
    })();

    return () => {
      disposed = true;
      listenerCancelled = true;
      window.clearTimeout(startup);
      window.removeEventListener(PERMISSION_ANSWERED_EVENT, onPermissionAnswered);
      unregister();
      remove?.();
    };
  }, [city.lat, city.lng, madhab, calc, lang]);


  const setSettings = (next: AthanSettings) => {
    setSettingsState(next);
    saveAthanSettings(next);
  };
  const value = useMemo(
    () => ({ settings, setSettings, scheduledCount, reschedule: rescheduleNative }),
    [settings, scheduledCount, rescheduleNative],
  );
  return <SchedulerContext.Provider value={value}>{children}</SchedulerContext.Provider>;
}

export function useNativeAthanScheduler(): SchedulerContextValue {
  const context = useContext(SchedulerContext);
  if (!context) throw new Error("useNativeAthanScheduler must be inside NativeAthanScheduler");
  return context;
}