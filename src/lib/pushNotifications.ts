// Web Push subscription helpers — registers a Service Worker on production
// domains only, never inside Lovable preview iframes.
import { supabase } from "@/integrations/supabase/client";
import type { AthanSettings } from "./athanSettings";

function isPreviewOrIframe(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch { return true; }
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

export function pushAllowedHere(): boolean {
  return pushSupported() && !isPreviewOrIframe();
}

const INVALID_VAPID_MESSAGE =
  "VAPID public key is not a valid P-256 key. Generate a fresh pair with `npx web-push generate-vapid-keys`, then update both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.";

async function assertP256PublicKey(key: Uint8Array): Promise<void> {
  try {
    const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
    await crypto.subtle.importKey("raw", keyBuffer, { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    throw new Error(INVALID_VAPID_MESSAGE);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = (base64String || "").trim().replace(/\s+/g, "").replace(/=+$/, "");
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  // Valid uncompressed P-256 key must be 65 bytes starting with 0x04.
  if (out.length !== 65 || out[0] !== 0x04) {
    throw new Error(INVALID_VAPID_MESSAGE);
  }
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function fetchPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("subscribe-push", {
    body: { action: "publicKey" },
  });
  if (error) throw error;
  return data.publicKey as string;
}

export async function subscribeToPush(
  coords: { lat: number; lng: number },
  settings: AthanSettings,
  lang: "en" | "ar",
): Promise<PushSubscription> {
  if (!pushAllowedHere()) {
    throw new Error("Background notifications require techsnds.com (not preview).");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission denied");

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const publicKey = await fetchPublicKey();
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    await assertP256PublicKey(applicationServerKey);
    const applicationServerKeyBuffer = applicationServerKey.buffer.slice(
      applicationServerKey.byteOffset,
      applicationServerKey.byteOffset + applicationServerKey.byteLength,
    ) as ArrayBuffer;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKeyBuffer,
    });
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh";
  const { error } = await supabase.functions.invoke("subscribe-push", {
    body: {
      action: "subscribe",
      subscription: sub.toJSON(),
      lat: coords.lat,
      lng: coords.lng,
      tz, lang,
      settings: {
        preReminderMinutes: settings.preReminderMinutes,
        dhikrReminderMinutes: settings.dhikrReminderMinutes,
        nightAlertsEnabled: settings.nightAlertsEnabled,
      },
      user_agent: navigator.userAgent,
    },
  });
  if (error) throw error;
  localStorage.setItem("push_endpoint", sub.endpoint);
  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  const endpoint = sub?.endpoint || localStorage.getItem("push_endpoint");
  if (sub) await sub.unsubscribe();
  if (endpoint) {
    await supabase.functions.invoke("subscribe-push", {
      body: { action: "unsubscribe", endpoint },
    }).catch(() => {});
  }
  localStorage.removeItem("push_endpoint");
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}
