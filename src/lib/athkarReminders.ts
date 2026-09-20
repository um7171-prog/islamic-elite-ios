/**
 * Morning / Evening Athkar reminders.
 *
 * Completely independent from the prayer scheduler: notification IDs live in
 * the "athkar" range (see lib/notifications/ranges.ts), and the sound is
 * always a short bell/chime — never an adhan. Nothing here touches prayer
 * notification logic.
 */

import { scheduleGroup } from "@/lib/notifications/scheduler";
import { NOTIFICATION_RANGES } from "@/lib/notifications/ranges";
import {
  DEFAULT_ATHKAR_SOUND as ATHKAR_DEFAULT_SOUND,
  reminderNativeSound as reminderSoundFile,
  type ReminderSoundId,
} from "@/lib/notifications/sounds";

const ATHKAR_ID_MIN = NOTIFICATION_RANGES.athkar.min;

export interface AthkarReminderSettings {
  morningEnabled: boolean;
  /** minutes after sunrise */
  morningAfterSunrise: number;
  eveningEnabled: boolean;
  /** minutes before maghrib */
  eveningBeforeMaghrib: number;
  sound: ReminderSoundId;
}

const STORAGE_KEY = "elite.athkar.reminders.v1";

export const DEFAULT_ATHKAR_SETTINGS: AthkarReminderSettings = {
  morningEnabled: true,
  morningAfterSunrise: 30,
  eveningEnabled: true,
  eveningBeforeMaghrib: 60,
  sound: ATHKAR_DEFAULT_SOUND,
};

export function loadAthkarSettings(): AthkarReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ATHKAR_SETTINGS };
    return { ...DEFAULT_ATHKAR_SETTINGS, ...(JSON.parse(raw) as Partial<AthkarReminderSettings>) };
  } catch {
    return { ...DEFAULT_ATHKAR_SETTINGS };
  }
}

export function saveAthkarSettings(s: AthkarReminderSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

export interface AthkarDayTimes {
  /** local sunrise for that day */
  sunrise: Date;
  /** local maghrib for that day */
  maghrib: Date;
}

const TEXTS = {
  morning: {
    ar: { title: "أذكار الصباح", body: "ابدأ يومك بذكر الله ﴿فاذكروني أذكركم﴾" },
    en: { title: "Morning Athkar", body: "Start your day with the remembrance of Allah." },
  },
  evening: {
    ar: { title: "أذكار المساء", body: "لا تنسَ أذكار المساء، حصّن نفسك بذكر الله." },
    en: { title: "Evening Athkar", body: "Don't forget your evening Athkar." },
  },
};

/**
 * Rebuild all Athkar notifications for the next few days.
 * Only the "athkar" range is rebuilt — prayer/calendar notifications untouched.
 */
export async function syncAthkarReminders(
  settings: AthkarReminderSettings,
  dayTimes: AthkarDayTimes[],
  lang: "ar" | "en",
) {
  const sound = reminderSoundFile(settings.sound);
  const items: {
    id: number;
    title: string;
    body: string;
    at: Date;
    sound: string;
    extra: { route: string };
  }[] = [];

  dayTimes.slice(0, 3).forEach((d, i) => {
    if (settings.morningEnabled) {
      const txt = TEXTS.morning[lang];
      items.push({
        id: ATHKAR_ID_MIN + i * 2,
        title: txt.title,
        body: txt.body,
        at: new Date(d.sunrise.getTime() + settings.morningAfterSunrise * 60_000),
        sound,
        extra: { route: "/?athkar=morning" },
      });
    }
    if (settings.eveningEnabled) {
      const txt = TEXTS.evening[lang];
      items.push({
        id: ATHKAR_ID_MIN + i * 2 + 1,
        title: txt.title,
        body: txt.body,
        at: new Date(d.maghrib.getTime() - settings.eveningBeforeMaghrib * 60_000),
        sound,
        extra: { route: "/?athkar=evening" },
      });
    }
  });

  const res = await scheduleGroup("athkar", items);
  return res.scheduled;
}
