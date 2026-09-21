import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeApp, openNativeAppSettings } from "@/lib/platform";

/**
 * NotificationPermissionService: the ONE place that talks to iOS about notification permission.
 *
 * Status is read from iOS itself (never remembered by the app):
 *  - "granted"       authorised (this includes provisional/ephemeral: iOS delivers notifications)
 *  - "denied"        the user refused; iOS never shows its dialog again, only Settings can change it
 *  - "notDetermined" iOS has not asked yet (also the answer in a plain browser, where there is no
 *                    OS permission at all)
 *  - "unknown"       the plugin could not be read; nothing is assumed
 *
 * `getPermissionStatus()` NEVER prompts. Only `requestPermission()` can show Apple's system dialog,
 * and only while the real status is "notDetermined". After the user has answered, calling it again
 * just returns the current status: the dialog cannot be forced a second time.
 */
export type NotificationPermissionStatus = "granted" | "denied" | "notDetermined" | "unknown";

export const PERMISSION_CHANGED_EVENT = "elite-notifications:permission-changed";

function emitChanged(status: NotificationPermissionStatus) {
  window.dispatchEvent(new CustomEvent(PERMISSION_CHANGED_EVENT, { detail: { status } }));
}

/** Maps Capacitor's iOS answer ("granted" | "denied" | "prompt" | "prompt-with-rationale"). */
export function mapDisplay(display: string): NotificationPermissionStatus {
  if (display === "granted") return "granted";
  if (display === "denied") return "denied";
  if (display === "prompt" || display === "prompt-with-rationale") return "notDetermined";
  return "unknown";
}

/** Read-only. Never shows a dialog. */
export async function getPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!isNativeApp()) return "notDetermined";
  try {
    const result = await LocalNotifications.checkPermissions();
    return mapDisplay(result.display);
  } catch {
    return "unknown";
  }
}

/** Shows Apple's real system dialog when iOS has not asked yet; otherwise just reports the status. */
export async function requestPermission(): Promise<NotificationPermissionStatus> {
  if (!isNativeApp()) return "notDetermined";
  try {
    let status = mapDisplay((await LocalNotifications.checkPermissions()).display);
    if (status === "notDetermined") {
      status = mapDisplay((await LocalNotifications.requestPermissions()).display);
    }
    emitChanged(status);
    return status;
  } catch {
    return "unknown";
  }
}

/** Opens this app's page in iOS Settings (the only way to change a previous "Don't Allow"). */
export function openNotificationSettings(): Promise<void> {
  return openNativeAppSettings();
}
