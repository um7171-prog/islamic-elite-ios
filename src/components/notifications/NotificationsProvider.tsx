import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCity } from "@/contexts/CityContext";
import { useLocale } from "@/contexts/LocaleContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { isNativeApp } from "@/lib/platform";
import { getPrayerTimes } from "@/lib/prayer";
import { loadEvents } from "@/lib/events";
import { loadAthkarSettings, syncAthkarReminders, type AthkarDayTimes } from "@/lib/athkarReminders";
import {
  getPermissionStatus,
  PERMISSION_CHANGED_EVENT,
  type NotificationPermissionStatus,
} from "@/lib/notifications/NotificationPermissionService";
import { isDryRun, registerNotificationRebuildHandler } from "@/lib/notifications/NotificationScheduler";
import { syncPrayerNotifications } from "@/lib/notifications/PrayerNotificationService";
import { syncAppointmentNotifications } from "@/lib/notifications/AppointmentNotificationService";
import {
  loadPrayerNotificationSettings,
  savePrayerNotificationSettings,
  type PrayerNotificationSettings,
} from "@/lib/notifications/NotificationSettings";

interface NotificationsContextValue {
  permission: NotificationPermissionStatus;
  refreshPermission: () => Promise<void>;
  prayerSettings: PrayerNotificationSettings;
  setPrayerSettings: (s: PrayerNotificationSettings) => void;
  scheduledPrayerCount: number;
  rebuildAll: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * The orchestrator. It owns NO scheduling logic: it only decides WHEN to rebuild (startup, a
 * location/method/madhab/setting/language change, the app returning to the foreground, the
 * permission changing, a settings screen asking) and calls the three services, which hand their
 * lists to the NotificationScheduler. Rebuilds never overlap: a request that arrives while one is
 * running makes it run once more afterwards, with the newest inputs (read from a ref, so there is
 * no stale closure).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { city } = useCity();
  const { lang } = useLocale();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const native = isNativeApp();

  const [permission, setPermission] = useState<NotificationPermissionStatus>("notDetermined");
  // Restore saved preferences everywhere (web included) so the Settings toggles survive a reload.
  const [prayerSettings, setPrayerSettingsState] = useState<PrayerNotificationSettings>(() => loadPrayerNotificationSettings());
  const [scheduledPrayerCount, setScheduledPrayerCount] = useState(0);

  const calc = useMemo(
    () => ({ method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [method, adjustments, prefs.ishaDelay30],
  );

  // Always the newest render's inputs.
  const inputs = useRef({ city, madhab, calc, prayerSettings, lang });
  inputs.current = { city, madhab, calc, prayerSettings, lang };

  const refreshPermission = useCallback(async () => {
    if (!native) return;
    setPermission(await getPermissionStatus());
  }, [native]);

  const setPrayerSettings = (next: PrayerNotificationSettings) => {
    setPrayerSettingsState(next);
    savePrayerNotificationSettings(next);
  };

  /* ---------------- one coalescing, non-overlapping rebuild ---------------- */
  const running = useRef(false);
  const again = useRef(false);

  const performRebuild = useCallback(async () => {
    // Browser: only the test-only dry run may proceed (it records requests, delivers nothing).
    if (!native && !isDryRun()) return;
    if (native && (await getPermissionStatus()) !== "granted") return;

    const { city: c, madhab: m, calc: cc, prayerSettings: ps, lang: lg } = inputs.current;
    const l: "ar" | "en" = lg === "ar" ? "ar" : "en";

    const prayer = await syncPrayerNotifications({ lat: c.lat, lng: c.lng, madhab: m, calc: cc, settings: ps, lang: l });
    setScheduledPrayerCount(prayer.scheduled);

    await syncAppointmentNotifications(loadEvents(), l);

    const days: AthkarDayTimes[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const { times } = getPrayerTimes(d, c.lat, c.lng, m, cc);
      days.push({ sunrise: times.sunrise, maghrib: times.maghrib });
    }
    await syncAthkarReminders(loadAthkarSettings(), days, l);
  }, [native]);

  const rebuild = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        try {
          await performRebuild();
        } catch {
          /* the scheduler reports its own errors; never let one failed rebuild stop the next */
        }
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [performRebuild]);

  // The permission the UI shows comes from iOS on start-up.
  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  // Rebuild whenever anything the schedule depends on changes (including the permission).
  useEffect(() => {
    void rebuild();
  }, [rebuild, permission, city.lat, city.lng, madhab, calcSignature, prayerSettings, lang]);

  // Settings screens ask through the scheduler module; nothing else builds notifications.
  useEffect(() => registerNotificationRebuildHandler(() => void rebuild()), [rebuild]);

  // The user answered Apple's dialog (or changed something) from anywhere.
  useEffect(() => {
    const onChanged = () => {
      void refreshPermission();
      void rebuild();
    };
    window.addEventListener(PERMISSION_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PERMISSION_CHANGED_EVENT, onChanged);
  }, [refreshPermission, rebuild]);

  // Back from the background (or from iOS Settings): re-read the permission and top the schedule up.
  useEffect(() => {
    if (!native) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          void refreshPermission();
          void rebuild();
        });
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      } catch {
        /* plugin unavailable */
      }
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [native, refreshPermission, rebuild]);

  const rebuildAll = useCallback(async () => {
    await rebuild();
  }, [rebuild]);

  const value = useMemo<NotificationsContextValue>(
    () => ({ permission, refreshPermission, prayerSettings, setPrayerSettings, scheduledPrayerCount, rebuildAll }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permission, refreshPermission, prayerSettings, scheduledPrayerCount, rebuildAll],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}

/** Same as useNotifications, but null outside a NotificationsProvider. */
export function useNotificationsOptional(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}
