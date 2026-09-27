import { describe, it, expect, vi, beforeEach } from "vitest";

// Native iOS platform; iOS's notification centre is the repo's faithful fake (64-pending limit on).
let native = true;
vi.mock("@/lib/platform", () => ({ isNativeApp: () => native, isIOSNativeApp: () => native, openNativeAppSettings: vi.fn() }));
const listeners: Record<string, (payload: unknown) => void> = {};
vi.mock("@capacitor/local-notifications", async () => {
  const m = await import("./fakeIosNotificationCenter");
  return {
    LocalNotifications: {
      ...m.fakeLocalNotifications,
      addListener: async (event: string, cb: (payload: unknown) => void) => {
        listeners[event] = cb;
        return { remove: async () => undefined };
      },
    },
  };
});
// The short clip "exists" in Library/Sounds unless a test removes it.
let clipOnDisk = true;
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Library: "LIBRARY", LibraryNoCloud: "LIBRARY_NO_CLOUD", Cache: "CACHE" },
  Filesystem: {
    stat: vi.fn(async ({ path }: { path: string }) => {
      if (path.startsWith("Sounds/") && clipOnDisk) return { size: 1_280_000, type: "file" };
      throw new Error("File does not exist");
    }),
  },
}));

import { center, pendingIn, resetCenter } from "./fakeIosNotificationCenter";
import { NOTIFICATION_RANGES, isInGroup, prepareItems, replaceGroup, type NotificationGroup, type ScheduleItemInput } from "@/lib/notifications/NotificationScheduler";
import { PROTOTYPE_VOICE } from "@/lib/voiceLab/prototypeVoice";
import { LAB_TEST_NOTIFICATION_ID, cancelLabTestNotification, isLabTestPending, scheduleLabTestNotification, shortFileName } from "@/lib/voiceLab/voiceStore";
import { INBOX_KEY, loadInbox } from "@/lib/notificationInbox";

const inMin = (m: number) => new Date(Date.now() + m * 60_000);
const fill = (group: NotificationGroup): ScheduleItemInput[] =>
  Array.from({ length: NOTIFICATION_RANGES[group].cap }, (_, i) => ({
    id: NOTIFICATION_RANGES[group].min + i, title: `${group} ${i}`, body: "", at: inMin(60 + i), sound: "default",
  }));

beforeEach(() => {
  resetCenter();
  native = true;
  clipOnDisk = true;
  localStorage.clear();
});

describe("scheduler: the lab group and iOS's 64-pending limit", () => {
  it("lab owns 49000–49009 with cap 1; appointments gave up one slot (12 → 11); caps sum to exactly 64", () => {
    expect(NOTIFICATION_RANGES.lab).toEqual({ min: 49000, max: 49009, cap: 1 });
    expect(NOTIFICATION_RANGES.calendar.cap).toBe(11);
    const total = Object.values(NOTIFICATION_RANGES).reduce((s, r) => s + r.cap, 0);
    expect(total).toBe(64);
  });

  it("the lab can never hold more than one notification", () => {
    const two = [0, 1].map((i) => ({ id: 49000 + i, title: "", body: "", at: inMin(1 + i), sound: "x.wav" }));
    expect(prepareItems("lab", two)).toHaveLength(1);
  });

  it("with EVERY production group full, the lab test still fits and no prayer/night/athkar/appointment is dropped", async () => {
    for (const g of ["prayer", "athkar", "calendar", "night"] as const) {
      const r = await replaceGroup(g, fill(g));
      expect(r.scheduled).toBe(NOTIFICATION_RANGES[g].cap);
    }
    expect(center.pending.size).toBe(63);
    const lab = await scheduleLabTestNotification(PROTOTYPE_VOICE);
    expect(lab).toMatchObject({ ok: true });
    expect(center.pending.size).toBe(64); // exactly iOS's limit, nothing pushed out
    for (const g of ["prayer", "athkar", "calendar", "night"] as const) {
      expect(pendingIn(NOTIFICATION_RANGES[g].min, NOTIFICATION_RANGES[g].max)).toHaveLength(NOTIFICATION_RANGES[g].cap);
    }
  });
});

describe("lab test notification", () => {
  it("uses ONLY the short clip's file name as its sound (never the full recording)", async () => {
    await scheduleLabTestNotification(PROTOTYPE_VOICE);
    const n = center.pending.get(LAB_TEST_NOTIFICATION_ID)!;
    expect(n.sound).toBe(shortFileName(PROTOTYPE_VOICE));
    expect(n.sound).toMatch(/-notify\.wav$/);
    expect(n.sound).not.toMatch(/\.mp3$/);
    expect(n.at.getTime() - Date.now()).toBeGreaterThan(10_000);
    expect(n.at.getTime() - Date.now()).toBeLessThanOrEqual(20_000);
  });

  it("scheduling and cancelling it never touches another group's notifications", async () => {
    await replaceGroup("prayer", fill("prayer"));
    await replaceGroup("night", fill("night"));
    const before = [...center.pending.keys()].sort();
    center.calls.length = 0;
    await scheduleLabTestNotification(PROTOTYPE_VOICE);
    expect(await isLabTestPending()).toBe(true);
    await cancelLabTestNotification();
    expect(await isLabTestPending()).toBe(false);
    for (const c of center.calls.filter((x) => x.op === "cancel" || x.op === "schedule")) {
      for (const id of c.ids ?? []) expect(isInGroup("lab", id)).toBe(true);
    }
    expect([...center.pending.keys()].sort()).toEqual(before);
  });

  it("refuses without the clip on disk, outside the app, and without permission — and schedules nothing", async () => {
    clipOnDisk = false;
    expect(await scheduleLabTestNotification(PROTOTYPE_VOICE)).toMatchObject({ ok: false, reason: "no-clip" });
    clipOnDisk = true;
    center.permission = "denied";
    expect(await scheduleLabTestNotification(PROTOTYPE_VOICE)).toMatchObject({ ok: false, reason: "permission-denied" });
    native = false;
    expect(await scheduleLabTestNotification(PROTOTYPE_VOICE)).toMatchObject({ ok: false, reason: "not-native" });
    expect(center.pending.size).toBe(0);
  });
});

describe("isolation from the Notification Center / inbox", () => {
  it("a delivered lab notification is NOT added to the inbox; a real one still is", async () => {
    const { render } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { LocaleProvider } = await import("@/contexts/LocaleContext");
    const { NotificationRouter } = await import("@/components/notifications/NotificationRouter");
    render(<MemoryRouter><LocaleProvider><NotificationRouter /></LocaleProvider></MemoryRouter>);
    await vi.waitFor(() => expect(listeners.localNotificationReceived).toBeTypeOf("function"));

    listeners.localNotificationReceived({ id: LAB_TEST_NOTIFICATION_ID, title: "اختبار صوت الإشعار (مختبر)", body: "", extra: { kind: "voice-lab" } });
    expect(loadInbox()).toHaveLength(0);
    expect(localStorage.getItem(INBOX_KEY) ?? "[]").not.toMatch(/مختبر/);

    listeners.localNotificationReceived({ id: 41003, title: "حان الآن وقت صلاة العصر", body: "", extra: { kind: "athan-x" } });
    expect(loadInbox()).toHaveLength(1);
  });
});
