import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---- iOS is replaced by an in-memory notification centre behind the real plugin API ----
vi.mock("@/lib/platform", () => ({ isNativeApp: () => true, isIOSNativeApp: () => false, openNativeAppSettings: async () => undefined }));
vi.mock("@capacitor/local-notifications", async () => {
  const m = await import("./fakeIosNotificationCenter");
  return { LocalNotifications: m.fakeLocalNotifications };
});
import { center, pendingIn, resetCenter } from "./fakeIosNotificationCenter";
const rebuildSpy = vi.fn();

import { LocaleProvider } from "@/contexts/LocaleContext";
import { EventsCalendar } from "@/components/islamic/EventsCalendar";
import { loadEvents, type CalEvent } from "@/lib/events";
import { syncAppointmentNotifications } from "@/lib/notifications/AppointmentNotificationService";
import { syncAthkarReminders, DEFAULT_ATHKAR_SETTINGS, type AthkarReminderSettings } from "@/lib/athkarReminders";
import { NOTIFICATION_RANGES, registerNotificationRebuildHandler } from "@/lib/notifications/NotificationScheduler";
import { INBOX_KEY, INBOX_TTL_MS, addInboxItem, isFresh, loadInbox, relativeAgo, visibleItems } from "@/lib/notificationInbox";
import { fetchTemperature, temperatureUrl, _clearTemperatureCache } from "@/lib/temperature";
import { DAILY_ITEMS, dailyItem } from "@/lib/dailyContent";
import { MORNING, EVENING, SLEEP, POST_PRAYER } from "@/lib/athkarData";
import { SocialRows } from "@/components/site/SocialRows";
import { uid } from "@/lib/id";

const MIN = 60_000;

/* ---------------- Notification Center: relative time + 30-minute display window ---------------- */
describe("Notification Center window", () => {
  const now = Date.parse("2026-09-20T12:00:00Z");
  const ago = (m: number) => now - m * MIN;

  it("shows 1, 3, 10 and 29 minute-old notifications; hides 30 and 31", () => {
    const items = [1, 3, 10, 29, 30, 31].map((m) => ({ id: `n${m}`, receivedAt: ago(m) }));
    expect(visibleItems(items, now).map((i) => i.id)).toEqual(["n1", "n3", "n10", "n29"]);
    expect(isFresh(ago(29.9), now)).toBe(true);
    expect(isFresh(ago(30), now)).toBe(false);
    expect(INBOX_TTL_MS).toBe(30 * MIN);
  });

  it("Arabic relative labels", () => {
    expect(relativeAgo(ago(0.2), "ar", now)).toBe("الآن");
    expect(relativeAgo(ago(1), "ar", now)).toBe("منذ دقيقة");
    expect(relativeAgo(ago(2), "ar", now)).toBe("منذ دقيقتين");
    expect(relativeAgo(ago(3), "ar", now)).toBe("منذ 3 دقائق");
    expect(relativeAgo(ago(10), "ar", now)).toBe("منذ 10 دقائق");
    expect(relativeAgo(ago(20), "ar", now)).toBe("منذ 20 دقيقة");
    expect(relativeAgo(ago(29), "ar", now)).toBe("منذ 29 دقيقة");
  });

  it("English relative labels", () => {
    expect(relativeAgo(ago(1), "en", now)).toBe("1 minute ago");
    expect(relativeAgo(ago(3), "en", now)).toBe("3 minutes ago");
    expect(relativeAgo(ago(29), "en", now)).toBe("29 minutes ago");
  });

  it("the inbox stores the real receive time and prunes expired entries from storage", () => {
    localStorage.clear();
    const t0 = Date.now();
    addInboxItem({ kind: "push", id: "a", title: "old", body: "", receivedAt: t0 - 31 * MIN });
    addInboxItem({ kind: "push", id: "b", title: "fresh", body: "", receivedAt: t0 - 2 * MIN });
    const c = addInboxItem({ kind: "local", title: "now", body: "" });
    expect(Math.abs(c.receivedAt - Date.now())).toBeLessThan(2000); // timestamp is the arrival time, not fixed data
    const shown = loadInbox().map((i) => i.title);
    expect(shown).toContain("fresh");
    expect(shown).toContain("now");
    expect(shown).not.toContain("old");
    expect(JSON.parse(localStorage.getItem(INBOX_KEY)!).some((i: { title: string }) => i.title === "old")).toBe(false);
  });

  it("expiry is display-only: the scheduler is never called by the inbox", () => {
    resetCenter();
    addInboxItem({ kind: "push", id: "x", title: "t", body: "", receivedAt: Date.now() - 45 * MIN });
    loadInbox();
    expect(center.calls.length).toBe(0);
  });
});

