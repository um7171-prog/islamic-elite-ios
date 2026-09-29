import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { haversineKm } from "@/lib/geo";
import { MAX_QUERY_RADIUS_M, OVERPASS_ENDPOINTS, OVERPASS_USER_AGENT, QUERY_PADDING_M } from "@/lib/mosques/config";
import { bearingDegrees, compassPoint, distanceMeters, formatDistance, formatRadius, rankByDistance } from "@/lib/mosques/distance";
import { directionsUrl, mapViewUrl, mapsTarget } from "@/lib/mosques/maps";
import { isValidCoordinate, MosqueSearchError, type LatLng, type MosquePlace } from "@/lib/mosques/model";
import { dedupeMosques, isMosqueTagged, nameKey, normalizeElement, normalizeOverpassResponse } from "@/lib/mosques/osm";
import { buildOverpassQuery, createOverpassProvider, fetchTransport, type MosqueProvider } from "@/lib/mosques/overpass";
import { cachedNearbyMosques, clearMosqueCache, findNearbyMosques, roundForQuery } from "@/lib/mosques/search";

const platform = vi.hoisted(() => ({ native: false }));
const httpPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform", () => ({
  isNativeApp: () => platform.native,
  isIOSNativeApp: () => platform.native,
  openNativeAppSettings: vi.fn(),
}));
vi.mock("@capacitor/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@capacitor/core")>()),
  CapacitorHttp: { post: httpPost },
}));

const ORIGIN: LatLng = { lat: 24.713612, lng: 46.675349 };
const M_PER_DEG = (Math.PI * 6_371_000) / 180;
const north = (m: number, from = ORIGIN): LatLng => ({ lat: from.lat + m / M_PER_DEG, lng: from.lng });
const east = (m: number, from = ORIGIN): LatLng => ({ lat: from.lat, lng: from.lng + m / (M_PER_DEG * Math.cos((from.lat * Math.PI) / 180)) });

const MOSQUE_TAGS = { amenity: "place_of_worship", religion: "muslim" };
const node = (id: number, p: LatLng, tags: Record<string, string> = MOSQUE_TAGS) => ({ type: "node", id, lat: p.lat, lon: p.lng, tags });
const way = (id: number, p: LatLng, tags: Record<string, string> = MOSQUE_TAGS) => ({ type: "way", id, center: { lat: p.lat, lon: p.lng }, tags });
const place = (id: string, p: LatLng, extra: Partial<MosquePlace> = {}): MosquePlace => ({
  id,
  name: null,
  latitude: p.lat,
  longitude: p.lng,
  source: "osm",
  ...extra,
});
const AR = { m: "م", km: "كم" };
const EN = { m: "m", km: "km" };

