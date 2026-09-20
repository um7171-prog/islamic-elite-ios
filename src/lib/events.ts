/**
 * Calendar events ("التقويم والمواعيد").
 * Stored permanently in localStorage; each event can schedule an iOS local
 * notification. Notification IDs live in the "calendar" range (see
 * lib/notifications/ranges.ts) so they never clash with prayer or athkar
 * notifications.
 */

import { reminderNativeSound as reminderSoundFile, type ReminderSoundId } from "@/lib/notifications/sounds";
import { scheduleGroup } from "@/lib/notifications/scheduler";
import { NOTIFICATION_RANGES } from "@/lib/notifications/ranges";

export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface CalEvent {
  id: string;
  title: string;
  /** yyyy-mm-dd of the first occurrence */
  date: string;
  /** HH:MM */
  time: string;
  notes?: string;
  repeat: Repeat;
  /** minutes before the event; 0 = at event time; null = no notification */
  remindMinutesBefore: number | null;
  /** built-in reminder sound id */
  sound?: ReminderSoundId;
  createdAt: number;
}

const STORAGE_KEY = "elite.calendar.events.v1";

export const EVENT_ID_MIN = NOTIFICATION_RANGES.calendar.min;
export const EVENT_ID_MAX = NOTIFICATION_RANGES.calendar.max;

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}
export function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function eventDateTime(dateStr: string, time: string) {
  const d = parseYmd(dateStr);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

export function loadEvents(): CalEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as CalEvent[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveEvents(list: CalEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage full / private mode */
  }
}

/** Does `event` occur on calendar day `day`? */
export function occursOn(ev: CalEvent, day: Date): boolean {
  const start = parseYmd(ev.date);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (d < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
  switch (ev.repeat) {
    case "none":
      return ymd(d) === ev.date;
    case "daily":
      return true;
    case "weekly":
      return d.getDay() === start.getDay();
    case "monthly":
      return d.getDate() === start.getDate();
    case "yearly":
      return d.getDate() === start.getDate() && d.getMonth() === start.getMonth();
    default:
      return false;
  }
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Next occurrence date-time at or after `from` (null when it already passed). */
export function nextOccurrence(ev: CalEvent, from = new Date()): Date | null {
  const first = eventDateTime(ev.date, ev.time);
  if (ev.repeat === "none") return first.getTime() >= from.getTime() ? first : null;
  if (first.getTime() >= from.getTime()) return first;
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 800; i++) {
    if (occursOn(ev, cursor)) {
      const dt = eventDateTime(ymd(cursor), ev.time);
      if (dt.getTime() >= from.getTime()) return dt;
    }
    cursor = addDays(cursor, 1);
  }
  return null;
}

/** Upcoming occurrences across all events, sorted by time. */
export function upcoming(events: CalEvent[], limit = 8, from = new Date()) {
  return events
    .map((ev) => ({ ev, when: nextOccurrence(ev, from) }))
    .filter((x): x is { ev: CalEvent; when: Date } => !!x.when)
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .slice(0, limit);
}

/** Natural Arabic / English relative label: غداً، بعد أسبوع، بعد 8 أيام، بعد شهر… */
export function relativeLabel(when: Date, lang: "ar" | "en", now = new Date()): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(when) - startOf(now)) / 86_400_000);
  const ms = when.getTime() - now.getTime();

  if (days === 0) {
    if (ms <= 0) return lang === "ar" ? "الآن" : "now";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return lang === "ar" ? `بعد ${mins} دقيقة` : `in ${mins} min`;
    const hrs = Math.round(mins / 60);
    return lang === "ar" ? `اليوم بعد ${hrs} ساعة` : `today in ${hrs}h`;
  }
  if (days === 1) return lang === "ar" ? "غداً" : "tomorrow";
  if (days === 2) return lang === "ar" ? "بعد يومين" : "in 2 days";
  if (days === 7) return lang === "ar" ? "بعد أسبوع" : "in a week";
  if (days === 14) return lang === "ar" ? "بعد أسبوعين" : "in 2 weeks";
  if (days < 30) return lang === "ar" ? `بعد ${days} أيام` : `in ${days} days`;
  const months = Math.round(days / 30);
  if (months === 1) return lang === "ar" ? "بعد شهر" : "in a month";
  if (months === 2) return lang === "ar" ? "بعد شهرين" : "in 2 months";
  if (months < 12) return lang === "ar" ? `بعد ${months} أشهر` : `in ${months} months`;
  const years = Math.round(days / 365);
  return years === 1
    ? lang === "ar" ? "بعد سنة" : "in a year"
    : lang === "ar" ? `بعد ${years} سنوات` : `in ${years} years`;
}

