/**
 * Built-in short notification sounds for calendar reminders and Athkar
 * reminders. Every entry ships twice:
 *  - `.caf` inside the iOS bundle (used by Local Notifications)
 *  - `.mp3` under /sounds (used for in-app preview)
 *
 * These are synthesized tones bundled with the app (royalty free) — iOS does
 * not allow browsing the user's system ringtones.
 */

export type ReminderSoundId =
  | "default"
  | "notif_bell"
  | "notif_chime"
  | "notif_alert"
  | "notif_calm";

export interface ReminderSound {
  id: ReminderSoundId;
  ar: string;
  en: string;
  /** iOS bundle filename; undefined = system default notification sound */
  file?: string;
  /** Web preview asset; undefined = no preview (system default) */
  preview?: string;
}

export const REMINDER_SOUNDS: ReminderSound[] = [
  { id: "default", ar: "التنبيه الافتراضي", en: "Default notification" },
  {
    id: "notif_bell",
    ar: "جرس هادئ",
    en: "Soft Bell",
    file: "notif_bell.caf",
    preview: "/sounds/notif_bell.mp3",
  },
  {
    id: "notif_chime",
    ar: "رنّة لطيفة",
    en: "Gentle Chime",
    file: "notif_chime.caf",
    preview: "/sounds/notif_chime.mp3",
  },
  {
    id: "notif_alert",
    ar: "تنبيه قصير",
    en: "Short Alert",
    file: "notif_alert.caf",
    preview: "/sounds/notif_alert.mp3",
  },
  {
    id: "notif_calm",
    ar: "نغمة هادئة",
    en: "Calm tone",
    file: "notif_calm.caf",
    preview: "/sounds/notif_calm.mp3",
  },
];

export const DEFAULT_REMINDER_SOUND: ReminderSoundId = "notif_chime";
/** Short bell used by the Athkar reminders (never the athan). */
export const ATHKAR_DEFAULT_SOUND: ReminderSoundId = "notif_bell";

export function getReminderSound(id: ReminderSoundId | undefined): ReminderSound {
  return REMINDER_SOUNDS.find((s) => s.id === id) ?? REMINDER_SOUNDS[0];
}

/** iOS notification `sound` value ("default" when no bundled file). */
export function reminderSoundFile(id: ReminderSoundId | undefined): string {
  return getReminderSound(id).file ?? "default";
}

let previewEl: HTMLAudioElement | null = null;

/** Play (or restart) the in-app preview of a reminder sound. */
export function previewReminderSound(id: ReminderSoundId) {
  const sound = getReminderSound(id);
  stopReminderPreview();
  if (!sound.preview) return;
  try {
    previewEl = new Audio(sound.preview);
    previewEl.volume = 0.9;
    void previewEl.play().catch(() => undefined);
  } catch {
    /* audio unavailable */
  }
}

export function stopReminderPreview() {
  if (previewEl) {
    try {
      previewEl.pause();
      previewEl.currentTime = 0;
    } catch {
      /* noop */
    }
    previewEl = null;
  }
}
