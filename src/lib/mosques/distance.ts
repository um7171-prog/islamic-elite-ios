import { haversineKm } from "@/lib/geo";
import { isValidCoordinate, type LatLng, type Mosque, type MosquePlace } from "./model";

/** Great-circle distance in metres (Haversine, via the app's shared geo helper). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/** Initial bearing from `from` to `to`, degrees clockwise from true north (0–360). */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type CompassPoint = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
const POINTS: CompassPoint[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** The nearest of the 8 compass points to a bearing. */
export function compassPoint(bearing: number): CompassPoint {
  const b = ((bearing % 360) + 360) % 360;
  return POINTS[Math.round(b / 45) % 8];
}

export const placeLatLng = (p: MosquePlace): LatLng => ({ lat: p.latitude, lng: p.longitude });

/** Measures every place from `origin`, keeps those within `radiusM` and sorts them
 * nearest first. The source's own ordering is never trusted. */
export function rankByDistance(places: readonly MosquePlace[], origin: LatLng, radiusM: number): Mosque[] {
  return places
    .filter((p) => isValidCoordinate(p.latitude, p.longitude))
    .map((p) => ({
      ...p,
      distanceMeters: distanceMeters(origin, placeLatLng(p)),
      bearingDegrees: bearingDegrees(origin, placeLatLng(p)),
    }))
    .filter((m) => m.distanceMeters <= radiusM)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface DistanceUnits {
  m: string;
  km: string;
}

const trimZero = (s: string) => s.replace(/\.0$/, "");

/** "350 م", "820 م", "1.2 كم", "12 كم" — never a long raw number. */
export function formatDistance(meters: number, units: DistanceUnits): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  if (rounded < 1000) return `${rounded} ${units.m}`;
  const km = meters / 1000;
  return `${km < 10 ? trimZero(km.toFixed(1)) : Math.round(km)} ${units.km}`;
}

/** A search radius as "2 كم" / "2 km". */
export function formatRadius(radiusM: number, kmUnit: string): string {
  return `${trimZero((radiusM / 1000).toFixed(1))} ${kmUnit}`;
}
