import { isIOSNativeApp } from "@/lib/platform";

/**
 * Map links for a mosque. Only the mosque's coordinates go into the link — never the
 * user's position; the maps app works out "from here" itself.
 *
 * - iOS app: the user's choice of Apple Maps or Google Maps (mapsLauncher.ts opens it and
 *   checks that iOS actually did). Apple Maps uses its documented https://maps.apple.com
 *   links; Google Maps its documented comgooglemaps:// scheme, with the official web link
 *   as the fallback when the app isn't installed.
 * - Web (and anywhere else): Google Maps' documented cross-platform URLs, which open
 *   the Google Maps app when installed and the website otherwise.
 */
export type MapsApp = "apple" | "google";
export type MapsTarget = MapsApp;
export type MapsAction = "directions" | "view";

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export function mapsTarget(): MapsTarget {
  return isIOSNativeApp() ? "apple" : "google";
}

/** The mosque's point exactly as mapped (never rounded). */
const coord = (p: MapPoint) => `${p.latitude},${p.longitude}`;

/** Apple Maps: directions from the current location, or the mosque as a pin named `label`. */
export function appleMapsUrl(action: MapsAction, p: MapPoint, label = ""): string {
  return action === "directions"
    ? `https://maps.apple.com/?daddr=${coord(p)}`
    : `https://maps.apple.com/?ll=${coord(p)}&q=${encodeURIComponent(label)}`;
}

/**
 * The Google Maps iPhone app (its documented URL scheme). Directions always end at the mosque's
 * own point. «Open» searches a named mosque by its own name centred on that point, so Google shows
 * its place (name, entrances) right there rather than a bare pin; an unnamed one is the point.
 */
export function googleMapsAppUrl(action: MapsAction, p: MapPoint, name?: string | null): string {
  const c = coord(p);
  if (action === "directions") return `comgooglemaps://?daddr=${c}&directionsmode=driving`;
  return name ? `comgooglemaps://?q=${encodeURIComponent(name)}&center=${c}&zoom=18` : `comgooglemaps://?q=${c}&center=${c}`;
}

/** Google Maps on the web (the official Maps URLs). */
export function googleMapsWebUrl(action: MapsAction, p: MapPoint): string {
  return action === "directions"
    ? `https://www.google.com/maps/dir/?api=1&destination=${coord(p)}`
    : `https://www.google.com/maps/search/?api=1&query=${coord(p)}`;
}

/** Turn-by-turn directions from the user's current location to the mosque. */
export function directionsUrl(p: MapPoint, target: MapsTarget = mapsTarget()): string {
  return target === "apple" ? appleMapsUrl("directions", p) : googleMapsWebUrl("directions", p);
}

/** The mosque as a pin on the map; `label` names the pin where supported. */
export function mapViewUrl(p: MapPoint, label: string, target: MapsTarget = mapsTarget()): string {
  return target === "apple" ? appleMapsUrl("view", p, label) : googleMapsWebUrl("view", p);
}

const MAPS_APP_KEY = "elite.mapsApp.v1";

/** The maps app the user picked in the iPhone app, or null before they have picked one. */
export function loadMapsApp(): MapsApp | null {
  try {
    const v = localStorage.getItem(MAPS_APP_KEY);
    return v === "apple" || v === "google" ? v : null;
  } catch {
    return null;
  }
}

export function saveMapsApp(app: MapsApp): void {
  try {
    localStorage.setItem(MAPS_APP_KEY, app);
  } catch {
    /* private mode: asked again next time */
  }
}
