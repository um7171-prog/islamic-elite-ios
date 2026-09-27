import { describe, it, expect, beforeEach } from "vitest";
import type { PrayerEntry, PrayerKey } from "@/lib/prayer";
import {
  JOURNEY_KEY,
  completeActivity,
  getJourneyState,
  getJourneySummary,
  getLastActivity,
  getUnfinishedActivity,
  parseJourney,
  recordActivity,
  updateActivityProgress,
} from "@/lib/journey/store";
import {
  SESSION_PLANS,
  buildSessionSteps,
  completeSessionStep,
  getActiveSession,
  sessionActivityId,
  startSession,
  stopSession,
  updateSessionStep,
} from "@/lib/journey/session";
import { NAMES_CURSOR, QURAN_ACTIVITY_ID, athkarActivityId, getNamesCursor, noteAthkarProgress, noteQuranReading } from "@/lib/journey/sources";
import { getDayContext, type PrayerDay } from "@/lib/journey/context";
import { sessionDhikrList, suggestNow } from "@/lib/journey/suggest";
import { SESSION_LENGTHS } from "@/lib/journey/types";
import { ATHKAR_LISTS, athkarCountsKey, loadAthkarCounts } from "@/lib/athkarProgress";

const T0 = new Date(2026, 8, 27, 10, 0).getTime();
const input = { dhikrList: "morning" as const, quranPage: 50, namesCursor: 0 };

beforeEach(() => localStorage.clear());

describe("Journey store", () => {
  it("starts empty: no last/unfinished activity, zero sessions", () => {
    expect(getLastActivity()).toBeNull();
    expect(getUnfinishedActivity(T0)).toBeNull();
    const s = getJourneySummary(T0);
    expect(s).toMatchObject({ current: null, last: null, lastCompleted: null, recent: [], completedCount: 0 });
    expect(s.sessions).toEqual({ started: 0, completed: 0, active: null });
  });

  it("records an activity and returns it as the last one", () => {
    recordActivity({ id: "a", type: "reading", title: { ar: "قراءة", en: "Reading" }, route: "/x", progress: 0.2 }, T0);
    const last = getLastActivity();
    expect(last).toMatchObject({ id: "a", type: "reading", route: "/x", progress: 0.2, status: "active", startedAt: T0, updatedAt: T0 });
    expect(getUnfinishedActivity(T0)?.id).toBe("a");
  });

  it("updates progress (clamped to 0..1) and ignores unknown ids", () => {
    recordActivity({ id: "a", type: "reading", title: { ar: "", en: "" }, route: "/x" }, T0);
    expect(updateActivityProgress("a", 0.5, { page: 3 }, T0 + 1)?.progress).toBe(0.5);
    expect(updateActivityProgress("a", 7, {}, T0 + 2)?.progress).toBe(1);
    expect(getLastActivity()?.metadata.page).toBe(3);
    expect(updateActivityProgress("nope", 0.5)).toBeNull();
  });

  it("completes an activity: it is no longer offered to continue, and becomes the last completed", () => {
    recordActivity({ id: "a", type: "dhikr", title: { ar: "", en: "" }, route: "/athkar", progress: 0.4 }, T0);
    completeActivity("a", T0 + 5);
    expect(getUnfinishedActivity(T0 + 6)).toBeNull();
    const s = getJourneySummary(T0 + 6);
    expect(s.lastCompleted).toMatchObject({ id: "a", status: "completed", progress: 1, completedAt: T0 + 5 });
    expect(s.completedCount).toBe(1);
  });

  it("keeps several activity types; the most recent wins", () => {
    recordActivity({ id: "q", type: "quran", title: { ar: "", en: "" }, route: "/mushaf" }, T0);
    recordActivity({ id: "d", type: "dhikr", title: { ar: "", en: "" }, route: "/athkar" }, T0 + 1000);
    expect(getLastActivity()?.id).toBe("d");
    recordActivity({ id: "q", type: "quran", title: { ar: "", en: "" }, route: "/mushaf" }, T0 + 2000);
    expect(getLastActivity()?.id).toBe("q");
    expect(getJourneyState().activities.map((a) => a.type).sort()).toEqual(["dhikr", "quran"]);
  });

  it("an expired activity is not offered to continue", () => {
    recordActivity({ id: "a", type: "reading", title: { ar: "", en: "" }, route: "/x", expiresAt: T0 + 60_000 }, T0);
    expect(getUnfinishedActivity(T0 + 59_000)?.id).toBe("a");
    expect(getUnfinishedActivity(T0 + 61_000)).toBeNull();
  });

  it("never trusts corrupted storage: garbage, a wrong version and bad items are dropped", () => {
    localStorage.setItem(JOURNEY_KEY, "{not json");
    expect(getJourneyState().activities).toEqual([]);
    localStorage.setItem(JOURNEY_KEY, JSON.stringify({ version: 2, activities: [] }));
    expect(getJourneyState()).toEqual({ version: 1, activities: [], sessions: [], cursors: {} });

    const good = { id: "ok", type: "quran", title: { ar: "a", en: "b" }, route: "/mushaf", progress: 3, status: "active", startedAt: 1, updatedAt: 2, metadata: { page: 4, bad: { x: 1 } } };
    const state = parseJourney(JSON.stringify({
      version: 1,
      activities: [good, { id: "x", type: "hack" }, null, { ...good, id: "y", route: "https://evil" }],
      sessions: [{ id: "s", minutes: 7, steps: [] }],
      cursors: { names: 5, bad: "z" },
    }));
    expect(state.activities.map((a) => a.id)).toEqual(["ok"]);
    expect(state.activities[0].progress).toBe(1);
    expect(state.activities[0].metadata).toEqual({ page: 4 });
    expect(state.sessions).toEqual([]);
    expect(state.cursors).toEqual({ names: 5 });
    // And a write after reading corrupted data produces a valid store again.
    recordActivity({ id: "n", type: "reading", title: { ar: "", en: "" }, route: "/x" }, T0);
    expect(parseJourney(localStorage.getItem(JOURNEY_KEY)).activities.map((a) => a.id)).toEqual(["n"]);
  });

  it("stays bounded", () => {
    for (let i = 0; i < 60; i++) recordActivity({ id: `a${i}`, type: "reading", title: { ar: "", en: "" }, route: "/x" }, T0 + i);
    expect(getJourneyState().activities.length).toBeLessThanOrEqual(40);
    expect(getLastActivity()?.id).toBe("a59");
  });
});

