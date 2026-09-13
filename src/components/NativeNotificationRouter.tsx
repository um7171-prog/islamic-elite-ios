import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isNativeApp } from "@/lib/nativeAthan";
import { ANNOUNCEMENT_PUSH_CHANGED_EVENT, getAnnouncementPushEnabled, registerPushNotifications } from "@/lib/pushDevice";
import { useLocale } from "@/contexts/LocaleContext";

/**
 * Native-only: opens the right screen when the user taps a notification
 * (local athan alerts + remote admin announcements) and registers the device
 * with APNs. Renders nothing and does nothing on the web build.
 */
export function NativeNotificationRouter() {
  const navigate = useNavigate();
  const { lang } = useLocale();
  const [announcementPushEnabled, setAnnouncementPushEnabledState] = useState(() => getAnnouncementPushEnabled());

  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const handle = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (event) => {
            const route = (event.notification?.extra as any)?.route || "/";
            navigate(route);
          },
        );
        if (cancelled) handle.remove();
        else remove = () => handle.remove();
      } catch {
        /* plugin unavailable */
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const onChanged = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      setAnnouncementPushEnabledState(typeof enabled === "boolean" ? enabled : getAnnouncementPushEnabled());
    };
    window.addEventListener(ANNOUNCEMENT_PUSH_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ANNOUNCEMENT_PUSH_CHANGED_EVENT, onChanged);
  }, []);

  // Remote push (admin announcements) — explicit user opt-in only.
  useEffect(() => {
    if (!isNativeApp() || !announcementPushEnabled) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void registerPushNotifications(lang, (data) => {
      const route = typeof data?.route === "string" ? data.route : "/";
      navigate(route);
    }).then((fn) => {
      if (cancelled) fn();
      else cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [navigate, lang, announcementPushEnabled]);

  return null;
}
