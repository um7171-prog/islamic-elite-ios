import { LOCAL_LOCATIONS, type CityLocation } from "@/lib/locations";

/** Real device-location plumbing (browser / WKWebView Geolocation API). Nothing
 * here invents a position: every function either returns what the device
 * reported or a precise failure reason. */

export type GeoPermission = "granted" | "prompt" | "denied" | "unknown" | "unsupported";
export type GeoFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export interface GeoFix {
  lat: number;
  lng: number;
  /** metres, as reported by the device */
  accuracy: number;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Nearest known city to a coordinate (and how far it is). */
export function nearestCity(
  lat: number,
  lng: number,
  list: CityLocation[] = LOCAL_LOCATIONS,
): { city: CityLocation; km: number } {
  let best = list[0];
  let bestKm = Infinity;
  for (const c of list) {
    const km = haversineKm({ lat, lng }, c);
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return { city: best, km: bestKm };
}

/** Where the browser says location permission stands, WITHOUT prompting. */
export async function queryGeoPermission(): Promise<GeoPermission> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) return "unknown";
    const res = await perms.query({ name: "geolocation" as PermissionName });
    return res.state as GeoPermission;
  } catch {
    return "unknown";
  }
}

/** One position fix. May show the system permission prompt when permission is
 * still undecided — only call this from a user action (or when permission is
 * already granted). */
export function getPosition(timeoutMs = 12_000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject("unsupported" as GeoFailure);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject((e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable") as GeoFailure),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Device time zone (IANA). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Beyond this distance the nearest known city is not "this" location. */
export const NEAREST_CITY_MAX_KM = 80;
