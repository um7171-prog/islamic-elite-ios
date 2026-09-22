/**
 * Real sound catalog for the new notification system.
 *
 * Every `.caf` filename below was verified to actually exist on disk in
 * ios/App/App/ AND to be registered in the Xcode project's "Copy Bundle
 * Resources" build phase (checked directly against project.pbxproj — not
 * assumed). `BUNDLED_NATIVE_SOUNDS` re-does that same check at build time
 * (see vite.config.ts's bundledCafs()) so a renamed/removed file can never
 * silently schedule a sound iOS can't find — iOS delivers a completely
 * SILENT notification when the named sound file is missing, with no error,
 * so this fallback-to-default matters.
 *
 * No new sound files were added — this only re-catalogs what already ships
 * in the app bundle.
 */

export type AthanSoundId = "makkah" | "madinah" | "fajr" | "ibnMajid" | "default";
export type ReminderSoundId = "notif_bell" | "notif_chime" | "notif_alert" | "notif_calm";

export interface AthanSoundOption {
  id: AthanSoundId;
  ar: string;
  en: string;
  /** In-app preview (web + native webview) — empty when unavailable. */
  previewUrl: string;
  /** Bundled iOS filename, or undefined to use the system default sound. */
  nativeFile?: string;
}

export const ATHAN_SOUNDS: AthanSoundOption[] = [
  { id: "makkah", ar: "أذان المسجد الحرام", en: "Makkah (Haram)", previewUrl: "/sounds/athan_makkah.mp3", nativeFile: "athan_makkah.caf" },
  { id: "madinah", ar: "أذان المسجد النبوي", en: "Madinah (Nabawi)", previewUrl: "/sounds/athan_madinah.mp3", nativeFile: "athan_madinah.caf" },
  { id: "fajr", ar: "أذان الفجر", en: "Fajr Athan", previewUrl: "/sounds/athan_fajr.mp3", nativeFile: "athan_fajr.caf" },
  { id: "ibnMajid", ar: "الشيخ عبدالعزيز بن ماجد", en: "Sheikh Abdulaziz bin Majid", previewUrl: "/sounds/athan_ibn_majid.mp3", nativeFile: "athan_ibn_majid.caf" },
  { id: "default", ar: "الصوت الافتراضي", en: "System default", previewUrl: "" },
];

export interface ReminderSoundOption {
  id: ReminderSoundId;
  ar: string;
  en: string;
  previewUrl: string;
  nativeFile: string;
}

export const REMINDER_SOUNDS: ReminderSoundOption[] = [
  { id: "notif_chime", ar: "رنة لطيفة", en: "Gentle chime", previewUrl: "/sounds/notif_chime.mp3", nativeFile: "notif_chime.caf" },
  { id: "notif_bell", ar: "جرس هادئ", en: "Soft bell", previewUrl: "/sounds/notif_bell.mp3", nativeFile: "notif_bell.caf" },
  { id: "notif_alert", ar: "تنبيه قصير", en: "Short alert", previewUrl: "/sounds/notif_alert.mp3", nativeFile: "notif_alert.caf" },
  { id: "notif_calm", ar: "نغمة هادئة", en: "Calm tone", previewUrl: "/sounds/notif_calm.mp3", nativeFile: "notif_calm.caf" },
];

export const DEFAULT_ATHAN_SOUND_FAJR: AthanSoundId = "fajr";
export const DEFAULT_ATHAN_SOUND_OTHER: AthanSoundId = "makkah";
export const DEFAULT_REMINDER_SOUND: ReminderSoundId = "notif_chime";
export const DEFAULT_ATHKAR_SOUND: ReminderSoundId = "notif_bell";

/** Build-time verified list of `.caf` files actually inside the iOS bundle
 * (vite.config.ts's CAF_NAMES / bundledCafs()). Empty on web/dev-only builds
 * where that check doesn't apply. */
const BUNDLED_NATIVE_SOUNDS: string[] = typeof __BUNDLED_CAFS__ !== "undefined" ? __BUNDLED_CAFS__ : [];

export function athanSoundOption(id: AthanSoundId): AthanSoundOption | undefined {
  return ATHAN_SOUNDS.find((s) => s.id === id);
}

export function reminderSoundOption(id: ReminderSoundId): ReminderSoundOption | undefined {
  return REMINDER_SOUNDS.find((s) => s.id === id);
}

/** The iOS notification `sound` value to actually schedule — falls back to
 * "default" if the named file isn't verified as bundled, so a notification
 * is never silently unschedulable because of a missing sound asset. */
export function athanNativeSound(id: AthanSoundId): string {
  const file = athanSoundOption(id)?.nativeFile;
  return file && BUNDLED_NATIVE_SOUNDS.includes(file) ? file : "default";
}

export function reminderNativeSound(id: ReminderSoundId): string {
  const file = reminderSoundOption(id)?.nativeFile;
  return file && BUNDLED_NATIVE_SOUNDS.includes(file) ? file : "default";
}

/** The bundled "أستغفر الله" file used for the pre-prayer reminder ONLY — never for the
 * athan itself. Falls back to "default" the same way athan/reminder sounds do if it is
 * ever not actually bundled. */
export const PRE_PRAYER_SOUND_FILE = "astaghfirullah.caf";
export function preprayerNativeSound(): string {
  return BUNDLED_NATIVE_SOUNDS.includes(PRE_PRAYER_SOUND_FILE) ? PRE_PRAYER_SOUND_FILE : "default";
}

/** Local full-length recitation file for in-app playback (never truncated by the
 * iOS notification-sound size limit, which only applies to the short `.caf`). */
export function athanFullAudioUrl(id: AthanSoundId): string {
  return athanSoundOption(id)?.previewUrl || "";
}

/** In-app preview playback (web + native webview) — separate from the
 * scheduler on purpose, so picking a sound never touches native scheduling. */
let previewEl: HTMLAudioElement | null = null;
export function previewSound(url: string) {
  try {
    previewEl?.pause();
    if (!url) return;
    previewEl = new Audio(url);
    void previewEl.play().catch(() => undefined);
  } catch {
    /* audio unavailable */
  }
}
export function stopPreview() {
  try {
    previewEl?.pause();
  } catch {
    /* noop */
  }
}
