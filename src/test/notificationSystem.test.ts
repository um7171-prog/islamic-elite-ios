import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The platform is "native iOS"; iOS itself is replaced by a faithful in-memory notification centre
// behind the real @capacitor/local-notifications API. This proves the app's scheduling logic
// (request / replace / cancel / verify / permission handling). It does NOT prove that a physical
// iPhone delivers anything: see docs/DEVICE_TEST_PLAN_AR.md.
let native = true;
vi.mock("@/lib/platform", () => ({
  isNativeApp: () => native,
  isIOSNativeApp: () => native,
  openNativeAppSettings: async () => undefined,
}));
vi.mock("@capacitor/local-notifications", async () => {
  const m = await import("./fakeIosNotificationCenter");
  return { LocalNotifications: m.fakeLocalNotifications };
});

import { center, pendingIn, resetCenter } from "./fakeIosNotificationCenter";
import {
  NOTIFICATION_RANGES,
  cancelGroup,
  pendingIds,
  prepareItems,
  replaceGroup,
  type ScheduleItemInput,
} from "@/lib/notifications/NotificationScheduler";
import { getPermissionStatus, mapDisplay, requestPermission } from "@/lib/notifications/NotificationPermissionService";
import { buildPrayerItems, syncPrayerNotifications, PRAYER_ROLLING_DAYS } from "@/lib/notifications/PrayerNotificationService";
import { DEFAULT_PRAYER_NOTIFICATION_SETTINGS, type PrayerNotificationSettings } from "@/lib/notifications/NotificationSettings";
import { buildAppointmentItems, syncAppointmentNotifications } from "@/lib/notifications/AppointmentNotificationService";
import { syncAthkarReminders, DEFAULT_ATHKAR_SETTINGS } from "@/lib/athkarReminders";
import { setCalendarNotificationsEnabled, type CalEvent } from "@/lib/events";
import { adhanElapsedLabel, getAdhanElapsed, type PrayerTimeEntry } from "@/lib/notifications/AdhanElapsed";

const BURAYDAH = { lat: 26.33, lng: 43.97 };
const CAIRO = { lat: 30.04, lng: 31.24 };
const settings = (over: Partial<PrayerNotificationSettings> = {}): PrayerNotificationSettings => ({
  ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS,
  ...over,
  perPrayerEnabled: { ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS.perPrayerEnabled, ...(over.perPrayerEnabled || {}) },
});
const prayerInput = (o: { c?: { lat: number; lng: number }; madhab?: "hanbali" | "hanafi"; s?: PrayerNotificationSettings } = {}) => ({
  ...(o.c ?? BURAYDAH),
  madhab: o.madhab ?? ("hanbali" as const),
  settings: o.s ?? settings(),
  lang: "en" as const,
});
const item = (over: Partial<ScheduleItemInput> & { id: number }): ScheduleItemInput => ({
  title: `n${over.id}`, body: "", at: new Date(Date.now() + 3600_000), sound: "default", ...over,
});
const mk = (id: string, date: string, time: string, remind: number | null = 10, extra: Partial<CalEvent> = {}): CalEvent =>
  ({ id, title: `Event ${id}`, date, time, repeat: "none", remindMinutesBefore: remind, sound: "notif_chime", createdAt: 1, ...extra }) as unknown as CalEvent;

beforeEach(() => {
  native = true;
  resetCenter();
  localStorage.clear();
  vi.useFakeTimers();
  // 03:30 Riyadh on 2026-09-20: every prayer of that day is still ahead.
  vi.setSystemTime(new Date("2026-09-20T00:30:00Z"));
});
afterEach(() => vi.useRealTimers());

