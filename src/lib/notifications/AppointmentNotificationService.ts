import { isCalendarNotificationsEnabled, nextOccurrence, type CalEvent } from "@/lib/events";
import { NOTIFICATION_RANGES, replaceGroup, type ScheduleItemInput } from "./NotificationScheduler";
import { reminderNativeSound } from "./NotificationSounds";

/**
 * AppointmentNotificationService: appointments -> NotificationScheduler -> iOS local notifications.
 *
 * The group is rebuilt from the saved appointments each time, which gives the required lifecycle:
 *   create  -> its notification is scheduled
 *   edit    -> the old notification is cancelled (its id is gone from the new list) and the new one scheduled
 *   delete  -> its notification is cancelled
 * Other appointments are untouched by a change to one of them (same id, same time -> replaced by
 * an identical request). Times are computed in the device's local time zone.
 */
const ID_MIN = NOTIFICATION_RANGES.calendar.min;
const ID_MAX = NOTIFICATION_RANGES.calendar.max;
const ID_SPAN = ID_MAX - ID_MIN + 1;

/** Stable per-appointment id inside the calendar range (a hash of the appointment id). */
export function appointmentNotificationId(ev: Pick<CalEvent, "id">, occurrence = 0): number {
  let h = 0;
  for (let i = 0; i < ev.id.length; i++) h = (h * 31 + ev.id.charCodeAt(i)) % ID_SPAN;
  return ID_MIN + ((h + occurrence * 3) % ID_SPAN);
}

/** Pure: appointments -> notification requests. Ids are unique within the list. */
export function buildAppointmentItems(events: CalEvent[], lang: "ar" | "en", now = new Date()): ScheduleItemInput[] {
  const items: ScheduleItemInput[] = [];
  const used = new Set<number>();

  for (const ev of events) {
    if (ev.remindMinutesBefore === null) continue;
    let cursor = now;
    const count = ev.repeat === "none" ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const when = nextOccurrence(ev, cursor);
      if (!when) break;
      const requestedAt = new Date(when.getTime() - (ev.remindMinutesBefore ?? 0) * 60_000);
      // "Two minutes from now" with a 15-minute reminder: the reminder time is already past, so
      // fall back to the appointment time itself instead of silently dropping the notification.
      const at = requestedAt.getTime() > now.getTime() + 5_000 ? requestedAt : when;
      let id = appointmentNotificationId(ev, i);
      while (used.has(id)) id = id + 1 > ID_MAX ? ID_MIN : id + 1;
      used.add(id);
      items.push({
        id,
        title: ev.title,
        body: ev.notes || (lang === "ar" ? `موعدك الساعة ${ev.time}` : `Your event at ${ev.time}`),
        at,
        sound: reminderNativeSound(ev.sound ?? "notif_chime"),
        extra: { route: `/calendar?event=${ev.id}` },
      });
      cursor = new Date(when.getTime() + 60_000);
    }
  }
  return items;
}

/** Rebuilds the appointment group. With appointment reminders switched off it cancels them all. */
export function syncAppointmentNotifications(events: CalEvent[], lang: "ar" | "en") {
  if (!isCalendarNotificationsEnabled()) return replaceGroup("calendar", []);
  return replaceGroup("calendar", buildAppointmentItems(events, lang));
}
