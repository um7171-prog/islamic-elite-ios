import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Native bridge + platform are mocked so the *real* scheduling pipeline
// (builder -> scheduleGroup -> plugin call) runs and we can inspect exactly what
// would be handed to iOS. Nothing here proves iOS accepted it (that needs a
// device), but it does prove what the JS layer asks iOS to schedule/cancel.
const scheduleCalls: { minId: number; maxId: number; items: { id: number; atMs: number; title: string }[] }[] = [];
vi.mock("@/lib/platform", () => ({ isNativeApp: () => true, isIOSNativeApp: () => true }));
vi.mock("@/lib/notifications/permission", () => ({ checkPermissionStatus: async () => "granted" }));
vi.mock("@/lib/notifications/plugin", () => ({
  pluginScheduleGroup: async (minId: number, maxId: number, items: { id: number; atMs: number; title: string }[]) => {
    scheduleCalls.push({ minId, maxId, items });
    return { acceptedIds: items.map((i) => i.id), verifiedIds: items.map((i) => i.id), errors: [] };
  },
  pluginPendingGroup: async () => [],
  pluginCancelGroup: async () => undefined,
  pluginEnsurePermission: async () => ({ granted: true, status: "granted" }),
}));

import { NOTIFICATION_RANGES } from "@/lib/notifications/ranges";
import { buildPrayerScheduleItems, schedulePrayerNotifications } from "@/lib/notifications/prayerSchedule";
import { DEFAULT_PRAYER_NOTIFICATION_SETTINGS, type PrayerNotificationSettings } from "@/lib/notifications/settings";
import { syncAthkarReminders, DEFAULT_ATHKAR_SETTINGS } from "@/lib/athkarReminders";
import { syncEventNotifications, setCalendarNotificationsEnabled, type CalEvent } from "@/lib/events";
import { scheduleGroup } from "@/lib/notifications/scheduler";

const BURAYDAH = { lat: 26.33, lng: 43.97 };
const CAIRO = { lat: 30.04, lng: 31.24 };
const base = (over: Partial<PrayerNotificationSettings> = {}): PrayerNotificationSettings => ({
  ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS,
  ...over,
  perPrayerEnabled: { ...DEFAULT_PRAYER_NOTIFICATION_SETTINGS.perPrayerEnabled, ...(over.perPrayerEnabled || {}) },
});
type Opts = { c?: { lat: number; lng: number }; madhab?: "hanbali" | "hanafi"; s?: PrayerNotificationSettings };
const build = (o: Opts = {}) =>
  buildPrayerScheduleItems({ ...(o.c ?? BURAYDAH), madhab: o.madhab ?? "hanbali", settings: o.s ?? base(), lang: "en" });
const prayerOf = (i: { extra?: Record<string, unknown> }) => (i.extra as { prayer: string }).prayer;
const kindOf = (i: { extra?: Record<string, unknown> }) => (i.extra as { kind: string }).kind;

beforeEach(() => {
  scheduleCalls.length = 0;
  vi.useFakeTimers();
  // 03:30 Riyadh: every prayer today is still ahead.
  vi.setSystemTime(new Date("2026-09-20T00:30:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("notification id ranges", () => {
  it("are disjoint and the caps fit under the iOS 64-pending limit", () => {
    const r = Object.values(NOTIFICATION_RANGES).sort((a, b) => a.min - b.min);
    for (let i = 1; i < r.length; i++) expect(r[i].min).toBeGreaterThan(r[i - 1].max);
    expect(Object.values(NOTIFICATION_RANGES).reduce((n, g) => n + g.cap, 0)).toBeLessThanOrEqual(64);
  });
});

describe("prayer schedule", () => {
  it("only schedules the five prayers, never sunrise", () => {
    const items = build();
    expect(items.every((i) => !/sunrise/i.test(i.title) && prayerOf(i) !== "sunrise")).toBe(true);
    expect(items.length).toBe(3 * 5 * 2); // 3 days x 5 prayers x (athan + reminder)
  });

  it("all ids stay inside the prayer range and are unique", () => {
    const ids = build().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.prayer.min);
      expect(id).toBeLessThanOrEqual(NOTIFICATION_RANGES.prayer.max);
    }
  });

  it("changing the city changes the scheduled times", () => {
    const a = build({ c: BURAYDAH }).map((i) => i.at.getTime());
    const b = build({ c: CAIRO }).map((i) => i.at.getTime());
    expect(a).not.toEqual(b);
  });

  it("changing the madhab moves Asr (Hanafi is later) and nothing else", () => {
    const s = base({ preReminderEnabled: false });
    const at = (m: "hanbali" | "hanafi", p: string) => build({ madhab: m, s }).filter((i) => prayerOf(i) === p)[0].at.getTime();
    expect(at("hanafi", "asr")).toBeGreaterThan(at("hanbali", "asr"));
    expect(at("hanafi", "dhuhr")).toBe(at("hanbali", "dhuhr"));
  });

  it("changing the reminder minutes replaces (same ids, new times) so old reminders do not linger", () => {
    const rem = (m: 5 | 10) => build({ s: base({ preReminderMinutes: m }) }).filter((i) => kindOf(i) === "pre-reminder");
    const a = rem(10);
    const b = rem(5);
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id));
    expect(b[0].at.getTime() - a[0].at.getTime()).toBe(5 * 60_000);
  });

  it("turning the reminder off removes every reminder item", () => {
    const items = build({ s: base({ preReminderEnabled: false }) });
    expect(items.some((i) => kindOf(i) === "pre-reminder")).toBe(false);
    expect(items.length).toBe(15);
  });

  it("disabling a prayer removes all of its items (athan + reminder)", () => {
    const items = build({ s: base({ perPrayerEnabled: { ...base().perPrayerEnabled, asr: false } }) });
    expect(items.some((i) => prayerOf(i) === "asr")).toBe(false);
    expect(items.some((i) => prayerOf(i) === "dhuhr")).toBe(true);
  });

  it("the native call for a rebuild carries the full new list, so stale ids are cleared natively", async () => {
    await schedulePrayerNotifications({ ...BURAYDAH, madhab: "hanbali", settings: base(), lang: "en" });
    const off = base({ perPrayerEnabled: { ...base().perPrayerEnabled, asr: false } });
    await schedulePrayerNotifications({ ...BURAYDAH, madhab: "hanbali", settings: off, lang: "en" });
    const [first, second] = scheduleCalls;
    expect(first.minId).toBe(NOTIFICATION_RANGES.prayer.min);
    expect(first.maxId).toBe(NOTIFICATION_RANGES.prayer.max);
    const removed = first.items.map((i) => i.id).filter((id) => !second.items.some((i) => i.id === id));
    expect(removed.length).toBe(6); // asr: 3 days x (athan + reminder)
  });
});

