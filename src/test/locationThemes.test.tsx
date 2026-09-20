import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { CityProvider, useCity } from "@/contexts/CityContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { haversineKm, nearestCity } from "@/lib/geo";
import { ALL_THEME_VARS, THEMES, THEME_STORAGE_KEY, themeById } from "@/lib/themes";
import { LOCAL_LOCATIONS } from "@/lib/locations";

/* ---------- geo ---------- */
describe("geo helpers", () => {
  it("haversine: Riyadh <-> Jeddah is ~ 850 km", () => {
    const riyadh = LOCAL_LOCATIONS.find((c) => c.id === "sa-riyadh")!;
    const jeddah = LOCAL_LOCATIONS.find((c) => c.id === "sa-jeddah")!;
    const km = haversineKm(riyadh, jeddah);
    expect(km).toBeGreaterThan(820);
    expect(km).toBeLessThan(880);
  });

  it("nearestCity maps a GPS point to the closest known city", () => {
    expect(nearestCity(24.72, 46.68).city.id).toBe("sa-riyadh");
    expect(nearestCity(21.42, 39.83).city.id).toBe("sa-makkah");
    expect(nearestCity(26.33, 43.97).city.id).toBe("sa-buraydah");
  });
});

/* ---------- themes ---------- */
const hslToRgb = (triplet: string) => {
  const [h, s, l] = triplet.replace(/%/g, "").split(/\s+/).map(Number);
  const S = s / 100, L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return L - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
};
const lum = (rgb: number[]) => {
  const c = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const la = lum(hslToRgb(a)), lb = lum(hslToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe("theme catalogue", () => {
  it("has the five themes with premium metadata (Emerald free, others premium)", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["emerald", "makkah", "madinah", "layl", "heritage"]);
    expect(THEMES.filter((t) => !t.isPremium).map((t) => t.id)).toEqual(["emerald"]);
    for (const t of THEMES) {
      expect(t.name).toMatch(/[؀-ۿ]/);
      expect(t.englishName).toMatch(/^[A-Za-z]+$/);
    }
  });

  it("every non-default theme defines a full token set for BOTH light and dark", () => {
    for (const t of THEMES.filter((x) => x.id !== "emerald")) {
      for (const mode of ["light", "night"] as const) {
        for (const v of ["--background", "--foreground", "--card", "--primary", "--accent", "--border", "--header-a", "--header-b"]) {
          expect(t.tokens[mode][v as keyof (typeof t.tokens)[typeof mode]], `${t.id}/${mode}/${v}`).toBeTruthy();
        }
      }
    }
  });

  it("body text and primary buttons are readable in every theme and appearance", () => {
    for (const t of THEMES.filter((x) => x.id !== "emerald")) {
      for (const mode of ["light", "night"] as const) {
        const k = t.tokens[mode];
        expect(ratio(k["--foreground"]!, k["--background"]!), `${t.id}/${mode} text`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(k["--foreground"]!, k["--card"]!), `${t.id}/${mode} card text`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(k["--primary-foreground"]!, k["--primary"]!), `${t.id}/${mode} primary`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("unknown ids fall back to Emerald", () => {
    expect(themeById("nope").id).toBe("emerald");
    expect(themeById(null).id).toBe("emerald");
  });
});

let themeApi: ReturnType<typeof useTheme> | null = null;
const ThemeProbe = () => { themeApi = useTheme(); return null; };

describe("ThemeProvider: theme is independent of appearance", () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("style"); delete document.documentElement.dataset.theme; });

  it("applies theme tokens, keeps them across appearance changes, and persists", async () => {
    localStorage.setItem("theme-mode", "light");
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("emerald");
    expect(root.style.getPropertyValue("--header-a")).toBe(""); // emerald = css defaults

    act(() => themeApi!.setThemeId("makkah"));
    expect(root.dataset.theme).toBe("makkah");
    const lightHeader = root.style.getPropertyValue("--header-a");
    expect(lightHeader).toBe(themeById("makkah").tokens.light["--header-a"]);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("makkah");

    act(() => themeApi!.setMode("night")); // same theme, dark appearance
    expect(root.dataset.theme).toBe("makkah");
    expect(root.style.getPropertyValue("--header-a")).toBe(themeById("makkah").tokens.night["--header-a"]);
    expect(root.style.getPropertyValue("--header-a")).not.toBe(lightHeader);

    act(() => themeApi!.setThemeId("emerald")); // switching back clears every override
    for (const v of ALL_THEME_VARS) expect(root.style.getPropertyValue(v)).toBe("");
  });

  it("restores the saved theme on load", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "heritage");
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(themeApi!.themeId).toBe("heritage");
  });
});

