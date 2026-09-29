/**
 * Nearby mosques — every tunable in one place, so the data source can be swapped or
 * re-pointed later without touching the UI. The source is public OpenStreetMap data
 * through the Overpass API: no account and no API key.
 */

/** Tried in order; the next one is used only when the previous one fails. */
export const OVERPASS_ENDPOINTS: readonly string[] = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** Sent by the native app, as the Overpass usage policy asks clients to identify
 * themselves (browsers always send their own User-Agent). */
export const OVERPASS_USER_AGENT = "IslamicElite/1.0 (+https://www.techsnds.com)";

/** Server-side query limit (seconds) and the client wait per endpoint (ms). */
export const OVERPASS_SERVER_TIMEOUT_S = 15;
export const OVERPASS_REQUEST_TIMEOUT_MS = 20_000;

/** Radii the user can choose. The first automatic search uses the smallest one and
 * widens to DEFAULT_RADIUS_M once when it finds fewer than FEW_RESULTS mosques. */
export const SEARCH_RADII_M = [1000, 2000, 5000, 10_000] as const;
export const FIRST_RADIUS_M = 1000;
export const DEFAULT_RADIUS_M = 2000;
export const FEW_RESULTS = 3;
/** Hard ceiling on any query, whatever the caller asks for. */
export const MAX_QUERY_RADIUS_M = 12_000;

/** Coordinates sent to the server are rounded to 3 decimals (~110 m) and the query
 * circle is padded to cover the rounding, then results are filtered locally from
 * the exact position. The server never receives the precise location. */
export const QUERY_COORD_DECIMALS = 3;
export const QUERY_PADDING_M = 150;

/** Short-lived, in-memory only: nothing about the user's location is persisted. */
export const CACHE_TTL_MS = 10 * 60_000;
export const CACHE_MAX_ENTRIES = 6;
/** A manual refresh inside this window reuses the result it just got. */
export const MIN_REFRESH_INTERVAL_MS = 20_000;

/** Radius taps are coalesced so quick changes send one request. */
export const RADIUS_DEBOUNCE_MS = 350;
/** One position fix (never continuous tracking). */
export const LOCATION_TIMEOUT_MS = 15_000;
