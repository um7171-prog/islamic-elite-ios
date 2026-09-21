import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Regression: coming back to the foreground must re-schedule with the LATEST
// prayer settings. It used to call a rebuild captured when the listener was
// registered, so a reminder-minutes change made after that was undone (the old
// reminder times were scheduled again).
const scheduleCalls: { minId: number; items: { id: number; atMs: number }[] }[] = [];
let appStateCallback: ((s: { isActive: boolean }) => void) | null = null;

vi.mock("@/lib/platform", () => ({ isNativeApp: () => true, isIOSNativeApp: () => true, openNativeAppSettings: async () => undefined }));
vi.mock("@/lib/notifications/permission", () => ({
  checkPermissionStatus: async () => "granted",
  PERMISSION_CHANGED_EVENT: "elite-notifications:permission-changed",
  requestPermission: async () => "granted",
}));
vi.mock("@/lib/notifications/plugin", () => ({
  pluginScheduleGroup: async (minId: number, _max: number, items: { id: number; atMs: number }[]) => {
    scheduleCalls.push({ minId, items });
    return { acceptedIds: items.map((i) => i.id), verifiedIds: items.map((i) => i.id), errors: [] };
  },
  pluginPendingGroup: async () => [],
  pluginCancelGroup: async () => undefined,
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (_evt: string, cb: (s: { isActive: boolean }) => void) => {
      appStateCallback = cb;
      return { remove: () => undefined };
    },
  },
}));

import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import { NotificationsProvider, useNotifications } from "@/components/notifications/NotificationsProvider";
import { NOTIFICATION_RANGES } from "@/lib/notifications/ranges";

let api: ReturnType<typeof useNotifications> | null = null;
function Probe() {
  api = useNotifications();
  return null;
}

const prayerCalls = () => scheduleCalls.filter((c) => c.minId === NOTIFICATION_RANGES.prayer.min);
const soonestReminderGap = (items: { id: number; atMs: number }[]) => {
  // Deterministic ids: base + day*10 + prayerIdx*2 + (1 for reminder). Fajr day 0 => athan id base+0, reminder base+1.
  const base = NOTIFICATION_RANGES.prayer.min;
  const athan = items.find((i) => i.id === base + 20 + 0); // day 2, fajr athan (always in the future)
  const rem = items.find((i) => i.id === base + 20 + 1);
  return athan && rem ? (athan.atMs - rem.atMs) / 60_000 : null;
};

beforeEach(() => {
  scheduleCalls.length = 0;
  appStateCallback = null;
  api = null;
  localStorage.clear();
  localStorage.setItem("lang", "en");
});

describe("NotificationsProvider foreground reschedule", () => {
  it("uses the newest reminder minutes after returning to the app", async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <LocaleProvider>
            <CityProvider>
              <PrayerCalcProvider>
                <NotificationsProvider>
                  <Probe />
                </NotificationsProvider>
              </PrayerCalcProvider>
            </CityProvider>
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(prayerCalls().length).toBeGreaterThan(0));
    await waitFor(() => expect(appStateCallback).not.toBeNull());
    expect(soonestReminderGap(prayerCalls().at(-1)!.items)).toBe(10); // default

    // User changes reminder to 5 minutes...
    await act(async () => {
      api!.setPrayerSettings({ ...api!.prayerSettings, preReminderMinutes: 5 });
    });
    await waitFor(() => expect(soonestReminderGap(prayerCalls().at(-1)!.items)).toBe(5));

    // ...then the app goes to the background and returns.
    scheduleCalls.length = 0;
    await act(async () => {
      appStateCallback!({ isActive: true });
      await new Promise((r) => setTimeout(r, 900));
    });
    await waitFor(() => expect(prayerCalls().length).toBeGreaterThan(0));
    expect(soonestReminderGap(prayerCalls().at(-1)!.items)).toBe(5); // not the stale 10
  });
});
