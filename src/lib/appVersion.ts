import { Capacitor } from "@capacitor/core";

export type AppVersionInfo = { version: string; build: string };

declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD__: string | undefined;

/** Fallback values injected at build time (see vite.config.ts). */
const FALLBACK: AppVersionInfo = {
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "1.0.0",
  build: typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "0",
};



/**
 * Reads the real app version/build from the native bundle when running inside
 * Capacitor (CFBundleShortVersionString / CFBundleVersion on iOS).
 * On the web it falls back to the values injected at build time.
 */
export async function getAppVersion(): Promise<AppVersionInfo> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      return { version: info.version || FALLBACK.version, build: info.build || FALLBACK.build };
    }
  } catch {
    /* ignore — use fallback */
  }
  return FALLBACK;
}
