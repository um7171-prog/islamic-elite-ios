import { useCallback, useEffect, useRef, useState } from "react";
import { getPosition, queryGeoPermission, type GeoFailure, type GeoFix, type GeoPermission } from "@/lib/geo";
import {
  APPROXIMATE_LOCATION_M,
  DEFAULT_RADIUS_M,
  FEW_RESULTS,
  FIRST_RADIUS_M,
  LOCATION_MAX_AGE_MS,
  LOCATION_TIMEOUT_MS,
  RADIUS_DEBOUNCE_MS,
  SEARCH_RADII_M,
} from "@/lib/mosques/config";
import { isValidCoordinate, toSearchError, type LatLng, type Mosque, type MosqueSearchErrorKind } from "@/lib/mosques/model";
import type { MosqueProvider } from "@/lib/mosques/overpass";
import { cachedNearbyMosques, findNearbyMosques } from "@/lib/mosques/search";

export type NearbyPhase =
  | "checking" // reading the permission state (never prompts)
  | "idle" // waiting for the user to allow location
  | "locating"
  | "searching"
  | "results"
  | "empty"
  | "denied"
  | "unavailable" // no usable position (GPS off, timeout, invalid fix)
  | "unsupported"
  | "error"; // the mosque source failed

export interface NearbyState {
  phase: NearbyPhase;
  /** The radius selected / being searched. */
  radiusM: number;
  /** Last list found; kept on screen (dimmed) while a new search runs. */
  mosques: Mosque[];
  /** The radius `mosques` was searched with. */
  listRadiusM: number;
  errorKind: MosqueSearchErrorKind | null;
  locationTimedOut: boolean;
  /** The first search found too few mosques and widened itself once. */
  autoExpanded: boolean;
  /** A position fix is held (in memory only). */
  located: boolean;
  /** How precise that fix is, in metres as the device reported it (null when unknown). */
  accuracyM: number | null;
}

export interface NearbyDeps {
  locate?: () => Promise<GeoFix>;
  permission?: () => Promise<GeoPermission>;
  provider?: MosqueProvider;
}

const INITIAL: NearbyState = {
  phase: "checking",
  radiusM: FIRST_RADIUS_M,
  mosques: [],
  listRadiusM: FIRST_RADIUS_M,
  errorKind: null,
  locationTimedOut: false,
  autoExpanded: false,
  located: false,
  accuracyM: null,
};

/** One fresh, precise fix, While-In-Use only: no watchPosition, no background, no interval. */
const defaultLocate = () => getPosition(LOCATION_TIMEOUT_MS, true, LOCATION_MAX_AGE_MS);

const isBusy = (phase: NearbyPhase) => phase === "locating" || phase === "searching" || phase === "checking";

/**
 * Nearby mosques screen state. Location is asked for only when needed (automatically
 * only if it is already granted, otherwise on the user's tap), kept in memory for
 * distances, and never stored or sent anywhere but the rounded map query.
 *
 * Every search takes a ticket; starting a new one aborts the previous request and makes
 * its late result ignored, so re-renders or quick radius taps never pile up requests.
 */
