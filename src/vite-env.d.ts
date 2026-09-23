/// <reference types="vite/client" />

declare module "hijri-converter" {
  export function toHijri(gy: number, gm: number, gd: number): { hy: number; hm: number; hd: number };
  export function toGregorian(hy: number, hm: number, hd: number): { gy: number; gm: number; gd: number };
}

declare module "mammoth" {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  };
  export default mammoth;
}

/** Injected by vite.config.ts — true when pre_athan_alert.caf is inside the iOS App Bundle. */
declare const __PRE_REMINDER_CAF_BUNDLED__: boolean;
/** Injected by vite.config.ts — .caf files verified to be in the iOS App Bundle. */
declare const __BUNDLED_CAFS__: string[];
/** Injected by vite.config.ts — ISO timestamp of the current build. */
declare const __BUILD_STAMP__: string;
/** Injected by vite.config.ts — marketing version (CFBundleShortVersionString). */
declare const __APP_VERSION__: string;
/** Injected by vite.config.ts — CI build number (CFBundleVersion). */
declare const __APP_BUILD__: string;
/** Injected by vite.config.ts — short git commit hash baked into this build. */
declare const __GIT_COMMIT__: string;
/** Injected by vite.config.ts — git branch baked into this build. */
declare const __GIT_BRANCH__: string;
