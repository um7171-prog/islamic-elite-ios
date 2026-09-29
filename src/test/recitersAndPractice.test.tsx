import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import RecitersPage from "@/pages/RecitersPage";
import RecitePage from "@/pages/RecitePage";
import MorePage from "@/pages/MorePage";
import { RECITERS, surahUrl } from "@/lib/reciters";
import { loadLastPlayed, nextSurah, normalizeSearch, prevSurah, saveLastPlayed, searchReciters, searchSurahs, streamOrCachedUrl } from "@/lib/surahPlayer";
import { MAX_SESSIONS, deleteSession, loadSessions, practiceStats, saveSession, surahLevel, validRange, type NewSession } from "@/lib/recitePractice";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 29, 12).getTime();

beforeEach(() => { localStorage.clear(); localStorage.setItem("lang", "ar"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/* ---------------- surah player helpers ---------------- */

describe("reciters library helpers", () => {
  it("search ignores diacritics and letter forms, in Arabic and English", () => {
    expect(normalizeSearch("مِشَارِي")).toBe(normalizeSearch("مشاري"));
    expect(searchReciters(RECITERS, "العفاسى").map((r) => r.id)).toEqual(["afasy"]);
    expect(searchReciters(RECITERS, "sudais").map((r) => r.id)).toEqual(["sudais"]);
    expect(searchReciters(RECITERS, "")).toHaveLength(RECITERS.length);
    expect(searchReciters(RECITERS, "zzz")).toEqual([]);
  });
  it("surah search by number, Arabic or English name", () => {
    expect(searchSurahs("18").map((s) => s.n)).toEqual([18]);
    expect(searchSurahs("الكهف").map((s) => s.n)).toEqual([18]);
    expect(searchSurahs("kahf").map((s) => s.n)).toEqual([18]);
    expect(searchSurahs("")).toHaveLength(114);
  });
  it("previous / next surah stop at the ends", () => {
    expect(prevSurah(1)).toBeNull();
    expect(nextSurah(114)).toBeNull();
    expect(nextSurah(18)).toBe(19);
    expect(prevSurah(18)).toBe(17);
  });
  it("remembers the last surah and position; rejects malformed data", () => {
    saveLastPlayed({ reciterId: "afasy", surah: 18, position: 95.7 });
    expect(loadLastPlayed()).toEqual({ reciterId: "afasy", surah: 18, position: 95 });
    localStorage.setItem("quran:player-last", JSON.stringify({ reciterId: "afasy", surah: 200, position: 1 }));
    expect(loadLastPlayed()).toBeNull();
    localStorage.setItem("quran:player-last", "not json");
    expect(loadLastPlayed()).toBeNull();
  });
  it("streams when the surah is not cached (never starts a whole-surah download)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = RECITERS[0];
    expect(await streamOrCachedUrl(r, 1)).toEqual({ url: surahUrl(r, 1), cached: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/* ---------------- recitation practice store ---------------- */

const base: NewSession = { surah: 112, fromAyah: 1, toAyah: 4, mode: "memorize", rating: 5, recordedSeconds: 30, notes: "" };

describe("recitation practice (self-practice, teacher-ready)", () => {
  it("validates ayah ranges against the surah", () => {
    expect(validRange(112, 1, 4)).toBe(true);
    expect(validRange(112, 1, 5)).toBe(false);
    expect(validRange(112, 3, 2)).toBe(false);
    expect(validRange(115, 1, 1)).toBe(false);
    expect(() => saveSession({ ...base, toAyah: 9 })).toThrow();
  });
  it("saves a self-reviewed session with no teacher, newest first; delete removes it", () => {
    const a = saveSession(base, NOW - 1000);
    const b = saveSession({ ...base, rating: 3, notes: "  مد  " }, NOW);
    const all = loadSessions();
    expect(all.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(all[0]).toMatchObject({ status: "self-reviewed", reviewer: null, teacherNotes: null, notes: "مد" });
    deleteSession(a.id);
    expect(loadSessions().map((s) => s.id)).toEqual([b.id]);
  });
  it("keeps at most MAX_SESSIONS and ignores malformed stored entries", () => {
    localStorage.setItem("recite:sessions", JSON.stringify([{ id: "x" }, null, 5]));
    expect(loadSessions()).toEqual([]);
    for (let i = 0; i < MAX_SESSIONS + 5; i++) saveSession(base, NOW + i);
    expect(loadSessions()).toHaveLength(MAX_SESSIONS);
  });
  it("levels come only from the user's own ratings", () => {
    expect(surahLevel([], 112)).toBe("not-started");
    saveSession({ ...base, toAyah: 2 }, NOW);
    expect(surahLevel(loadSessions(), 112, NOW)).toBe("learning");
    saveSession({ ...base, rating: 2 }, NOW + 1);
    expect(surahLevel(loadSessions(), 112, NOW + 1)).toBe("needs-review");
    saveSession({ ...base, rating: 5 }, NOW + 2);
    expect(surahLevel(loadSessions(), 112, NOW + 2)).toBe("memorized");
    expect(surahLevel(loadSessions(), 112, NOW + 31 * DAY)).toBe("needs-review");
  });
  it("stats: sessions, memorized, streak of consecutive days, recorded minutes", () => {
    saveSession(base, NOW - 2 * DAY);
    saveSession(base, NOW - DAY);
    saveSession({ ...base, surah: 1, toAyah: 7, rating: 1, recordedSeconds: 90 }, NOW);
    expect(practiceStats(loadSessions(), NOW)).toEqual({ sessions: 3, surahsPractised: 2, memorized: 1, needsReview: 1, streakDays: 3, recordedMinutes: 3 });
    expect(practiceStats(loadSessions(), NOW + 3 * DAY).streakDays).toBe(0);
  });
});

/* ---------------- screens ---------------- */

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <LocaleProvider>
            <CityProvider>
              <PrayerCalcProvider>
                <Routes>
                  <Route path="/reciters" element={<RecitersPage />} />
                  <Route path="/recite" element={<RecitePage />} />
                  <Route path="/more" element={<MorePage />} />
                </Routes>
              </PrayerCalcProvider>
            </CityProvider>
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("More page entries", () => {
  it("«القرّاء» and «القراءة مع المعلم» open their screens; «الحساب» is still there", () => {
    renderAt("/more");
    expect(document.querySelector('[data-more="reciters"]')?.getAttribute("href")).toBe("/reciters");
    expect(document.querySelector('[data-more="recite"]')?.getAttribute("href")).toBe("/recite");
    expect(document.querySelector('[data-more="account"]')?.getAttribute("href")).toBe("/account");
  });
});

describe("Reciters screen", () => {
  let played: string[];
  beforeEach(() => {
    played = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { played.push(this.src); return Promise.resolve(); });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  it("lists every reciter; search filters; choosing one is saved (the Mushaf's same choice)", () => {
    renderAt("/reciters");
    expect(document.querySelectorAll("[data-reciter]")).toHaveLength(RECITERS.length);
    fireEvent.change(document.querySelector('[data-search="reciters"]') as HTMLInputElement, { target: { value: "الغامدي" } });
    expect([...document.querySelectorAll("[data-reciter]")].map((e) => e.getAttribute("data-reciter"))).toEqual(["ghamdi"]);
    fireEvent.click(document.querySelector('[data-reciter="ghamdi"] button') as HTMLElement);
    expect(localStorage.getItem("quran:selected-reciter")).toBe("ghamdi");
  });
  it("favorites are saved and listed first", () => {
    renderAt("/reciters");
    fireEvent.click(document.querySelector('[data-fav="qatami"]') as HTMLElement);
    expect(JSON.parse(localStorage.getItem("quran:fav-reciters") ?? "[]")).toEqual(["qatami"]);
    expect(document.querySelector("[data-reciter]")?.getAttribute("data-reciter")).toBe("qatami");
  });
  it("plays a surah with the chosen reciter, then next / previous surah", async () => {
    localStorage.setItem("quran:selected-reciter", "afasy");
    renderAt("/reciters");
    fireEvent.click(document.querySelector('[data-surah="18"]') as HTMLElement);
    await waitFor(() => expect(played.at(-1)).toBe(surahUrl(RECITERS.find((r) => r.id === "afasy")!, 18)));
    await waitFor(() => expect(document.querySelector("[data-player-status]")?.getAttribute("data-player-status")).toBe("playing"));
    fireEvent.click(document.querySelector('[data-player="next"]') as HTMLElement);
    await waitFor(() => expect(played.at(-1)).toMatch(/019\.mp3$/));
    fireEvent.click(document.querySelector('[data-player="prev"]') as HTMLElement);
    await waitFor(() => expect(played.at(-1)).toMatch(/018\.mp3$/));
  });
  it("a playback failure is reported, not hidden", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("network"));
    renderAt("/reciters");
    fireEvent.click(document.querySelector('[data-surah="1"]') as HTMLElement);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
  it("names the audio source", () => {
    renderAt("/reciters");
    expect(document.body.textContent).toContain("mp3quran.net");
  });
});

describe("Recite with a teacher — self-practice screen", () => {
  it("says plainly that no teacher is connected yet", () => {
    renderAt("/recite");
    expect(document.querySelector('[data-recite="notice"]')?.textContent).toContain("لا يوجد معلم متصل");
  });
  it("shows the chosen ayahs, then a rated session is saved and appears in the history and stats", async () => {
    renderAt("/recite");
    fireEvent.change(document.getElementById("recite-surah") as HTMLSelectElement, { target: { value: "112" } });
    await waitFor(() => expect(document.querySelector('[data-recite="text"]')?.textContent).toContain("﴿4﴾"));
    fireEvent.click(document.querySelector('[data-rating="5"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-recite="save"]') as HTMLElement);
    await waitFor(() => expect(document.querySelectorAll("[data-session]")).toHaveLength(1));
    expect(loadSessions()[0]).toMatchObject({ surah: 112, fromAyah: 1, toAyah: 4, rating: 5, status: "self-reviewed", reviewer: null });
  });
  it("an invalid range is refused and nothing can be saved", () => {
    renderAt("/recite");
    fireEvent.change(document.getElementById("recite-to") as HTMLInputElement, { target: { value: "99" } });
    expect(screen.getByRole("alert").textContent).toContain("7");
    expect(document.querySelector('[data-recite="save"]')).toBeNull();
  });
  it("without a microphone API the screen says so instead of failing", () => {
    renderAt("/recite");
    expect(document.querySelector('[data-recite="record"]')).toBeNull();
    expect(document.body.textContent).toContain("التسجيل غير متاح");
  });
});
