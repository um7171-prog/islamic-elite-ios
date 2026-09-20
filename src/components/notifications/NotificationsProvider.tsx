import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCity } from "@/contexts/CityContext";
import { useLocale } from "@/contexts/LocaleContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { isNativeApp } from "@/lib/platform";
import {
  DEFAULT_PRAYER_NOTIFICATION_SETTINGS,
  loadPrayerNotificationSettings,
  savePrayerNotificationSettings,
  type PrayerNotificationSettings,
} from "@/lib/notifications/settings";
import { schedulePrayerNotifications } from "@/lib/notifications/prayerSchedule";
import { checkPermissionStatus, PERMISSION_CHANGED_EVENT, type NotificationPermissionStatus } from "@/lib/notifications/permission";
import { registerNotificationRebuildHandler } from "@/lib/notifications/coordinator";
import { loadEvents, syncEventNotifications } from "@/lib/events";
import { loadAthkarSettings, syncAthkarReminders, type AthkarDayTimes } from "@/lib/athkarReminders";
import { getPrayerTimes } from "@/lib/prayer";

interface NotificationsContextValue {
  permission: NotificationPermissionStatus;
  refreshPermission: () => Promise<void>;
  prayerSettings: PrayerNotificationSettings;
  setPrayerSettings: (s: PrayerNotificationSettings) => void;
  scheduledPrayerCount: number;
  rebuildAll: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { city } = useCity();
  const { lang } = useLocale();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const native = isNativeApp();

  const [permission, setPermission] = useState<NotificationPermissionStatus>("notDetermined");
  const [prayerSettings, setPrayerSettingsState] = useState<PrayerNotificationSettings>(() =>
    native ? loadPrayerNotificationSettings() : DEFAULT_PRAYER_NOTIFICATION_SETTINGS,
  );
  const [scheduledPrayerCount, setScheduledPrayerCount] = useState(0);

  const calc = useMemo(
    () => ({ method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [method, adjustments, prefs.ishaDelay30],
  );

  const refreshPermission = async () => {
    const status = await checkPermissionStatus();
    setPermission(status);
  };

  // Read-only permission check on mount/native change — never prompts.
  useEffect(() => {
    if (!native) return;
    void refreshPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  // React the moment the user answers the permission prompt from anywhere
  // (the onboarding card or the Settings button) so schedules go out right away.
  useEffect(() => {
    const onChanged = () => void refreshPermission();
    window.addEventListener(PERMISSION_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PERMISSION_CHANGED_EVENT, onChanged);
  }, []);

  const setPrayerSettings = (next: PrayerNotificationSettings) => {
    setPrayerSettingsState(next);
    savePrayerNotificationSettings(next);
  };

  // ---- Prayer schedule rebuild: city / madhab / calc / settings / lang ----
  const reschedulePrayer = async () => {
    if (!native || permission !== "granted") return 0;
    const res = await schedulePrayerNotifications({
      lat: city.lat,
      lng: city.lng,
      madhab,
      calc,
      settings: prayerSettings,
      lang: lang === "ar" ? "ar" : "en",
    });
    setScheduledPrayerCount(res.scheduled);
    return res.scheduled;
  };

  useEffect(() => {
    void reschedulePrayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, permission, city.lat, city.lng, madhab, calcSignature, prayerSettings, lang]);

  // ---- Athkar + calendar rebuild: one serialized owner, like the prayer
  // group but driven by the coordinator so those two features don't each
  // need their own foreground/permission wiring. ----
  const groupRunRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);

  useEffect(() => {
    if (!native) return;
    let disposed = false;

    const performAthkarAndCalendar = async () => {
      const status = await checkPermissionStatus();
      if (status !== "granted" || disposed) return;
      const l: "ar" | "en" = lang === "ar" ? "ar" : "en";
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
          await performAthkarAndCalendar();
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

    const unregister = registerNotificationRebuildHandler(requestRun);
    const startup = window.setTimeout(requestRun, 900);
    const onPermissionChanged = () => requestRun();
    window.addEventListener(PERMISSION_CHANGED_EVENT, onPermissionChanged);

    let removeAppListener: (() => void) | undefined;
    let listenerCancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            window.setTimeout(requestRun, 500);
            window.setTimeout(() => void reschedulePrayer(), 500);
          }
        });
        if (listenerCancelled) handle.remove();
        else removeAppListener = () => handle.remove();
      } catch {
        /* plugin unavailable (web build) */
      }
    })();

    return () => {
      disposed = true;
      listenerCancelled = true;
      window.clearTimeout(startup);
      window.removeEventListener(PERMISSION_CHANGED_EVENT, onPermissionChanged);
      unregister();
      removeAppListener?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, city.lat, city.lng, madhab, calc, lang]);

  const rebuildAll = async () => {
    await reschedulePrayer();
    // Athkar/calendar go through the same coordinator every other trigger uses.
    const { requestNotificationRebuild } = await import("@/lib/notifications/coordinator");
    requestNotificationRebuild();
  };

  const value = useMemo<NotificationsContextValue>(
    () => ({ permission, refreshPermission, prayerSettings, setPrayerSettings, scheduledPrayerCount, rebuildAll }),
    [permission, prayerSettings, scheduledPrayerCount],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