/* ---------- automatic location ---------- */
let cityApi: ReturnType<typeof useCity> | null = null;
const CityProbe = () => { cityApi = useCity(); return null; };

function mockGeolocation(opts: { permission: "granted" | "prompt" | "denied"; lat?: number; lng?: number; error?: number }) {
  Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: opts.permission }) }, configurable: true });
  const getCurrentPosition = vi.fn((ok: PositionCallback, err: PositionErrorCallback) => {
    if (opts.error) err({ code: opts.error } as GeolocationPositionError);
    else ok({ coords: { latitude: opts.lat ?? 0, longitude: opts.lng ?? 0, accuracy: 20 } } as GeolocationPosition);
  });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
}

describe("CityProvider: automatic location", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "permissions", { value: undefined, configurable: true });
  });

  it("defaults ON and, with permission granted, applies the real fix (nearest city name, exact GPS coordinates)", async () => {
    mockGeolocation({ permission: "granted", lat: 24.72, lng: 46.68 });
    render(<CityProvider><CityProbe /></CityProvider>);
    await waitFor(() => expect(cityApi!.status).toBe("ok"));
    expect(cityApi!.auto).toBe(true);
    expect(cityApi!.city.en).toBe("Riyadh");
    expect(cityApi!.city.lat).toBe(24.72);
    expect(cityApi!.city.lng).toBe(46.68);
    // stored in the existing keys (no second storage for the city)
    expect(localStorage.getItem("city.id")).toBe("auto-gps");
    expect(JSON.parse(localStorage.getItem("city.custom")!).en).toBe("Riyadh");
  });

  it("city-centre option uses the nearest city's own coordinates instead of the GPS point", async () => {
    mockGeolocation({ permission: "granted", lat: 24.72, lng: 46.68 });
    render(<CityProvider><CityProbe /></CityProvider>);
    await waitFor(() => expect(cityApi!.status).toBe("ok"));
    act(() => cityApi!.setUseCityCenter(true));
    await waitFor(() => expect(cityApi!.city.id).toBe("sa-riyadh"));
    expect(cityApi!.city.lat).toBeCloseTo(24.7136, 3);
  });

  it("never prompts on its own: undecided permission only reports 'needs-permission', keeping the saved city", async () => {
    const spy = mockGeolocation({ permission: "prompt", lat: 21.42, lng: 39.83 });
    render(<CityProvider><CityProbe /></CityProvider>);
    await waitFor(() => expect(cityApi!.status).toBe("needs-permission"));
    expect(spy).not.toHaveBeenCalled();
    expect(cityApi!.city.id).toBe("sa-buraydah");
    await act(async () => { await cityApi!.requestLocation(); }); // explicit user action
    expect(spy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(cityApi!.status).toBe("ok"));
    expect(cityApi!.city.en).toBe("Makkah");
  });

  it("maps failures to real states: denied, unavailable, unsupported", async () => {
    mockGeolocation({ permission: "denied" });
    const { unmount } = render(<CityProvider><CityProbe /></CityProvider>);
    await waitFor(() => expect(cityApi!.status).toBe("denied"));
    unmount();

    mockGeolocation({ permission: "granted", error: 2 });
    const r2 = render(<CityProvider><CityProbe /></CityProvider>);
    await waitFor(() => expect(cityApi!.status).toBe("unavailable"));
    r2.unmount();

    Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    render(<CityProvider><CityProbe /></CityProvider>);
    await waitFor(() => expect(cityApi!.status).toBe("unsupported"));
  });

  it("choosing a city by hand turns automatic OFF and keeps that city (persisted)", async () => {
    mockGeolocation({ permission: "granted", lat: 24.72, lng: 46.68 });
    render(<CityProvider><CityProbe /></CityProvider>);
    await waitFor(() => expect(cityApi!.status).toBe("ok"));
    act(() => cityApi!.setCityId("sa-jeddah"));
    expect(cityApi!.auto).toBe(false);
    expect(cityApi!.city.id).toBe("sa-jeddah");
    expect(cityApi!.status).toBe("off");
    expect(localStorage.getItem("elite.location.auto.v1")).toBe("off");
    expect(localStorage.getItem("city.id")).toBe("sa-jeddah");
  });
});
