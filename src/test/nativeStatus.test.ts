import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PermissionStatus, PendingResult } from "@capacitor/local-notifications";

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getPending: vi.fn(),
  },
}));

import { LocalNotifications } from "@capacitor/local-notifications";
import { getNativeStatus } from "@/lib/nativeAthan";

const checkPermissions = vi.mocked(LocalNotifications.checkPermissions);
const requestPermissions = vi.mocked(LocalNotifications.requestPermissions);
const getPending = vi.mocked(LocalNotifications.getPending);

function status(display: PermissionStatus["display"]): PermissionStatus {
  return { display };
}
function pending(notifications: PendingResult["notifications"]): PendingResult {
  return { notifications };
}

interface FakeCapacitor {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
}
declare global {
  var Capacitor: FakeCapacitor | undefined;
}
function mockNative(isNative: boolean) {
  globalThis.Capacitor = isNative
    ? { isNativePlatform: () => true, getPlatform: () => "ios" }
    : undefined;
}

describe("getNativeStatus — reads permission through the unified gate, never prompts", () => {
  beforeEach(() => {
    checkPermissions.mockReset();
    requestPermissions.mockReset();
    getPending.mockReset();
    getPending.mockResolvedValue(pending([]));
  });
  afterEach(() => mockNative(false));

  it("on the web, reports unsupported without touching the plugin", async () => {
    mockNative(false);
    const res = await getNativeStatus();
    expect(res.supported).toBe(false);
    expect(checkPermissions).not.toHaveBeenCalled();
  });

  it("reflects a granted permission and never calls requestPermissions", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("granted"));
    const res = await getNativeStatus();
    expect(res.supported).toBe(true);
    expect(res.granted).toBe(true);
    expect(res.permission).toBe("granted");
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("reflects an undecided ('prompt') permission WITHOUT triggering the system dialog", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("prompt"));
    const res = await getNativeStatus();
    expect(res.granted).toBe(false);
    expect(res.permission).toBe("prompt");
    // This is the whole point of routing status display through the
    // read-only gate: just checking status must never pop Apple's dialog.
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("reflects a denied permission and never re-prompts", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("denied"));
    const res = await getNativeStatus();
    expect(res.granted).toBe(false);
    expect(res.permission).toBe("denied");
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("reports pending notification count and next date from getPending()", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("granted"));
    const at = new Date(Date.now() + 60_000).toISOString();
    getPending.mockResolvedValue(pending([
      { id: 10001, title: "Fajr", schedule: { at } } as PendingResult["notifications"][number],
    ]));
    const res = await getNativeStatus();
    expect(res.pending).toBe(1);
    expect(res.next?.toISOString()).toBe(new Date(at).toISOString());
  });
});
