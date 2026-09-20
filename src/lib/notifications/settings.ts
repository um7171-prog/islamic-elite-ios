import type { PrayerKey } from "@/lib/prayer";
import { DEFAULT_ATHAN_SOUND_FAJR, DEFAULT_ATHAN_SOUND_OTHER, type AthanSoundId } from "./sounds";

/** The five real prayers this system schedules alerts for — sunrise is a
 * displayed time elsewhere in the app but never gets its own alert. */
export const NOTIFIABLE_PRAYERS: Exclude<PrayerKey, "sunrise">[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export interface PrayerNotificationSettings {
  perPrayerEnabled: Record<Exclude<PrayerKey, "sunrise">, boolean>;
  preReminderEnabled: boolean;
  /** Minutes before the prayer time; only meaningful when preReminderEnabled. */
  preReminderMinutes: 5 | 10 | 15 | 20;
  soundFajr: AthanSoundId;
  soundOther: AthanSoundId;
}

const STORAGE_KEY = "elite.notifications.prayer.v1";

export const DEFAULT_PRAYER_NOTIFICATION_SETTINGS: PrayerNotificationSettings = {
  perPrayerEnabled: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  preReminderEnabled: true,
  preReminderMinutes: 10,
  soundFajr: DEFAULT_ATHAN_SOUND_FAJR,
  soundOther: DEFAULT_ATHAN_SOUND_OTHER,
};

export function loadPrayerNotificationSettings(): PrayerNotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PrayerNotificationSettings>;
    return {
      ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS,
      ...parsed,
      perPrayerEnabled: { ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS.perPrayerEnabled, ...(parsed.perPrayerEnabled || {}) },
    };
  } catch {
    return { ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS };
  }
}

export function savePrayerNotificationSettings(s: PrayerNotificationSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}
