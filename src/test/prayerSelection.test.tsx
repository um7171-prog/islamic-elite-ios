import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import PrayerTimes from "@/pages/PrayerTimes";

function renderPage() {
  localStorage.setItem("lang", "ar");
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <ThemeProvider>
          <LocaleProvider>
            <CityProvider>
              <PrayerCalcProvider>
                <PrayerTimes />
              </PrayerCalcProvider>
            </CityProvider>
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const seconds = (hms: string) => {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // Midday in the default city (Buraydah, UTC+3): after Dhuhr, before Asr.
  vi.setSystemTime(new Date("2026-09-20T09:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Prayer Times — choosing a prayer points the countdown at it", () => {
  it("defaults to the next prayer, then follows the tapped prayer, and tapping again returns to next", () => {
    renderPage();
    const bar = screen.getByTestId("next-prayer-bar");
    const nextKey = bar.getAttribute("data-target");
    expect(nextKey).toBeTruthy();

    fireEvent.click(screen.getByTestId("prayer-row-maghrib"));
    expect(bar.getAttribute("data-target")).toBe("maghrib");
    expect(bar.textContent).toMatch(/متبقي على المغرب/);
    expect(bar.className).toMatch(/bg-maghrib/);

    fireEvent.click(screen.getByTestId("prayer-row-isha"));
    expect(bar.getAttribute("data-target")).toBe("isha");
    expect(bar.className).toMatch(/bg-isha/);
    // Isha is later than Maghrib today, so its countdown is longer.
    expect(seconds(screen.getByTestId("hero-countdown").textContent ?? "")).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("prayer-row-isha"));
    expect(bar.getAttribute("data-target")).toBe(nextKey);
  });

  it("a prayer that already passed today counts down to tomorrow's time", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("prayer-row-fajr"));
    const left = seconds(screen.getByTestId("hero-countdown").textContent ?? "");
    // It's midday: tomorrow's Fajr is well over 12 hours away, and under 24.
    expect(left).toBeGreaterThan(12 * 3600);
    expect(left).toBeLessThan(24 * 3600);
  });

  it("the countdown keeps ticking for the chosen prayer", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("prayer-row-asr"));
    const before = seconds(screen.getByTestId("hero-countdown").textContent ?? "");
    act(() => { vi.advanceTimersByTime(5000); });
    const after = seconds(screen.getByTestId("hero-countdown").textContent ?? "");
    expect(before - after).toBe(5);
  });

  it("shows midnight and the last third of the night as information on the screen", () => {
    const { container } = renderPage();
    expect(container.textContent).toMatch(/منتصف الليل/);
    expect(container.textContent).toMatch(/الثلث الأخير/);
  });
});
