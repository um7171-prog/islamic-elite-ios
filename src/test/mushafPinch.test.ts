import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fireEvent } from "@testing-library/react";
import { createPinchInput, type PinchEvent } from "@/components/mushaf/pinchInput";
import { startNativePinch } from "@/components/mushaf/nativePinch";

const platform = vi.hoisted(() => ({ ios: true }));
const plugin = vi.hoisted(() => {
  const listeners: ((d: unknown) => void)[] = [];
  return {
    listeners,
    enable: vi.fn(async () => undefined),
    disable: vi.fn(async () => undefined),
    addListener: vi.fn(async (_event: string, cb: (d: unknown) => void) => {
      listeners.push(cb);
      return { remove: vi.fn(async () => undefined) };
    }),
  };
});
vi.mock("@/lib/platform", () => ({ isIOSNativeApp: () => platform.ios, isNativeApp: () => platform.ios, openNativeAppSettings: vi.fn() }));
vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    registerPlugin: ((name: string, impl?: never) => (name === "MushafGesture" ? plugin : actual.registerPlugin(name, impl))) as typeof actual.registerPlugin,
  };
});

const t = (clientX: number, clientY: number) => ({ clientX, clientY });

let el: HTMLDivElement;
let events: PinchEvent[];
let detach: () => void;

beforeEach(() => {
  el = document.createElement("div");
  el.style.overflowY = "auto";
  document.body.appendChild(el);
  events = [];
  detach = createPinchInput(el, { onPinch: (e) => events.push(e) }).detach;
});
afterEach(() => {
  detach();
  el.remove();
  plugin.listeners.length = 0;
});