/* ---------------- appointment notifications: create / edit / delete ---------------- */
const ev = (over: Partial<CalEvent> = {}): CalEvent =>
  ({ id: "evt-1", title: "Dentist", date: "2026-09-25", time: "10:00", repeat: "none", remindMinutesBefore: 15, sound: "notif_chime", category: "general", createdAt: 1, ...over }) as CalEvent;
const cal = () => pendingIn(NOTIFICATION_RANGES.calendar.min, NOTIFICATION_RANGES.calendar.max);

describe("appointment notification lifecycle (against the iOS notification-centre double)", () => {
  beforeEach(() => { resetCenter(); localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T06:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("create -> one notification at (time - reminder), inside the calendar id range only", async () => {
    await syncAppointmentNotifications([ev()], "en");
    expect(cal()).toHaveLength(1);
    const n = cal()[0];
    expect(n.at.getTime()).toBe(new Date(2026, 8, 25, 9, 45, 0).getTime()); // 10:00 - 15 min, local time
    expect(n.id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.calendar.min);
    expect(n.id).toBeLessThanOrEqual(NOTIFICATION_RANGES.calendar.max);
  });

  it("edit -> the SAME id now carries the new time (old one replaced, not duplicated)", async () => {
    await syncAppointmentNotifications([ev()], "en");
    const first = cal()[0];
    await syncAppointmentNotifications([ev({ time: "14:30", remindMinutesBefore: 5 })], "en");
    expect(cal()).toHaveLength(1);
    expect(cal()[0].id).toBe(first.id);
    expect(cal()[0].at.getTime()).toBe(new Date(2026, 8, 25, 14, 25, 0).getTime());
  });

  it("delete -> the notification is cancelled", async () => {
    await syncAppointmentNotifications([ev()], "en");
    await syncAppointmentNotifications([], "en");
    expect(cal()).toHaveLength(0);
  });

  it("removing only the reminder from an event cancels its notification", async () => {
    await syncAppointmentNotifications([ev()], "en");
    await syncAppointmentNotifications([ev({ remindMinutesBefore: null })], "en");
    expect(cal()).toHaveLength(0);
  });

  it("two events get two different ids; a daily repeat yields several distinct ones", async () => {
    await syncAppointmentNotifications([ev(), ev({ id: "evt-2", title: "Meeting" }), ev({ id: "evt-3", repeat: "daily" })], "en");
    const ids = cal().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });

  it("calendar ids never overlap prayer / athkar ranges", () => {
    const { calendar, prayer, athkar } = NOTIFICATION_RANGES;
    for (const other of [prayer, athkar]) expect(calendar.max < other.min || calendar.min > other.max).toBe(true);
  });
});

describe("EventsCalendar UI -> storage + reschedule", () => {
  let unregister: () => void = () => undefined;
  beforeEach(() => { localStorage.clear(); localStorage.setItem("lang", "en"); rebuildSpy.mockClear(); resetCenter(); unregister = registerNotificationRebuildHandler(() => rebuildSpy()); });
  afterEach(() => unregister());

  const setup = () =>
    render(
      <MemoryRouter>
        <LocaleProvider>
          <EventsCalendar hideHeading />
        </LocaleProvider>
      </MemoryRouter>,
    );

  it("add -> Save closes the form, shows it, stores it and asks for a reschedule; edit and delete do the same", async () => {
    setup();
    fireEvent.click(screen.getByTestId("add-event"));
    const title = await screen.findByTestId("event-title");
    fireEvent.change(title, { target: { value: "Team meeting" } });
    const tomorrow = new Date(Date.now() + 86_400_000);
    const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    fireEvent.change(document.getElementById("ev-date")!, { target: { value: ymd } });
    fireEvent.change(document.getElementById("ev-time")!, { target: { value: "11:15" } });
    rebuildSpy.mockClear();

    fireEvent.click(screen.getByTestId("event-save"));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId("event-save")).toBeNull(); // form closed
    const stored = loadEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ title: "Team meeting", date: ymd, time: "11:15" });
    expect(screen.getAllByText("Team meeting").length).toBeGreaterThan(0); // visible immediately
    expect(rebuildSpy).toHaveBeenCalled();

    // edit
    fireEvent.click(screen.getAllByLabelText(/^Edit: Team meeting/)[0]);
    fireEvent.change(await screen.findByTestId("event-title"), { target: { value: "Team meeting 2" } });
    rebuildSpy.mockClear();
    fireEvent.click(screen.getByTestId("event-save"));
    await act(async () => { await Promise.resolve(); });
    expect(loadEvents()[0].title).toBe("Team meeting 2");
    expect(loadEvents()).toHaveLength(1);
    expect(rebuildSpy).toHaveBeenCalled();

    // delete
    rebuildSpy.mockClear();
    fireEvent.click(screen.getAllByLabelText(/^Delete: Team meeting 2/)[0]);
    await act(async () => { await Promise.resolve(); });
    expect(loadEvents()).toHaveLength(0);
    expect(rebuildSpy).toHaveBeenCalled();
  });

  it("an empty title / a past time is explained INSIDE the form and nothing is saved", async () => {
    setup();
    fireEvent.click(screen.getByTestId("add-event"));
    await screen.findByTestId("event-title");
    fireEvent.click(screen.getByTestId("event-save"));
    expect((await screen.findByTestId("event-error")).textContent).toMatch(/title/i);
    expect(loadEvents()).toHaveLength(0);

    fireEvent.change(screen.getByTestId("event-title"), { target: { value: "Past" } });
    fireEvent.change(document.getElementById("ev-date")!, { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByTestId("event-save"));
    expect((await screen.findByTestId("event-error")).textContent).toMatch(/passed/i);
    expect(loadEvents()).toHaveLength(0);
  });
});

