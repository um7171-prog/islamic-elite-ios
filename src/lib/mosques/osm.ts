import { distanceMeters, placeLatLng } from "./distance";
import { isValidCoordinate, MosqueSearchError, type LatLng, type MosquePlace, type OsmType } from "./model";

/**
 * OpenStreetMap → MosquePlace. Everything that knows the shape of Overpass JSON lives
 * here; one malformed element is skipped, never allowed to break the whole list.
 */

type Tags = Record<string, string>;

interface RawPoint {
  lat?: unknown;
  lon?: unknown;
}

interface RawElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: RawPoint;
  bounds?: { minlat?: unknown; minlon?: unknown; maxlat?: unknown; maxlon?: unknown };
  geometry?: unknown;
  tags?: unknown;
}

const OSM_TYPES: readonly OsmType[] = ["node", "way", "relation"];

function point(lat: unknown, lng: unknown): LatLng | null {
  return isValidCoordinate(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

/** A node's own position; for a way/relation (an area) its centre: the server's
 * `center`, else the mean of its geometry, else the middle of its bounds. */
export function elementPosition(el: RawElement): LatLng | null {
  if (el.type === "node") return point(el.lat, el.lon);
  const c = el.center ? point(el.center.lat, el.center.lon) : null;
  if (c) return c;
  if (Array.isArray(el.geometry)) {
    const pts = (el.geometry as RawPoint[]).map((g) => (g ? point(g.lat, g.lon) : null)).filter((p): p is LatLng => !!p);
    if (pts.length) {
      return point(pts.reduce((s, p) => s + p.lat, 0) / pts.length, pts.reduce((s, p) => s + p.lng, 0) / pts.length);
    }
  }
  const b = el.bounds;
  if (b && [b.minlat, b.minlon, b.maxlat, b.maxlon].every((v) => typeof v === "number")) {
    return point(((b.minlat as number) + (b.maxlat as number)) / 2, ((b.minlon as number) + (b.maxlon as number)) / 2);
  }
  return point(el.lat, el.lon);
}

function readTags(raw: unknown): Tags {
  if (!raw || typeof raw !== "object") return {};
  const out: Tags = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

const YES = (v?: string) => v === "yes";
// "muslim" is the documented value; the other two are common mistaggings of the same thing.
const MUSLIM = new Set(["muslim", "islam", "islamic"]);

/** Mosques are tagged more than one way in OSM; any of these counts:
 *  amenity=place_of_worship + religion=muslim, amenity=place_of_worship +
 *  place_of_worship=mosque, or building=mosque. Explicitly non-Muslim or
 *  disused/abandoned features are excluded. */
export function isMosqueTagged(tags: Tags): boolean {
  const religion = tags.religion?.toLowerCase();
  if (religion && !MUSLIM.has(religion)) return false;
  if (YES(tags.disused) || YES(tags.abandoned) || tags.historic === "ruins") return false;
  if (tags.amenity === "place_of_worship" && (religion || tags.place_of_worship === "mosque")) return true;
  return tags.building === "mosque";
}

const GENERIC_WORDS = new Set([
  "مسجد", "المسجد", "جامع", "الجامع", "مصلي", "المصلي", "و",
  "mosque", "masjid", "masjed", "masjeed", "jami", "jamia", "jame", "the", "of",
]);

/** A comparable form of a mosque name: diacritics, letter variants, punctuation and
 * generic words ("مسجد", "جامع", "Mosque"…) removed. "" means the name says nothing
 * beyond "a mosque". */
export function nameKey(name: string | null | undefined): string {
  if (!name) return "";
  const s = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  return s.split(" ").filter((w) => w && !GENERIC_WORDS.has(w)).join(" ");
}

const meaningful = (name?: string) => (name && nameKey(name) ? name : undefined);

function addressOf(tags: Tags): string | undefined {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const area = tags["addr:district"] ?? tags["addr:suburb"] ?? tags["addr:neighbourhood"] ?? tags["addr:quarter"];
  const parts = [street, area, tags["addr:city"]].filter((p): p is string => !!p);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(" · ") : undefined;
}

/** One Overpass element → MosquePlace, or null when it isn't a usable mosque. */
export function normalizeElement(raw: unknown): MosquePlace | null {
  if (!raw || typeof raw !== "object") return null;
  const el = raw as RawElement;
  const type = OSM_TYPES.find((t) => t === el.type);
  if (!type || typeof el.id !== "number" || !Number.isFinite(el.id)) return null;
  const tags = readTags(el.tags);
  if (!isMosqueTagged(tags)) return null;
  const pos = elementPosition(el);
  if (!pos) return null;
  const nameAr = meaningful(tags["name:ar"]);
  const nameEn = meaningful(tags["name:en"]);
  const name = meaningful(tags.name) ?? nameAr ?? nameEn ?? meaningful(tags.official_name) ?? null;
  const place: MosquePlace = {
    id: `osm/${type}/${el.id}`,
    name,
    latitude: pos.lat,
    longitude: pos.lng,
    source: "osm",
    osmType: type,
    osmId: el.id,
  };
  if (nameAr) place.nameAr = nameAr;
  if (nameEn) place.nameEn = nameEn;
  const address = addressOf(tags);
  if (address) place.address = address;
  return place;
}

/** A whole Overpass response → places. Throws when the response itself is unusable
 * (not JSON, no `elements` list, or a server-side runtime error such as a timeout). */
export function normalizeOverpassResponse(body: unknown): MosquePlace[] {
  let json = body;
  if (typeof body === "string") {
    try {
      json = JSON.parse(body);
    } catch {
      throw new MosqueSearchError("invalid-response", "response is not JSON");
    }
  }
  if (!json || typeof json !== "object") throw new MosqueSearchError("invalid-response", "response is not an object");
  const { elements, remark } = json as { elements?: unknown; remark?: unknown };
  // Overpass reports its own failures (timeout, memory) as a 200 with a remark and
  // partial data. Partial data could hide the nearest mosque, so it is an error.
  if (typeof remark === "string" && /runtime error/i.test(remark)) {
    throw new MosqueSearchError(/timed out|timeout/i.test(remark) ? "timeout" : "http", remark);
  }
  if (!Array.isArray(elements)) throw new MosqueSearchError("invalid-response", "response has no elements list");
  return elements.map(normalizeElement).filter((p): p is MosquePlace => !!p);
}

/** Unnamed features this close are the same mosque (e.g. a POI inside its building outline). */
const SAME_PLACE_M = 40;
/** The same name this close is the same mosque (e.g. an entrance node and the building centre). */
const SAME_NAME_M = 150;
/** Differently named features are only merged when practically on top of each other. */
const DIFFERENT_NAME_M = 15;

function nameKeys(p: MosquePlace): Set<string> {
  return new Set([p.name, p.nameAr, p.nameEn].map(nameKey).filter(Boolean));
}

export function isSameMosque(a: MosquePlace, b: MosquePlace): boolean {
  if (a.id === b.id) return true;
  const d = distanceMeters(placeLatLng(a), placeLatLng(b));
  const ka = nameKeys(a);
  const kb = nameKeys(b);
  if (!ka.size || !kb.size) return d <= SAME_PLACE_M;
  for (const k of ka) if (kb.has(k)) return d <= SAME_NAME_M;
  return d <= DIFFERENT_NAME_M;
}

const richness = (p: MosquePlace) => (p.name ? 4 : 0) + (p.address ? 2 : 0) + (p.nameAr || p.nameEn ? 1 : 0);

/** Removes duplicates: the same OSM element twice, and the same mosque mapped as more
 * than one element (a point plus a building outline). The richest record is kept and
 * missing details are filled from the duplicates. */
export function dedupeMosques(places: readonly MosquePlace[]): MosquePlace[] {
  const byId = new Map<string, MosquePlace>();
  for (const p of places) if (!byId.has(p.id)) byId.set(p.id, p);
  const ordered = [...byId.values()].sort((a, b) => richness(b) - richness(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept: MosquePlace[] = [];
  for (const p of ordered) {
    const same = kept.find((k) => isSameMosque(k, p));
    if (!same) {
      kept.push({ ...p });
      continue;
    }
    same.name ??= p.name;
    same.nameAr ??= p.nameAr;
    same.nameEn ??= p.nameEn;
    same.address ??= p.address;
  }
  return kept;
}
