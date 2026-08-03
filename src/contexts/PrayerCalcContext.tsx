import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type MadhabId = "hanbali" | "shafi" | "maliki" | "hanafi";

interface Ctx {
  madhab: MadhabId;
  setMadhab: (m: MadhabId) => void;
}

const C = createContext<Ctx | null>(null);
const KEY = "prayer.madhab";

export function PrayerCalcProvider({ children }: { children: ReactNode }) {
  const [madhab, setMadhabState] = useState<MadhabId>(() => {
    if (typeof localStorage === "undefined") return "hanbali";
    const v = localStorage.getItem(KEY);
    if (v === "hanbali" || v === "shafi" || v === "maliki" || v === "hanafi") return v;
    return "hanbali"; // Umm Al-Qura default (Standard madhab)
  });

  useEffect(() => {
    localStorage.setItem(KEY, madhab);
  }, [madhab]);

  const value = useMemo<Ctx>(() => ({ madhab, setMadhab: setMadhabState }), [madhab]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function usePrayerCalc() {
  const ctx = useContext(C);
  if (!ctx) throw new Error("usePrayerCalc must be inside PrayerCalcProvider");
  return ctx;
}
