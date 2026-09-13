import type { PrayerKey } from "./prayer";

export type AthanSound = "makkah" | "madinah" | "fajr" | "ibnMajid" | "default";

export type NightAlertKey = "midnight" | "lastThird" | "witr" | "qiyam";

export interface NightAlertConfig {
  enabled: boolean;
  /** Minutes BEFORE the computed moment. */
  offsetMinutes: number;
}

export interface AthanSettings {
  preReminderMinutes: 0 | 5 | 10 | 15 | 20;
  soundFajr: AthanSound;
  soundOther: AthanSound;
  mutedDates: string[]; // YYYY-MM-DD
  dhikrReminderMinutes: 0 | 5 | 10;
  nightAlertsEnabled: boolean;
  /** Independent night reminders (native + web). */
  nightAlerts: Record<NightAlertKey, NightAlertConfig>;
  // Per-prayer notification toggles
  perPrayerEnabled: Record<PrayerKey, boolean>;
}

const KEY = "athan.settings";

export const defaultNightAlerts: Record<NightAlertKey, NightAlertConfig> = {
  midnight: { enabled: true, offsetMinutes: 0 },
  lastThird: { enabled: false, offsetMinutes: 0 },
  witr: { enabled: false, offsetMinutes: 0 },
  qiyam: { enabled: false, offsetMinutes: 15 },
};

export const defaultAthanSettings: AthanSettings = {
  preReminderMinutes: 5,
  soundFajr: "fajr",
  soundOther: "makkah",
  mutedDates: [],
  dhikrReminderMinutes: 0,
  nightAlertsEnabled: true,
  nightAlerts: defaultNightAlerts,
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
    const merged: AthanSettings = {
      ...defaultAthanSettings,
      ...parsed,
      perPrayerEnabled: { ...defaultAthanSettings.perPrayerEnabled, ...(parsed.perPrayerEnabled || {}) },
      nightAlerts: { ...defaultNightAlerts, ...(parsed.nightAlerts || {}) },
    };
    // Never keep a stored voice whose recording is missing/unverified.
    if (!isSoundSelectable(merged.soundFajr)) merged.soundFajr = defaultAthanSettings.soundFajr;
    if (!isSoundSelectable(merged.soundOther)) merged.soundOther = defaultAthanSettings.soundOther;
    return merged;
  } catch {
    return defaultAthanSettings;
  }
}

export function saveAthanSettings(s: AthanSettings) {
  // Only persist a voice selection when the matching recording actually exists.
  const safe: AthanSettings = {
    ...s,
    soundFajr: isSoundSelectable(s.soundFajr) ? s.soundFajr : defaultAthanSettings.soundFajr,
    soundOther: isSoundSelectable(s.soundOther) ? s.soundOther : defaultAthanSettings.soundOther,
  };
  localStorage.setItem(KEY, JSON.stringify(safe));
}

/** Short Arabic clip played with the pre-athan reminder ("استغفر الله وأتوب إليه") — web preview. */
export const PRE_REMINDER_VOICE_URL = "/sounds/astaghfirullah.mp3";

/**
 * File bundled inside the iOS App Bundle (Copy Bundle Resources) and used as the
 * `sound` of every pre-athan notification. Must live at the bundle root.
 */
export const PRE_REMINDER_NATIVE_SOUND = "astaghfirullah.caf";

export interface AthanSoundOption {
  value: AthanSound;
  en: string;
  ar: string;
  /** Preview URL used in-app (web + native webview). Empty when no audio exists. */
  previewUrl: string;
  /**
   * Bundled iOS sound file name (.caf/.wav placed in the Xcode bundle).
   * When absent the system default sound is used instead.
   */
  nativeFile?: string;
  /** The recording has been verified to actually match the muezzin's name. */
  verified: boolean;
  /** An audio file (preview or bundled) is currently available. */
  available: boolean;
}

/**
 * Central registry — add a new entry here to add a new athan voice.
 * `verified` MUST stay false until the recording is confirmed to be the
 * named muezzin's own voice; unverified entries are shown as unavailable.
 */
export const ATHAN_SOUNDS: AthanSoundOption[] = [
  { value: "makkah",   en: "Makkah (Haram)",   ar: "أذان المسجد الحرام", previewUrl: "https://www.islamcan.com/audio/adhan/azan3.mp3", nativeFile: "athan_makkah.caf", verified: true,  available: true },
  { value: "madinah",  en: "Madinah (Nabawi)", ar: "أذان المسجد النبوي", previewUrl: "https://www.islamcan.com/audio/adhan/azan1.mp3", nativeFile: "athan_madinah.caf", verified: true, available: true },
  { value: "fajr",     en: "Fajr Athan",       ar: "أذان الفجر",         previewUrl: "https://www.islamcan.com/audio/adhan/azan2.mp3", nativeFile: "athan_fajr.caf",   verified: true,  available: true },
  // Verified recording provided by the app owner — used ONLY for this option.
  { value: "ibnMajid", en: "Sheikh Abdulaziz bin Majid", ar: "الشيخ عبدالعزيز بن ماجد", previewUrl: "/sounds/athan_ibn_majid.mp3", nativeFile: "athan_ibn_majid.caf", verified: true, available: true },
  { value: "default",  en: "System default",   ar: "الصوت الافتراضي",    previewUrl: "", verified: true, available: true },
];

export function athanSoundOption(sound: AthanSound): AthanSoundOption | undefined {
  return ATHAN_SOUNDS.find((s) => s.value === sound);
}

export function isSoundSelectable(sound: AthanSound): boolean {
  const o = athanSoundOption(sound);
  return !!o && o.verified && o.available;
}

export function soundUrl(sound: AthanSound): string {
  const o = athanSoundOption(sound);
  if (!o || !o.verified || !o.available) return "";
  return o.previewUrl;
}

/**
 * .caf files verified at build time to exist on disk AND to be listed in the
 * iOS "Copy Bundle Resources" phase. iOS delivers a completely SILENT
 * notification when it is handed a sound file name it cannot find, so an
 * unbundled file must never be scheduled — we fall back to the system sound.
 */
export const BUNDLED_NATIVE_SOUNDS: string[] =
  typeof __BUNDLED_CAFS__ !== "undefined" ? __BUNDLED_CAFS__ : [];

export function isNativeSoundBundled(sound: AthanSound): boolean {
  const file = athanSoundOption(sound)?.nativeFile;
  return !!file && BUNDLED_NATIVE_SOUNDS.includes(file);
}

export function nativeSoundFile(sound: AthanSound): string | undefined {
  const o = athanSoundOption(sound);
  if (!o || !o.verified || !o.available || !o.nativeFile) return undefined;
  // Never schedule a sound that is not actually inside the app bundle.
  return BUNDLED_NATIVE_SOUNDS.includes(o.nativeFile) ? o.nativeFile : undefined;
}

export type ExtraAlertKind = "dhikr" | "midnight" | "lastThird" | "witr" | "qiyam";

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
