import { isIOSNativeApp } from "@/lib/platform";

/**
 * Map links for a mosque. Only the mosque's coordinates go into the link — never the
 * user's position; the maps app works out "from here" itself.
 *
 * - iOS app: Apple Maps through its documented https://maps.apple.com links, which iOS
 *   hands straight to the Maps app (no custom URL scheme or LSApplicationQueriesSchemes
 *   entry needed; the Capacitor WebView opens target=_blank links with the system).
 * - Web (and anywhere else): Google Maps' documented cross-platform URLs, which open
 *   the Google Maps app when installed and the website otherwise.
 */
export type MapsTarget = "apple" | "google";

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export function mapsTarget(): MapsTarget {
  return isIOSNativeApp() ? "apple" : "google";
}

const coord = (p: MapPoint) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

/** Turn-by-turn directions from the user's current location to the mosque. */
export function directionsUrl(p: MapPoint, target: MapsTarget = mapsTarget()): string {
  return target === "apple"
    ? `https://maps.apple.com/?daddr=${coord(p)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${coord(p)}`;
}

/** The mosque as a pin on the map; `label` names the pin where supported. */
export function mapViewUrl(p: MapPoint, label: string, target: MapsTarget = mapsTarget()): string {
  return target === "apple"
    ? `https://maps.apple.com/?ll=${coord(p)}&q=${encodeURIComponent(label)}`
    : `https://www.google.com/maps/search/?api=1&query=${coord(p)}`;
}
