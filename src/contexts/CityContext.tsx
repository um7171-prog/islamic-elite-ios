import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { DEFAULT_LOCATION, LOCAL_LOCATIONS, type CityLocation } from "@/lib/locations";
import {
  NEAREST_CITY_MAX_KM,
  deviceTimeZone,
  getPosition,
  nearestCity,
  queryGeoPermission,
  type GeoFix,
  type GeoPermission,
} from "@/lib/geo";

export type City = CityLocation;
export const CITIES = LOCAL_LOCATIONS;

/** What the automatic-location engine is doing / why it can't. */
export type LocationStatus =
  | "off" // automatic location is switched off (manual city in use)
  | "idle" // on, nothing requested yet
  | "locating"
  | "ok" // a real fix was applied
  | "needs-permission" // on, but the user hasn't granted access yet
  | "denied"
  | "unavailable" // GPS could not produce a position
  | "timeout"
  | "unsupported";

interface Ctx {
  city: City;
  setCityId: (id: string) => void;
  setCity: (city: City) => void;
  /** Automatic (device) location on/off. Default ON. */
  auto: boolean;
  setAuto: (on: boolean) => void;
  /** With automatic location: calculate from the nearest city's centre instead of the exact GPS point. */
  useCityCenter: boolean;
  setUseCityCenter: (on: boolean) => void;
  status: LocationStatus;
  permission: GeoPermission;
  /** Last real device fix (null until one succeeded this session). */
  fix: GeoFix | null;
  /** Ask the device for a position now (may show the system permission prompt — call from a tap). */
  requestLocation: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);

// Existing storage (unchanged): the selected city id and the object of any
// non-built-in city (manual global pick or the automatic GPS city).
const KEY = "city.id";
const CUSTOM_KEY = "city.custom";
// New, only for the two new switches.
const AUTO_KEY = "elite.location.auto.v1";
const CENTER_KEY = "elite.location.cityCenter.v1";
const AUTO_CITY_ID = "auto-gps";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "on";
  } catch {
    return fallback;
  }
}

export function CityProvider({ children }: { children: ReactNode }) {
  const [customCity, setCustomCity] = useState<City | null>(() => {
    if (typeof localStorage === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "null"); }
    catch { return null; }
  });
  const [id, setId] = useState<string>(() => localStorage.getItem(KEY) || DEFAULT_LOCATION.id);
  const [auto, setAutoState] = useState<boolean>(() => readFlag(AUTO_KEY, true));
  const [useCityCenter, setUseCityCenterState] = useState<boolean>(() => readFlag(CENTER_KEY, false));
  const [status, setStatus] = useState<LocationStatus>(auto ? "idle" : "off");
  const [permission, setPermission] = useState<GeoPermission>("unknown");
  const [fix, setFix] = useState<GeoFix | null>(null);

  useEffect(() => { localStorage.setItem(KEY, id); }, [id]);
  useEffect(() => {
    if (customCity) localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCity));
  }, [customCity]);
  useEffect(() => { try { localStorage.setItem(AUTO_KEY, auto ? "on" : "off"); } catch { /* private mode */ } }, [auto]);
  useEffect(() => { try { localStorage.setItem(CENTER_KEY, useCityCenter ? "on" : "off"); } catch { /* private mode */ } }, [useCityCenter]);

  const city = useMemo(() => {
    if (customCity?.id === id) return customCity;
    return CITIES.find(c => c.id === id) || DEFAULT_LOCATION;
  }, [id, customCity]);

  // Choosing a city by hand means "use this city", so automatic location turns off.
  const setCity = (next: City) => {
    if (!CITIES.some((c) => c.id === next.id)) setCustomCity(next);
    setId(next.id);
    setAutoState(false);
  };
  const setCityId = (nextId: string) => {
    setId(nextId);
    setAutoState(false);
  };

  /** Turn a real GPS fix into the app's current city. */
  const applyFix = useCallback((f: GeoFix, centre: boolean) => {
    const { city: near, km } = nearestCity(f.lat, f.lng);
    const known = km <= NEAREST_CITY_MAX_KM;
    if (centre && known) {
      // Calculate from the nearest city's centre: a plain built-in city, no custom object.
      setId(near.id);
      return;
    }
    const auto: City = {
      id: AUTO_CITY_ID,
      en: known ? near.en : "Current location",
      ar: known ? near.ar : "موقعي الحالي",
      lat: f.lat,
      lng: f.lng,
      tz: deviceTimeZone(),
      countryEn: known ? near.countryEn : "",
      countryAr: known ? near.countryAr : "",
      source: "local",
    };
    setCustomCity(auto);
    setId(AUTO_CITY_ID);
  }, []);

  const centreRef = useRef(useCityCenter);
  centreRef.current = useCityCenter;

  const requestLocation = useCallback(async () => {
    setStatus("locating");
    try {
      const f = await getPosition();
      setFix(f);
      setPermission("granted");
      applyFix(f, centreRef.current);
      setStatus("ok");
    } catch (e) {
      const reason = String(e);
      if (reason === "denied") { setPermission("denied"); setStatus("denied"); }
      else if (reason === "timeout") setStatus("timeout");
      else if (reason === "unsupported") { setPermission("unsupported"); setStatus("unsupported"); }
      else setStatus("unavailable");
    }
  }, [applyFix]);

  // Automatic mode: if the device already allowed location, refresh silently;
  // otherwise report that permission is needed (never prompt on its own).
  useEffect(() => {
    if (!auto) { setStatus("off"); return; }
    let cancelled = false;
    void (async () => {
      const p = await queryGeoPermission();
      if (cancelled) return;
      setPermission(p);
      if (p === "granted") await requestLocation();
      else if (p === "denied") setStatus("denied");
      else if (p === "unsupported") setStatus("unsupported");
      else setStatus("needs-permission");
    })();
    return () => { cancelled = true; };
  }, [auto, requestLocation]);

  // Toggling "city centre" re-applies the last fix immediately.
  useEffect(() => {
    if (auto && fix) applyFix(fix, useCityCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCityCenter]);

  const setAuto = (on: boolean) => setAutoState(on);
  const setUseCityCenter = (on: boolean) => setUseCityCenterState(on);

  return (
    <C.Provider value={{ city, setCityId, setCity, auto, setAuto, useCityCenter, setUseCityCenter, status, permission, fix, requestLocation }}>
      {children}
    </C.Provider>
  );
}

export function useCity() {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useCity must be inside CityProvider");
  return ctx;
}
