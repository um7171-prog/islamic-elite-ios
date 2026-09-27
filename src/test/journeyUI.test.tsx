import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import { JourneyHome } from "@/components/journey/JourneyHome";
import { AthkarDialog } from "@/components/islamic/AthkarDialog";
import SessionPage from "@/pages/SessionPage";
import JourneyPage from "@/pages/JourneyPage";
import { getJourneyState, getLastActivity } from "@/lib/journey/store";
import { noteQuranReading } from "@/lib/journey/sources";
import { athkarCountsKey } from "@/lib/athkarProgress";

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function app(initial: string, lang: "ar" | "en" = "ar") {
  localStorage.setItem("lang", lang);
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initial]}>
        <ThemeProvider>
          <LocaleProvider>
            <CityProvider>
              <PrayerCalcProvider>
                <Routes>
                  <Route path="/" element={<JourneyHome />} />
                  <Route path="/session" element={<SessionPage />} />
                  <Route path="/journey" element={<JourneyPage />} />
                  <Route path="*" element={<p>OTHER</p>} />
                </Routes>
                <Where />
              </PrayerCalcProvider>
            </CityProvider>
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const noJunk = (text: string | null) => expect(text ?? "").not.toMatch(/undefined|NaN|null|\[object/);

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("Home: «يومك في النخبة» + «أكمل رحلتي»", () => {
  it("with no data: a respectful start state, RTL, no errors or junk values", () => {
    const { container } = app("/");
    const day = screen.getByTestId("your-day");
    expect(day.getAttribute("dir")).toBe("rtl");
    expect(day.textContent).toContain("يومك في النخبة");
    expect(screen.getByTestId("your-day-action")).toBeTruthy();
    expect(screen.getByTestId("continue-journey").getAttribute("data-state")).toBe("empty");
    expect(screen.getByTestId("continue-empty").textContent).toContain("رحلتك تبدأ بخطوة");
    expect(screen.queryByTestId("your-day-last")).toBeNull();
    noJunk(container.textContent);
  });

  it("English is LTR", () => {
    app("/", "en");
    expect(screen.getByTestId("your-day").getAttribute("dir")).toBe("ltr");
    expect(screen.getByTestId("continue-journey").textContent).toContain("Continue my journey");
  });

  it("a Mushaf reading shows up in «أكمل رحلتي» with its real page, and «متابعة» opens it", () => {
    noteQuranReading(50);
    app("/");
    expect(screen.getByTestId("continue-journey").getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("continue-title").textContent).toMatch(/^المصحف — /);
    expect(screen.getByTestId("continue-progress").textContent).toBe("صفحة 50 من 604");
    fireEvent.click(screen.getByTestId("continue-action"));
    expect(screen.getByTestId("where").textContent).toBe("/mushaf");
  });

  it("«رحلتي» link navigates to the journey page", () => {
    app("/");
    fireEvent.click(screen.getByTestId("open-journey"));
    expect(screen.getByTestId("journey-page")).toBeTruthy();
  });
});

describe("«جلسة الآن» end to end — the four parts are connected", () => {
  it("Home chip → a 10-minute session → each part saved → completed → counted in «رحلتي»", () => {
    app("/");
    fireEvent.click(screen.getByTestId("your-day-session").querySelector('[data-session-length="10"]') as HTMLElement);
    expect(screen.getByTestId("where").textContent).toBe("/session");
    expect(screen.getByTestId("session-active").getAttribute("data-step")).toBe("quran");
    expect(screen.getByTestId("session-step-index").textContent).toBe("الجزء 1 من 3");

    // Quran part
    fireEvent.click(screen.getByTestId("session-step-done"));
    expect(screen.getByTestId("session-active").getAttribute("data-step")).toBe("dhikr");

    // Dhikr part: counting here is counting in the Athkar screen (same storage) and in the Journey.
    const list = screen.getByTestId("session-dhikr").getAttribute("data-list") as "morning";
    fireEvent.click(screen.getByTestId("session-dhikr").querySelector('[data-dhikr="0"]') as HTMLElement);
    expect(JSON.parse(localStorage.getItem(athkarCountsKey(list)) ?? "[]")[0]).toBe(1);
    expect(getJourneyState().activities.some((a) => a.type === "dhikr")).toBe(true);
    fireEvent.click(screen.getByTestId("session-step-done"));

    // Names part
    expect(screen.getByTestId("session-active").getAttribute("data-step")).toBe("names");
    fireEvent.click(screen.getByTestId("session-step-done"));
    expect(screen.getByTestId("session-finished").textContent).toContain("أتممت الجلسة");

    fireEvent.click(screen.getByRole("button", { name: /رحلتي/ }));
    const sessions = screen.getByTestId("journey-sessions");
    expect(sessions.textContent).toContain("بدأتها");
    expect(sessions.textContent).toMatch(/1\s*أتممتها/);
  });

  it("leaving mid-session: Home offers to resume it, and the session reopens at the same part", () => {
    const first = app("/session");
    fireEvent.click(screen.getByTestId("session-picker").querySelector('[data-session-length="20"]') as HTMLElement);
    fireEvent.click(screen.getByTestId("session-step-done")); // Quran → Dhikr
    first.unmount();

    app("/");
    expect(screen.getByTestId("your-day").getAttribute("data-suggestion")).toBe("resume-session");
    expect(screen.getByTestId("continue-title").textContent).toBe("جلسة الآن — 20 دقيقة");
    expect(screen.getByTestId("continue-progress").textContent).toBe("الجزء 2 من 3");
    expect(screen.queryByTestId("your-day-session")).toBeNull(); // no new-session chips while one is open
    fireEvent.click(screen.getByTestId("continue-action"));
    expect(screen.getByTestId("session-active").getAttribute("data-step")).toBe("dhikr");
  });

  it("ending a session without completing it is not offered again", () => {
    app("/session");
    fireEvent.click(screen.getByTestId("session-picker").querySelector('[data-session-length="5"]') as HTMLElement);
    fireEvent.click(screen.getByTestId("session-stop"));
    expect(screen.getByTestId("session-picker")).toBeTruthy();
    expect(getLastActivity()?.type).toBe("session");
  });

  it("back from the session page goes home when opened directly", () => {
    app("/session");
    fireEvent.click(screen.getByTestId("page-back"));
    expect(screen.getByTestId("where").textContent).toBe("/");
  });
});

describe("«رحلتي»", () => {
  it("with no data: every section has an honest empty state and no invented numbers", () => {
    const { container } = app("/journey");
    for (const id of ["journey-current", "journey-last-completed", "journey-sessions", "journey-quran", "journey-athkar", "journey-recent"]) {
      expect(screen.getByTestId(id).querySelector("[data-empty]"), id).toBeTruthy();
    }
    expect(screen.queryByTestId("journey-names")).toBeNull();
    expect(container.textContent).not.toMatch(/[0-9]+ ?%/);
    noJunk(container.textContent);
  });

  it("shows only real data: the Mushaf page and today's counted Athkar", () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 77, surah: 4, at: Date.now() }));
    noteQuranReading(77);
    app("/journey");
    expect(screen.getByTestId("journey-quran").textContent).toContain("صفحة 77 من 604");
    expect(screen.getByTestId("journey-current").textContent).toContain("المصحف");
    expect(screen.getByTestId("journey-athkar").querySelector("[data-empty]")).toBeTruthy();
  });
});

describe("Athkar screen → Journey", () => {
  function athkar(initialList: string | null) {
    localStorage.setItem("lang", "ar");
    return render(
      <LocaleProvider>
        <AthkarDialog open onOpenChange={() => undefined} initialList={initialList} />
      </LocaleProvider>,
    );
  }

  it("opening a list records nothing; a tap records real progress", () => {
    athkar("evening");
    expect(getJourneyState().activities).toHaveLength(0);
    act(() => {
      fireEvent.click(document.querySelector('[data-thikr="0"]') as HTMLElement);
    });
    const a = getLastActivity();
    expect(a).toMatchObject({ type: "dhikr", route: "/athkar?list=evening" });
    expect(a?.metadata.done).toBe(1);
  });
});