describe("Journey sources (real feature data)", () => {
  it("the Mushaf page becomes the Quran activity, with the real page", () => {
    noteQuranReading(50, T0);
    const a = getLastActivity();
    expect(a).toMatchObject({ id: QURAN_ACTIVITY_ID, type: "quran", route: "/mushaf", metadata: { page: 50 } });
    expect(a?.progress).toBeCloseTo(50 / 604);
    expect(a?.title.ar).toMatch(/^المصحف — /);
  });

  it("Athkar progress is recorded per list and day, and completes when the list is done", () => {
    const items = ATHKAR_LISTS.evening.items;
    noteAthkarProgress("evening", items.map((_, i) => (i === 0 ? items[0].count : 0)), T0);
    const id = athkarActivityId("evening", T0);
    expect(getLastActivity()).toMatchObject({ id, type: "dhikr", route: "/athkar?list=evening", status: "active", metadata: { done: 1, total: items.length } });
    noteAthkarProgress("evening", items.map((it) => it.count), T0 + 1);
    expect(getJourneyState().activities.find((a) => a.id === id)?.status).toBe("completed");
    // Tomorrow the list starts fresh, so today's activity is not offered to continue.
    noteAthkarProgress("morning", [1, 0, 0, 0, 0, 0, 0, 0], T0);
    expect(getUnfinishedActivity(T0 + 24 * 3600_000)).toBeNull();
  });
});

