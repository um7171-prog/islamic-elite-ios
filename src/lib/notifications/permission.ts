import { isNativeApp } from "@/lib/platform";

/**
 * Single source of truth for the local-notification permission across the
 * whole app. Three real states only — nothing is invented:
 *
 *  - "granted"      — iOS will actually show local notifications.
 *  - "denied"        — the user (or a previous prompt) said no; iOS gives no
 *                      in-app way to ask again, only Settings can change it.
 *  - "notDetermined" — never asked yet.
 *
 * `checkStatus()` is READ-ONLY: it NEVER shows Apple's system dialog, no
 * matter when it's called (app boot, returning to the foreground, opening
 * Settings). Only `requestPermission()` can trigger the real OS prompt, and
 * it must only ever be called from a direct, explicit user tap — the
 * onboarding card's "Enable notifications" button, or the equivalent button
 * in Settings. This is what keeps the system prompt from ever appearing
 * "out of nowhere".
 */
export type NotificationPermissionStatus = "granted" | "denied" | "notDetermined";

export const PERMISSION_CHANGED_EVENT = "elite-notifications:permission-changed";

function emitChanged(status: NotificationPermissionStatus) {
  window.dispatchEvent(new CustomEvent(PERMISSION_CHANGED_EVENT, { detail: { status } }));
}

function readDisplay(display: string): NotificationPermissionStatus {
  if (display === "granted") return "granted";
  if (display === "denied") return "denied";
  return "notDetermined";
}

/** Read-only. Never shows a system dialog. Returns "notDetermined" on plain web
 * (there is no iOS permission to check outside the native app). */
export async function checkPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!isNativeApp()) return "notDetermined";
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.checkPermissions();
    return readDisplay(result.display);
  } catch {
    return "notDetermined";
  }
}

/** Shows Apple's real system permission dialog when status is still
 * "notDetermined" (a no-op read if already granted/denied — safe to call
 * more than once). Call this ONLY from a direct user tap. */
export async function requestPermission(): Promise<NotificationPermissionStatus> {
  if (!isNativeApp()) return "notDetermined";
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const current = await LocalNotifications.checkPermissions();
    let status = readDisplay(current.display);
    if (status === "notDetermined") {
      const requested = await LocalNotifications.requestPermissions();
      status = readDisplay(requested.display);
    }
    emitChanged(status);
    return status;
  } catch {
    return "notDetermined";
  }
}
