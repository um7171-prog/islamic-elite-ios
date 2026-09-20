import { useEffect, useState } from "react";

/**
 * Current temperature for Home (a small pill, not a weather screen).
 * Source: Open-Meteo (free, no API key). The request always uses the coordinates
 * of the CURRENT city (automatic or manual). If the network or the service is
 * unavailable the UI shows "unavailable" — a temperature is never invented, and
 * nothing cached is ever presented as live.
 */
export interface TemperatureReading {
  tempC: number;
  /** epoch ms of the successful fetch */
  fetchedAt: number;
}

export type TemperatureState =
  | { status: "loading" }
  | { status: "ok"; reading: TemperatureReading }
  | { status: "unavailable" };

const REFRESH_MS = 15 * 60_000;
const CACHE_MS = 10 * 60_000;

export function temperatureUrl(lat: number, lng: number): string {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", lat.toFixed(4));
  u.searchParams.set("longitude", lng.toFixed(4));
  u.searchParams.set("current", "temperature_2m");
  u.searchParams.set("timezone", "auto");
  return u.toString();
}

const cache = new Map<string, TemperatureReading>();

export async function fetchTemperature(lat: number, lng: number, signal?: AbortSignal): Promise<TemperatureReading> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit;
  const res = await fetch(temperatureUrl(lat, lng), { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`temperature ${res.status}`);
  const json = (await res.json()) as { current?: { temperature_2m?: number } };
  const v = json.current?.temperature_2m;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("no temperature in response");
  const reading = { tempC: v, fetchedAt: Date.now() };
  cache.set(key, reading);
  return reading;
}

/** Live temperature for a coordinate; re-fetches when the coordinate changes and every 15 min. */
export function useTemperature(lat: number, lng: number): TemperatureState {
  const [state, setState] = useState<TemperatureState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setState({ status: "loading" });
    const run = () =>
      fetchTemperature(lat, lng, ctrl.signal)
        .then((reading) => !cancelled && setState({ status: "ok", reading }))
        .catch(() => !cancelled && setState({ status: "unavailable" }));
    void run();
    const id = window.setInterval(() => void run(), REFRESH_MS);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [lat, lng]);
  return state;
}

/** Test helper. */
export function _clearTemperatureCache() {
  cache.clear();
}
