import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { MethodId } from "@/lib/prayerMethods";
import type { PrayerKey } from "@/lib/prayer";

export type MadhabId = "hanbali" | "shafi" | "maliki" | "hanafi";

export type PrayerAdjustments = Record<PrayerKey, number>;

export interface PrayerPrefs {
  /** Update the city automatically from the device location. */
  autoCity: boolean;
  /** Show city names in Arabic. */
  arabicCityNames: boolean;
  /** Show the sunrise row in the prayer lists. */
  showSunrise: boolean;
  /** Play only the first takbir of the athan instead of the full recording. */
  firstTakbirOnly: boolean;
  /** Delay Isha by 30 minutes (Ramadan / local mosque practice). */
  ishaDelay30: boolean;
}

interface Ctx {
  madhab: MadhabId;
  setMadhab: (m: MadhabId) => void;
  method: MethodId;
  setMethod: (m: MethodId) => void;
  adjustments: PrayerAdjustments;
  setAdjustment: (key: PrayerKey, minutes: number) => void;
  resetAdjustments: () => void;
  prefs: PrayerPrefs;
  setPref: <K extends keyof PrayerPrefs>(key: K, value: PrayerPrefs[K]) => void;
  /** Any change here should force a full notification reschedule. */
  calcSignature: string;
}

const C = createContext<Ctx | null>(null);
const KEY = "prayer.madhab";
const METHOD_KEY = "prayer.method";
const ADJ_KEY = "prayer.adjustments";
const PREFS_KEY = "prayer.prefs";

export const DEFAULT_ADJUSTMENTS: PrayerAdjustments = {
  fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0,
};

export const DEFAULT_PREFS: PrayerPrefs = {
  autoCity: false,
  arabicCityNames: true,
  showSunrise: true,
  firstTakbirOnly: false,
  ishaDelay30: false,
};

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...(fallback as object), ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export function PrayerCalcProvider({ children }: { children: ReactNode }) {
  const [madhab, setMadhabState] = useState<MadhabId>(() => {
    if (typeof localStorage === "undefined") return "hanbali";
    const v = localStorage.getItem(KEY);
    if (v === "hanbali" || v === "shafi" || v === "maliki" || v === "hanafi") return v;
    return "hanbali"; // Umm Al-Qura default (Standard madhab)
  });
  const [method, setMethodState] = useState<MethodId>(() => {
    if (typeof localStorage === "undefined") return "ummAlQura";
    return (localStorage.getItem(METHOD_KEY) as MethodId) || "ummAlQura";
  });
  const [adjustments, setAdjustments] = useState<PrayerAdjustments>(() =>
    read(ADJ_KEY, DEFAULT_ADJUSTMENTS),
  );
  const [prefs, setPrefs] = useState<PrayerPrefs>(() => read(PREFS_KEY, DEFAULT_PREFS));

  useEffect(() => { localStorage.setItem(KEY, madhab); }, [madhab]);
  useEffect(() => { localStorage.setItem(METHOD_KEY, method); }, [method]);
  useEffect(() => { localStorage.setItem(ADJ_KEY, JSON.stringify(adjustments)); }, [adjustments]);
  useEffect(() => { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }, [prefs]);

  const value = useMemo<Ctx>(() => ({
    madhab,
    setMadhab: setMadhabState,
    method,
    setMethod: setMethodState,
    adjustments,
    setAdjustment: (key, minutes) =>
      setAdjustments((prev) => ({ ...prev, [key]: Math.max(-60, Math.min(60, minutes)) })),
    resetAdjustments: () => setAdjustments(DEFAULT_ADJUSTMENTS),
    prefs,
    setPref: (key, val) => setPrefs((prev) => ({ ...prev, [key]: val })),
    calcSignature: `${madhab}|${method}|${JSON.stringify(adjustments)}|${prefs.ishaDelay30}`,
  }), [madhab, method, adjustments, prefs]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function usePrayerCalc() {
  const ctx = useContext(C);
  if (!ctx) throw new Error("usePrayerCalc must be inside PrayerCalcProvider");
  return ctx;
}
