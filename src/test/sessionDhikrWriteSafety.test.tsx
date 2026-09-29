import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import SessionPage from "@/pages/SessionPage";
import { ATHKAR_LISTS, loadAthkarCounts, localDayKey, saveAthkarCounts } from "@/lib/athkarProgress";
import { completeSessionStep, startSession } from "@/lib/journey/session";
import { applyLocalDocs } from "@/lib/accountSync/localApply";

/**
 * «جلسة الآن» — the dhikr part while an account sync writes the same Athkar tallies.
 * Dhikr #6 of the morning list is "سبحان الله وبحمده" (target 100 — asserted below).
 */
const D = 6;
const zeros = () => ATHKAR_LISTS.morning.items.map(() => 0);
const with7 = (n: number) => { const c = zeros(); c[D] = n; return c; };

/** An open session whose current part is the morning-Athkar dhikr part. */
function openSessionAtDhikr() {
  const s = startSession(10, { dhikrList: "morning", quranPage: 1, namesCursor: 0 });
  completeSessionStep(s.id, { endPage: 1 }); // quran -> dhikr
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/session"]}>
        <ThemeProvider>
          <LocaleProvider>
            <CityProvider>
              <PrayerCalcProvider>
                <Routes><Route path="/session" element={<SessionPage />} /></Routes>
              </PrayerCalcProvider>
            </CityProvider>
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}
const tap = (i: number) => fireEvent.click(screen.getByTestId("session-dhikr").querySelector(`[data-dhikr="${i}"]`) as HTMLElement);
const syncWrites = (counts: number[]) =>
  act(() => { applyLocalDocs({ "athkar.progress": { days: { [localDayKey()]: { morning: counts } } } }, { now: Date.now() }); });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "ar");
});
afterEach(() => cleanup());

describe("SessionPage dhikr part — an account sync while the session is open", () => {
  it("uses a dhikr whose target (100) leaves room for the counts below", () => {
    expect(ATHKAR_LISTS.morning.items[D].count).toBe(100);
  });

  it("1. a sync apply then a tap: the synced tallies are kept and the tap is added on top", () => {
    saveAthkarCounts("morning", zeros());
    openSessionAtDhikr();
    expect(screen.getByTestId("session-dhikr").getAttribute("data-list")).toBe("morning");
    const synced = zeros(); synced[1] = 2; synced[D] = 40;
    syncWrites(synced);
    tap(D);
    const want = zeros(); want[1] = 2; want[D] = 41;
    expect(loadAthkarCounts("morning")).toEqual(want);
  });

  it("2. screen state 2, storage after sync 5, one tap -> 6 (not 3)", () => {
    saveAthkarCounts("morning", with7(2));
    openSessionAtDhikr();
    syncWrites(with7(5));
    expect(loadAthkarCounts("morning")[D]).toBe(5);
    tap(D);
    expect(loadAthkarCounts("morning")[D]).toBe(6);
  });

  it("3. when the screen's own count is ahead of storage, the screen's count is used", () => {
    saveAthkarCounts("morning", with7(4));
    openSessionAtDhikr();
    // Storage goes back behind the screen (e.g. written by an older copy): the screen's 4 wins.
    act(() => { saveAthkarCounts("morning", with7(1)); });
    tap(D);
    expect(loadAthkarCounts("morning")[D]).toBe(5);
  });

  it("the target is respected: a dhikr already at its target stays there", () => {
    const target = ATHKAR_LISTS.morning.items[0].count;
    saveAthkarCounts("morning", zeros());
    openSessionAtDhikr();
    const synced = zeros(); synced[0] = target;
    syncWrites(synced);
    tap(0);
    expect(loadAthkarCounts("morning")[0]).toBe(target);
  });

  it("4. three fast taps before React re-renders are all counted", () => {
    saveAthkarCounts("morning", zeros());
    openSessionAtDhikr();
    act(() => { tap(D); tap(D); tap(D); });
    expect(loadAthkarCounts("morning")[D]).toBe(3);
  });

  it("5. the same scenario twice: nothing duplicated, nothing lost", () => {
    saveAthkarCounts("morning", zeros());
    openSessionAtDhikr();
    syncWrites(with7(10));
    tap(D);
    expect(loadAthkarCounts("morning")[D]).toBe(11);
    syncWrites(with7(10)); // the same sync again: max(11, 10) -> nothing goes back
    tap(D);
    expect(loadAthkarCounts("morning")[D]).toBe(12);
    syncWrites(with7(20)); // a newer sync from another device
    tap(D);
    expect(loadAthkarCounts("morning")[D]).toBe(21);
  });
});
