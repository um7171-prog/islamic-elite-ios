// Remote (APNs) push notifications — admin announcements & updates ONLY.
// Athan / prayer / appointment alerts are LOCAL notifications (lib/notifications/NotificationScheduler.ts).
import { addInboxItem } from "@/lib/notificationInbox";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "./platform";

const TOKEN_KEY = "push.deviceToken";
const ANNOUNCEMENT_PUSH_KEY = "elite.push.announcements.enabled.v1";
export const ANNOUNCEMENT_PUSH_CHANGED_EVENT = "elite:announcement-push-changed";

export function getAnnouncementPushEnabled(): boolean {
  try { return localStorage.getItem(ANNOUNCEMENT_PUSH_KEY) === "1"; } catch { return false; }
}

export async function setAnnouncementPushEnabled(enabled: boolean): Promise<void> {
  try {
    localStorage.setItem(ANNOUNCEMENT_PUSH_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_PUSH_CHANGED_EVENT, { detail: { enabled } }));
  } catch { /* ignore */ }

  if (!enabled) {
    const token = getStoredPushToken();
    if (token) {
      try {
        await supabase.functions.invoke("register-device-token", {
          body: { action: "disable", token },
        });
      } catch { /* ignore */ }
    }
  }
}

async function plugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

async function saveToken(token: string, lang: "en" | "ar") {
  try {
    // Registration/refresh is mediated by an Edge Function (service role) that
    // scopes the write to this exact token — direct table writes from the
    // client are no longer permitted (see migration lock_device_tokens_writes).
    await supabase.functions.invoke("register-device-token", {
      body: {
        action: "register",
        token,
        platform: "ios",
        lang,
        device_model: navigator.userAgent.slice(0, 200),
      },
    });
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[push] token save failed", e);
  }
}

export function getStoredPushToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/**
 * Registers the device with APNs and stores the token in the backend.
 * Returns a cleanup function. No-op on the web build.
 */
export async function registerPushNotifications(
  lang: "en" | "ar",
  onOpen?: (data: Record<string, unknown>) => void,
): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  try {
    const PN = await plugin();

    let perm = await PN.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PN.requestPermissions();
    }
    if (perm.receive !== "granted") return () => {};

    const handles = [
      await PN.addListener("registration", (t) => { void saveToken(t.value, lang); }),
      await PN.addListener("registrationError", (e) => {
        if (import.meta.env.DEV) console.warn("[push] registration error", e);
      }),
      // Admin push arriving while the app is open: goes into the Notification Center with its real receive time.
      await PN.addListener("pushNotificationReceived", (n) => {
        addInboxItem({ kind: "push", id: n.id ? `push-${n.id}` : undefined, title: n.title ?? "", body: n.body ?? "", route: typeof n.data?.route === "string" ? n.data.route : undefined });
      }),
      await PN.addListener("pushNotificationActionPerformed", (action) => {
        // Tapped from the lock screen / banner: record it (arrival time = the tap, the only time the app learns of it).
        const n = action.notification;
        addInboxItem({ kind: "push", id: n?.id ? `push-${n.id}` : undefined, title: n?.title ?? "", body: n?.body ?? "", route: typeof n?.data?.route === "string" ? n.data.route : undefined });
        onOpen?.((action.notification?.data || {}) as Record<string, unknown>);
      }),
    ];

    await PN.register();
    return () => handles.forEach((h) => h.remove());
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[push] unavailable", e);
    return () => {};
  }
}