/* ---------------- Athkar rescheduling ---------------- */
const athkarHeld = () => pendingIn(NOTIFICATION_RANGES.athkar.min, NOTIFICATION_RANGES.athkar.max);
const days = (shiftMin = 0) =>
  [0, 1, 2].map((n) => ({
    sunrise: new Date(new Date("2026-09-21T02:50:00Z").getTime() + n * 86_400_000 + shiftMin * MIN),
    maghrib: new Date(new Date("2026-09-21T15:10:00Z").getTime() + n * 86_400_000 + shiftMin * MIN),
  }));
const A = (over: Partial<AthkarReminderSettings> = {}) => ({ ...DEFAULT_ATHKAR_SETTINGS, ...over });

describe("Athkar rescheduling", () => {
  beforeEach(() => { resetCenter(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T00:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("Morning ON/OFF and Evening ON/OFF add/remove exactly their own items", async () => {
    await syncAthkarReminders(A(), days(), "en");
    expect(athkarHeld()).toHaveLength(6);
    await syncAthkarReminders(A({ morningEnabled: false }), days(), "en");
    expect(athkarHeld()).toHaveLength(3);
    expect(athkarHeld().every((i) => /Evening/.test(i.title))).toBe(true);
    await syncAthkarReminders(A({ eveningEnabled: false }), days(), "en");
    expect(athkarHeld().every((i) => /Morning/.test(i.title))).toBe(true);
    await syncAthkarReminders(A({ morningEnabled: false, eveningEnabled: false }), days(), "en");
    expect(athkarHeld()).toHaveLength(0); // OFF -> the whole athkar range is cleared
  });

  it("changing the time replaces (same ids, new times); no old notification is left", async () => {
    await syncAthkarReminders(A({ morningAfterSunrise: 30, eveningBeforeMaghrib: 60 }), days(), "en");
    const a = athkarHeld().map((n) => ({ id: n.id, at: n.at.getTime(), title: n.title }));
    await syncAthkarReminders(A({ morningAfterSunrise: 60, eveningBeforeMaghrib: 30 }), days(), "en");
    const b = athkarHeld();
    expect(b.map((n) => n.id)).toEqual(a.map((n) => n.id));
    const morning = a.find((n) => /Morning/.test(n.title))!;
    const evening = a.find((n) => /Evening/.test(n.title))!;
    expect(b.find((n) => n.id === morning.id)!.at.getTime() - morning.at).toBe(30 * MIN); // later
    expect(b.find((n) => n.id === evening.id)!.at.getTime() - evening.at).toBe(30 * MIN); // 30 min before maghrib instead of 60
  });

  it("times follow the (re-computed) sunrise / maghrib after a city or date change", async () => {
    await syncAthkarReminders(A(), days(0), "en");
    const a = athkarHeld().map((n) => n.at.getTime());
    await syncAthkarReminders(A(), days(20), "en"); // another city: prayer times 20 min later
    athkarHeld().forEach((n, i) => expect(n.at.getTime() - a[i]).toBe(20 * MIN));
  });

  it("ids stay inside the athkar range and are unique", async () => {
    await syncAthkarReminders(A(), days(), "en");
    const ids = athkarHeld().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => { expect(id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.athkar.min); expect(id).toBeLessThanOrEqual(NOTIFICATION_RANGES.athkar.max); });
  });
});

/* ---------------- temperature ---------------- */
describe("temperature (Open-Meteo)", () => {
  beforeEach(() => _clearTemperatureCache());
  afterEach(() => vi.unstubAllGlobals());

  it("the request uses the coordinates it is given (Buraydah, then Riyadh)", () => {
    const u1 = new URL(temperatureUrl(26.326, 43.975));
    expect(u1.hostname).toBe("api.open-meteo.com");
    expect(u1.searchParams.get("latitude")).toBe("26.3260");
    expect(u1.searchParams.get("longitude")).toBe("43.9750");
    expect(u1.searchParams.get("current")).toBe("temperature_2m");
    const u2 = new URL(temperatureUrl(24.7136, 46.6753));
    expect(u2.searchParams.get("latitude")).toBe("24.7136");
    expect(u2.searchParams.get("longitude")).toBe("46.6753");
  });

  it("parses a live reading; failures throw (nothing is invented)", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ current: { temperature_2m: 27.6 } }) }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchTemperature(26.33, 43.97);
    expect(r.tempC).toBe(27.6);
    expect(fetchMock.mock.calls[0][0]).toContain("latitude=26.3300");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(fetchTemperature(1, 1)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ current: {} }) })));
    await expect(fetchTemperature(2, 2)).rejects.toThrow();
  });
});

