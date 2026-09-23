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
  it("defaults to the automatic prayer, then follows the tapped prayer, and tapping again returns to it", () => {
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

// 09:00Z is 12:00 in Buraydah, a few minutes after Dhuhr (≈11:56): inside the 30-minute window.
describe("Prayer Times — «أذّن منذ…» for 30 minutes after the adhan", () => {
  it("after the adhan it stays on that prayer and shows «أذّن منذ N …» instead of jumping to the next", () => {
    renderPage();
    const bar = screen.getByTestId("next-prayer-bar");
    expect(bar.getAttribute("data-mode")).toBe("since");
    expect(bar.getAttribute("data-target")).toBe("dhuhr");
    expect(bar.className).toMatch(/bg-dhuhr/);
    expect(screen.getByTestId("adhan-since").textContent).toMatch(/^أذّن منذ (دقيقتين|\d+ دقائق)$/);
    expect(screen.queryByTestId("hero-countdown")).toBeNull();
  });

  it("updates by itself every minute", () => {
    renderPage();
    const m0 = Number(screen.getByTestId("adhan-since").getAttribute("data-minutes"));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(Number(screen.getByTestId("adhan-since").getAttribute("data-minutes"))).toBe(m0 + 1);
  });

  it("after 30 minutes it returns to the normal countdown to the next prayer", () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(30 * 60_000); });
    const bar = screen.getByTestId("next-prayer-bar");
    expect(bar.getAttribute("data-mode")).toBe("countdown");
    expect(bar.getAttribute("data-target")).toBe("asr");
    expect(bar.textContent).toMatch(/متبقي على العصر/);
  });

  it("with a prayer selected, «أذّن منذ…» belongs to that prayer only", () => {
    renderPage();
    const bar = screen.getByTestId("next-prayer-bar");
    fireEvent.click(screen.getByTestId("prayer-row-asr")); // not yet: a countdown
    expect(bar.getAttribute("data-mode")).toBe("countdown");
    expect(bar.textContent).toMatch(/متبقي على العصر/);
    fireEvent.click(screen.getByTestId("prayer-row-dhuhr")); // its adhan just passed
    expect(bar.getAttribute("data-mode")).toBe("since");
    expect(bar.getAttribute("data-target")).toBe("dhuhr");
    expect(screen.getByTestId("adhan-since").textContent).toMatch(/^أذّن منذ/);
  });

  it("Arabic minute forms: دقيقة، دقيقتين، 3–10 دقائق، 11+ دقيقة", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("prayer-row-dhuhr"));
    const seen = new Set<string>();
    for (let i = 0; i < 26; i++) {
      seen.add(screen.getByTestId("adhan-since").textContent ?? "");
      act(() => { vi.advanceTimersByTime(60_000); });
    }
    const all = [...seen].join(" | ");
    expect(all).toMatch(/أذّن منذ 10 دقائق/);
    expect(all).toMatch(/أذّن منذ 11 دقيقة/);
  });
});

describe("Prayer Times — «أذّن منذ دقيقة/دقيقتين» at the start of the window", () => {
  it("counts دقيقة then دقيقتين right after the adhan", () => {
    // Walk back from 12:00 to the first minute after Dhuhr, reading the minutes shown.
    renderPage();
    const m = Number(screen.getByTestId("adhan-since").getAttribute("data-minutes"));
    cleanup();
    vi.setSystemTime(new Date(Date.now() - (m - 1) * 60_000));
    renderPage();
    expect(screen.getByTestId("adhan-since").textContent).toBe("أذّن منذ دقيقة");
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByTestId("adhan-since").textContent).toBe("أذّن منذ دقيقتين");
  });
});
