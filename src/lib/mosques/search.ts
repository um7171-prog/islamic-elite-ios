import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  MIN_REFRESH_INTERVAL_MS,
  QUERY_COORD_DECIMALS,
  QUERY_PADDING_M,
} from "./config";
import { distanceMeters, rankByDistance } from "./distance";
import { isValidCoordinate, MosqueSearchError, type LatLng, type Mosque, type MosquePlace } from "./model";
import { dedupeMosques } from "./osm";
import { createOverpassProvider, type MosqueProvider } from "./overpass";

/**
 * Nearby-mosque search with a short-lived cache and single-flight requests.
 *
 * Privacy: the cache lives in memory only (never localStorage, never an account), holds
 * the rounded query point rather than the user's position, and expires in minutes.
 */

interface CacheEntry {
  /** Rounded query centre (what the server saw), not the user's exact position. */
  center: LatLng;
  /** Radius of the circle this entry fully covers. */
  radiusM: number;
  places: MosquePlace[];
  at: number;
}

interface Flight {
  promise: Promise<MosquePlace[]>;
  ctrl: AbortController;
  waiters: number;
}

let cache: CacheEntry[] = [];
const flights = new Map<string, Flight>();
const defaultProvider = createOverpassProvider();

export function roundForQuery(p: LatLng): LatLng {
  const f = 10 ** QUERY_COORD_DECIMALS;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

/** A fresh entry whose circle fully contains the requested one (so moving far away,
 * or asking for a wider radius, never reuses it). */
function coveringEntry(origin: LatLng, radiusM: number, now: number): CacheEntry | undefined {
  return cache.find((e) => now - e.at < CACHE_TTL_MS && distanceMeters(e.center, origin) + radiusM <= e.radiusM);
}

function remember(entry: CacheEntry) {
  cache = [entry, ...cache.filter((e) => entry.at - e.at < CACHE_TTL_MS)].slice(0, CACHE_MAX_ENTRIES);
}

/** Mosques around `origin` from the cache alone (no network), or null. */
export function cachedNearbyMosques(origin: LatLng, radiusM: number, now = Date.now()): Mosque[] | null {
  if (!isValidCoordinate(origin.lat, origin.lng)) return null;
  const hit = coveringEntry(origin, radiusM, now);
  return hit ? rankByDistance(hit.places, origin, radiusM) : null;
}

/** Joins the in-flight request for `key` (or starts it). The shared request is only
 * cancelled once every caller waiting on it has aborted. */
function joinFlight(key: string, start: (signal: AbortSignal) => Promise<MosquePlace[]>, signal?: AbortSignal): Promise<MosquePlace[]> {
  let flight = flights.get(key);
  if (!flight) {
    const ctrl = new AbortController();
    const created: Flight = { ctrl, waiters: 0, promise: Promise.resolve([]) };
    created.promise = start(ctrl.signal).finally(() => {
      if (flights.get(key) === created) flights.delete(key);
    });
    flights.set(key, created);
    flight = created;
  }
  const f = flight;
  f.waiters++;
  return new Promise<MosquePlace[]>((resolve, reject) => {
    let done = false;
    const leave = () => {
      done = true;
      f.waiters--;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (done) return;
      leave();
      if (f.waiters === 0) {
        f.ctrl.abort();
        if (flights.get(key) === f) flights.delete(key);
      }
      reject(new MosqueSearchError("aborted"));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    f.promise.then(
      (v) => {
        if (done) return;
        leave();
        resolve(v);
      },
      (e) => {
        if (done) return;
        leave();
        reject(e);
      },
    );
  });
}

export interface NearbySearchOptions {
  /** The user's current position (used in memory for distances only). */
  origin: LatLng;
  radiusM: number;
  /** Manual refresh: bypass the cache unless it was filled moments ago. */
  force?: boolean;
  signal?: AbortSignal;
  provider?: MosqueProvider;
  now?: () => number;
}

export interface NearbySearchResult {
  mosques: Mosque[];
  fromCache: boolean;
}

/** Mosques within `radiusM` of `origin`, nearest first, without duplicates. */
export async function findNearbyMosques({
  origin,
  radiusM,
  force = false,
  signal,
  provider = defaultProvider,
  now = Date.now,
}: NearbySearchOptions): Promise<NearbySearchResult> {
  if (!isValidCoordinate(origin.lat, origin.lng)) throw new MosqueSearchError("invalid-location");
  if (signal?.aborted) throw new MosqueSearchError("aborted");
  const t = now();
  const hit = coveringEntry(origin, radiusM, t);
  if (hit && (!force || t - hit.at < MIN_REFRESH_INTERVAL_MS)) {
    return { mosques: rankByDistance(hit.places, origin, radiusM), fromCache: true };
  }
  const center = roundForQuery(origin);
  const queryRadiusM = radiusM + QUERY_PADDING_M;
  const key = `${center.lat},${center.lng},${queryRadiusM}`;
  const places = await joinFlight(
    key,
    async (sharedSignal) => {
      const found = dedupeMosques(await provider.search(center, queryRadiusM, sharedSignal));
      remember({ center, radiusM: queryRadiusM, places: found, at: now() });
      return found;
    },
    signal,
  );
  return { mosques: rankByDistance(places, origin, radiusM), fromCache: false };
}

/** Test helper / privacy reset. */
export function clearMosqueCache() {
  cache = [];
  flights.clear();
}
