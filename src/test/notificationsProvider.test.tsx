import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Regression: coming back to the foreground must re-schedule with the LATEST
// prayer settings. It used to call a rebuild captured when the listener was
// registered, so a reminder-minutes change made after that was undone (the old
// reminder times were scheduled again).
let appStateCallback: ((s: { isActive: boolean }) => void) | null = null;

vi.mock("@/lib/platform", () => ({ isNativeApp: () => true, isIOSNativeApp: () => true, openNativeAppSettings: async () => undefined }));
vi.mock("@capacitor/local-notifications", async () => {
  const m = await import("./fakeIosNotificationCenter");
  return { LocalNotifications: m.fakeLocalNotifications };
});
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (_evt: string, cb: (s: { isActive: boolean }) => void) => {
      appStateCallback = cb;
      return { remove: () => undefined };
    },
  },
}));
import { center, pendingIn, resetCenter } from "./fakeIosNotificationCenter";

import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import { NotificationsProvider, useNotifications } from "@/components/notifications/NotificationsProvider";
import { NOTIFICATION_RANGES } from "@/lib/notifications/NotificationScheduler";

let api: ReturnType<typeof useNotifications> | null = null;
function Probe() {
  api = useNotifications();
  return null;
}

const prayerHeld = () => pendingIn(NOTIFICATION_RANGES.prayer.min, NOTIFICATION_RANGES.prayer.max);
const reminderGap = () => {
  // Deterministic ids: base + day*10 + prayerIdx*2 (+1 = reminder). Day 2, Fajr: athan base+20, reminder base+21.
  const base = NOTIFICATION_RANGES.prayer.min;
  const athan = prayerHeld().find((n) => n.id === base + 20);
  const rem = prayerHeld().find((n) => n.id === base + 21);
  return athan && rem ? (athan.at.getTime() - rem.at.getTime()) / 60_000 : null;
};

beforeEach(() => {
  resetCenter();
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

    await waitFor(() => expect(prayerHeld().length).toBeGreaterThan(0));
    await waitFor(() => expect(appStateCallback).not.toBeNull());
    expect(reminderGap()).toBe(5); // default

    // User changes reminder to 10 minutes...
    await act(async () => {
      api!.setPrayerSettings({ ...api!.prayerSettings, preReminderMinutes: 10 });
    });
    await waitFor(() => expect(reminderGap()).toBe(10));

    // ...then the app goes to the background and returns: the schedule must still use 10, not the stale 5.
    await new Promise((r) => setTimeout(r, 300));
    center.calls.length = 0;
    await act(async () => {
      appStateCallback!({ isActive: true });
      await new Promise((r) => setTimeout(r, 900));
    });
    await waitFor(() => expect(center.calls.some((c) => c.op === "getPending")).toBe(true));
    expect(reminderGap()).toBe(10);
  });

  it("returning from iOS Settings re-reads the permission and schedules once it is granted", async () => {
    center.permission = "denied";
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
    await waitFor(() => expect(api!.permission).toBe("denied"));
    expect(prayerHeld()).toHaveLength(0); // nothing is scheduled without permission

    center.permission = "granted"; // the user enabled notifications in iOS Settings
    await waitFor(() => expect(appStateCallback).not.toBeNull());
    await act(async () => {
      appStateCallback!({ isActive: true });
      await new Promise((r) => setTimeout(r, 500));
    });
    await waitFor(() => expect(api!.permission).toBe("granted"));
    await waitFor(() => expect(prayerHeld().length).toBeGreaterThan(0));
  });
});