describe("groups never overlap", () => {
  it("athkar and calendar use their own ranges, distinct from prayer", async () => {
    const day = (n: number) => ({
      sunrise: new Date(Date.now() + (n + 1) * 86_400_000),
      maghrib: new Date(Date.now() + (n + 1) * 86_400_000 + 3600_000 * 12),
    });
    await syncAthkarReminders({ ...DEFAULT_ATHKAR_SETTINGS }, [day(0), day(1), day(2)], "en");
    const ev = { id: "abc", title: "T", date: "2026-09-25", time: "10:00", repeat: "none", remindMinutesBefore: 10, sound: "default", createdAt: 1 } as unknown as CalEvent;
    await syncEventNotifications([ev], "en");
    const athkar = scheduleCalls.find((c) => c.minId === NOTIFICATION_RANGES.athkar.min)!;
    const cal = scheduleCalls.find((c) => c.minId === NOTIFICATION_RANGES.calendar.min)!;
    expect(athkar.items.length).toBe(6);
    expect(cal.items.length).toBe(1);
    for (const i of athkar.items) {
      expect(i.id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.athkar.min);
      expect(i.id).toBeLessThanOrEqual(NOTIFICATION_RANGES.athkar.max);
    }
    for (const i of cal.items) {
      expect(i.id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.calendar.min);
      expect(i.id).toBeLessThanOrEqual(NOTIFICATION_RANGES.calendar.max);
    }
  });

  it("when a group exceeds its cap, the soonest items are kept", async () => {
    const items = Array.from({ length: NOTIFICATION_RANGES.calendar.cap + 5 }, (_, i) => ({
      id: NOTIFICATION_RANGES.calendar.min + i,
      title: `e${i}`,
      body: "",
      sound: "default",
      at: new Date(Date.now() + (100 - i) * 60_000), // later ids are sooner
    }));
    await scheduleGroup("calendar", items);
    const sent = scheduleCalls[0].items;
    expect(sent.length).toBe(NOTIFICATION_RANGES.calendar.cap);
    const latestSent = Math.max(...sent.map((s) => s.atMs));
    const dropped = items.filter((it) => !sent.some((s) => s.id === it.id));
    expect(dropped.every((d) => d.at.getTime() > latestSent)).toBe(true);
  });
});

describe("calendar reminders master switch", () => {
  const ev = { id: "abc", title: "T", date: "2026-09-25", time: "10:00", repeat: "none", remindMinutesBefore: 10, sound: "default", createdAt: 1 } as unknown as CalEvent;

  it("schedules appointment reminders by default", async () => {
    localStorage.clear();
    await syncEventNotifications([ev], "en");
    expect(scheduleCalls.at(-1)!.items.length).toBe(1);
  });

  it("switching them off clears the calendar group (empty native call) without touching the events", async () => {
    setCalendarNotificationsEnabled(false);
    await syncEventNotifications([ev], "en");
    const last = scheduleCalls.at(-1)!;
    expect(last.minId).toBe(NOTIFICATION_RANGES.calendar.min);
    expect(last.items.length).toBe(0);
    setCalendarNotificationsEnabled(true);
  });
});

