import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---- native bridge mocks (scheduler payloads are inspected, iOS itself is not available here) ----
const scheduleCalls: { minId: number; maxId: number; items: { id: number; atMs: number; title: string }[] }[] = [];
vi.mock("@/lib/platform", () => ({ isNativeApp: () => true, isIOSNativeApp: () => false, openNativeAppSettings: async () => undefined }));
vi.mock("@/lib/notifications/permission", () => ({ checkPermissionStatus: async () => "granted", PERMISSION_CHANGED_EVENT: "x", requestPermission: async () => "granted" }));
vi.mock("@/lib/notifications/plugin", () => ({
  pluginScheduleGroup: async (minId: number, maxId: number, items: { id: number; atMs: number; title: string }[]) => {
    scheduleCalls.push({ minId, maxId, items });
    return { acceptedIds: items.map((i) => i.id), verifiedIds: items.map((i) => i.id), errors: [] };
  },
  pluginPendingGroup: async () => [],
  pluginCancelGroup: async () => undefined,
}));
const rebuildSpy = vi.fn();
vi.mock("@/lib/notifications/coordinator", () => ({
  requestNotificationRebuild: () => rebuildSpy(),
  registerNotificationRebuildHandler: () => () => undefined,
}));

import { LocaleProvider } from "@/contexts/LocaleContext";
import { EventsCalendar } from "@/components/islamic/EventsCalendar";
import { syncEventNotifications, loadEvents, type CalEvent } from "@/lib/events";
import { syncAthkarReminders, DEFAULT_ATHKAR_SETTINGS, type AthkarReminderSettings } from "@/lib/athkarReminders";
import { NOTIFICATION_RANGES } from "@/lib/notifications/ranges";
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
    scheduleCalls.length = 0;
    addInboxItem({ kind: "push", id: "x", title: "t", body: "", receivedAt: Date.now() - 45 * MIN });
    loadInbox();
    expect(scheduleCalls.length).toBe(0);
  });
});

/* ---------------- appointment notifications: create / edit / delete ---------------- */
const ev = (over: Partial<CalEvent> = {}): CalEvent =>
  ({ id: "evt-1", title: "Dentist", date: "2026-09-25", time: "10:00", repeat: "none", remindMinutesBefore: 15, sound: "notif_chime", category: "general", createdAt: 1, ...over }) as CalEvent;
const calCalls = () => scheduleCalls.filter((c) => c.minId === NOTIFICATION_RANGES.calendar.min);

