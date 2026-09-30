import { CapacitorHttp } from "@capacitor/core";
import { isNativeApp } from "@/lib/platform";
import {
  MAX_QUERY_RADIUS_M,
  OVERPASS_ENDPOINTS,
  OVERPASS_REQUEST_TIMEOUT_MS,
  OVERPASS_SERVER_TIMEOUT_S,
  OVERPASS_USER_AGENT,
} from "./config";
import { isValidCoordinate, MosqueSearchError, toSearchError, type LatLng, type MosquePlace } from "./model";
import { normalizeOverpassResponse } from "./osm";

/** Where mosques come from. The UI only talks to this interface, so the source can
 * change (another endpoint, another service) without touching any screen. */
export interface MosqueProvider {
  /** Places within `radiusM` of `center`. Rejects with a MosqueSearchError. */
  search(center: LatLng, radiusM: number, signal?: AbortSignal): Promise<MosquePlace[]>;
}

/**
 * One bounded query around the given point that covers every way a mosque is mapped in OSM,
 * as nodes, ways and relations alike (`nwr`; an element matching several filters is returned
 * once by the union):
 * - a place of worship whose religion is muslim or islam,
 * - a place of worship typed as a mosque, the non-standard `amenity=mosque`, `building=mosque`,
 * - a place of worship with no religion at all (common where nearly every one is a mosque; the
 *   client drops those whose name says another faith, see isMosqueTagged).
 * Exact tag values only: they are indexed by Overpass, so a 5 km search answers in seconds. A
 * name pattern («مسجد …») was measured in Riyadh at 19–27 s for a 5 km circle (past the server's
 * limit) while adding one mosque out of 192 (its other matches were streets), so it is not used.
 * `out geom` returns each area's real outline (a building, or a multipolygon's rings), so its
 * point can be placed on the building itself rather than at its bounding-box centre, and a
 * mosque's point can be recognised inside its own building when removing duplicates.
 */
export function buildOverpassQuery(center: LatLng, radiusM: number): string {
  if (!isValidCoordinate(center.lat, center.lng)) throw new MosqueSearchError("invalid-location");
  const r = Math.round(Math.min(Math.max(radiusM, 50), MAX_QUERY_RADIUS_M));
  const around = `(around:${r},${center.lat},${center.lng})`;
  return (
    `[out:json][timeout:${OVERPASS_SERVER_TIMEOUT_S}];(` +
    `nwr["amenity"="place_of_worship"]["religion"="muslim"]${around};` +
    `nwr["amenity"="place_of_worship"]["religion"="islam"]${around};` +
    `nwr["amenity"="place_of_worship"]["place_of_worship"="mosque"]${around};` +
    `nwr["amenity"="mosque"]${around};` +
    `nwr["building"="mosque"]${around};` +
    `nwr["amenity"="place_of_worship"][!"religion"]${around};` +
    `);out geom qt;`
  );
}

export interface TransportResponse {
  status: number;
  /** Parsed JSON or raw text — normalizeOverpassResponse accepts both. */
  body: unknown;
}

/** Sends one query to one endpoint. Rejects with a MosqueSearchError. */
export type OverpassTransport = (endpoint: string, query: string, timeoutMs: number, signal?: AbortSignal) => Promise<TransportResponse>;

/** Browser: a CORS "simple" POST (no preflight) with no cookies. */
export const fetchTransport: OverpassTransport = async (endpoint, query, timeoutMs, signal) => {
  if (signal?.aborted) throw new MosqueSearchError("aborted");
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" },
      body: `data=${encodeURIComponent(query)}`,
      credentials: "omit",
      signal: ctrl.signal,
    });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    if (timedOut) throw new MosqueSearchError("timeout");
    if (signal?.aborted) throw new MosqueSearchError("aborted");
    throw toSearchError(e);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
};

/** Native app: the request goes through the OS networking stack so it can identify
 * the app (a WebView cannot set User-Agent, and some Overpass servers reject
 * anonymous WebView requests). A native request cannot be cancelled, so an abort or
 * timeout simply stops waiting for it. */
export const nativeTransport: OverpassTransport = (endpoint, query, timeoutMs, signal) => {
  if (signal?.aborted) return Promise.reject(new MosqueSearchError("aborted"));
  return new Promise<TransportResponse>((resolve, reject) => {
    const finish = (fn: () => void) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => finish(() => reject(new MosqueSearchError("aborted")));
    const timer = setTimeout(() => finish(() => reject(new MosqueSearchError("timeout"))), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    CapacitorHttp.post({
      url: endpoint,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": OVERPASS_USER_AGENT,
      },
      data: { data: query },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: "text",
    }).then(
      (res) => finish(() => resolve({ status: res.status, body: res.data })),
      (e: unknown) => finish(() => reject(/timed out|timeout/i.test(String((e as Error)?.message ?? e)) ? new MosqueSearchError("timeout") : toSearchError(e))),
    );
  });
};

const defaultTransport: OverpassTransport = (...args) => (isNativeApp() ? nativeTransport(...args) : fetchTransport(...args));

function statusError(status: number): MosqueSearchError | null {
  if (status >= 200 && status < 300) return null;
  if (status === 429) return new MosqueSearchError("rate-limited", "HTTP 429");
  // Overpass answers 504 when its queue is full or the query ran out of time.
  if (status === 504 || status === 408) return new MosqueSearchError("timeout", `HTTP ${status}`);
  return new MosqueSearchError("http", `HTTP ${status}`);
}

export interface OverpassProviderOptions {
  endpoints?: readonly string[];
  transport?: OverpassTransport;
  timeoutMs?: number;
}

/**
 * OpenStreetMap through Overpass. Each endpoint is tried once, in order, and the next
 * one only after a failure (network, timeout, rate limit, HTTP error or an unusable
 * response) — a bounded retry, never a loop. An abort stops immediately.
 */
export function createOverpassProvider(options: OverpassProviderOptions = {}): MosqueProvider {
  const endpoints = options.endpoints ?? OVERPASS_ENDPOINTS;
  const transport = options.transport ?? defaultTransport;
  const timeoutMs = options.timeoutMs ?? OVERPASS_REQUEST_TIMEOUT_MS;
  return {
    async search(center, radiusM, signal) {
      const query = buildOverpassQuery(center, radiusM);
      let last: MosqueSearchError | null = null;
      for (const endpoint of endpoints) {
        if (signal?.aborted) throw new MosqueSearchError("aborted");
        try {
          const res = await transport(endpoint, query, timeoutMs, signal);
          const bad = statusError(res.status);
          if (bad) throw bad;
          return normalizeOverpassResponse(res.body);
        } catch (e) {
          const err = toSearchError(e);
          if (err.kind === "aborted" || signal?.aborted) throw new MosqueSearchError("aborted");
          last = err;
        }
      }
      throw last ?? new MosqueSearchError("network", "no endpoint configured");
    },
  };
}