/* ---------------- home dhikr content ---------------- */
describe("daily dhikr content", () => {
  it("only uses text that already exists in the app's Athkar lists (nothing invented)", () => {
    const all = new Set([...MORNING, ...EVENING, ...SLEEP, ...POST_PRAYER].map((i) => i.ar));
    expect(DAILY_ITEMS.length).toBeGreaterThan(5);
    DAILY_ITEMS.forEach((i) => { expect(all.has(i.ar)).toBe(true); expect(i.ar.length).toBeLessThanOrEqual(170); });
  });
  it("is stable for a day and changes with Next", () => {
    const d = new Date(2026, 8, 20);
    expect(dailyItem(0, d).ar).toBe(dailyItem(0, d).ar);
    expect(dailyItem(1, d).ar).not.toBe(dailyItem(0, d).ar);
  });
});

/* ---------------- social + ids ---------------- */
describe("social links & ids", () => {
  it("rows open the provided official links; without a link nothing is opened", () => {
    localStorage.setItem("lang", "en");
    const { container, rerender } = render(<MemoryRouter><LocaleProvider><SocialRows links={{ tiktok: "https://www.tiktok.com/@example", instagram: "https://www.instagram.com/example" }} /></LocaleProvider></MemoryRouter>);
    expect(container.querySelector('[data-social="tiktok"]')!.getAttribute("href")).toBe("https://www.tiktok.com/@example");
    expect(container.querySelector('[data-social="instagram"]')!.getAttribute("href")).toBe("https://www.instagram.com/example");
    rerender(<MemoryRouter><LocaleProvider><SocialRows links={{ tiktok: "", instagram: "" }} /></LocaleProvider></MemoryRouter>);
    expect(container.querySelector('[data-social="tiktok"]')!.getAttribute("href")).toBeNull();
    expect(container.textContent).toMatch(/Coming soon/);
  });
  it("uid() is unique and never throws without crypto.randomUUID", () => {
    const orig = globalThis.crypto.randomUUID;
    // simulate an old iOS WebView
    (globalThis.crypto as unknown as { randomUUID?: unknown }).randomUUID = undefined;
    const ids = new Set(Array.from({ length: 50 }, () => uid()));
    globalThis.crypto.randomUUID = orig;
    expect(ids.size).toBe(50);
  });
});