describe("appointment notification lifecycle (scheduler payloads)", () => {
  beforeEach(() => { scheduleCalls.length = 0; localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T06:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("create -> one notification at (time - reminder), inside the calendar id range only", async () => {
    await syncEventNotifications([ev()], "en");
    const [call] = calCalls();
    expect(call.items).toHaveLength(1);
    const it0 = call.items[0];
    expect(it0.atMs).toBe(new Date(2026, 8, 25, 9, 45, 0).getTime()); // 10:00 - 15 min, local time
    expect(it0.id).toBeGreaterThanOrEqual(NOTIFICATION_RANGES.calendar.min);
    expect(it0.id).toBeLessThanOrEqual(NOTIFICATION_RANGES.calendar.max);
    expect(call.minId).toBe(NOTIFICATION_RANGES.calendar.min);
    expect(call.maxId).toBe(NOTIFICATION_RANGES.calendar.max);
  });

  it("edit -> the SAME id is re-used with the new time (old one replaced, not duplicated)", async () => {
    await syncEventNotifications([ev()], "en");
    await syncEventNotifications([ev({ time: "14:30", remindMinutesBefore: 5 })], "en");
    const [a, b] = calCalls();
    expect(b.items).toHaveLength(1);
    expect(b.items[0].id).toBe(a.items[0].id);
    expect(b.items[0].atMs).toBe(new Date(2026, 8, 25, 14, 25, 0).getTime());
    expect(b.items[0].atMs).not.toBe(a.items[0].atMs);
  });

  it("delete -> an empty rebuild for the calendar range (native clears every stale id in it)", async () => {
    await syncEventNotifications([ev()], "en");
    await syncEventNotifications([], "en");
    const last = calCalls().at(-1)!;
    expect(last.items).toHaveLength(0);
    expect(last.minId).toBe(NOTIFICATION_RANGES.calendar.min);
    expect(last.maxId).toBe(NOTIFICATION_RANGES.calendar.max);
  });

  it("removing only the reminder from an event cancels its notification", async () => {
    await syncEventNotifications([ev()], "en");
    await syncEventNotifications([ev({ remindMinutesBefore: null })], "en");
    expect(calCalls().at(-1)!.items).toHaveLength(0);
  });

  it("two events get two different ids; a daily repeat yields several distinct ones", async () => {
    await syncEventNotifications([ev(), ev({ id: "evt-2", title: "Meeting" }), ev({ id: "evt-3", repeat: "daily" })], "en");
    const ids = calCalls()[0].items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });

  it("calendar ids never overlap prayer / athkar / test ranges", () => {
    const { calendar, prayer, athkar, test } = NOTIFICATION_RANGES;
    for (const other of [prayer, athkar, test]) expect(calendar.max < other.min || calendar.min > other.max).toBe(true);
  });
});

describe("EventsCalendar UI -> storage + reschedule", () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem("lang", "en"); rebuildSpy.mockClear(); scheduleCalls.length = 0; });

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
const athkarCalls = () => scheduleCalls.filter((c) => c.minId === NOTIFICATION_RANGES.athkar.min);
const days = (shiftMin = 0) =>
  [0, 1, 2].map((n) => ({
    sunrise: new Date(new Date("2026-09-21T02:50:00Z").getTime() + n * 86_400_000 + shiftMin * MIN),
    maghrib: new Date(new Date("2026-09-21T15:10:00Z").getTime() + n * 86_400_000 + shiftMin * MIN),
  }));
const A = (over: Partial<AthkarReminderSettings> = {}) => ({ ...DEFAULT_ATHKAR_SETTINGS, ...over });

describe("Athkar rescheduling", () => {
  beforeEach(() => { scheduleCalls.length = 0; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T00:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("Morning ON/OFF and Evening ON/OFF add/remove exactly their own items", async () => {
    await syncAthkarReminders(A(), days(), "en");
    expect(athkarCalls().at(-1)!.items).toHaveLength(6);
    await syncAthkarReminders(A({ morningEnabled: false }), days(), "en");
    const noMorning = athkarCalls().at(-1)!.items;
    expect(noMorning).toHaveLength(3);
    expect(noMorning.every((i) => /Evening/.test(i.title))).toBe(true);
    await syncAthkarReminders(A({ eveningEnabled: false }), days(), "en");
    expect(athkarCalls().at(-1)!.items.every((i) => /Morning/.test(i.title))).toBe(true);
    await syncAthkarReminders(A({ morningEnabled: false, eveningEnabled: false }), days(), "en");
    expect(athkarCalls().at(-1)!.items).toHaveLength(0); // OFF -> native clears the whole athkar range
  });

  it("changing the time replaces (same ids, new times); no old notification is left", async () => {
    await syncAthkarReminders(A({ morningAfterSunrise: 30, eveningBeforeMaghrib: 60 }), days(), "en");
    await syncAthkarReminders(A({ morningAfterSunrise: 60, eveningBeforeMaghrib: 30 }), days(), "en");
    const [a, b] = athkarCalls();
    expect(b.items.map((i) => i.id).sort()).toEqual(a.items.map((i) => i.id).sort());
    const byId = (c: typeof a, id: number) => c.items.find((i) => i.id === id)!;
    const morningId = a.items.find((i) => /Morning/.test(i.title))!.id;
    const eveningId = a.items.find((i) => /Evening/.test(i.title))!.id;
    expect(byId(b, morningId).atMs - byId(a, morningId).atMs).toBe(30 * MIN); // later
    expect(byId(b, eveningId).atMs - byId(a, eveningId).atMs).toBe(30 * MIN); // evening: 30 min before maghrib instead of 60 => 30 min later
  });

  it("times follow the (re-computed) sunrise / maghrib after a city or date change", async () => {
    await syncAthkarReminders(A(), days(0), "en");
    await syncAthkarReminders(A(), days(20), "en"); // another city: prayer times 20 min later
    const [a, b] = athkarCalls();
    a.items.forEach((it0, i) => expect(b.items[i].atMs - it0.atMs).toBe(20 * MIN));
  });

  it("ids stay inside the athkar range and are unique", async () => {
    await syncAthkarReminders(A(), days(), "en");
    const ids = athkarCalls()[0].items.map((i) => i.id);
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
