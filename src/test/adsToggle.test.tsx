import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { isAdsEnabled, setAdsEnabled } from "@/lib/adsConfig";
import { LocaleProvider } from "@/contexts/LocaleContext";

vi.mock("@/lib/platform", () => ({ isIOSNativeApp: () => iosNative, isNativeApp: () => iosNative }));
let iosNative = false;

describe("Ads ON/OFF setting", () => {
  beforeEach(() => { localStorage.clear(); iosNative = false; });

  it("defaults to ON (matches the app's existing behaviour before the switch existed)", () => {
    expect(isAdsEnabled()).toBe(true);
  });

  it("setAdsEnabled(false) is respected by isAdsEnabled()", () => {
    setAdsEnabled(false);
    expect(isAdsEnabled()).toBe(false);
    setAdsEnabled(true);
    expect(isAdsEnabled()).toBe(true);
  });
});

describe("AdSlot respects the setting (and is still never shown on iOS native)", () => {
  afterEach(() => cleanup());

  it("renders nothing when ads are disabled, even with a configured slot", async () => {
    setAdsEnabled(false);
    const { AdSlot } = await import("@/components/ads/AdSlot");
    const { container } = render(<AdSlot slot="fileConverterResult" />);
    expect(container.querySelector("ins")).toBeNull();
  });

  it("renders the slot when ads are enabled (web) with a configured slot id", async () => {
    setAdsEnabled(true);
    const { AdSlot } = await import("@/components/ads/AdSlot");
    const { container } = render(<AdSlot slot="fileConverterResult" />);
    await waitFor(() => expect(container.querySelector("ins")).toBeTruthy());
  });

  it("never renders on iOS native, even with ads enabled", async () => {
    setAdsEnabled(true);
    iosNative = true;
    const { AdSlot } = await import("@/components/ads/AdSlot");
    const { container } = render(<AdSlot slot="fileConverterResult" />);
    expect(container.querySelector("ins")).toBeNull();
  });
});

describe("InterstitialAd respects the setting", () => {
  beforeEach(() => { localStorage.clear(); iosNative = false; });
  afterEach(() => cleanup());

  it("auto-closes immediately when ads are disabled instead of showing anything", async () => {
    setAdsEnabled(false);
    const { InterstitialAd } = await import("@/components/ads/InterstitialAd");
    const onClose = vi.fn();
    render(<LocaleProvider><InterstitialAd open slot="fileConverterResult" onClose={onClose} /></LocaleProvider>);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("ads never appear in worship-sensitive screens (source audit)", () => {
  it("no AdSlot/InterstitialAd usage in prayer, Quran, Athkar, Qibla or the scanner", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const sensitive = [
      "src/pages/PrayerTimes.tsx",
      "src/pages/QuranIndexPage.tsx",
      "src/pages/Mushaf.tsx",
      "src/pages/AthkarPage.tsx",
      "src/pages/QiblaPage.tsx",
      "src/components/scanner/DocumentScannerDialog.tsx",
    ].filter((f) => { try { readFileSync(f); return true; } catch { return false; } });
    expect(sensitive.length).toBeGreaterThan(3); // sanity: the paths above actually resolved
    for (const f of sensitive) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/<AdSlot|<InterstitialAd/);
    }
    void readdirSync; // silence unused-import in case none of the optional paths exist
  });
});
