import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { MapsAppSettingRow } from "@/components/site/MapsAppSetting";

const platform = vi.hoisted(() => ({ ios: true }));
const mapsPlugin = vi.hoisted(() => ({ open: vi.fn(), canOpen: vi.fn() }));
vi.mock("@/lib/platform", () => ({
  isIOSNativeApp: () => platform.ios,
  isNativeApp: () => platform.ios,
  openNativeAppSettings: vi.fn(),
}));
vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    registerPlugin: ((name: string, impl?: never) => (name === "MapsLauncher" ? mapsPlugin : actual.registerPlugin(name, impl))) as typeof actual.registerPlugin,
  };
});

const MAPS_KEY = "elite.mapsApp.v1";

function row() {
  return (
    <LocaleProvider>
      <MapsAppSettingRow />
    </LocaleProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "ar");
  platform.ios = true;
  mapsPlugin.canOpen.mockReset().mockResolvedValue({ value: true });
});
afterEach(cleanup);

describe("Settings → Location → Maps app", () => {
  it("iPhone app: shows the current choice (asked on first use until one is made)", () => {
    render(row());
    expect(screen.getByText("تطبيق الخرائط")).toBeInTheDocument();
    expect(screen.getByText("يُسأل عند أول استخدام")).toBeInTheDocument();
  });

  it("changing it saves the new app, and the row shows it", async () => {
    localStorage.setItem(MAPS_KEY, "apple");
    render(row());
    expect(screen.getByText("خرائط Apple")).toBeInTheDocument();
    fireEvent.click(screen.getByText("تطبيق الخرائط"));
    fireEvent.click(await screen.findByRole("radio", { name: /خرائط Google/ }));
    expect(localStorage.getItem(MAPS_KEY)).toBe("google");
    await waitFor(() => expect(screen.queryByRole("radio")).toBeNull());
    expect(screen.getByText("خرائط Google")).toBeInTheDocument();
  });

  it("marks Google Maps as not installed when iOS says so", async () => {
    mapsPlugin.canOpen.mockResolvedValue({ value: false });
    render(row());
    fireEvent.click(screen.getByText("تطبيق الخرائط"));
    expect(await screen.findByText("غير مثبت على جهازك — سيُفتح في المتصفح")).toBeInTheDocument();
  });

  it("outside the iPhone app there is nothing to choose (the web always uses Google Maps links)", () => {
    platform.ios = false;
    const { container } = render(row());
    expect(container).toBeEmptyDOMElement();
  });
});