describe("web pinch: two fingers always win over scrolling", () => {
  it("pinch start → move → end, with the scale and the point between the fingers", () => {
    fireEvent.touchStart(el, { touches: [t(100, 300), t(200, 300)] });
    fireEvent.touchMove(el, { touches: [t(50, 310), t(250, 310)] });
    fireEvent.touchEnd(el, { touches: [] });
    expect(events.map((e) => e.phase)).toEqual(["start", "change", "end"]);
    expect(events[0]).toMatchObject({ scale: 1, x: 150, y: 300 });
    expect(events[1]).toMatchObject({ scale: 2, x: 150, y: 310 });
    expect(events[2]).toMatchObject({ phase: "end", scale: 2 });
  });

  it("a pinch is never dropped because the browser marked the events non-cancelable (a scroll had started)", () => {
    fireEvent.touchStart(el, { touches: [t(100, 300), t(200, 300)], cancelable: false });
    fireEvent.touchMove(el, { touches: [t(80, 300), t(220, 300)], cancelable: false });
    fireEvent.touchEnd(el, { touches: [], cancelable: false });
    expect(events.map((e) => e.phase)).toEqual(["start", "change", "end"]);
    expect(events[1].scale).toBeCloseTo(1.4, 5);
  });

  it("while two fingers are down the scroll view is frozen, and it scrolls again as soon as they lift", () => {
    fireEvent.touchStart(el, { touches: [t(100, 300), t(200, 300)] });
    expect(el.style.overflowY).toBe("hidden");
    fireEvent.touchMove(el, { touches: [t(90, 300), t(210, 300)] });
    expect(el.style.overflowY).toBe("hidden");
    fireEvent.touchEnd(el, { touches: [t(90, 300)] }); // one finger left: back to scrolling
    expect(el.style.overflowY).toBe("auto");
  });

  it("scroll → pinch → scroll: one finger is left to native scrolling before and after", () => {
    fireEvent.touchStart(el, { touches: [t(100, 300)] });
    fireEvent.touchMove(el, { touches: [t(100, 250)] });
    expect(events).toEqual([]);
    expect(el.style.overflowY).toBe("auto");
    fireEvent.touchStart(el, { touches: [t(100, 250), t(200, 250)] });
    fireEvent.touchMove(el, { touches: [t(90, 250), t(210, 250)] });
    fireEvent.touchEnd(el, { touches: [t(90, 250)] });
    fireEvent.touchMove(el, { touches: [t(90, 200)] });
    fireEvent.touchEnd(el, { touches: [] });
    expect(events.map((e) => e.phase)).toEqual(["start", "change", "end"]);
    expect(el.style.overflowY).toBe("auto");
  });

  it("the whole-screen browser zoom is always blocked (Safari gesture events)", () => {
    const ev = new Event("gesturestart", { cancelable: true });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("a trackpad pinch (Ctrl + wheel) zooms too", () => {
    const wheel = vi.fn();
    const other = document.createElement("div");
    const input = createPinchInput(other, { onPinch: () => undefined, onWheelZoom: wheel });
    fireEvent.wheel(other, { deltaY: -50, ctrlKey: true, clientX: 10, clientY: 20 });
    fireEvent.wheel(other, { deltaY: -50 }); // a plain wheel scrolls: not a zoom
    expect(wheel).toHaveBeenCalledTimes(1);
    expect(wheel.mock.calls[0][0]).toBeGreaterThan(1);
    input.detach();
  });

  it("while the native pinch is in charge, touch events only freeze scrolling (never a second zoom)", () => {
    const input = createPinchInput(el, { onPinch: (e) => events.push(e) });
    input.setEmit(false);
    events.length = 0;
    detach(); // the default input from beforeEach
    fireEvent.touchStart(el, { touches: [t(100, 300), t(200, 300)] });
    expect(el.style.overflowY).toBe("hidden");
    fireEvent.touchMove(el, { touches: [t(50, 300), t(250, 300)] });
    fireEvent.touchEnd(el, { touches: [] });
    expect(events).toEqual([]);
    input.detach();
    detach = () => undefined;
  });
});

describe("native iPhone pinch (MushafGesture plugin)", () => {
  it("listens, enables the recognizer, forwards its events, and cleans both up", async () => {
    const got: PinchEvent[] = [];
    const stop = await startNativePinch((e) => got.push(e));
    expect(stop).not.toBeNull();
    expect(plugin.addListener).toHaveBeenCalledWith("pinch", expect.any(Function));
    expect(plugin.enable).toHaveBeenCalledTimes(1);
    plugin.listeners[0]({ phase: "start", scale: 1, x: 120, y: 400 });
    plugin.listeners[0]({ phase: "change", scale: 1.8, x: 121, y: 401 });
    plugin.listeners[0]({ phase: "cancel", scale: 1.8, x: 121, y: 401 });
    expect(got.map((e) => e.phase)).toEqual(["start", "change", "end"]);
    expect(got[1]).toMatchObject({ scale: 1.8, x: 121, y: 401 });
    stop!();
    expect(plugin.disable).toHaveBeenCalledTimes(1);
  });

  it("outside the iPhone app, or when the native side is missing, the web pinch is used instead", async () => {
    platform.ios = false;
    expect(await startNativePinch(() => undefined)).toBeNull();
    platform.ios = true;
    plugin.enable.mockRejectedValueOnce(new Error("not implemented"));
    expect(await startNativePinch(() => undefined)).toBeNull();
  });
});

describe("native wiring (what the iPhone build contains)", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("MushafGesturePlugin.swift exists, is compiled, and is registered under the name the JS uses", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(existsSync("ios/App/App/MushafGesturePlugin.swift")).toBe(true);
    expect(pbx).toMatch(/MushafGesturePlugin\.swift in Sources/);
    expect(pbx).toContain("path = MushafGesturePlugin.swift");
    expect(read("ios/App/App/MainViewController.swift")).toMatch(/registerPluginInstance\(MushafGesturePlugin\(\)\)/);
    expect(read("ios/App/App/MushafGesturePlugin.swift")).toMatch(/jsName = "MushafGesture"/);
    expect(read("src/components/mushaf/nativePinch.ts")).toMatch(/registerPlugin<MushafGesturePlugin>\("MushafGesture"\)/);
  });

  it("a UIKit pinch recognizer that runs alongside the web view and pauses its scroll views while pinching", () => {
    const swift = read("ios/App/App/MushafGesturePlugin.swift");
    expect(swift).toMatch(/UIPinchGestureRecognizer/);
    expect(swift).toMatch(/shouldRecognizeSimultaneouslyWith/);
    expect(swift).toMatch(/cancelsTouchesInView = false/);
    expect(swift).toMatch(/panGestureRecognizer\.isEnabled = false/);
    expect(swift).toMatch(/isEnabled = true/);
    expect(swift).toMatch(/notifyListeners\("pinch"/);
  });
});
