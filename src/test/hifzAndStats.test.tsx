import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import HifzPage from "@/pages/HifzPage";
import StatsPage from "@/pages/StatsPage";
import RecitePage from "@/pages/RecitePage";
import MorePage from "@/pages/MorePage";
import { JourneyHome } from "@/components/journey/JourneyHome";
import { PRESETS, REVIEW_AFTER_DAYS, clearPlan, loadPlan, orderSurahs, planProgress, reciteLink, savePlan } from "@/lib/hifzPlan";
import { saveSession, type NewSession } from "@/lib/recitePractice";
import { personalStats } from "@/lib/personalStats";
import { ATHKAR_LISTS, saveAthkarCounts } from "@/lib/athkarProgress";
import { SURAHS } from "@/lib/mushafData";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 29, 12).getTime();
const memo = (surah: number, fromAyah: number, toAyah: number, rating: 1 | 2 | 3 | 4 | 5, at: number, mode: "memorize" | "review" = "memorize") =>
  saveSession({ surah, fromAyah, toAyah, rating, mode, recordedSeconds: 0, notes: "" } as NewSession, at);

beforeEach(() => { localStorage.clear(); localStorage.setItem("lang", "ar"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

/* ---------------- plan logic ---------------- */

describe("memorization plan", () => {
  it("presets and ordering", () => {
    expect(PRESETS.juz30[0]).toBe(78);
    expect(PRESETS.juz30.at(-1)).toBe(114);
    expect(PRESETS.juz29).toEqual([67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77]);
    expect(orderSurahs([112, 114, 113, 114, 200], "descending")).toEqual([114, 113, 112]);
    expect(orderSurahs([112, 114, 113], "ascending")).toEqual([112, 113, 114]);
  });
  it("save / load / clear; malformed stored plans are ignored", () => {
    expect(() => savePlan([], 5)).toThrow();
    expect(() => savePlan([1], 0)).toThrow();
    savePlan([114, 113], 5, NOW);
    expect(loadPlan()).toEqual({ version: 1, surahs: [114, 113], dailyAyahs: 5, createdAt: NOW });
    localStorage.setItem("hifz:plan", JSON.stringify({ version: 1, surahs: [999], dailyAyahs: 5 }));
    expect(loadPlan()).toBeNull();
    clearPlan();
    expect(loadPlan()).toBeNull();
  });
  it("progress counts only ayahs rated 4-5; the next portion follows the plan order and daily size", () => {
    const plan = savePlan([114, 113], 3, NOW);
    let p = planProgress(plan, [], NOW);
    expect(p).toMatchObject({ totalAyahs: 11, memorizedAyahs: 0, percent: 0, todayAyahs: 0, next: { surah: 114, fromAyah: 1, toAyah: 3 } });
    memo(114, 1, 3, 5, NOW);
    memo(114, 4, 6, 2, NOW); // weak: not memorized
    p = planProgress(plan, storedSessions(), NOW);
    expect(p.memorizedAyahs).toBe(3);
    expect(p.percent).toBe(27); // floor(3/11)
    expect(p.todayAyahs).toBe(6);
    expect(p.todayDone).toBe(true);
    expect(p.next).toEqual({ surah: 114, fromAyah: 4, toAyah: 6 });
  });
  it("a finished surah moves to the next one; the whole plan done -> next is null", () => {
    const plan = savePlan([114, 113], 10, NOW);
    memo(114, 1, 6, 5, NOW);
    expect(planProgress(plan, storedSessions(), NOW).next).toEqual({ surah: 113, fromAyah: 1, toAyah: 5 });
    memo(113, 1, 5, 4, NOW);
    const p = planProgress(plan, storedSessions(), NOW);
    expect(p.next).toBeNull();
    expect(p.percent).toBe(100);
  });
  it("review queue: memorized surahs rated low or not practised for a week, oldest first", () => {
    const plan = savePlan([114, 113, 112], 10, NOW);
    memo(114, 1, 6, 5, NOW - 10 * DAY);
    memo(113, 1, 5, 5, NOW - 8 * DAY);
    memo(112, 1, 4, 5, NOW - DAY);
    expect(planProgress(plan, storedSessions(), NOW).reviewDue.map((s) => s.surah)).toEqual([114, 113]);
    expect(REVIEW_AFTER_DAYS).toBe(7);
  });
  it("review link opens the whole surah in review mode", () => {
    expect(reciteLink({ surah: 114, fromAyah: 1, toAyah: 6 }, "review")).toBe("/recite?surah=114&from=1&to=6&mode=review");
  });
});

/** The practice sessions exactly as stored. */
function storedSessions() {
  return JSON.parse(localStorage.getItem("recite:sessions") ?? "[]");
}

/* ---------------- personal stats ---------------- */

describe("personal stats (real data only)", () => {
  it("a fresh device: every figure is zero or absent — nothing invented", () => {
    const s = personalStats(NOW);
    expect(s.plan).toBeNull();
    expect(s.practice).toMatchObject({ sessions: 0, memorized: 0, streakDays: 0 });
    expect(s.athkar).toMatchObject({ completedLists7: 0, activeDays7: 0 });
    expect(s.athkar.last7).toHaveLength(7);
    expect(s.journey.completedSessions).toBe(0);
    expect(s.journey.achievements.every((a) => !a.unlocked)).toBe(true);
    expect(s.tasbeehCounter).toBe(0);
  });
  it("counts completed Athkar lists per day from the stored tallies", () => {
    const today = new Date(NOW);
    const full = ATHKAR_LISTS.morning.items.map((i) => i.count);
    saveAthkarCounts("morning", full, today);
    const partial = ATHKAR_LISTS.evening.items.map(() => 0); partial[0] = 1;
    saveAthkarCounts("evening", partial, new Date(NOW - DAY));
    const s = personalStats(NOW);
    expect(s.athkar.last7.at(-1)).toMatchObject({ completedLists: 1, active: true });
    expect(s.athkar.last7.at(-2)).toMatchObject({ completedLists: 0, active: true });
    expect(s.athkar).toMatchObject({ completedLists7: 1, activeDays7: 2 });
  });
  it("plan, practice and tasbeeh figures come from their stores", () => {
    savePlan([114], 3, NOW);
    memo(114, 1, 6, 5, NOW);
    localStorage.setItem("tasbeeh", "33");
    const s = personalStats(NOW);
    expect(s.plan).toMatchObject({ percent: 100, memorizedAyahs: 6, totalAyahs: 6 });
    expect(s.practice.memorized).toBe(1);
    expect(s.tasbeehCounter).toBe(33);
  });
});

/* ---------------- screens ---------------- */

function Where() { const l = useLocation(); return <div data-where={l.pathname + l.search} />; }
function renderAt(path: string, extra?: React.ReactNode) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <LocaleProvider>
            <CityProvider>
              <PrayerCalcProvider>
                <Routes>
                  <Route path="/hifz" element={<HifzPage />} />
                  <Route path="/stats" element={<StatsPage />} />
                  <Route path="/recite" element={<RecitePage />} />
                  <Route path="/more" element={<MorePage />} />
                  <Route path="/home" element={<JourneyHome />} />
                  <Route path="*" element={<div />} />
                </Routes>
                <Where />
                {extra}
              </PrayerCalcProvider>
            </CityProvider>
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}
const where = () => document.querySelector("[data-where]")?.getAttribute("data-where");

describe("memorization plan screen", () => {
  it("create a Juz Amma plan from the end of the Mushaf, then start today's portion in /recite", async () => {
    renderAt("/hifz");
    expect(document.querySelector('[data-hifz="summary"]')?.textContent).toContain(SURAHS[113].ar);
    fireEvent.click(document.querySelector('[data-hifz="save"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-hifz="plan"]')).toBeTruthy());
    expect(loadPlan()?.surahs[0]).toBe(114);
    expect(document.querySelector('[data-hifz="percent"]')?.textContent).toBe("0%");
    fireEvent.click(document.querySelector('[data-hifz="start"]') as HTMLElement);
    await waitFor(() => expect(where()).toBe("/recite?surah=114&from=1&to=5&mode=memorize"));
  });
  it("custom surahs: nothing chosen cannot be saved", () => {
    renderAt("/hifz");
    fireEvent.click([...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent === "سور مختارة") as HTMLElement);
    expect((document.querySelector('[data-hifz="save"]') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-pick="36"]') as HTMLElement);
    expect((document.querySelector('[data-hifz="save"]') as HTMLButtonElement).disabled).toBe(false);
  });
  it("deleting the plan keeps the practice sessions", async () => {
    savePlan([114], 5, NOW);
    memo(114, 1, 6, 5, NOW);
    renderAt("/hifz");
    fireEvent.click(document.querySelector('[data-hifz="delete"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-hifz="delete-confirm"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-hifz="setup"]')).toBeTruthy());
    expect(loadPlan()).toBeNull();
    expect(storedSessions()).toHaveLength(1);
  });
});

describe("/recite opened on a portion", () => {
  it("prefills surah, ayah range and mode from the link", async () => {
    renderAt("/recite?surah=114&from=2&to=4&mode=review");
    expect((document.getElementById("recite-surah") as HTMLSelectElement).value).toBe("114");
    expect((document.getElementById("recite-from") as HTMLInputElement).value).toBe("2");
    expect((document.getElementById("recite-to") as HTMLInputElement).value).toBe("4");
    expect(document.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe("مراجعة");
  });
  it("an invalid link falls back to a safe default", () => {
    renderAt("/recite?surah=114&from=5&to=99");
    expect((document.getElementById("recite-from") as HTMLInputElement).value).toBe("1");
    expect((document.getElementById("recite-to") as HTMLInputElement).value).toBe("6");
  });
});

describe("stats screen", () => {
  it("shows real figures and the achievements; a fresh device shows zeros and no plan", () => {
    renderAt("/stats");
    expect(document.querySelectorAll("[data-athkar-day]")).toHaveLength(7);
    expect(document.querySelectorAll("[data-achievement]").length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-unlocked="1"]')).toHaveLength(0);
    expect(document.body.textContent).toContain("أنشئ خطة حفظ");
  });
});

describe("«يومك في النخبة» — memorization line", () => {
  it("absent without a plan; shows today's real count with one", () => {
    renderAt("/home");
    expect(document.querySelector('[data-testid="your-day-hifz"]')).toBeNull();
    cleanup();
    savePlan([114], 5, Date.now());
    saveSession({ surah: 114, fromAyah: 1, toAyah: 2, rating: 5, mode: "memorize", recordedSeconds: 0, notes: "" });
    renderAt("/home");
    expect(document.querySelector('[data-testid="your-day-hifz"]')?.textContent).toContain("2/5");
  });
});

describe("More page", () => {
  it("has the plan and stats entries, and keeps the existing ones", () => {
    renderAt("/more");
    for (const [k, href] of [["hifz", "/hifz"], ["stats", "/stats"], ["reciters", "/reciters"], ["recite", "/recite"], ["account", "/account"], ["journey", "/journey"]]) {
      expect(document.querySelector(`[data-more="${k}"]`)?.getAttribute("href")).toBe(href);
    }
  });
});
