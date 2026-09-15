import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";

// CRITICAL regression test: NativeAthanScheduler's events/athkar auto-sync
// used to call scheduleNativeGroup() with no prior permission check. On iOS
// that reaches the custom plugin's ensurePermission(), which auto-prompts
// Apple's real system dialog the instant status is undetermined — bypassing
// the "only two call sites may ever prompt" rule the first-launch dialog and
// Settings button rely on. This test pins that events/athkar scheduling is
// gated behind an already-granted permission, exactly like prayers.

vi.mock("@/lib/nativeNotify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nativeNotify")>();
  return { ...actual, isNativeApp: () => true };
});

let permissionGranted = false;
const checkOrRequestNotificationPermission = vi.fn(async () => ({
  status: permissionGranted ? ("granted" as const) : ("prompt" as const),
  granted: permissionGranted,
}));
vi.mock("@/lib/nativeAthan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nativeAthan")>();
  return { ...actual, checkOrRequestNotificationPermission };
});

const syncEventNotifications = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return { ...actual, loadEvents: () => [], syncEventNotifications };
});

const syncAthkarReminders = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/athkarReminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/athkarReminders")>();
  return { ...actual, syncAthkarReminders };
});

vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));

// Imported after the mocks above so NativeAthanScheduler picks them up.
const { NativeAthanScheduler } = await import("@/components/NativeAthanScheduler");

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <CityProvider>
        <PrayerCalcProvider>{children}</PrayerCalcProvider>
      </CityProvider>
    </LocaleProvider>
  );
}

describe("NativeAthanScheduler — events/athkar auto-sync respects the permission gate", () => {
  beforeEach(() => {
    permissionGranted = false;
    checkOrRequestNotificationPermission.mockClear();
    syncEventNotifications.mockClear();
    syncAthkarReminders.mockClear();
  });

  it("never calls syncEventNotifications/syncAthkarReminders while permission is still undecided", async () => {
    render(
      <Wrapper>
        <NativeAthanScheduler>
          <div />
        </NativeAthanScheduler>
      </Wrapper>,
    );

    // The automatic sync fires ~900ms after mount — wait past that.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(checkOrRequestNotificationPermission).toHaveBeenCalled();
    // Every call made while gating must be read-only (allowPrompt=false),
    // matching the invariant that only the dialog/Settings button may prompt.
    checkOrRequestNotificationPermission.mock.calls.forEach((args) => {
      expect(args[0]).not.toBe(true);
    });
    expect(syncEventNotifications).not.toHaveBeenCalled();
    expect(syncAthkarReminders).not.toHaveBeenCalled();
  }, 10000);

  it("calls syncEventNotifications/syncAthkarReminders once permission is already granted", async () => {
    permissionGranted = true;
    render(
      <Wrapper>
        <NativeAthanScheduler>
          <div />
        </NativeAthanScheduler>
      </Wrapper>,
    );

    await waitFor(() => expect(syncEventNotifications).toHaveBeenCalled(), { timeout: 5000 });
    await waitFor(() => expect(syncAthkarReminders).toHaveBeenCalled(), { timeout: 5000 });
  }, 10000);
});
