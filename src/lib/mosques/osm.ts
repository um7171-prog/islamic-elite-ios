import { distanceMeters, placeLatLng } from "./distance";
import { areaPoint, insideRings, isClosedRing, joinRings, type Ring } from "./geometry";
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

interface RawMember {
  type?: unknown;
  role?: unknown;
  geometry?: unknown;
}

interface RawElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: RawPoint;
  bounds?: { minlat?: unknown; minlon?: unknown; maxlat?: unknown; maxlon?: unknown };
  geometry?: unknown;
  members?: unknown;
  tags?: unknown;
}

const OSM_TYPES: readonly OsmType[] = ["node", "way", "relation"];

function point(lat: unknown, lng: unknown): LatLng | null {
  return isValidCoordinate(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

function points(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawPoint[]).map((g) => (g ? point(g.lat, g.lon) : null)).filter((p): p is LatLng => !!p);
}

/** The area's rings (`out geom`): a closed way, or a multipolygon's outer and inner member ways
 * (a ring split over several ways is joined). Null for a node or when there is no usable ring. */
export function elementOutline(el: RawElement): Ring[] | null {
  if (el.type === "way") {
    const ring = points(el.geometry);
    return isClosedRing(ring) ? [ring] : null;
  }
  if (el.type === "relation" && Array.isArray(el.members)) {
    const parts = (el.members as RawMember[])
      .filter((m) => m && m.type === "way" && (m.role === "outer" || m.role === "inner" || m.role === ""))
      .map((m) => points(m.geometry));
    const rings = joinRings(parts);
    return rings.length ? rings : null;
  }
  return null;
}

/** A node's own position. For a way/relation (an area): a point on the area itself from its real
 * outline; without one, the server's `center`, else the mean of its geometry, else the middle of
 * its bounds. */
export function elementPosition(el: RawElement): LatLng | null {
  if (el.type === "node") return point(el.lat, el.lon);
  const outline = elementOutline(el);
  const onArea = outline ? areaPoint(outline) : null;
  if (onArea && isValidCoordinate(onArea.lat, onArea.lng)) return onArea;
  const c = el.center ? point(el.center.lat, el.center.lon) : null;
  if (c) return c;
  const pts = points(el.geometry);
  if (pts.length) {
    return point(pts.reduce((s, p) => s + p.lat, 0) / pts.length, pts.reduce((s, p) => s + p.lng, 0) / pts.length);
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

/** A name's words with diacritics, letter variants and punctuation evened out. */
function nameWords(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** A comparable form of a mosque name: diacritics, letter variants, punctuation and
 * generic words ("مسجد", "جامع", "Mosque"…) removed. "" means the name says nothing
 * beyond "a mosque". */
export function nameKey(name: string | null | undefined): string {
  return nameWords(name).filter((w) => !GENERIC_WORDS.has(w)).join(" ");
}

/** The whole name, generic words kept: «مسجد النور» and «جامع النور» differ here. */
function fullName(name: string | null | undefined): string {
  return nameKey(name) ? nameWords(name).join(" ") : "";
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
  const outline = type === "node" ? null : elementOutline(el);
  if (outline) place.outline = outline;
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

/** The same full name this close is the same mosque mapped twice (a point and its building). */
const SAME_NAME_M = 60;
/** Without a full-name match (unnamed, or only «مسجد»/«جامع» differs), only practically the same spot. */
const SAME_SPOT_M = 20;

const namesOf = (p: MosquePlace) => [p.name, p.nameAr, p.nameEn];
const keysOf = (p: MosquePlace, form: (n: string | null | undefined) => string) => new Set(namesOf(p).map(form).filter(Boolean));
const shareAny = (a: Set<string>, b: Set<string>) => [...a].some((k) => b.has(k));

/** A point mapped inside the other's building / area outline. */
const pointInside = (p: MosquePlace, area: MosquePlace) =>
  p.osmType === "node" && !!area.outline && insideRings(placeLatLng(p), area.outline);

/**
 * Two records of one real mosque, never two neighbouring mosques:
 * - differently named ones are never the same, however close;
 * - a point inside the other's building outline is that building's mosque;
 * - the same full name within SAME_NAME_M;
 * - otherwise (unnamed, or only «مسجد»/«جامع» differs) only on practically the same spot.
 */
export function isSameMosque(a: MosquePlace, b: MosquePlace): boolean {
  if (a.id === b.id) return true;
  const ka = keysOf(a, nameKey);
  const kb = keysOf(b, nameKey);
  const named = ka.size > 0 && kb.size > 0;
  if (named && !shareAny(ka, kb)) return false;
  if (pointInside(a, b) || pointInside(b, a)) return true;
  const d = distanceMeters(placeLatLng(a), placeLatLng(b));
  if (named && shareAny(keysOf(a, fullName), keysOf(b, fullName))) return d <= SAME_NAME_M;
  return d <= SAME_SPOT_M;
}

const richness = (p: MosquePlace) => (p.name ? 4 : 0) + (p.address ? 2 : 0) + (p.nameAr || p.nameEn ? 1 : 0);

/** Removes duplicates: the same OSM element twice, and the same mosque mapped as more
 * than one element (a point plus a building outline). The richest record is kept and
 * missing details are filled from the duplicates; its position is the mapped point (node)
 * whenever one of the duplicates is a node, never a centre computed from a building. */
export function dedupeMosques(places: readonly MosquePlace[]): MosquePlace[] {
  const byId = new Map<string, MosquePlace>();
  for (const p of places) if (!byId.has(p.id)) byId.set(p.id, p);
  const ordered = [...byId.values()].sort((a, b) => richness(b) - richness(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept: MosquePlace[] = [];
  // Records whose position already comes from a mapped point: a second point never moves them.
  const keptAtNode = new Set<MosquePlace>();
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
    same.outline ??= p.outline;
    if (p.osmType === "node" && same.osmType !== "node" && !keptAtNode.has(same)) {
      same.latitude = p.latitude;
      same.longitude = p.longitude;
      keptAtNode.add(same);
    }
  }
  return kept.map(({ outline: _outline, ...place }) => place);
}