describe("Session now", () => {
  it.each(SESSION_LENGTHS)("a %i-minute session splits exactly its minutes between existing content", (m) => {
    const steps = buildSessionSteps(m, input, T0);
    expect(steps.reduce((s, x) => s + x.minutes, 0)).toBe(m);
    expect(steps[0]).toMatchObject({ kind: "quran", status: "active", startedAt: T0, data: { startPage: 50 } });
    expect(steps.slice(1).every((s) => s.status === "pending")).toBe(true);
    expect(steps.map((s) => s.kind)).toEqual(SESSION_PLANS[m].map((p) => p.kind));
    const names = steps.find((s) => s.kind === "names");
    if (names) expect(Number(names.data.to) - Number(names.data.from)).toBeGreaterThan(0);
  });

  it("starts, progresses, completes each part and then the session", () => {
    const s = startSession(10, input, T0);
    expect(getActiveSession(T0)?.id).toBe(s.id);
    expect(getLastActivity()).toMatchObject({ id: sessionActivityId(s), type: "session", route: "/session", progress: 0 });

    updateSessionStep(s.id, { endPage: 52 }, T0 + 1);
    expect(getActiveSession(T0)?.steps[0].data).toMatchObject({ startPage: 50, endPage: 52 });

    completeSessionStep(s.id, { endPage: 53 }, T0 + 60_000);
    let cur = getActiveSession(T0 + 60_000);
    expect(cur?.currentStep).toBe(1);
    expect(cur?.steps[0]).toMatchObject({ status: "done", completedAt: T0 + 60_000 });
    expect(cur?.steps[1]).toMatchObject({ kind: "dhikr", status: "active" });
    expect(getLastActivity()?.progress).toBeCloseTo(1 / 3);

    updateSessionStep(s.id, { list: "evening" }, T0 + 61_000);
    expect(getActiveSession(T0)?.steps[1].data.list).toBe("evening");

    completeSessionStep(s.id, {}, T0 + 120_000);
    cur = getActiveSession(T0 + 120_000);
    expect(cur?.steps[2]).toMatchObject({ kind: "names", status: "active" });
    const to = Number(cur?.steps[2].data.to);

    const done = completeSessionStep(s.id, {}, T0 + 180_000);
    expect(done).toMatchObject({ status: "completed", completedAt: T0 + 180_000 });
    expect(getActiveSession(T0 + 180_000)).toBeNull();
    expect(getNamesCursor()).toBe(to);
    const summary = getJourneySummary(T0 + 180_000);
    expect(summary.sessions).toMatchObject({ started: 1, completed: 1, active: null });
    expect(summary.lastCompleted?.id).toBe(sessionActivityId(s));
  });

  it("resumes an unfinished session exactly where it was (after a reload)", () => {
    const s = startSession(20, input, T0);
    completeSessionStep(s.id, { endPage: 55 }, T0 + 1000);
    // A fresh read from storage (what a relaunch does).
    const reloaded = parseJourney(localStorage.getItem(JOURNEY_KEY));
    const again = reloaded.sessions.find((x) => x.id === s.id);
    expect(again).toMatchObject({ status: "active", currentStep: 1 });
    expect(getActiveSession(T0 + 3600_000)?.id).toBe(s.id);
    expect(getUnfinishedActivity(T0 + 3600_000)?.id).toBe(sessionActivityId(s));
  });

  it("only one session is open: a new one stops the old; a stopped one is not offered", () => {
    const a = startSession(5, input, T0);
    const b = startSession(30, input, T0 + 1000);
    expect(getActiveSession(T0 + 2000)?.id).toBe(b.id);
    expect(getJourneyState().sessions.find((x) => x.id === a.id)?.status).toBe("stopped");
    stopSession(b.id, T0 + 3000);
    expect(getActiveSession(T0 + 4000)).toBeNull();
    expect(getUnfinishedActivity(T0 + 4000)).toBeNull();
  });

  it("a session left for a day is not resumed", () => {
    startSession(5, input, T0);
    expect(getActiveSession(T0 + 25 * 3600_000)).toBeNull();
  });

  it("the Names part continues across sessions and wraps after the 99th name", () => {
    localStorage.setItem(JOURNEY_KEY, JSON.stringify({ version: 1, activities: [], sessions: [], cursors: { [NAMES_CURSOR]: 97 } }));
    const s = startSession(10, { ...input, namesCursor: getNamesCursor() }, T0);
    expect(s.steps[2].data).toMatchObject({ from: 97, to: 99 });
    for (let i = 0; i < 3; i++) completeSessionStep(s.id, {}, T0 + i + 1);
    expect(getNamesCursor()).toBe(0);
  });
});

