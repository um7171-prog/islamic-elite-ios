import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import PrayerTimes from "@/pages/PrayerTimes";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { HeroPrayerCard } from "@/components/islamic/HeroPrayerCard";
import { PrayerStrip } from "@/components/islamic/PrayerStrip";
import type { PrayerKey } from "@/lib/prayer";

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

/* The Home screen wiring, exactly as Index.tsx does it: one selection shared by the card and the strip. */
function HomeHarness() {
  const [selected, setSelected] = useState<PrayerKey | null>(null);
  return (
    <>
      <HeroPrayerCard selectedKey={selected} />
      <PrayerStrip selectedKey={selected} onSelect={setSelected} />
    </>
  );
}
function renderHome() {
  localStorage.setItem("lang", "ar");
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LocaleProvider>
          <CityProvider>
            <PrayerCalcProvider>
              <HomeHarness />
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("Home — tapping a prayer in the strip moves the MAIN countdown to it", () => {
  it("Index.tsx shares one selection between the card and the strip", () => {
    const src = readFileSync("src/pages/Index.tsx", "utf8");
    expect(src).toMatch(/<HeroPrayerCard[^>]*selectedKey=\{selectedPrayer\}/);
    expect(src).toMatch(/<PrayerStrip[^>]*selectedKey=\{selectedPrayer\}[^>]*onSelect=\{setSelectedPrayer\}/);
  });

  it("Asr -> «متبقي على العصر» counting to the real Asr time; Maghrib -> Maghrib; again -> back to next", () => {
    renderHome();
    const card = screen.getByTestId("hero-card");
    const nextKey = card.getAttribute("data-target");

    fireEvent.click(screen.getByTestId("prayer-tile-asr"));
    expect(card.getAttribute("data-target")).toBe("asr");
    expect(card.textContent).toMatch(/متبقي على العصر/);
    expect(card.textContent).toMatch(/الصلاة المختارة/);
    const toAsr = seconds(screen.getByTestId("hero-countdown").textContent ?? "");

    fireEvent.click(screen.getByTestId("prayer-tile-maghrib"));
    expect(card.getAttribute("data-target")).toBe("maghrib");
    expect(card.textContent).toMatch(/متبقي على المغرب/);
    const toMaghrib = seconds(screen.getByTestId("hero-countdown").textContent ?? "");
    expect(toMaghrib).toBeGreaterThan(toAsr); // the real times: Maghrib is after Asr

    // the strip's atmosphere follows the selection and stays (no 5-second revert)
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("maghrib");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("maghrib");
    expect(card.getAttribute("data-target")).toBe("maghrib");

    fireEvent.click(screen.getByTestId("prayer-tile-maghrib"));
    expect(card.getAttribute("data-target")).toBe(nextKey);
    expect(card.textContent).toMatch(/الصلاة القادمة/);
  });

  it("a selected prayer already passed today counts to tomorrow's, and ticks every second", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("prayer-tile-fajr"));
    const a = seconds(screen.getByTestId("hero-countdown").textContent ?? "");
    expect(a).toBeGreaterThan(12 * 3600);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(a - seconds(screen.getByTestId("hero-countdown").textContent ?? "")).toBe(3);
  });
});

// 09:00Z is 12:00 in Buraydah, a few minutes after Dhuhr (≈11:56).
describe("«منذ MM:SS» under the countdown after a prayer's time", () => {
  const sinceSeconds = () => Number(screen.getByTestId("adhan-since").getAttribute("data-seconds"));

  it("Home: shows «منذ MM:SS» UNDER the countdown; the countdown and «الصلاة القادمة» stay", () => {
    renderHome();
    const card = screen.getByTestId("hero-card");
    expect(screen.getByTestId("hero-countdown").textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(card.textContent).toMatch(/الصلاة القادمة/);
    expect(card.textContent).toMatch(/متبقي على العصر/);
    expect(screen.getByTestId("adhan-since").textContent).toMatch(/^منذ \d{2}:\d{2}$/);
  });

  it("starts at 00:00 when the prayer time enters, and counts minutes AND seconds", () => {
    renderHome();
    const age = sinceSeconds();
    cleanup();
    vi.setSystemTime(new Date(Date.now() - age * 1000)); // the exact moment Dhuhr entered
    renderHome();
    expect(screen.getByTestId("adhan-since").textContent).toBe("منذ 00:00");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId("adhan-since").textContent).toBe("منذ 00:01");
    act(() => { vi.advanceTimersByTime(15 * 60_000 + 31_000); });
    expect(screen.getByTestId("adhan-since").textContent).toBe("منذ 15:32");
  });

  it("lasts 45 minutes only (never shows hours), then only «منذ» disappears", () => {
    renderHome();
    const age = sinceSeconds();
    act(() => { vi.advanceTimersByTime((45 * 60 - 1 - age) * 1000); });
    expect(screen.getByTestId("adhan-since").textContent).toBe("منذ 44:59");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId("adhan-since")).toBeNull();
    expect(screen.getByTestId("hero-countdown")).toBeTruthy();
    expect(screen.getByTestId("hero-card").textContent).toMatch(/الصلاة القادمة/);
  });

  it("Prayer Times screen: the same «منذ» line under its countdown", () => {
    renderPage();
    expect(screen.getByTestId("hero-countdown")).toBeTruthy();
    expect(screen.getByTestId("next-prayer-bar").textContent).toMatch(/متبقي على العصر/);
    expect(screen.getByTestId("adhan-since").textContent).toMatch(/^منذ \d{2}:\d{2}$/);
  });

  it("with a prayer selected, «منذ» belongs to that prayer only", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("prayer-row-asr")); // Asr has not entered: no «منذ»
    expect(screen.queryByTestId("adhan-since")).toBeNull();
    fireEvent.click(screen.getByTestId("prayer-row-dhuhr")); // Dhuhr just entered
    expect(screen.getByTestId("adhan-since")).toBeTruthy();
    expect(screen.getByTestId("hero-countdown")).toBeTruthy(); // counts to tomorrow's Dhuhr
  });
});
