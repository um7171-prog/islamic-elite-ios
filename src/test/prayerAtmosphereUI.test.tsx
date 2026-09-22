import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import { PrayerStrip } from "@/components/islamic/PrayerStrip";
import { getPrayerTimes } from "@/lib/prayer";

const BURAYDAH = { lat: 26.326, lng: 43.975 };

function renderStrip() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LocaleProvider>
          <CityProvider>
            <PrayerCalcProvider>
              <PrayerStrip />
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Jumps the fake clock to `offsetMin` minutes after `key`'s time on the given day, using the
 * SAME prayer-time source the component itself reads, so the target is always correct. */
function timeAt(day: string, key: string, offsetMin: number) {
  const { entries } = getPrayerTimes(new Date(day), BURAYDAH.lat, BURAYDAH.lng, "hanbali", undefined);
  return new Date(entries.find((e) => e.key === key)!.time.getTime() + offsetMin * 60_000);
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("Home prayer-time atmosphere", () => {
  it("matches the real current period on load (e.g. just after Dhuhr)", () => {
    vi.setSystemTime(timeAt("2026-09-20", "dhuhr", 5));
    renderStrip();
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("dhuhr");
  });

  it("automatically switches the moment a new prayer's time arrives — no tap needed", () => {
    vi.setSystemTime(timeAt("2026-09-20", "maghrib", -30));
    renderStrip();
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("asr");
    act(() => {
      vi.setSystemTime(timeAt("2026-09-20", "maghrib", 1));
      vi.advanceTimersByTime(1000); // the strip's own 1s tick picks it up
    });
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("maghrib");
  });

  it("includes Sunrise as its own atmosphere (not silently reusing Dhuhr's)", () => {
    vi.setSystemTime(timeAt("2026-09-20", "sunrise", 5));
    renderStrip();
    const el = screen.getByTestId("prayer-atmosphere");
    expect(el.getAttribute("data-atmosphere")).toBe("sunrise");
    expect(el.querySelector(".bg-sunrise")).toBeTruthy();
  });

  it("tapping a prayer tile PREVIEWS its atmosphere without changing the real one", () => {
    vi.setSystemTime(timeAt("2026-09-20", "asr", 10)); // real = asr
    renderStrip();
    fireEvent.click(screen.getByTestId("prayer-tile-maghrib"));
    const el = screen.getByTestId("prayer-atmosphere");
    expect(el.getAttribute("data-atmosphere")).toBe("maghrib");
    expect(el.getAttribute("data-previewing")).toBe("true");
  });

  it("a preview reverts to the real atmosphere after it times out", () => {
    vi.setSystemTime(timeAt("2026-09-20", "asr", 10));
    renderStrip();
    fireEvent.click(screen.getByTestId("prayer-tile-isha"));
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("isha");
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("asr");
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-previewing")).toBe("false");
  });

  it("tapping the SAME (real) tile again just clears the preview (no-op visually)", () => {
    vi.setSystemTime(timeAt("2026-09-20", "dhuhr", 5));
    renderStrip();
    fireEvent.click(screen.getByTestId("prayer-tile-dhuhr"));
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-previewing")).toBe("false");
  });

  it("the real time moving on drops a stale preview even before its own timeout", () => {
    vi.setSystemTime(timeAt("2026-09-20", "maghrib", -5)); // real = asr
    renderStrip();
    fireEvent.click(screen.getByTestId("prayer-tile-isha")); // preview isha
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).toBe("isha");
    act(() => {
      vi.setSystemTime(timeAt("2026-09-20", "maghrib", 1)); // real time now enters maghrib
      vi.advanceTimersByTime(1000);
    });
    const el = screen.getByTestId("prayer-atmosphere");
    expect(el.getAttribute("data-atmosphere")).toBe("maghrib"); // real, not the stale isha preview
    expect(el.getAttribute("data-previewing")).toBe("false");
  });

  it("the gradient cross-fades: an incoming layer appears, then settles into the base layer on animation end", () => {
    vi.setSystemTime(timeAt("2026-09-20", "dhuhr", 5));
    renderStrip();
    fireEvent.click(screen.getByTestId("prayer-tile-isha"));
    const wrap = screen.getByTestId("prayer-atmosphere");
    const incoming = wrap.querySelector(".atmosphere-fade-in");
    expect(incoming).toBeTruthy();
    expect(incoming!.className).toContain("bg-isha");
    fireEvent.animationEnd(incoming!);
    expect(wrap.querySelector(".atmosphere-fade-in")).toBeNull(); // settled: only the base layer remains
    expect(wrap.querySelector(".bg-isha")).toBeTruthy();
  });

  it("decorative background layers never block the prayer buttons (aria-hidden, tiles remain clickable)", () => {
    vi.setSystemTime(timeAt("2026-09-20", "dhuhr", 5));
    renderStrip();
    const wrap = screen.getByTestId("prayer-atmosphere");
    wrap.querySelectorAll('[aria-hidden="true"]').forEach((el) => expect(el.className).not.toMatch(/prayer-tile/));
    const before = screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere");
    fireEvent.click(screen.getByTestId("prayer-tile-fajr"));
    expect(screen.getByTestId("prayer-atmosphere").getAttribute("data-atmosphere")).not.toBe(before === "fajr" ? "__never__" : before);
  });

  it("CSS: the fade is a lightweight opacity animation, instant under prefers-reduced-motion", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/@keyframes atmosphere-fade-in \{\s*from \{ opacity: 0; \}\s*to \{ opacity: 1; \}\s*\}/);
    expect(css).toMatch(/\.atmosphere-fade-in \{ animation: atmosphere-fade-in 900ms/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.atmosphere-fade-in[\s\S]*?\}/);
    expect(reduced).toBeTruthy();
  });

  it("does not replace the Haram hero video component (still present alongside the strip)", () => {
    const source = readFileSync("src/components/islamic/HomeHeader.tsx", "utf8");
    expect(source).toMatch(/HaramHero/);
  });
});
