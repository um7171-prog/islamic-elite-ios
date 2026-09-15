import { describe, it, expect, vi, beforeEach } from "vitest";

// A plain <a download> click is a silent no-op inside a Capacitor iOS
// WKWebView — no OS download manager ever catches it. Every "save the
// produced file" path (file converter, document scanner, AI image tools)
// must route through the real Share Sheet on iOS native instead. This test
// pins that behavioral contract directly, not just that the functions exist.
let iosNative = false;
vi.mock("@/lib/platform", () => ({
  isIOSNativeApp: () => iosNative,
}));

import { downloadBlob } from "@/lib/aiImage";

describe("downloadBlob (aiImage.ts) — iOS native must Share, never rely on <a download>", () => {
  beforeEach(() => {
    iosNative = false;
    vi.restoreAllMocks();
    // jsdom does not implement the Blob URL APIs the <a download> fallback uses.
    if (!URL.createObjectURL) Object.assign(URL, { createObjectURL: () => "blob:mock" });
    if (!URL.revokeObjectURL) Object.assign(URL, { revokeObjectURL: () => {} });
  });

  it("on iOS native with Share available: calls navigator.share and never clicks an <a download> link", async () => {
    iosNative = true;
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    await downloadBlob(new Blob(["x"], { type: "text/plain" }), "file.txt");

    expect(share).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("on iOS native without Share support: falls back to <a download>", async () => {
    iosNative = true;
    Object.assign(navigator, { canShare: undefined, share: undefined });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadBlob(new Blob(["x"], { type: "text/plain" }), "file.txt");

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("on web (not iOS native): uses <a download> directly, never calls navigator.share", async () => {
    iosNative = false;
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadBlob(new Blob(["x"], { type: "text/plain" }), "file.txt");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
  });

  it("user cancelling the iOS share sheet (AbortError) does not fall back to <a download>", async () => {
    iosNative = true;
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const share = vi.fn().mockRejectedValue(abortError);
    const canShare = vi.fn().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    await downloadBlob(new Blob(["x"], { type: "text/plain" }), "file.txt");

    expect(share).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