/* ---------------- context engine ---------------- */

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);
const NAMES: Record<PrayerKey, [string, string]> = {
  fajr: ["Fajr", "الفجر"], sunrise: ["Sunrise", "الشروق"], dhuhr: ["Dhuhr", "الظهر"], asr: ["Asr", "العصر"], maghrib: ["Maghrib", "المغرب"], isha: ["Isha", "العشاء"],
};
const TIMES: [PrayerKey, number, number][] = [["fajr", 4, 30], ["sunrise", 5, 50], ["dhuhr", 12, 0], ["asr", 15, 20], ["maghrib", 18, 0], ["isha", 19, 30]];
const dayEntries = (d: number): PrayerEntry[] =>
  TIMES.map(([key, h, m]) => ({ key, nameEn: NAMES[key][0], nameAr: NAMES[key][1], time: at(d, h, m), gradient: "" }));
const prayers: PrayerDay = { yesterday: dayEntries(26), today: dayEntries(27), tomorrow: dayEntries(28) };
const ctxAt = (now: Date, extra: Partial<Parameters<typeof getDayContext>[0]> = {}) =>
  getDayContext({ now, prayers, unfinished: null, activeSession: null, ...extra });

describe("Context engine", () => {
  it("before a prayer: the next prayer and the minutes left", () => {
    const c = ctxAt(at(27, 11, 50));
    expect(c).toMatchObject({ phase: "before-prayer", minutesToNext: 10, period: "morning" });
    expect(c.nextPrayer?.key).toBe("dhuhr");
    expect(c.currentPrayer?.key).toBe("fajr");
  });

  it("at prayer time, then after it, then between prayers", () => {
    expect(ctxAt(at(27, 12, 5))).toMatchObject({ phase: "prayer-time", minutesSinceCurrent: 5, period: "midday" });
    expect(ctxAt(at(27, 12, 5)).currentPrayer?.key).toBe("dhuhr");
    expect(ctxAt(at(27, 12, 30)).phase).toBe("after-prayer");
    expect(ctxAt(at(27, 13, 30)).phase).toBe("between");
  });

  it("after midnight the current prayer is yesterday's Isha; after Isha the next is tomorrow's Fajr", () => {
    const night = ctxAt(at(27, 1, 0));
    expect(night.currentPrayer?.time).toEqual(at(26, 19, 30));
    expect(night.nextPrayer?.time).toEqual(at(27, 4, 30));
    expect(night.period).toBe("late-night");
    const evening = ctxAt(at(27, 22, 0));
    expect(evening.nextPrayer?.time).toEqual(at(28, 4, 30));
    expect(evening.period).toBe("night");
    expect(ctxAt(at(27, 5, 0)).period).toBe("dawn");
  });

  it("knows whether there is an unfinished activity or an active session", () => {
    expect(ctxAt(at(27, 13, 30))).toMatchObject({ hasUnfinishedActivity: false, hasActiveSession: false });
    const a = recordActivity({ id: "q", type: "quran", title: { ar: "المصحف", en: "Mushaf" }, route: "/mushaf" }, T0);
    const s = startSession(5, input, T0);
    expect(ctxAt(at(27, 13, 30), { unfinished: a, activeSession: s })).toMatchObject({ hasUnfinishedActivity: true, hasActiveSession: true });
  });
});