beforeEach(() => {
  platform.native = false;
  httpPost.mockReset();
  clearMosqueCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("distance (Haversine) and direction", () => {
  it("measures real distances: Masjid al-Haram → Masjid an-Nabawi ≈ 339 km", () => {
    const km = haversineKm({ lat: 21.4225, lng: 39.8262 }, { lat: 24.4672, lng: 39.6111 });
    expect(km).toBeGreaterThan(336);
    expect(km).toBeLessThan(342);
  });

  it("measures short distances in metres, symmetrically, and zero for the same point", () => {
    expect(distanceMeters(ORIGIN, north(350))).toBeCloseTo(350, 0);
    expect(distanceMeters(ORIGIN, east(820))).toBeCloseTo(820, -1);
    expect(distanceMeters(north(350), ORIGIN)).toBeCloseTo(distanceMeters(ORIGIN, north(350)), 6);
    expect(distanceMeters(ORIGIN, ORIGIN)).toBe(0);
  });

  it("gives the bearing and the nearest compass point", () => {
    expect(bearingDegrees(ORIGIN, north(500))).toBeCloseTo(0, 0);
    expect(bearingDegrees(ORIGIN, east(500))).toBeCloseTo(90, 0);
    expect(compassPoint(bearingDegrees(ORIGIN, north(-500)))).toBe("S");
    expect([0, 44, 90, 135, 180, 225, 270, 315, 359, -45, 720].map(compassPoint)).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N", "NW", "N"]);
  });

  it("formats distances for people, never as long raw numbers", () => {
    expect(formatDistance(350, AR)).toBe("350 م");
    expect(formatDistance(823, AR)).toBe("820 م");
    expect(formatDistance(1237.482, AR)).toBe("1.2 كم");
    expect(formatDistance(3400, AR)).toBe("3.4 كم");
    expect(formatDistance(996, AR)).toBe("1 كم");
    expect(formatDistance(12_345, AR)).toBe("12 كم");
    expect(formatDistance(4, AR)).toBe("10 م");
    expect(formatDistance(350, EN)).toBe("350 m");
    expect(formatDistance(1237.482, EN)).toBe("1.2 km");
    expect(formatDistance(Number.NaN, EN)).toBe("");
    expect(formatDistance(-5, EN)).toBe("");
    expect(formatRadius(2000, "كم")).toBe("2 كم");
    expect(formatRadius(10_000, "km")).toBe("10 km");
  });
});

describe("ranking: sort by distance and filter by radius", () => {
  const far = place("osm/node/3", north(1800));
  const near = place("osm/node/1", east(300));
  const mid = place("osm/node/2", north(-700));

  it("sorts nearest first whatever order the source used", () => {
    const ranked = rankByDistance([far, mid, near], ORIGIN, 2000);
    expect(ranked.map((m) => m.id)).toEqual(["osm/node/1", "osm/node/2", "osm/node/3"]);
    expect(ranked[0].distanceMeters).toBeCloseTo(300, -1);
    expect(ranked[0].bearingDegrees).toBeCloseTo(90, 0);
  });

  it("keeps only mosques inside the radius", () => {
    expect(rankByDistance([far, mid, near], ORIGIN, 1000).map((m) => m.id)).toEqual(["osm/node/1", "osm/node/2"]);
    expect(rankByDistance([far], ORIGIN, 1000)).toEqual([]);
  });

  it("skips places with invalid coordinates", () => {
    const broken = place("osm/node/9", { lat: Number.NaN, lng: 46 });
    expect(rankByDistance([broken, near], ORIGIN, 2000).map((m) => m.id)).toEqual(["osm/node/1"]);
  });
});

describe("OSM normalization", () => {
  it("parses a node into the app's model", () => {
    const p = normalizeElement(node(11, north(100), { ...MOSQUE_TAGS, name: "مسجد الراجحي" }));
    expect(p).toEqual({
      id: "osm/node/11",
      name: "مسجد الراجحي",
      latitude: north(100).lat,
      longitude: north(100).lng,
      source: "osm",
      osmType: "node",
      osmId: 11,
    });
  });

  it("uses the centre of a way (building outline)", () => {
    const p = normalizeElement(way(22, east(200), { building: "mosque", name: "Al Noor Mosque" }));
    expect(p?.osmType).toBe("way");
    expect(p?.latitude).toBeCloseTo(east(200).lat, 9);
    expect(p?.longitude).toBeCloseTo(east(200).lng, 9);
  });

  it("falls back to the geometry centroid, then to the bounds, for areas without a centre", () => {
    const geom = normalizeElement({ type: "way", id: 5, tags: MOSQUE_TAGS, geometry: [{ lat: 24.7, lon: 46.6 }, { lat: 24.8, lon: 46.8 }, null] });
    expect(geom?.latitude).toBeCloseTo(24.75, 9);
    expect(geom?.longitude).toBeCloseTo(46.7, 9);
    const rel = normalizeElement({ type: "relation", id: 6, tags: MOSQUE_TAGS, bounds: { minlat: 24.7, minlon: 46.6, maxlat: 24.72, maxlon: 46.62 } });
    expect(rel?.osmType).toBe("relation");
    expect(rel?.latitude).toBeCloseTo(24.71, 9);
    expect(rel?.longitude).toBeCloseTo(46.61, 9);
    expect(normalizeElement({ type: "way", id: 7, tags: MOSQUE_TAGS })).toBeNull();
  });

  it("missing or generic names become null (the UI shows «مسجد قريب»); name:ar/name:en are kept", () => {
    expect(normalizeElement(node(1, north(10)))?.name).toBeNull();
    expect(normalizeElement(node(2, north(10), { ...MOSQUE_TAGS, name: "مسجد" }))?.name).toBeNull();
    expect(normalizeElement(node(3, north(10), { ...MOSQUE_TAGS, name: " Mosque " }))?.name).toBeNull();
    const bi = normalizeElement(node(4, north(10), { ...MOSQUE_TAGS, "name:ar": "جامع الملك خالد", "name:en": "King Khalid Mosque" }));
    expect(bi).toMatchObject({ name: "جامع الملك خالد", nameAr: "جامع الملك خالد", nameEn: "King Khalid Mosque" });
  });

  it("builds an address when OSM has one", () => {
    const p = normalizeElement(node(8, north(10), { ...MOSQUE_TAGS, "addr:street": "طريق الملك فهد", "addr:housenumber": "12", "addr:district": "العليا", "addr:city": "الرياض" }));
    expect(p?.address).toBe("12 طريق الملك فهد · العليا · الرياض");
    expect(normalizeElement(node(9, north(10)))?.address).toBeUndefined();
  });

  it("accepts every common mosque tagging, and nothing else", () => {
    expect(isMosqueTagged({ amenity: "place_of_worship", religion: "muslim" })).toBe(true);
    expect(isMosqueTagged({ amenity: "place_of_worship", place_of_worship: "mosque" })).toBe(true);
    expect(isMosqueTagged({ building: "mosque" })).toBe(true);
    expect(isMosqueTagged({ building: "mosque", religion: "islam" })).toBe(true);
    expect(isMosqueTagged({ amenity: "place_of_worship" })).toBe(false);
    expect(isMosqueTagged({ amenity: "place_of_worship", religion: "christian" })).toBe(false);
    expect(isMosqueTagged({ building: "mosque", disused: "yes" })).toBe(false);
    expect(isMosqueTagged({ building: "yes" })).toBe(false);
  });

  it("rejects invalid coordinates and malformed elements", () => {
    expect(normalizeElement({ type: "node", id: 1, lat: 95, lon: 46, tags: MOSQUE_TAGS })).toBeNull();
    expect(normalizeElement({ type: "node", id: 1, lat: "24.7", lon: 46, tags: MOSQUE_TAGS })).toBeNull();
    expect(normalizeElement({ type: "node", id: 1, lat: Number.NaN, lon: 46, tags: MOSQUE_TAGS })).toBeNull();
    expect(normalizeElement({ type: "node", id: 1, lat: 0, lon: 0, tags: MOSQUE_TAGS })).toBeNull();
    expect(normalizeElement({ type: "node", lat: 24.7, lon: 46.6, tags: MOSQUE_TAGS })).toBeNull();
    expect(normalizeElement({ type: "area", id: 1, lat: 24.7, lon: 46.6, tags: MOSQUE_TAGS })).toBeNull();
    expect(normalizeElement(null)).toBeNull();
    expect(normalizeElement("node")).toBeNull();
    expect(isValidCoordinate(24.7, 46.6)).toBe(true);
    expect(isValidCoordinate(24.7, 181)).toBe(false);
  });

  it("turns a whole response into places, skipping broken elements", () => {
    const body = { elements: [node(1, north(100)), { type: "node", id: 2 }, "junk", way(3, east(300), { building: "mosque" })] };
    expect(normalizeOverpassResponse(body).map((p) => p.id)).toEqual(["osm/node/1", "osm/way/3"]);
    expect(normalizeOverpassResponse(JSON.stringify(body))).toHaveLength(2);
    expect(normalizeOverpassResponse({ elements: [] })).toEqual([]);
  });

  it("rejects malformed responses and Overpass runtime errors", () => {
    const kind = (body: unknown) => {
      try {
        normalizeOverpassResponse(body);
        return "ok";
      } catch (e) {
        return (e as MosqueSearchError).kind;
      }
    };
    expect(kind("<html>busy</html>")).toBe("invalid-response");
    expect(kind(null)).toBe("invalid-response");
    expect(kind({})).toBe("invalid-response");
    expect(kind({ elements: "nope" })).toBe("invalid-response");
    expect(kind({ elements: [node(1, north(10))], remark: "runtime error: Query timed out in \"query\" at line 1 after 16 seconds." })).toBe("timeout");
    expect(kind({ elements: [], remark: "runtime error: Query run out of memory" })).toBe("http");
  });
});

describe("duplicate removal", () => {
  it("drops the same OSM element returned twice", () => {
    const a = place("osm/node/1", north(100), { name: "مسجد التقوى" });
    expect(dedupeMosques([a, { ...a }])).toHaveLength(1);
  });

  it("merges a named point with the unnamed building outline around it", () => {
    const poi = place("osm/node/1", north(100), { name: "مسجد التقوى" });
    const building = place("osm/way/2", north(120), { address: "حي الملز" });
    const out = dedupeMosques([building, poi]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "osm/node/1", name: "مسجد التقوى", address: "حي الملز" });
  });

  it("merges the same name spelled differently (مسجد/جامع, diacritics, hamza)", () => {
    const a = place("osm/node/1", north(100), { name: "مسجد النور" });
    const b = place("osm/way/2", north(200), { name: "جامع النُّور" });
    expect(dedupeMosques([a, b])).toHaveLength(1);
    expect(nameKey("جامع الإمام محمد بن سعود")).toBe(nameKey("مسجد الامام محمد بن سعود"));
    expect(nameKey("مسجد")).toBe("");
  });

  it("keeps genuinely different mosques, even close ones", () => {
    const a = place("osm/node/1", north(100), { name: "مسجد النور" });
    const b = place("osm/node/2", north(300), { name: "مسجد الهدى" });
    const c = place("osm/node/3", east(400));
    const d = place("osm/node/4", east(700));
    expect(dedupeMosques([a, b, c, d])).toHaveLength(4);
  });
});

describe("Overpass query", () => {
  it("covers every mosque tagging around the given point only", () => {
    const q = buildOverpassQuery({ lat: 24.714, lng: 46.675 }, 1150);
    expect(q).toContain("[out:json]");
    expect(q).toContain('nwr["amenity"="place_of_worship"]["religion"="muslim"](around:1150,24.714,46.675);');
    expect(q).toContain('nwr["amenity"="place_of_worship"]["place_of_worship"="mosque"](around:1150,24.714,46.675);');
    expect(q).toContain('nwr["building"="mosque"](around:1150,24.714,46.675);');
    expect(q).toContain("out tags center");
  });

  it("never builds a huge query, and refuses an invalid centre", () => {
    expect(buildOverpassQuery({ lat: 24.7, lng: 46.6 }, 500_000)).toContain(`around:${MAX_QUERY_RADIUS_M},`);
    expect(() => buildOverpassQuery({ lat: Number.NaN, lng: 46.6 }, 1000)).toThrow(MosqueSearchError);
  });
});

describe("Overpass provider (network, retries, errors)", () => {
  const ok = (elements: unknown[]) => ({ status: 200, text: async () => JSON.stringify({ elements }) });
  const status = (s: number) => ({ status: s, text: async () => "<html>error</html>" });
  const kindOf = async (p: Promise<unknown>) => p.then(() => "ok", (e: MosqueSearchError) => e.kind);

  it("posts one bounded query and returns normalized places", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([node(1, north(100), { ...MOSQUE_TAGS, name: "مسجد التقوى" })]));
    vi.stubGlobal("fetch", fetchMock);
    const places = await createOverpassProvider().search({ lat: 24.714, lng: 46.675 }, 1150);
    expect(places.map((p) => p.name)).toEqual(["مسجد التقوى"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(OVERPASS_ENDPOINTS[0]);
    expect(init).toMatchObject({ method: "POST", credentials: "omit" });
    expect(decodeURIComponent(String(init.body).slice(5))).toContain("around:1150,24.714,46.675");
  });

  it("falls back to the next endpoint when one fails, then stops", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(status(406)).mockResolvedValueOnce(ok([node(1, north(100))]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createOverpassProvider().search(ORIGIN, 1000)).toHaveLength(1);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([...OVERPASS_ENDPOINTS]);
  });

  it("retries a limited number of times (once per endpoint) and reports the failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(429));
    vi.stubGlobal("fetch", fetchMock);
    expect(await kindOf(createOverpassProvider().search(ORIGIN, 1000))).toBe("rate-limited");
    expect(fetchMock).toHaveBeenCalledTimes(OVERPASS_ENDPOINTS.length);
  });

  it("classifies HTTP 504 as a timeout, a failed fetch as a network error, bad JSON as invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(504)));
    expect(await kindOf(createOverpassProvider().search(ORIGIN, 1000))).toBe("timeout");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await kindOf(createOverpassProvider().search(ORIGIN, 1000))).toBe("network");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, text: async () => "{not json" }));
    expect(await kindOf(createOverpassProvider().search(ORIGIN, 1000))).toBe("invalid-response");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(500)));
    expect(await kindOf(createOverpassProvider().search(ORIGIN, 1000))).toBe("http");
  });

  it("times out a request that never answers", async () => {
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", hang);
    const provider = createOverpassProvider({ transport: fetchTransport, timeoutMs: 20 });
    expect(await kindOf(provider.search(ORIGIN, 1000))).toBe("timeout");
    expect(hang).toHaveBeenCalledTimes(OVERPASS_ENDPOINTS.length);
  });

  it("stops at once when the caller cancels (no further endpoints)", async () => {
    const pre = new AbortController();
    pre.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await kindOf(createOverpassProvider().search(ORIGIN, 1000, pre.signal))).toBe("aborted");
    expect(fetchMock).not.toHaveBeenCalled();

    const ctrl = new AbortController();
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", hang);
    const pending = kindOf(createOverpassProvider().search(ORIGIN, 1000, ctrl.signal));
    ctrl.abort();
    expect(await pending).toBe("aborted");
    expect(hang).toHaveBeenCalledTimes(1);
  });

  it("in the native app, sends through CapacitorHttp with an identifying User-Agent", async () => {
    platform.native = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    httpPost.mockResolvedValue({ status: 200, data: { elements: [node(1, north(100))] }, headers: {}, url: "" });
    expect(await createOverpassProvider().search({ lat: 24.714, lng: 46.675 }, 1150)).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const opts = httpPost.mock.calls[0][0];
    expect(opts.url).toBe(OVERPASS_ENDPOINTS[0]);
    expect(opts.headers["User-Agent"]).toBe(OVERPASS_USER_AGENT);
    expect(opts.data.data).toContain("around:1150,24.714,46.675");
  });

  it("in the native app, a native failure falls back to the next endpoint", async () => {
    platform.native = true;
    httpPost.mockRejectedValueOnce(new Error("The request timed out.")).mockResolvedValueOnce({ status: 200, data: '{"elements":[]}', headers: {}, url: "" });
    expect(await createOverpassProvider().search(ORIGIN, 1000)).toEqual([]);
    expect(httpPost).toHaveBeenCalledTimes(2);
  });
});

