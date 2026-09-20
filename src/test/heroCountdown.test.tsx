import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import { HeroPrayerCard } from "@/components/islamic/HeroPrayerCard";
import { SERVICE_TOOLS } from "@/components/services/ServicesHub";

function renderHero(lang: "ar" | "en") {
  localStorage.setItem("lang", lang);
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LocaleProvider>
          <CityProvider>
            <PrayerCalcProvider>
              <HeroPrayerCard />
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // Midday, well away from any prayer boundary in the default city.
  vi.setSystemTime(new Date("2026-09-20T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Home hero — next-prayer phrase", () => {
  it('reads "متبقي على <الصلاة>" as one phrase (never "متبقي <الصلاة>")', () => {
    const { container } = renderHero("ar");
    const text = container.textContent ?? "";
    expect(text).toMatch(/متبقي على (الفجر|الشروق|الظهر|العصر|المغرب|العشاء)/);
    expect(text).not.toMatch(/متبقي (الفجر|الشروق|الظهر|العصر|المغرب|العشاء)/);
    expect(screen.getByTestId("hero-countdown").textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("names the prayer exactly once inside the card", () => {
    const { container } = renderHero("ar");
    const names = (container.textContent ?? "").match(/الفجر|الشروق|الظهر|العصر|المغرب|العشاء/g) ?? [];
    expect(names).toHaveLength(1);
  });

  it('uses "Remaining until <Prayer>" in English', () => {
    const { container } = renderHero("en");
    expect(container.textContent).toMatch(/Remaining until (Fajr|Sunrise|Dhuhr|Asr|Maghrib|Isha)/);
  });
});

describe("Weather removal", () => {
  it("no service tile mentions weather", () => {
    for (const tool of SERVICE_TOOLS) {
      expect(`${tool.id} ${tool.en} ${tool.ar} ${tool.keywords}`).not.toMatch(/weather|طقس/i);
    }
  });
});
