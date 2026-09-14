import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PermissionStatus } from "@capacitor/local-notifications";

// Mock the native Capacitor local-notifications plugin before importing the
// module under test, so checkPermissions()/requestPermissions() are spies
// instead of a real native bridge call.
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
  },
}));

import { LocalNotifications } from "@capacitor/local-notifications";
import { checkOrRequestNotificationPermission } from "@/lib/nativeAthan";

const checkPermissions = vi.mocked(LocalNotifications.checkPermissions);
const requestPermissions = vi.mocked(LocalNotifications.requestPermissions);

function status(display: PermissionStatus["display"]): PermissionStatus {
  return { display };
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

describe("checkOrRequestNotificationPermission — unified permission gate", () => {
  beforeEach(() => {
    checkPermissions.mockReset();
    requestPermissions.mockReset();
  });
  afterEach(() => {
    mockNative(false);
  });

  it("on the web (not native), never touches the plugin and reports not granted", async () => {
    mockNative(false);
    const res = await checkOrRequestNotificationPermission(true);
    expect(res).toEqual({ status: "prompt", granted: false });
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("allowPrompt=false + status already granted: reports granted, never calls requestPermissions", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("granted"));
    const res = await checkOrRequestNotificationPermission(false);
    expect(res).toEqual({ status: "granted", granted: true });
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("allowPrompt=false + status undecided ('prompt'): does NOT show the system dialog", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("prompt"));
    const res = await checkOrRequestNotificationPermission(false);
    expect(res).toEqual({ status: "prompt", granted: false });
    // This is the core fix: automatic/passive callers must never trigger
    // Apple's system dialog on their own.
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("allowPrompt=false + status already denied: reports denied, never re-prompts", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("denied"));
    const res = await checkOrRequestNotificationPermission(false);
    expect(res).toEqual({ status: "denied", granted: false });
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("allowPrompt=true + status undecided: DOES request, and reports the granted result", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("prompt"));
    requestPermissions.mockResolvedValue(status("granted"));
    const res = await checkOrRequestNotificationPermission(true);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ status: "granted", granted: true });
  });

  it("allowPrompt=true + user denies the system dialog: reports denied", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("prompt"));
    requestPermissions.mockResolvedValue(status("denied"));
    const res = await checkOrRequestNotificationPermission(true);
    expect(res).toEqual({ status: "denied", granted: false });
  });

  it("allowPrompt=true + status already decided (granted): does NOT call requestPermissions again", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("granted"));
    const res = await checkOrRequestNotificationPermission(true);
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(res).toEqual({ status: "granted", granted: true });
  });

  it("allowPrompt=true + status already decided (denied): does NOT re-trigger the system dialog", async () => {
    mockNative(true);
    checkPermissions.mockResolvedValue(status("denied"));
    const res = await checkOrRequestNotificationPermission(true);
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(res).toEqual({ status: "denied", granted: false });
  });
});