export function useNearbyMosques(deps: NearbyDeps = {}) {
  const [state, setState] = useState<NearbyState>(INITIAL);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const stateRef = useRef(state);
  stateRef.current = state;
  const originRef = useRef<LatLng | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  /** Cancels whatever is running or pending and returns the new current ticket. */
  const nextTicket = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    window.clearTimeout(timerRef.current);
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const search = useCallback(
    async function run(radiusM: number, opts: { force?: boolean; autoExpand?: boolean; ticket?: number } = {}): Promise<void> {
      const origin = originRef.current;
      if (!origin) return;
      const ticket = opts.ticket ?? nextTicket();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setState((s) => ({ ...s, phase: "searching", radiusM, errorKind: null }));
      try {
        const { mosques } = await findNearbyMosques({
          origin,
          radiusM,
          force: opts.force,
          signal: ctrl.signal,
          provider: depsRef.current.provider,
        });
        if (ticket !== seqRef.current) return;
        if (opts.autoExpand && mosques.length < FEW_RESULTS && radiusM < DEFAULT_RADIUS_M) {
          setState((s) => ({ ...s, autoExpanded: true }));
          return run(DEFAULT_RADIUS_M, { ticket: nextTicket() });
        }
        setState((s) => ({ ...s, phase: mosques.length ? "results" : "empty", mosques, listRadiusM: radiusM, radiusM }));
      } catch (e) {
        if (ticket !== seqRef.current) return;
        const err = toSearchError(e);
        if (err.kind === "aborted") return;
        if (err.kind === "invalid-location") {
          setState((s) => ({ ...s, phase: "unavailable", locationTimedOut: false }));
          return;
        }
        setState((s) => ({ ...s, phase: "error", errorKind: err.kind }));
      }
    },
    [nextTicket],
  );

  const locateAndSearch = useCallback(
    async (radiusM: number, opts: { force?: boolean; autoExpand?: boolean } = {}) => {
      const ticket = nextTicket();
      setState((s) => ({ ...s, phase: "locating", errorKind: null, locationTimedOut: false }));
      let fix: GeoFix;
      try {
        fix = await (depsRef.current.locate ?? defaultLocate)();
      } catch (reason) {
        if (ticket !== seqRef.current) return;
        const r = reason as GeoFailure;
        const phase: NearbyPhase = r === "denied" ? "denied" : r === "unsupported" ? "unsupported" : "unavailable";
        setState((s) => ({ ...s, phase, locationTimedOut: r === "timeout" }));
        return;
      }
      if (ticket !== seqRef.current) return;
      if (!fix || !isValidCoordinate(fix.lat, fix.lng)) {
        setState((s) => ({ ...s, phase: "unavailable", locationTimedOut: false }));
        return;
      }
      originRef.current = { lat: fix.lat, lng: fix.lng };
      const accuracyM = Number.isFinite(fix.accuracy) && fix.accuracy > 0 ? fix.accuracy : null;
      setState((s) => ({ ...s, located: true, accuracyM }));
      await search(radiusM, { ...opts, ticket });
    },
    [nextTicket, search],
  );

  // On open: read the permission state without prompting. Search right away only when
  // location is already allowed; otherwise wait for the user's tap.
  useEffect(() => {
    let cancelled = false;
    (depsRef.current.permission ?? queryGeoPermission)()
      .catch((): GeoPermission => "unknown")
      .then((p) => {
        if (cancelled) return;
        if (p === "granted") void locateAndSearch(FIRST_RADIUS_M, { autoExpand: true });
        else setState((s) => ({ ...s, phase: p === "denied" ? "denied" : p === "unsupported" ? "unsupported" : "idle" }));
      });
    return () => {
      cancelled = true;
      nextTicket();
    };
  }, [locateAndSearch, nextTicket]);

  /** First search (user tap): smallest radius, widened automatically if too few. */
  const start = useCallback(() => {
    if (isBusy(stateRef.current.phase)) return;
    setState((s) => ({ ...s, radiusM: FIRST_RADIUS_M, autoExpanded: false }));
    void locateAndSearch(FIRST_RADIUS_M, { autoExpand: true });
  }, [locateAndSearch]);

  /** After a failure: repeat the search, or the location step if that is what failed. */
  const retry = useCallback(() => {
    const s = stateRef.current;
    if (isBusy(s.phase)) return;
    if (originRef.current && s.phase === "error") {
      void search(s.radiusM);
      return;
    }
    const fresh = !originRef.current;
    void locateAndSearch(fresh ? FIRST_RADIUS_M : s.radiusM, { autoExpand: fresh });
  }, [locateAndSearch, search]);

  /** Manual refresh: a new position fix and fresh data for the current radius. */
  const refresh = useCallback(() => {
    const s = stateRef.current;
    if (isBusy(s.phase)) return;
    if (!originRef.current) {
      start();
      return;
    }
    setState((p) => ({ ...p, autoExpanded: false }));
    void locateAndSearch(s.radiusM, { force: true });
  }, [locateAndSearch, start]);

  /** Radius chips: served from the cache instantly when it covers the radius,
   * otherwise one debounced request (quick taps collapse into the last one). */
  const setRadius = useCallback(
    (r: number) => {
      if (!(SEARCH_RADII_M as readonly number[]).includes(r)) return;
      const ticket = nextTicket();
      const origin = originRef.current;
      if (!origin) {
        setState((s) => ({ ...s, radiusM: r, autoExpanded: false }));
        return;
      }
      const cached = cachedNearbyMosques(origin, r);
      if (cached) {
        setState((s) => ({
          ...s,
          radiusM: r,
          listRadiusM: r,
          mosques: cached,
          phase: cached.length ? "results" : "empty",
          errorKind: null,
          autoExpanded: false,
        }));
        return;
      }
      setState((s) => ({ ...s, radiusM: r, phase: "searching", errorKind: null, autoExpanded: false }));
      timerRef.current = window.setTimeout(() => {
        if (ticket === seqRef.current) void search(r, { ticket });
      }, RADIUS_DEBOUNCE_MS);
    },
    [nextTicket, search],
  );

  const nextRadius = SEARCH_RADII_M.find((r) => r > state.radiusM) ?? null;
  const expandRadius = useCallback(() => {
    const next = SEARCH_RADII_M.find((r) => r > stateRef.current.radiusM);
    if (next) setRadius(next);
  }, [setRadius]);

  /** The fix is too coarse to trust distances and order (e.g. Precise Location is off). */
  const approximate = state.located && state.accuracyM !== null && state.accuracyM > APPROXIMATE_LOCATION_M;

  return { ...state, approximate, nextRadius, start, retry, refresh, setRadius, expandRadius };
}
