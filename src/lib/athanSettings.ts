import type { PrayerKey } from "./prayer";

export type AthanSound = "makkah" | "madinah" | "fajr" | "ibnMajid" | "default";

export interface AthanSettings {
  enabled: boolean;
  preReminderMinutes: 0 | 5 | 10 | 15 | 20;
  soundFajr: AthanSound;
  soundOther: AthanSound;
  mutedDates: string[]; // YYYY-MM-DD
  dhikrReminderMinutes: 0 | 5 | 10;
  nightAlertsEnabled: boolean;
  // Per-prayer notification toggles
  perPrayerEnabled: Record<PrayerKey, boolean>;
}

const KEY = "athan.settings";

export const defaultAthanSettings: AthanSettings = {
  enabled: false,
  preReminderMinutes: 0,
  soundFajr: "fajr",
  soundOther: "makkah",
  mutedDates: [],
  dhikrReminderMinutes: 0,
  nightAlertsEnabled: false,
  perPrayerEnabled: {
    fajr: true,
    sunrise: false,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  },
};

export function loadAthanSettings(): AthanSettings {
  if (typeof localStorage === "undefined") return defaultAthanSettings;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultAthanSettings;
    const parsed = JSON.parse(raw);
    return {
      ...defaultAthanSettings,
      ...parsed,
      perPrayerEnabled: { ...defaultAthanSettings.perPrayerEnabled, ...(parsed.perPrayerEnabled || {}) },
    };
  } catch {
    return defaultAthanSettings;
  }
}

export function saveAthanSettings(s: AthanSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function soundUrl(sound: AthanSound): string {
  switch (sound) {
    case "fajr":    return "https://www.islamcan.com/audio/adhan/azan2.mp3";
    case "madinah": return "https://www.islamcan.com/audio/adhan/azan1.mp3";
    case "ibnMajid":return "https://www.islamcan.com/audio/adhan/azan9.mp3";
    case "default": return "";
    case "makkah":
    default:        return "https://www.islamcan.com/audio/adhan/azan3.mp3";
  }
}

export type ExtraAlertKind = "dhikr" | "midnight" | "lastThird";

export function firedKey(
  date: Date,
  key: PrayerKey | ExtraAlertKind,
  kind: "athan" | "pre" | "extra" = "athan",
): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `athan.fired.${y}${m}${d}.${key}.${kind}`;
}

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
