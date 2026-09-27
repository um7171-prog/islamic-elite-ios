import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import {
  useQiblaCompass,
  useUserLocation,
  requestMotionPermission,
  __resetMotionPermissionForTests,
  __resetLocationCacheForTests,
} from "@/hooks/useQiblaCompass";
import { QiblaDialog } from "@/components/islamic/QiblaDialog";

type Perm = "granted" | "denied" | "reject";

/** iOS-style DeviceOrientationEvent with requestPermission(). */
function installIOSOrientation(answer: () => Perm) {
  const requestPermission = vi.fn(() => {
    const a = answer();
    return a === "reject" ? Promise.reject(new DOMException("requires a user gesture", "NotAllowedError")) : Promise.resolve(a);
  });
  const DOE = Object.assign(function DeviceOrientationEvent() {}, { requestPermission });
  Object.defineProperty(window, "DeviceOrientationEvent", { configurable: true, writable: true, value: DOE });
  return requestPermission;
}
/** Android/desktop: the API exists, no permission prompt. */
function installPlainOrientation() {
  Object.defineProperty(window, "DeviceOrientationEvent", { configurable: true, writable: true, value: function DeviceOrientationEvent() {} });
}
const frame = (props: Record<string, unknown>) => Object.assign(new Event("deviceorientation"), props);

function mockGeolocation(result: "ok" | "denied" = "ok") {
  const getCurrentPosition = vi.fn((ok: PositionCallback, err: PositionErrorCallback) => {
    if (result === "ok") ok({ coords: { latitude: 26.33, longitude: 43.97 } } as GeolocationPosition);
    else err({ code: 1 } as GeolocationPositionError);
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

beforeEach(() => {
  __resetMotionPermissionForTests();
  __resetLocationCacheForTests();
  localStorage.clear();
  localStorage.setItem("lang", "ar");
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent;
});

describe("Motion & Orientation permission (iOS)", () => {
  it("granted: the compass attaches and follows the device live (not just a status flag)", async () => {
    installIOSOrientation(() => "granted");
    const { result } = renderHook(() => useQiblaCompass(true));
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe("running");
    await act(async () => { window.dispatchEvent(frame({ webkitCompassHeading: 90 })); });
    const first = result.current.heading!;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) await act(async () => { window.dispatchEvent(frame({ webkitCompassHeading: 180 })); });
    expect(result.current.heading!).toBeGreaterThan(first); // the needle moves with the phone
  });

  it("asked once per session: reopening the screen doesn't ask again", async () => {
    const ask = installIOSOrientation(() => "granted");
    const a = renderHook(() => useQiblaCompass(true));
    await act(async () => { await a.result.current.start(); });
    a.unmount();
    const b = renderHook(() => useQiblaCompass(true));
    await act(async () => { await b.result.current.start(); });
    expect(b.result.current.status).toBe("running");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("no user gesture yet (iOS rejects): 'needs-gesture', NOT 'denied' — and the next tap starts it", async () => {
    let answer: Perm = "reject";
    const ask = installIOSOrientation(() => answer);
    const { result } = renderHook(() => useQiblaCompass(true));
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe("needs-gesture");
    answer = "granted";
    await act(async () => { window.dispatchEvent(new Event("touchend")); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("running");
  });

  it("denied: a clear 'denied' state", async () => {
    installIOSOrientation(() => "denied");
    const { result } = renderHook(() => useQiblaCompass(true));
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe("denied");
  });

  it("the tap that opens the Qibla screen primes the request; the screen then reuses the answer", async () => {
    const ask = installIOSOrientation(() => "granted");
    await act(async () => { await requestMotionPermission(); }); // inside the tile's click handler
    const { result } = renderHook(() => useQiblaCompass(true));
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe("running");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("Android/desktop: no prompt at all", async () => {
    installPlainOrientation();
    await expect(requestMotionPermission()).resolves.toBe("granted");
  });
});

describe("Location for the Qibla", () => {
  it("asked on first need, then reused when the screen is reopened", () => {
    const get = mockGeolocation("ok");
    const a = renderHook(() => useUserLocation(true));
    expect(a.result.current.status).toBe("ready");
    expect(a.result.current.coords).toEqual({ lat: 26.33, lng: 43.97 });
    a.unmount();
    const b = renderHook(() => useUserLocation(true));
    expect(b.result.current.status).toBe("ready");
    expect(get).toHaveBeenCalledTimes(1);
  });
});

function renderQibla(onOpenChange = vi.fn()) {
  render(
    <MemoryRouter>
      <LocaleProvider>
        <CityProvider>
          <QiblaDialog open onOpenChange={onOpenChange} />
        </CityProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
  return onOpenChange;
}

describe("Qibla screen", () => {
  it("starts the compass by itself on open — no Compass tab / button tap needed", async () => {
    installPlainOrientation();
    mockGeolocation("ok");
    const add = vi.spyOn(window, "addEventListener");
    await act(async () => { renderQibla(); });
    expect(add.mock.calls.some(([type]) => type === "deviceorientation")).toBe(true);
    add.mockRestore();
  });

  it("iOS, permission already granted this session: starts on open without asking again", async () => {
    const ask = installIOSOrientation(() => "granted");
    mockGeolocation("ok");
    await act(async () => { await requestMotionPermission(); });
    const add = vi.spyOn(window, "addEventListener");
    await act(async () => { renderQibla(); });
    await act(async () => { await Promise.resolve(); });
    expect(add.mock.calls.some(([type]) => type === "deviceorientation")).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    add.mockRestore();
  });

  it("no Compass/Map/AR/Sun & Moon bar, no latitude/longitude line; bearing, accuracy and distance stay", async () => {
    installPlainOrientation();
    mockGeolocation("ok");
    await act(async () => { renderQibla(); });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/الخارطة|الواقع المعزز|الشمس والقمر/);
    expect(text).not.toMatch(/خط العرض|خط الطول/);
    expect(text).toMatch(/اتجاه القبلة من الشمال/);
    expect(text).toMatch(/البُعد عن الكعبة/);
    expect(text).toMatch(/الدقة/);
  });

  it("denied motion access shows a clear explanation of how to enable it", async () => {
    installIOSOrientation(() => "denied");
    mockGeolocation("ok");
    await act(async () => { renderQibla(); });
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).toMatch(/تم رفض إذن الحركة والاتجاه/);
    expect(document.body.textContent).toMatch(/إعادة المحاولة/);
  });

  it("the Back button (44px) closes the Qibla screen; there's no second overlapping X", async () => {
    installPlainOrientation();
    mockGeolocation("ok");
    let onOpenChange = vi.fn();
    await act(async () => { onOpenChange = renderQibla(); });
    const back = screen.getByTestId("qibla-close");
    expect(back.className).toMatch(/h-11 w-11/);
    fireEvent.click(back);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // The generic dialog X (a direct child of the content) is hidden here — it used to sit on top
    // of the header because the old CSS selector matched an aria-label the button never had.
    expect(screen.getByRole("dialog").className).toContain("[&>button]:hidden");
  });
});
