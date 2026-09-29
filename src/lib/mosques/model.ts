/** The app's own mosque model — the UI never sees raw Overpass/OSM JSON. */

export interface LatLng {
  lat: number;
  lng: number;
}

export type OsmType = "node" | "way" | "relation";

/** A mosque as returned by a data source, before it is measured from the user. */
export interface MosquePlace {
  /** Stable across requests, e.g. "osm/way/123". */
  id: string;
  /** Default name; null when the source has none (or only a generic "مسجد"). */
  name: string | null;
  nameAr?: string;
  nameEn?: string;
  latitude: number;
  longitude: number;
  address?: string;
  source: "osm";
  osmType?: OsmType;
  osmId?: number;
}

/** A mosque measured from the user's current position. */
export interface Mosque extends MosquePlace {
  distanceMeters: number;
  /** Initial bearing from the user, degrees clockwise from true north. */
  bearingDegrees: number;
}

export type MosqueSearchErrorKind =
  | "network"
  | "timeout"
  | "rate-limited"
  | "http"
  | "invalid-response"
  | "invalid-location"
  | "aborted";

export class MosqueSearchError extends Error {
  readonly kind: MosqueSearchErrorKind;
  constructor(kind: MosqueSearchErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "MosqueSearchError";
    this.kind = kind;
  }
}

/** Any thrown value as a MosqueSearchError (unknown failures count as network). */
export function toSearchError(e: unknown): MosqueSearchError {
  if (e instanceof MosqueSearchError) return e;
  if ((e as { name?: string } | null)?.name === "AbortError") return new MosqueSearchError("aborted");
  return new MosqueSearchError("network", e instanceof Error ? e.message : undefined);
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // 0,0 ("Null Island") is what broken data defaults to, never a real mosque or user.
    !(lat === 0 && lng === 0)
  );
}
