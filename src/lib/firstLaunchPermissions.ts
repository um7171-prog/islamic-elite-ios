import { isNativeApp } from "@/lib/nativeAthan";

export type PermState = "granted" | "denied" | "prompt" | "unknown";

const FLAG = "onboarding.permissions.requested.v1";

/** Module-level guard — survives React StrictMode double-effects. */
let flowRunning = false;

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

export async function checkLocationPermission(): Promise<PermState> {
  try {
    if (typeof navigator === "undefined" || !navigator.geolocation) return "unknown";
    if (!("permissions" in navigator) || !navigator.permissions?.query) return "prompt";
    const st = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return (st.state as PermState) ?? "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * Triggers the real Apple "Allow While Using App" dialog inside the Capacitor
 * WKWebView (When-In-Use only — we never ask for Always).
 */
export function requestLocationPermission(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    let settled = false;
    const done = (v: GeolocationPosition | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => done(pos),
      () => done(null),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 },
    );
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function checkNotificationPermission(): Promise<PermState> {
  try {
    if (isNativeApp()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const st = await LocalNotifications.checkPermissions();
      if (st.display === "granted") return "granted";
      if (st.display === "denied") return "denied";
      return "prompt";
    }
    if (typeof Notification === "undefined") return "unknown";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return "prompt";
  } catch {
    return "unknown";
  }
}

export async function requestNotificationPermission(): Promise<PermState> {
  try {
    if (isNativeApp()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const st = await LocalNotifications.requestPermissions();
      return st.display === "granted" ? "granted" : st.display === "denied" ? "denied" : "prompt";
    }
    if (typeof Notification === "undefined") return "unknown";
    const res = await Notification.requestPermission();
    return res === "granted" ? "granted" : res === "denied" ? "denied" : "prompt";
  } catch {
    return "unknown";
  }
}

/* ------------------------------------------------------------------ */
/* Sequential first-launch flow                                        */
/* ------------------------------------------------------------------ */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FirstLaunchResult {
  ran: boolean;
  location: PermState;
  notifications: PermState;
  position: GeolocationPosition | null;
}

/**
 * Location dialog first, then — only after the user answered and the Apple
 * sheet closed — the notifications dialog. Never in parallel.
 */
export async function runFirstLaunchPermissionFlow(): Promise<FirstLaunchResult> {
  if (flowRunning) {
    return { ran: false, location: "unknown", notifications: "unknown", position: null };
  }
  flowRunning = true;
  let position: GeolocationPosition | null = null;

  try {
    // 1) Location — When In Use only.
    let loc = await checkLocationPermission();
    if (loc === "prompt" || loc === "unknown") {
      position = await requestLocationPermission();
      loc = await checkLocationPermission();
      if (loc === "prompt" || loc === "unknown") loc = position ? "granted" : "denied";
    }

    // 2) Let the first system sheet finish dismissing.
    await wait(700);

    // 3) Notifications — only if iOS can still show the sheet.
    let notif = await checkNotificationPermission();
    if (notif === "prompt") {
      notif = await requestNotificationPermission();
    }

    try { localStorage.setItem(FLAG, "1"); } catch { /* ignore */ }
    return { ran: true, location: loc, notifications: notif, position };
  } finally {
    flowRunning = false;
  }
}

export function firstLaunchFlagSet(): boolean {
  try { return !!localStorage.getItem(FLAG); } catch { return false; }
}
