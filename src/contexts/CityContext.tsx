import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { DEFAULT_LOCATION, LOCAL_LOCATIONS, type CityLocation } from "@/lib/locations";

export type City = CityLocation;
export const CITIES = LOCAL_LOCATIONS;

interface Ctx { city: City; setCityId: (id: string) => void; setCity: (city: City) => void; }
const C = createContext<Ctx | null>(null);
const KEY = "city.id";
const CUSTOM_KEY = "city.custom";

export function CityProvider({ children }: { children: ReactNode }) {
  const [customCity, setCustomCity] = useState<City | null>(() => {
    if (typeof localStorage === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "null"); }
    catch { return null; }
  });
  const [id, setId] = useState<string>(() => localStorage.getItem(KEY) || DEFAULT_LOCATION.id);
  useEffect(() => { localStorage.setItem(KEY, id); }, [id]);
  useEffect(() => {
    if (customCity) localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCity));
  }, [customCity]);
  const city = useMemo(() => {
    if (customCity?.id === id) return customCity;
    return CITIES.find(c => c.id === id) || DEFAULT_LOCATION;
  }, [id, customCity]);
  const setCity = (next: City) => {
    if (!CITIES.some((c) => c.id === next.id)) setCustomCity(next);
    setId(next.id);
  };
  return <C.Provider value={{ city, setCityId: setId, setCity }}>{children}</C.Provider>;
}

export function useCity() {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useCity must be inside CityProvider");
  return ctx;
}
