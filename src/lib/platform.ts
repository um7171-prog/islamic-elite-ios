import { Capacitor } from "@capacitor/core";

/** True only inside the installed native iPhone/iPad app. */
export function isIOSNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/** True inside any native app shell (iOS or Android). Used where a feature
 * only makes sense off the plain web (e.g. native local notifications). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Opens the app's own page in the OS Settings app (permission was denied and
 * can only be changed there — iOS gives no in-app way to re-prompt). Uses the
 * `app-settings:` URL scheme WKWebView recognizes on iOS. */
export async function openNativeAppSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    window.open("app-settings:", "_system");
  } catch {
    /* no-op — nothing we can do without the OS accepting the scheme */
  }
}