/* ---------------------------------------------------------------- permission */
describe("NotificationPermissionService", () => {
  it("maps iOS answers to the four states", () => {
    expect(mapDisplay("granted")).toBe("granted");
    expect(mapDisplay("denied")).toBe("denied");
    expect(mapDisplay("prompt")).toBe("notDetermined");
    expect(mapDisplay("prompt-with-rationale")).toBe("notDetermined");
    expect(mapDisplay("something-new")).toBe("unknown");
  });

  it("reading the status never shows the system dialog", async () => {
    center.permission = "prompt";
    expect(await getPermissionStatus()).toBe("notDetermined");
    expect(center.calls.some((c) => c.op === "requestPermissions")).toBe(false);
  });

  it("first request: shows the system dialog once and returns the user's real answer", async () => {
    center.permission = "prompt";
    center.promptAnswer = "granted";
    expect(await requestPermission()).toBe("granted");
    expect(center.calls.filter((c) => c.op === "requestPermissions")).toHaveLength(1);
  });

  it("the user says no: the status is denied", async () => {
    center.permission = "prompt";
    center.promptAnswer = "denied";
    expect(await requestPermission()).toBe("denied");
    expect(await getPermissionStatus()).toBe("denied");
  });

  it("after an answer the dialog is never forced again (denied stays denied, no second prompt)", async () => {
    center.permission = "denied";
    expect(await requestPermission()).toBe("denied");
    expect(await requestPermission()).toBe("denied");
    expect(center.calls.some((c) => c.op === "requestPermissions")).toBe(false);
  });

  it("already granted: no dialog", async () => {
    center.permission = "granted";
    expect(await requestPermission()).toBe("granted");
    expect(center.calls.some((c) => c.op === "requestPermissions")).toBe(false);
  });

  it("an unreadable plugin reports unknown, never a guess", async () => {
    center.failPermissionRead = true;
    expect(await getPermissionStatus()).toBe("unknown");
    expect(await requestPermission()).toBe("unknown");
  });

  it("in a browser there is no OS permission: notDetermined, and nothing is asked", async () => {
    native = false;
    expect(await getPermissionStatus()).toBe("notDetermined");
    expect(await requestPermission()).toBe("notDetermined");
    expect(center.calls).toHaveLength(0);
  });

  it("re-reading after the user changed it in iOS Settings gives the new state", async () => {
    center.permission = "denied";
    expect(await getPermissionStatus()).toBe("denied");
    center.permission = "granted"; // user turned notifications on in Settings and came back
    expect(await getPermissionStatus()).toBe("granted");
  });
});