export const REMINDER_CHOICES: { minutes: number | null; ar: string; en: string }[] = [
  { minutes: null, ar: "بدون", en: "Off" },
  { minutes: 0, ar: "عند الموعد", en: "At time" },
  { minutes: 5, ar: "قبل 5 د", en: "5 min before" },
  { minutes: 10, ar: "قبل 10 د", en: "10 min before" },
  { minutes: 15, ar: "قبل 15 د", en: "15 min before" },
  { minutes: 30, ar: "قبل 30 د", en: "30 min before" },
  { minutes: 60, ar: "قبل ساعة", en: "1 hour before" },
  { minutes: 1440, ar: "قبل يوم", en: "1 day before" },
];

export const REPEAT_CHOICES: { value: Repeat; ar: string; en: string }[] = [
  { value: "none", ar: "بدون تكرار", en: "Once" },
  { value: "daily", ar: "يومي", en: "Daily" },
  { value: "weekly", ar: "أسبوعي", en: "Weekly" },
  { value: "monthly", ar: "شهري", en: "Monthly" },
  { value: "yearly", ar: "سنوي", en: "Yearly" },
];

// ---------------- Native local notifications ----------------

/** Stable per-event notification id inside the events range (20000–29999). */
function notifId(ev: CalEvent, offset = 0): number {
  let h = 0;
  for (let i = 0; i < ev.id.length; i++) h = (h * 31 + ev.id.charCodeAt(i)) % 9990;
  return EVENT_ID_MIN + ((h + offset * 3) % 9990);
}

/**
 * Rebuild all event notifications through the shared native pipeline.
 * Only the events id range is touched — prayers and athkar are untouched.
 */
export async function syncEventNotifications(events: CalEvent[], lang: "ar" | "en") {
  const now = new Date();
  const items: {
    id: number;
    title: string;
    body: string;
    at: Date;
    sound: string;
    extra: { route: string };
  }[] = [];
  const used = new Set<number>();

  for (const ev of events) {
    if (ev.remindMinutesBefore === null) continue;
    let cursor = now;
    const count = ev.repeat === "none" ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const when = nextOccurrence(ev, cursor);
      if (!when) break;
      const requestedAt = new Date(when.getTime() - (ev.remindMinutesBefore ?? 0) * 60_000);
      // A common real-world test is "make an event two minutes from now" while
      // the form still has its old/default "15 minutes before" reminder.  That
      // requested reminder is already in the past, so iOS correctly refuses it.
      // Keep the user's event useful by falling back to the event time itself.
      const at = requestedAt.getTime() > now.getTime() + 5_000 ? requestedAt : when;
      let id = notifId(ev, i);
      while (used.has(id)) id = id + 1 > EVENT_ID_MAX ? EVENT_ID_MIN : id + 1;
      used.add(id);
      items.push({
        id,
        title: ev.title,
        body:
          ev.notes ||
          (lang === "ar" ? `موعدك الساعة ${ev.time}` : `Your event at ${ev.time}`),
        at,
        sound: reminderSoundFile(ev.sound),
        extra: { route: `/calendar?event=${ev.id}` },
      });
      cursor = new Date(when.getTime() + 60_000);
    }
  }

  return scheduleGroup("calendar", items);
}
