import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQiblaCompass } from "@/hooks/useQiblaCompass";

// HIGH severity fix: the "no sensor data" watchdog used to re-set the same
// "running" status (a no-op), so a device with DeviceOrientationEvent
// present but that never actually dispatches an event (Wi-Fi-only iPads,
// browsers that silently drop the API) got stuck showing "move device to
// activate compass" forever instead of the existing "unsupported" message.

describe("useQiblaCompass — no-signal watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Make DeviceOrientationEvent "exist" (support check) but require no
    // explicit permission, matching a non-iOS device with a dead sensor.
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      writable: true,
      value: function DeviceOrientationEvent() {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error test cleanup of a test-only global shim
    delete window.DeviceOrientationEvent;
  });

  it("transitions to 'unsupported' after 4s when no sensor frame ever arrives", async () => {
    const { result } = renderHook(() => useQiblaCompass(true));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("running");

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.status).toBe("unsupported");
  });

  it("stays 'running' when a real sensor frame arrives before the watchdog fires", async () => {
    const { result } = renderHook(() => useQiblaCompass(true));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event("deviceorientation"), { alpha: 90, absolute: true }),
      );
    });
    expect(result.current.heading).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    // A real frame arrived, so the watchdog must not override a working compass.
    expect(result.current.status).toBe("running");
  });
});