/* ---------------------------------------------------------------- scheduler */
describe("NotificationScheduler", () => {
  it("id ranges are disjoint and the caps fit under iOS's 64 pending limit", () => {
    const g = Object.values(NOTIFICATION_RANGES);
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) expect(g[i].max < g[j].min || g[i].min > g[j].max).toBe(true);
    expect(g.reduce((s, r) => s + r.cap, 0)).toBeLessThanOrEqual(64);
  });

  it("schedules future items and reports what iOS actually holds", async () => {
    const r = await replaceGroup("calendar", [item({ id: 43001 }), item({ id: 43002 })]);
    expect(r.scheduled).toBe(2);
    expect(r.verifiedIds).toEqual([43001, 43002]);
    expect(pendingIn(43000, 43999)).toHaveLength(2);
  });

  it("uses the bundled sound only when it is a real file name (default -> system sound)", async () => {
    await replaceGroup("calendar", [item({ id: 43001, sound: "notif_chime.caf" }), item({ id: 43002, sound: "default" })]);
    const p = pendingIn(43000, 43999);
    expect(p.find((n) => n.id === 43001)!.sound).toBe("notif_chime.caf");
    expect(p.find((n) => n.id === 43002)!.sound).toBeUndefined();
  });

  it("REPLACE: an id that is no longer wanted is cancelled, the rest stay, new ones are added", async () => {
    await replaceGroup("calendar", [item({ id: 43001 }), item({ id: 43002 })]);
    await replaceGroup("calendar", [item({ id: 43002 }), item({ id: 43003 })]);
    expect(pendingIn(43000, 43999).map((n) => n.id)).toEqual([43002, 43003]);
    expect(center.calls.some((c) => c.op === "cancel" && c.ids!.includes(43001))).toBe(true);
  });

  it("the same id is replaced (new time), never duplicated", async () => {
    const t1 = new Date(Date.now() + 3600_000);
    const t2 = new Date(Date.now() + 7200_000);
    await replaceGroup("calendar", [item({ id: 43001, at: t1 })]);
    await replaceGroup("calendar", [item({ id: 43001, at: t2 })]);
    const p = pendingIn(43000, 43999);
    expect(p).toHaveLength(1);
    expect(p[0].at.getTime()).toBe(t2.getTime());
  });

  it("cancelGroup removes every notification of that group and only that group", async () => {
    await replaceGroup("calendar", [item({ id: 43001 })]);
    await replaceGroup("athkar", [item({ id: 42001 })]);
    await cancelGroup("calendar");
    expect(pendingIn(43000, 43999)).toHaveLength(0);
    expect(pendingIn(42000, 42999)).toHaveLength(1);
  });

  it("a group never touches another group's notifications, even with a foreign id in the list", async () => {
    await replaceGroup("prayer", [item({ id: 41001 })]);
    await replaceGroup("calendar", [item({ id: 43001 }), item({ id: 41005 })]); // 41005 is not a calendar id
    expect(pendingIn(41000, 41999).map((n) => n.id)).toEqual([41001]);
    expect(pendingIn(43000, 43999).map((n) => n.id)).toEqual([43001]);
  });

  it("items in the past (or within 5 s) are dropped, never sent", async () => {
    const r = await replaceGroup("calendar", [item({ id: 43001, at: new Date(Date.now() - 1000) }), item({ id: 43002, at: new Date(Date.now() + 2000) }), item({ id: 43003 })]);
    expect(r.verifiedIds).toEqual([43003]);
    expect(center.pending.size).toBe(1);
  });

  it("when a group exceeds its cap the SOONEST items are kept", () => {
    const cap = NOTIFICATION_RANGES.calendar.cap;
    const items = Array.from({ length: cap + 5 }, (_, i) => item({ id: 43000 + i, at: new Date(Date.now() + (100 - i) * 60_000) }));
    const kept = prepareItems("calendar", items);
    expect(kept).toHaveLength(cap);
    const latestKept = Math.max(...kept.map((k) => k.at.getTime()));
    expect(items.filter((it) => !kept.includes(it)).every((d) => d.at.getTime() > latestKept)).toBe(true);
  });

  it("does NOT trust schedule(): if iOS refuses an id the result says so", async () => {
    center.refuseIds.add(43002);
    const r = await replaceGroup("calendar", [item({ id: 43001 }), item({ id: 43002 })]);
    expect(r.verifiedIds).toEqual([43001]);
    expect(r.scheduled).toBe(1);
    expect(r.errors.join(" ")).toMatch(/43002/);
  });

  it("a failing plugin call is reported as an error, not as success", async () => {
    center.failSchedule = true;
    const r = await replaceGroup("calendar", [item({ id: 43001 })]);
    expect(r.scheduled).toBe(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("permission denied: nothing is scheduled and the reason is reported", async () => {
    center.permission = "denied";
    const r = await replaceGroup("calendar", [item({ id: 43001 })]);
    expect(r).toMatchObject({ scheduled: 0, reason: "permission-denied" });
    expect(center.calls.some((c) => c.op === "schedule")).toBe(false);
  });

  it("not determined yet: nothing is scheduled (the prompt is the permission service's job)", async () => {
    center.permission = "prompt";
    const r = await replaceGroup("calendar", [item({ id: 43001 })]);
    expect(r.reason).toBe("permission-denied");
    expect(center.pending.size).toBe(0);
  });

  it("browser: nothing is scheduled; the dry run (test only) records the request and never claims delivery", async () => {
    native = false;
    localStorage.setItem("elite.debug.notifications", "1");
    const r = await replaceGroup("calendar", [item({ id: 43001 })]);
    expect(r).toMatchObject({ scheduled: 0, reason: "not-native" });
    expect(center.calls).toHaveLength(0);
    const log = (window as unknown as { __eliteNotifLog: { group: string; items: unknown[] }[] }).__eliteNotifLog;
    expect(log.at(-1)).toMatchObject({ group: "calendar" });
  });

  it("concurrent rebuilds are serialised (no interleaving, the last request wins)", async () => {
    const a = replaceGroup("calendar", [item({ id: 43001 }), item({ id: 43002 })]);
    const b = replaceGroup("calendar", [item({ id: 43003 })]);
    await Promise.all([a, b]);
    expect(pendingIn(43000, 43999).map((n) => n.id)).toEqual([43003]);
  });

  it("pendingIds reads the real pending list for a group", async () => {
    await replaceGroup("calendar", [item({ id: 43001 })]);
    await replaceGroup("athkar", [item({ id: 42001 })]);
    expect(await pendingIds("calendar")).toEqual([43001]);
  });
});

/* ---------------------------------------------------------------- prayers */
describe("PrayerNotificationService", () => {
  const prayerOf = (i: ScheduleItemInput) => (i.extra as { prayer: string }).prayer;
  const kindOf = (i: ScheduleItemInput) => (i.extra as { kind: string }).kind;

  it("only the five prayers, never sunrise", () => {
    const items = buildPrayerItems(prayerInput());
    expect(new Set(items.map(prayerOf))).toEqual(new Set(["fajr", "dhuhr", "asr", "maghrib", "isha"]));
    expect(items.some((i) => prayerOf(i) === "sunrise")).toBe(false);
  });

  it("covers the rolling days with an athan and a pre-reminder per prayer", () => {
    const items = buildPrayerItems(prayerInput());
    expect(items.filter((i) => kindOf(i) === "athan")).toHaveLength(5 * PRAYER_ROLLING_DAYS);
    expect(items.filter((i) => kindOf(i) === "pre-reminder")).toHaveLength(5 * PRAYER_ROLLING_DAYS);
  });

  it("ids are unique and inside the prayer range", () => {
    const ids = buildPrayerItems(prayerInput()).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => { expect(id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.prayer.min); expect(id).toBeLessThanOrEqual(NOTIFICATION_RANGES.prayer.max); });
  });

  it("uses the app's prayer-time source: a different city gives different times", () => {
    const a = buildPrayerItems(prayerInput()).find((i) => prayerOf(i) === "fajr" && kindOf(i) === "athan")!;
    const b = buildPrayerItems(prayerInput({ c: CAIRO })).find((i) => prayerOf(i) === "fajr" && kindOf(i) === "athan")!;
    expect(a.at.getTime()).not.toBe(b.at.getTime());
  });

  it("the madhab moves Asr (Hanafi is later) and nothing else", () => {
    const at = (m: "hanbali" | "hanafi", p: string) => buildPrayerItems(prayerInput({ madhab: m })).find((i) => prayerOf(i) === p && kindOf(i) === "athan" && i.id < NOTIFICATION_RANGES.prayer.min + 10)!.at.getTime();
    expect(at("hanafi", "asr")).toBeGreaterThan(at("hanbali", "asr"));
    expect(at("hanafi", "fajr")).toBe(at("hanbali", "fajr"));
  });

  it("every prayer alert is at its prayer time; the reminder is N minutes earlier — with its OWN (pre-prayer) sound, not the athan's", () => {
    const items = buildPrayerItems(prayerInput({ s: settings({ preReminderMinutes: 15 }) }));
    const base = NOTIFICATION_RANGES.prayer.min;
    const athan = items.find((i) => i.id === base + 2)!; // day 0, dhuhr
    const rem = items.find((i) => i.id === base + 3)!;
    expect((athan.at.getTime() - rem.at.getTime()) / 60_000).toBe(15);
    expect(rem.sound).not.toBe(athan.sound);
    expect(rem.sound).toBe("pre_athan_alert.caf");
  });

  it("turning the reminder off removes every reminder; disabling a prayer removes all of it", () => {
    expect(buildPrayerItems(prayerInput({ s: settings({ preReminderEnabled: false }) })).some((i) => kindOf(i) === "pre-reminder")).toBe(false);
    const items = buildPrayerItems(prayerInput({ s: settings({ perPrayerEnabled: { ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS.perPrayerEnabled, asr: false } }) }));
    expect(items.some((i) => prayerOf(i) === "asr")).toBe(false);
  });

  it("date transition: a later 'now' moves the whole window (yesterday's prayers are never scheduled)", () => {
    const a = buildPrayerItems(prayerInput());
    const b = buildPrayerItems({ ...prayerInput(), now: new Date("2026-09-21T00:30:00Z") });
    expect(Math.min(...b.map((i) => i.at.getTime()))).toBeGreaterThan(Math.min(...a.map((i) => i.at.getTime())));
  });

  it("no valid location -> nothing is invented", () => {
    expect(buildPrayerItems({ ...prayerInput(), lat: 0, lng: 0 })).toEqual([]);
    expect(buildPrayerItems({ ...prayerInput(), lat: NaN, lng: 1 })).toEqual([]);
  });

  it("sync: iOS ends up holding exactly the future prayer items, with sounds and the tap route", async () => {
    const r = await syncPrayerNotifications(prayerInput());
    const held = pendingIn(NOTIFICATION_RANGES.prayer.min, NOTIFICATION_RANGES.prayer.max);
    expect(r.scheduled).toBe(held.length);
    expect(held.length).toBeGreaterThan(0);
    expect(held.length).toBeLessThanOrEqual(NOTIFICATION_RANGES.prayer.cap);
    expect(held.every((n) => (n.extra as { route: string }).route === "/")).toBe(true);
  });

  it("changing the city REPLACES: same ids, new times, no leftovers", async () => {
    await syncPrayerNotifications(prayerInput());
    const before = pendingIn(NOTIFICATION_RANGES.prayer.min, NOTIFICATION_RANGES.prayer.max);
    await syncPrayerNotifications(prayerInput({ c: CAIRO }));
    const after = pendingIn(NOTIFICATION_RANGES.prayer.min, NOTIFICATION_RANGES.prayer.max);
    expect(after.map((n) => n.id)).toEqual(before.map((n) => n.id));
    expect(after.some((n, i) => n.at.getTime() !== before[i].at.getTime())).toBe(true);
  });

  it("changing the reminder minutes replaces the times (an old 10-minute reminder does not linger)", async () => {
    await syncPrayerNotifications(prayerInput({ s: settings({ preReminderMinutes: 10 }) }));
    await syncPrayerNotifications(prayerInput({ s: settings({ preReminderMinutes: 5 }) }));
    const held = pendingIn(NOTIFICATION_RANGES.prayer.min, NOTIFICATION_RANGES.prayer.max);
    const base = NOTIFICATION_RANGES.prayer.min;
    const athan = held.find((n) => n.id === base + 20)!; // day 2, fajr
    const rem = held.find((n) => n.id === base + 21)!;
    expect((athan.at.getTime() - rem.at.getTime()) / 60_000).toBe(5);
  });

  it("everything switched off cancels the group", async () => {
    await syncPrayerNotifications(prayerInput());
    const off = Object.fromEntries(["fajr", "dhuhr", "asr", "maghrib", "isha"].map((k) => [k, false])) as PrayerNotificationSettings["perPrayerEnabled"];
    await syncPrayerNotifications(prayerInput({ s: settings({ perPrayerEnabled: off }) }));
    expect(pendingIn(NOTIFICATION_RANGES.prayer.min, NOTIFICATION_RANGES.prayer.max)).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- appointments */
describe("AppointmentNotificationService", () => {
  const cal = () => pendingIn(NOTIFICATION_RANGES.calendar.min, NOTIFICATION_RANGES.calendar.max);
  const byTitle = (t: string) => cal().find((n) => n.title === t);

  it("create -> schedule: at (time - reminder) in the device's local time zone, inside the calendar range", async () => {
    await syncAppointmentNotifications([mk("a", "2026-09-25", "10:00", 10)], "en");
    const n = byTitle("Event a")!;
    expect(n.at.getTime()).toBe(new Date(2026, 8, 25, 9, 50).getTime());
    expect(n.id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.calendar.min);
    expect(n.id).toBeLessThanOrEqual(NOTIFICATION_RANGES.calendar.max);
    expect((n.extra as { route: string }).route).toBe("/calendar?event=a");
  });

  it("edit -> the old notification is cancelled and the new one scheduled; the other appointment is untouched", async () => {
    const A = mk("a", "2026-09-25", "10:00");
    const B = mk("b", "2026-09-26", "18:30");
    await syncAppointmentNotifications([A, B], "en");
    const a1 = byTitle("Event a")!, b1 = byTitle("Event b")!;
    expect(a1.id).not.toBe(b1.id);

    await syncAppointmentNotifications([{ ...A, time: "11:15" }, B], "en");
    expect(cal()).toHaveLength(2); // no duplicate of A
    expect(byTitle("Event a")!.at.getTime()).toBe(new Date(2026, 8, 25, 11, 5).getTime());
    expect(byTitle("Event b")).toEqual(b1);
  });

  it("delete -> its notification is cancelled, the other stays", async () => {
    const A = mk("a", "2026-09-25", "10:00");
    const B = mk("b", "2026-09-26", "18:30");
    await syncAppointmentNotifications([A, B], "en");
    await syncAppointmentNotifications([B], "en");
    expect(cal().map((n) => n.title)).toEqual(["Event b"]);
    await syncAppointmentNotifications([], "en");
    expect(cal()).toHaveLength(0);
  });

  it("restart: rebuilding from what was saved gives the same notifications (nothing is lost or duplicated)", async () => {
    const list = [mk("a", "2026-09-25", "10:00"), mk("b", "2026-09-26", "18:30")];
    await syncAppointmentNotifications(list, "en");
    const before = cal().map((n) => [n.id, n.at.getTime()]);
    await syncAppointmentNotifications(JSON.parse(JSON.stringify(list)), "en"); // app relaunched, loaded from storage
    expect(cal().map((n) => [n.id, n.at.getTime()])).toEqual(before);
  });

  it("multiple appointments: unique ids; changing one does not change the others", () => {
    const list = Array.from({ length: 8 }, (_, i) => mk(`ev-${i}`, "2026-09-25", `${10 + i}:00`));
    const ids = buildAppointmentItems(list, "en").map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const changed = buildAppointmentItems(list.map((e, i) => (i === 3 ? { ...e, time: "20:00" } : e)), "en");
    const base = buildAppointmentItems(list, "en");
    base.forEach((b, i) => { if (i !== 3) expect(changed[i]).toEqual(b); });
  });

  it("colliding hash ids are separated inside the list (ids stay unique and in range)", () => {
    // 2000 appointments cannot all fit; a modest batch with the same hash space must still be unique
    const list = Array.from({ length: 30 }, (_, i) => mk(`same-hash-${i}`, "2026-09-25", "12:00"));
    const ids = buildAppointmentItems(list, "en").map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => { expect(id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.calendar.min); expect(id).toBeLessThanOrEqual(NOTIFICATION_RANGES.calendar.max); });
  });

  it("an appointment with no reminder schedules nothing; a past one is never sent", async () => {
    await syncAppointmentNotifications([mk("n", "2026-09-25", "10:00", null), mk("p", "2026-09-19", "10:00")], "en");
    expect(cal()).toHaveLength(0);
  });

  it("reminder time already passed -> falls back to the appointment time instead of vanishing", async () => {
    // now is 03:30 Riyadh (UTC+3) = 00:30Z; the appointment is 1 hour ahead with a 2-hour reminder
    const soon = new Date(Date.now() + 3600_000);
    const t = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;
    const date = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    await syncAppointmentNotifications([mk("s", date, t, 120)], "en");
    expect(cal()).toHaveLength(1);
    expect(cal()[0].at.getTime()).toBeGreaterThan(Date.now());
  });

  it("repeating appointments schedule several distinct occurrences", () => {
    const items = buildAppointmentItems([mk("d", "2026-09-21", "09:00", 10, { repeat: "daily" })], "en");
    expect(items.length).toBe(3);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
  });

  it("the master switch off clears every appointment notification (the appointments themselves are kept)", async () => {
    await syncAppointmentNotifications([mk("a", "2026-09-25", "10:00")], "en");
    expect(cal()).toHaveLength(1);
    setCalendarNotificationsEnabled(false);
    await syncAppointmentNotifications([mk("a", "2026-09-25", "10:00")], "en");
    expect(cal()).toHaveLength(0);
    setCalendarNotificationsEnabled(true);
  });

  it("permission denied: no appointment notification is claimed", async () => {
    center.permission = "denied";
    const r = await syncAppointmentNotifications([mk("a", "2026-09-25", "10:00")], "en");
    expect(r.reason).toBe("permission-denied");
    expect(cal()).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- athkar */
describe("Athkar reminders use the same scheduler", () => {
  it("own range, replace semantics", async () => {
    const day = (n: number) => ({ sunrise: new Date(Date.now() + (n + 1) * 86_400_000), maghrib: new Date(Date.now() + (n + 1) * 86_400_000 + 12 * 3600_000) });
    await syncAthkarReminders({ ...DEFAULT_ATHKAR_SETTINGS }, [day(0), day(1), day(2)], "en");
    const held = pendingIn(NOTIFICATION_RANGES.athkar.min, NOTIFICATION_RANGES.athkar.max);
    expect(held).toHaveLength(6);
    await syncAthkarReminders({ ...DEFAULT_ATHKAR_SETTINGS, morningEnabled: false }, [day(0), day(1), day(2)], "en");
    expect(pendingIn(NOTIFICATION_RANGES.athkar.min, NOTIFICATION_RANGES.athkar.max)).toHaveLength(3);
  });
});

/* ---------------------------------------------------------------- الأذان منذ */
describe("Adhan elapsed (الأذان منذ)", () => {
  const T = new Date("2026-09-20T12:00:00Z");
  const entries: PrayerTimeEntry[] = [
    { key: "fajr", time: new Date("2026-09-20T02:00:00Z") },
    { key: "sunrise", time: new Date("2026-09-20T03:20:00Z") },
    { key: "dhuhr", time: T },
    { key: "asr", time: new Date("2026-09-20T15:20:00Z") },
  ];
  const at = (sec: number) => new Date(T.getTime() + sec * 1000);

  it("the exact minute the adhan enters: الأذان الآن", () => {
    const e = getAdhanElapsed(at(0), entries)!;
    expect(e).toEqual({ prayer: "dhuhr", minutes: 0 });
    expect(adhanElapsedLabel(e.minutes, "ar")).toBe("الأذان الآن");
    expect(adhanElapsedLabel(getAdhanElapsed(at(59), entries)!.minutes, "ar")).toBe("الأذان الآن");
  });

  it("الأذان منذ دقيقة / دقيقتين / 3 دقائق … with correct Arabic dual and plural forms", () => {
    const label = (m: number) => adhanElapsedLabel(getAdhanElapsed(at(m * 60 + 5), entries)!.minutes, "ar");
    expect(label(1)).toBe("الأذان منذ دقيقة");
    expect(label(2)).toBe("الأذان منذ دقيقتين");
    expect(label(3)).toBe("الأذان منذ 3 دقائق");
    expect(label(10)).toBe("الأذان منذ 10 دقائق");
    expect(label(11)).toBe("الأذان منذ 11 دقيقة");
    expect(label(29)).toBe("الأذان منذ 29 دقيقة");
  });

  it("English labels", () => {
    expect(adhanElapsedLabel(0, "en")).toBe("Adhan now");
    expect(adhanElapsedLabel(1, "en")).toBe("Adhan 1 min ago");
    expect(adhanElapsedLabel(7, "en")).toBe("Adhan 7 min ago");
  });

  it("computed from the current time and the real prayer time: coming back from the background after 17 minutes shows 17 immediately", () => {
    // no ticks happened in between; only "now" matters
    expect(getAdhanElapsed(at(17 * 60 + 20), entries)).toEqual({ prayer: "dhuhr", minutes: 17 });
  });

  it("before the prayer time nothing is shown; after the 30-minute window nothing is shown", () => {
    expect(getAdhanElapsed(at(-1), entries)).toBeNull();
    expect(getAdhanElapsed(at(30 * 60), entries)).toBeNull();
    expect(getAdhanElapsed(at(30 * 60 - 1), entries)!.minutes).toBe(29);
  });

  it("sunrise is not a prayer and never shows الأذان", () => {
    expect(getAdhanElapsed(new Date("2026-09-20T03:25:00Z"), entries)).toBeNull();
  });

  it("date transition: the previous day's Isha is still shown just after midnight, then not", () => {
    const isha = new Date("2026-09-19T20:55:00Z");
    const e: PrayerTimeEntry[] = [{ key: "isha", time: isha }, { key: "fajr", time: new Date("2026-09-20T02:00:00Z") }];
    expect(getAdhanElapsed(new Date("2026-09-19T21:10:00Z"), e)).toEqual({ prayer: "isha", minutes: 15 });
    expect(getAdhanElapsed(new Date("2026-09-19T22:00:00Z"), e)).toBeNull();
  });

  it("independent of notifications: works with permission denied and nothing scheduled", () => {
    center.permission = "denied";
    expect(getAdhanElapsed(at(4 * 60), entries)).toEqual({ prayer: "dhuhr", minutes: 4 });
    expect(center.pending.size).toBe(0);
  });

  it("when two prayers are inside the window the most recent one wins", () => {
    const e: PrayerTimeEntry[] = [{ key: "dhuhr", time: new Date(T.getTime() - 20 * 60_000) }, { key: "asr", time: new Date(T.getTime() - 5 * 60_000) }];
    expect(getAdhanElapsed(T, e)).toEqual({ prayer: "asr", minutes: 5 });
  });
});

/* ---------------------------------------------------------------- pre-prayer vs athan sound */
describe("PRE-PRAYER (أستغفر الله) is never mixed with PRAYER TIME (athan)", () => {
  it("the athan item and the pre-reminder item use different sound files", () => {
    const items = buildPrayerItems(prayerInput({ s: settings({ preReminderEnabled: true, preReminderMinutes: 10 }) }));
    const athan = items.find((i) => (i.extra as { kind: string }).kind === "athan")!;
    const pre = items.find((i) => (i.extra as { kind: string }).kind === "pre-reminder")!;
    expect(athan.sound).not.toBe(pre.sound);
    expect(pre.sound).toBe("pre_athan_alert.caf");
    expect(athan.sound).toMatch(/^athan_/);
  });

  it("the pre-reminder body says Astaghfirullah / أستغفر الله, never the athan phrase", () => {
    const ar = buildPrayerItems({ ...prayerInput({ s: settings({ preReminderEnabled: true }) }), lang: "ar" });
    const en = buildPrayerItems({ ...prayerInput({ s: settings({ preReminderEnabled: true }) }), lang: "en" });
    const preAr = ar.filter((i) => (i.extra as { kind: string }).kind === "pre-reminder");
    const preEn = en.filter((i) => (i.extra as { kind: string }).kind === "pre-reminder");
    expect(preAr.length).toBeGreaterThan(0);
    expect(preEn.length).toBeGreaterThan(0);
    preAr.forEach((i) => expect(i.body).toMatch(/أستغفر الله/));
    preEn.forEach((i) => expect(i.body).toMatch(/Astaghfirullah/i));
    preAr.forEach((i) => expect(i.body).not.toMatch(/حيّ على الصلاة/));
  });

  it("the athan item carries its sound id in extra, for in-app full playback", () => {
    const items = buildPrayerItems(prayerInput({ s: settings({ soundFajr: "fajr", soundOther: "madinah" }) }));
    const fajrAthan = items.find((i) => (i.extra as { kind: string; prayer: string }).kind === "athan" && (i.extra as { prayer: string }).prayer === "fajr")!;
    const dhuhrAthan = items.find((i) => (i.extra as { kind: string; prayer: string }).kind === "athan" && (i.extra as { prayer: string }).prayer === "dhuhr")!;
    expect((fajrAthan.extra as { sound: string }).sound).toBe("fajr");
    expect((dhuhrAthan.extra as { sound: string }).sound).toBe("madinah");
  });
});
