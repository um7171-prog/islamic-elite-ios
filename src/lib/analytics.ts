import { supabase } from "@/integrations/supabase/client";
import { isIOSNativeApp } from "@/lib/platform";

const SESSION_KEY = "analytics:session_id";
const VISIT_KEY = "analytics:last_visit";
const GEO_KEY = "analytics:geo";
const APP_VERSION = "1.0.0";

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function detectDevice() {
  const ua = navigator.userAgent;
  let device_type = "Web";
  let os = "Unknown";
  let os_version = "";
  let browser = "Unknown";

  if (/iPhone|iPad|iPod/i.test(ua)) {
    device_type = "iPhone";
    os = "iOS";
    const m = ua.match(/OS (\d+_\d+)/);
    if (m) os_version = m[1].replace("_", ".");
  } else if (/Android/i.test(ua)) {
    device_type = "Android";
    os = "Android";
    const m = ua.match(/Android (\d+(?:\.\d+)?)/);
    if (m) os_version = m[1];
  } else if (/Windows/i.test(ua)) {
    os = "Windows";
  } else if (/Mac OS X/i.test(ua)) {
    os = "macOS";
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
  }

  if (/CriOS|Chrome/i.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = "Safari";
  else if (/Edg/i.test(ua)) browser = "Edge";

  return { device_type, os, os_version, browser, user_agent: ua };
}

type Geo = { country?: string; country_code?: string; city?: string };

async function getGeo(): Promise<Geo> {
  const cached = localStorage.getItem(GEO_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* ignore */ }
  }
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) return {};
    const data = await res.json();
    const geo: Geo = {
      country: data.country_name,
      country_code: data.country_code,
      city: data.city,
    };
    localStorage.setItem(GEO_KEY, JSON.stringify(geo));
    return geo;
  } catch {
    return {};
  }
}

/** Records one visit per session per day. */
export async function trackVisit(lang: string) {
  if (isIOSNativeApp()) return;
  const sessionId = getSessionId();
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(VISIT_KEY);
  if (last === today) return;

  const device = detectDevice();
  const geo = await getGeo();

  const { error } = await supabase.from("visitors").insert({
    session_id: sessionId,
    ...device,
    ...geo,
    language: lang,
    app_version: APP_VERSION,
  });
  if (!error) localStorage.setItem(VISIT_KEY, today);
}

export async function trackDownload(file_name: string, source_url?: string) {
  if (isIOSNativeApp()) return;
  const sessionId = getSessionId();
  const device = detectDevice();
  const geo = await getGeo();
  await supabase.from("download_events").insert({
    session_id: sessionId,
    file_name,
    source_url,
    device_type: device.device_type,
    country_code: geo.country_code,
  });
}