describe("Suggestion", () => {
  const none = { quran: null, athkarToday: [] };

  it("an open session comes first", () => {
    const s = startSession(10, input, T0);
    expect(suggestNow({ ...none, context: ctxAt(at(27, 11, 50), { activeSession: s }) })).toMatchObject({ kind: "resume-session", route: "/session" });
  });

  it("near a prayer: «اقتربت الصلاة»; at its time: the prayer times", () => {
    expect(suggestNow({ ...none, context: ctxAt(at(27, 11, 50)) })).toMatchObject({ kind: "prayer-soon", route: "/prayer-times", title: { ar: "اقتربت الصلاة" } });
    expect(suggestNow({ ...none, context: ctxAt(at(27, 12, 5)) }).kind).toBe("prayer-time");
  });

  it("after a prayer: the app's post-prayer Athkar (until they are done today)", () => {
    expect(suggestNow({ ...none, context: ctxAt(at(27, 12, 30)) })).toMatchObject({ kind: "athkar", route: "/athkar?list=post-prayer" });
    const done = [{ list: "post-prayer" as const, done: 7, total: 7, started: true }];
    expect(suggestNow({ quran: null, athkarToday: done, context: ctxAt(at(27, 12, 30)) }).kind).toBe("session");
  });

  it("an unfinished activity: «أكمل من حيث توقفت» to its own route", () => {
    const a = recordActivity({ id: "q", type: "quran", title: { ar: "المصحف — البقرة", en: "Mushaf" }, route: "/mushaf" }, T0);
    expect(suggestNow({ ...none, context: ctxAt(at(27, 13, 30), { unfinished: a }) })).toMatchObject({ kind: "continue", route: "/mushaf", title: { ar: "أكمل من حيث توقفت" } });
  });

  it("with no activity, the time of day picks from real content", () => {
    const quran = { page: 12, totalPages: 604, surahNumber: 2, surahAr: "البقرة", surahEn: "Al-Baqara", at: T0 };
    expect(suggestNow({ quran, athkarToday: [], context: ctxAt(at(27, 5, 30)) })).toMatchObject({ kind: "quran", title: { ar: "ابدأ وردك" }, route: "/mushaf" });
    expect(suggestNow({ ...none, context: ctxAt(at(27, 5, 30)) }).route).toBe("/quran");
    expect(suggestNow({ ...none, context: ctxAt(at(27, 16, 30)) })).toMatchObject({ kind: "athkar", route: "/athkar?list=evening" });
    expect(suggestNow({ ...none, context: ctxAt(at(27, 23, 30)) })).toMatchObject({ kind: "athkar", route: "/athkar?list=sleep" });
    expect(suggestNow({ ...none, context: ctxAt(at(27, 13, 30)) })).toMatchObject({ kind: "session", route: "/session" });
  });

  it("a session's dhikr part follows the time of day", () => {
    expect(sessionDhikrList(ctxAt(at(27, 12, 30)))).toBe("post-prayer");
    expect(sessionDhikrList(ctxAt(at(27, 7, 0)))).toBe("morning");
    expect(sessionDhikrList(ctxAt(at(27, 16, 30)))).toBe("evening");
    expect(sessionDhikrList(ctxAt(at(27, 23, 30)))).toBe("sleep");
  });
});

describe("Athkar tallies stay compatible", () => {
  it("uses the same storage key format as before (athkar.counts.<list>.<YYYY-MM-DD>)", () => {
    const d = new Date(2026, 8, 27);
    expect(athkarCountsKey("morning", d)).toBe("athkar.counts.morning.2026-09-27");
    localStorage.setItem("athkar.counts.morning.2026-09-27", JSON.stringify(ATHKAR_LISTS.morning.items.map(() => 1)));
    expect(loadAthkarCounts("morning", d)).toEqual(ATHKAR_LISTS.morning.items.map(() => 1));
    localStorage.setItem("athkar.counts.morning.2026-09-27", "[1,2]");
    expect(loadAthkarCounts("morning", d).every((n) => n === 0)).toBe(true);
  });
});
