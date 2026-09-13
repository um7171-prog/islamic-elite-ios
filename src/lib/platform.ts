import { Capacitor } from "@capacitor/core";

/** True only inside the installed native iPhone/iPad app. */
export function isIOSNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}
