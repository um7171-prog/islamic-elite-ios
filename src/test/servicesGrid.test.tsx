import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import { ServicesHub, SERVICE_TOOLS, DIALOG_TOOL_IDS, ROUTE_TOOL_TARGETS } from "@/components/services/ServicesHub";

// Every route path actually registered in src/App.tsx (TOOL_PATHS + the
// explicit <Route path="..."> list) — kept here as a plain, hand-verified
// snapshot so a service tile can never silently point at a page that
// doesn't exist ("no dead links" requirement).
const REGISTERED_ROUTES = new Set([
  "/", "/tools", "/media", "/calendar", "/athkar", "/qibla", "/quran", "/tasbeeh",
  "/translate", "/weather", "/notifications", "/qr-scanner", "/document-scanner",
  "/asma-al-husna", "/about", "/admin", "/ai", "/ai/background-remover",
  "/ai/image-enhancer", "/ai/ocr", "/contact", "/convert", "/cookies", "/disclaimer",
  "/faq", "/government-jobs", "/mushaf", "/notification-diagnostics", "/privacy",
  "/reset-password", "/saudi-jobs", "/saudi-jobs/:id", "/settings", "/sitemap", "/terms",
]);

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

function renderGrid(initialOpen: string | null = null) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LocaleProvider>
          <CityProvider>
            <PrayerCalcProvider>
              <ServicesHub
                initialOpen={initialOpen}
              />
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockClear();
  localStorage.clear();
  // jsdom's default navigator.language is "en-US", so LocaleContext would
  // otherwise default to English here — pin Arabic as the baseline for
  // tests that assert Arabic text; the two toggle tests below explicitly
  // override this to "en" to prove the switch itself works.
  localStorage.setItem("lang", "ar");
});

describe("Unified Services grid — data integrity (no dead links)", () => {
  it("every route-kind tool points at a route that actually exists in App.tsx", () => {
    for (const target of ROUTE_TOOL_TARGETS) {
      expect(REGISTERED_ROUTES.has(target)).toBe(true);
    }
  });

  it("has no duplicate tool ids", () => {
    const ids = SERVICE_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every tool has a non-empty Arabic name, English name, and a working icon", () => {
    for (const tool of SERVICE_TOOLS) {
      expect(tool.ar.trim().length).toBeGreaterThan(0);
      expect(tool.en.trim().length).toBeGreaterThan(0);
      expect(tool.Icon).toBeTruthy();
    }
  });
});

describe("Unified Services grid — confirmed services actually render", () => {
  it("shows every explicitly-requested confirmed-working service", () => {
    renderGrid();
    const expected = [
      "القرآن الكريم", // Quran
      "الأذكار", // Athkar
      "القبلة", // Qibla
      "مواقيت الصلاة", // Prayer times
      "التقويم", // Calendar
      "أسماء الله الحسنى", // 99 Names
      "كل المناسبات الإسلامية", // Islamic occasions (includes Ramadan)
    ];
    for (const label of expected) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("does not render a tile for Islamic education or Islamic wallpapers — they don't exist yet", () => {
    renderGrid();
    // Guards against ever silently adding a fake card before those features
    // are actually built (per the explicit instruction not to fabricate them).
    expect(screen.queryByText("التعليم الإسلامي")).not.toBeInTheDocument();
    expect(screen.queryByText("الخلفيات الإسلامية")).not.toBeInTheDocument();
  });
});

describe("Unified Services grid — navigation actually works", () => {
  it("tapping the Quran tile navigates to /mushaf (kept exactly as before, not QuranDialog)", () => {
    renderGrid();
    fireEvent.click(screen.getByText("القرآن الكريم"));
    expect(navigateMock).toHaveBeenCalledWith("/mushaf");
  });

  it("tapping the Prayer Times tile navigates home", () => {
    renderGrid();
    fireEvent.click(screen.getByText("مواقيت الصلاة"));
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("tapping the Calendar tile navigates to /calendar", () => {
    renderGrid();
    fireEvent.click(screen.getByText("التقويم"));
    expect(navigateMock).toHaveBeenCalledWith("/calendar");
  });

  it("tapping the File Converter tile navigates to /convert", () => {
    renderGrid();
    fireEvent.click(screen.getByText("تحويل الملفات"));
    expect(navigateMock).toHaveBeenCalledWith("/convert");
  });

  it("tapping the Qibla tile opens the real QiblaDialog (not a route)", () => {
    renderGrid();
    fireEvent.click(screen.getAllByText("القبلة")[0]);
    expect(navigateMock).not.toHaveBeenCalled();
    // QiblaDialog's own title text becomes visible once open — now the same
    // "القبلة" label as the tile itself (unified naming), so there are two
    // matches once the dialog is open instead of just the tile.
    expect(screen.getAllByText("القبلة").length).toBeGreaterThan(1);
  });

  it("the direct /asma-al-husna URL (initialOpen) opens the 99 Names dialog immediately", () => {
    renderGrid("asmaAlHusna");
    // "أسماء الله الحسنى" matches both the grid tile label and the dialog
    // title once open, so assert at least one (not exactly one) match.
    expect(screen.getAllByText("أسماء الله الحسنى").length).toBeGreaterThan(0);
    // Confirms actual name data renders inside the opened dialog, not just its title.
    expect(screen.getByText("الرَّحْمَن")).toBeInTheDocument();
  });
});

describe("Unified Services grid — Arabic/English toggle", () => {
  it("re-renders every tile's label in English when the language switches", () => {
    localStorage.setItem("lang", "en");
    renderGrid();
    expect(screen.getByText("Quran")).toBeInTheDocument();
    expect(screen.getByText("Athkar")).toBeInTheDocument();
    expect(screen.getByText("Prayer Times")).toBeInTheDocument();
    expect(screen.queryByText("القرآن الكريم")).not.toBeInTheDocument();
  });

  it("flips the container to RTL for Arabic and LTR for English", () => {
    localStorage.setItem("lang", "ar");
    const { container, unmount } = renderGrid();
    expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
    unmount();

    localStorage.setItem("lang", "en");
    const { container: enContainer } = renderGrid();
    expect(enContainer.querySelector('[dir="ltr"]')).not.toBeNull();
  });
});

describe("Unified Services grid — dialog-kind tools all have a matching dialog", () => {
  it("every id marked as opening a dialog is a known, wired-up dialog", () => {
    // If a future edit adds a new "dialog"-kind tool but forgets to render
    // its dialog, this at least confirms the id list itself stays a fixed,
    // reviewed set rather than silently growing unnoticed.
    const known = [
      "athkar", "qibla", "asmaAlHusna", "tasbeeh", "translate", "weather", "scanner", "docscan",
    ];
    expect(new Set(DIALOG_TOOL_IDS)).toEqual(new Set(known));
  });
});