describe("nearby search: cache, single-flight and privacy", () => {
  const places = [
    place("osm/node/1", north(300), { name: "مسجد الأول" }),
    place("osm/node/2", east(900), { name: "مسجد الثاني" }),
    place("osm/node/3", north(3000), { name: "مسجد الثالث" }),
    place("osm/way/4", north(310)), // the building of «مسجد الأول» — a duplicate
  ];
  const fakeProvider = (): MosqueProvider & { search: ReturnType<typeof vi.fn> } => ({ search: vi.fn(async () => places) });

  it("returns deduplicated mosques inside the radius, nearest first", async () => {
    const provider = fakeProvider();
    const { mosques, fromCache } = await findNearbyMosques({ origin: ORIGIN, radiusM: 2000, provider });
    expect(fromCache).toBe(false);
    expect(mosques.map((m) => m.name)).toEqual(["مسجد الأول", "مسجد الثاني"]);
  });

  it("sends only a rounded point (≈100 m), padded so no mosque inside the radius is missed", async () => {
    const provider = fakeProvider();
    await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider });
    const [center, radius] = provider.search.mock.calls[0];
    expect(center).toEqual({ lat: 24.714, lng: 46.675 });
    expect(center).toEqual(roundForQuery(ORIGIN));
    expect(radius).toBe(1000 + QUERY_PADDING_M);
    expect(distanceMeters(center, ORIGIN) + 1000).toBeLessThanOrEqual(radius);
  });

  it("serves repeats and smaller radii from the cache, but not a wider radius", async () => {
    const provider = fakeProvider();
    await findNearbyMosques({ origin: ORIGIN, radiusM: 5000, provider });
    expect((await findNearbyMosques({ origin: ORIGIN, radiusM: 5000, provider })).fromCache).toBe(true);
    const small = await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider });
    expect(small.fromCache).toBe(true);
    expect(small.mosques.map((m) => m.name)).toEqual(["مسجد الأول", "مسجد الثاني"]);
    expect(cachedNearbyMosques(ORIGIN, 2000)).toHaveLength(2);
    expect(provider.search).toHaveBeenCalledTimes(1);
    await findNearbyMosques({ origin: ORIGIN, radiusM: 10_000, provider });
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it("searches again after moving far, or once the cache expires", async () => {
    const provider = fakeProvider();
    let now = 1_000_000;
    const clock = () => now;
    await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider, now: clock });
    await findNearbyMosques({ origin: north(2000), radiusM: 1000, provider, now: clock });
    expect(provider.search).toHaveBeenCalledTimes(2);
    now += 11 * 60_000;
    await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider, now: clock });
    expect(provider.search).toHaveBeenCalledTimes(3);
  });

  it("a manual refresh bypasses the cache, except right after a fresh result", async () => {
    const provider = fakeProvider();
    let now = 5_000_000;
    const clock = () => now;
    await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider, now: clock });
    now += 5_000;
    expect((await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, force: true, provider, now: clock })).fromCache).toBe(true);
    now += 30_000;
    expect((await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, force: true, provider, now: clock })).fromCache).toBe(false);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it("concurrent identical searches share one request (single-flight)", async () => {
    const provider = fakeProvider();
    const [a, b] = await Promise.all([
      findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider }),
      findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider }),
    ]);
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(a.mosques).toEqual(b.mosques);
  });

  it("cancelling one caller doesn't cancel the shared request; cancelling the last one does", async () => {
    let release: (v: MosquePlace[]) => void = () => {};
    let seen: AbortSignal | undefined;
    const provider: MosqueProvider = {
      search: vi.fn((_c, _r, signal) => {
        seen = signal;
        return new Promise<MosquePlace[]>((resolve) => (release = resolve));
      }),
    };
    const first = new AbortController();
    const p1 = findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider, signal: first.signal });
    const p2 = findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider });
    first.abort();
    await expect(p1).rejects.toMatchObject({ kind: "aborted" });
    expect(seen?.aborted).toBe(false);
    release(places);
    expect((await p2).mosques.map((m) => m.name)).toEqual(["مسجد الأول", "مسجد الثاني"]);

    clearMosqueCache();
    const only = new AbortController();
    const p3 = findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider, signal: only.signal });
    only.abort();
    await expect(p3).rejects.toMatchObject({ kind: "aborted" });
    expect(seen?.aborted).toBe(true);
  });

  it("refuses an invalid position without any request", async () => {
    const provider = fakeProvider();
    await expect(findNearbyMosques({ origin: { lat: Number.NaN, lng: 46 }, radiusM: 1000, provider })).rejects.toMatchObject({ kind: "invalid-location" });
    await expect(findNearbyMosques({ origin: { lat: 0, lng: 0 }, radiusM: 1000, provider })).rejects.toMatchObject({ kind: "invalid-location" });
    expect(provider.search).not.toHaveBeenCalled();
    expect(cachedNearbyMosques({ lat: Number.NaN, lng: 0 }, 1000)).toBeNull();
  });

  it("an empty area is a valid, empty result", async () => {
    const provider: MosqueProvider = { search: vi.fn(async () => []) };
    expect((await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider })).mosques).toEqual([]);
  });

  it("keeps nothing in browser storage", async () => {
    const session = typeof sessionStorage !== "undefined" ? sessionStorage : null;
    localStorage.clear();
    session?.clear();
    await findNearbyMosques({ origin: ORIGIN, radiusM: 1000, provider: fakeProvider() });
    expect(localStorage.length).toBe(0);
    expect(session?.length ?? 0).toBe(0);
  });
});

describe("maps links", () => {
  const mosque = { latitude: 24.7171, longitude: 46.6789 };

  it("iOS app → Apple Maps (official maps.apple.com links)", () => {
    platform.native = true;
    expect(mapsTarget()).toBe("apple");
    expect(directionsUrl(mosque)).toBe("https://maps.apple.com/?daddr=24.717100,46.678900");
    expect(mapViewUrl(mosque, "مسجد النور")).toBe(`https://maps.apple.com/?ll=24.717100,46.678900&q=${encodeURIComponent("مسجد النور")}`);
  });

  it("web → Google Maps universal links", () => {
    expect(mapsTarget()).toBe("google");
    expect(directionsUrl(mosque)).toBe("https://www.google.com/maps/dir/?api=1&destination=24.717100,46.678900");
    expect(mapViewUrl(mosque, "x")).toBe("https://www.google.com/maps/search/?api=1&query=24.717100,46.678900");
  });
});
