import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isNativeApp } from "@/lib/platform";
import { ANNOUNCEMENT_PUSH_CHANGED_EVENT, getAnnouncementPushEnabled, registerPushNotifications } from "@/lib/pushDevice";
import { useLocale } from "@/contexts/LocaleContext";
import { addInboxItem } from "@/lib/notificationInbox";

/**
 * Native-only: opens the right screen when the user taps a notification, and
 * registers the device for the admin's remote announcements when the user
 * has opted in. These are two genuinely separate mechanisms:
 *
 *  - Local notification taps (prayer/athkar/calendar, all scheduled by
 *    NotificationsProvider) are read from `localNotificationActionPerformed`
 *    — no network, no APNs.
 *  - The admin announcements push registration below uses APNs
 *    (@capacitor/push-notifications) and is entirely opt-in via the "App
 *    Announcements" switch in Settings. It never schedules or cancels any
 *    local notification and has nothing to do with prayer times.
 *
 * Renders nothing and does nothing on the web build.
 */
export function NotificationRouter() {
  const navigate = useNavigate();
  const { lang } = useLocale();
  const [announcementPushEnabled, setAnnouncementPushEnabledState] = useState(() => getAnnouncementPushEnabled());

  // Local notification taps (prayer / athkar / calendar alike — all carry an
  // `extra.route` field set by whichever part of NotificationsProvider
  // scheduled them).
  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        // A local notification delivered while the app is open enters the Notification Center now.
        const received = await LocalNotifications.addListener("localNotificationReceived", (n) => {
          addInboxItem({ kind: "local", id: `local-${n.id}-${Math.floor(Date.now() / 60_000)}`, title: n.title ?? "", body: n.body ?? "", route: (n.extra as { route?: string } | undefined)?.route });
        });
        const handle = await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
          const route = (event.notification?.extra as { route?: string } | undefined)?.route || "/";
          navigate(route);
        });
        if (cancelled) { handle.remove(); received.remove(); }
        else remove = () => { handle.remove(); received.remove(); };
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

  // Remote push (admin announcements) — explicit user opt-in only, separate
  // from local notification permission entirely.
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
