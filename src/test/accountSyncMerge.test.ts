import { describe, it, expect } from "vitest";
import { ATHKAR_LISTS, localDayKey } from "@/lib/athkarProgress";
import type { JourneyActivity, JourneySession, JourneyState } from "@/lib/journey/types";
import {
  JOURNEY_MAX_ACTIVITIES,
  JOURNEY_MAX_SESSIONS,
  TOMBSTONE_TTL_MS,
  hasAnyData,
  mergeAll,
  mergeDoc,
  normalizeAll,
  stableStringify,
} from "@/lib/accountSync/merge";
import { mergeIntoAccount, planOwner } from "@/lib/accountSync/owner";
import { SYNC_DOCS, type RawSyncDocs, type SyncDocs } from "@/lib/accountSync/types";

const NOW = new Date(2026, 8, 27, 12, 0).getTime();
const ctx = { now: NOW };
const day = (offset: number) => localDayKey(new Date(2026, 8, 27 + offset));
const same = (a: unknown, b: unknown) => expect(stableStringify(a)).toBe(stableStringify(b));

/* ---------- fixtures ---------- */

function activity(id: string, updatedAt: number, extra: Partial<JourneyActivity> = {}): JourneyActivity {
  return {
    id, type: "quran", title: { ar: id, en: id }, route: "/mushaf", progress: 0.5, status: "active",
    startedAt: 1, updatedAt, completedAt: null, expiresAt: null, metadata: {}, ...extra,
  };
}
function session(id: string, startedAt: number, updatedAt = startedAt, extra: Partial<JourneySession> = {}): JourneySession {
  return {
    id, minutes: 10, currentStep: 0, status: "active", startedAt, updatedAt, completedAt: null,
    steps: [{ kind: "quran", minutes: 5, status: "active", startedAt, completedAt: null, data: {} }], ...extra,
  };
}
const journey = (p: Partial<JourneyState>): JourneyState => ({ version: 1, activities: [], sessions: [], cursors: {}, ...p });
const zeros = (list: keyof typeof ATHKAR_LISTS) => ATHKAR_LISTS[list].items.map(() => 0);

/* ---------- quran.position ---------- */

describe("quran.position — the latest `at` wins", () => {
  it("picks the newer position, whichever side it is on", () => {
    const older = { page: 10, surah: 2, at: 100 };
    const newer = { page: 50, surah: 3, at: 200 };
    same(mergeDoc("quran.position", older, newer, ctx), newer);
    same(mergeDoc("quran.position", newer, older, ctx), newer);
  });
  it("empty / never opened (at 0) / invalid values lose to any real position", () => {
    const p = { page: 5, surah: 2, at: 10 };
    same(mergeDoc("quran.position", null, p, ctx), p);
    same(mergeDoc("quran.position", { page: 1, surah: 1, at: 0 }, p, ctx), p);
    same(mergeDoc("quran.position", { page: 999, surah: 1, at: 50 }, p, ctx), p);
    expect(mergeDoc("quran.position", undefined, "garbage", ctx)).toBeNull();
  });
  it("a tie on `at` is settled by content, not by argument order", () => {
    const a = { page: 7, surah: 2, at: 100 };
    const b = { page: 8, surah: 2, at: 100 };
    same(mergeDoc("quran.position", a, b, ctx), mergeDoc("quran.position", b, a, ctx));
  });
});

/* ---------- quran.bookmarks ---------- */

describe("quran.bookmarks — union with timed deletions", () => {
  const bm = (page: number, at: number) => ({ page, surah: 2, label: "البقرة", at });

  it("unions bookmarks from both sides, sorted by page, without duplicates", () => {
    const m = mergeDoc("quran.bookmarks", { items: [bm(40, 1), bm(2, 1)], deleted: [] }, { items: [bm(2, 5), bm(100, 3)], deleted: [] }, ctx);
    expect(m.items.map((x) => x.page)).toEqual([2, 40, 100]);
    expect(m.items.find((x) => x.page === 2)?.at).toBe(5);
  });
  const T = NOW - 60_000; // recent times, inside the deletion retention window
  it("a deletion removes a bookmark made before it, even if the other device still has it", () => {
    const m = mergeDoc("quran.bookmarks", { items: [bm(40, T)], deleted: [] }, { items: [], deleted: [{ page: 40, deletedAt: T + 50 }] }, ctx);
    expect(m.items).toEqual([]);
    expect(m.deleted).toEqual([{ page: 40, deletedAt: T + 50 }]);
  });
  it("re-bookmarking after the deletion wins, and the old deletion is dropped", () => {
    const m = mergeDoc("quran.bookmarks", { items: [bm(40, T + 100)], deleted: [] }, { items: [], deleted: [{ page: 40, deletedAt: T + 50 }] }, ctx);
    expect(m.items.map((x) => x.page)).toEqual([40]);
    expect(m.deleted).toEqual([]);
  });
  it("a deletion at exactly the bookmark time wins (deterministic tie)", () => {
    const m = mergeDoc("quran.bookmarks", { items: [bm(9, T)], deleted: [] }, { items: [], deleted: [{ page: 9, deletedAt: T }] }, ctx);
    expect(m.items).toEqual([]);
  });
  it("deletions older than the retention window are forgotten", () => {
    const m = mergeDoc("quran.bookmarks", { items: [], deleted: [{ page: 3, deletedAt: NOW - TOMBSTONE_TTL_MS - 1 }, { page: 4, deletedAt: NOW - 1000 }] }, {}, ctx);
    expect(m.deleted).toEqual([{ page: 4, deletedAt: NOW - 1000 }]);
  });
  it("an old deletion is still APPLIED when present in the merge, and only then pruned from the result", () => {
    const old = NOW - TOMBSTONE_TTL_MS - 5_000;
    const m = mergeDoc("quran.bookmarks", { items: [bm(12, old - 1000)], deleted: [] }, { items: [], deleted: [{ page: 12, deletedAt: old }] }, ctx);
    expect(m.items).toEqual([]);
    expect(m.deleted).toEqual([]);
    const s = mergeDoc("services.favorites", { items: [{ id: "qibla", at: old - 1000 }], deleted: [] }, { items: [], deleted: [{ id: "qibla", deletedAt: old }] }, ctx);
    expect(s.items).toEqual([]);
  });
  it("drops invalid entries (bad page, missing label, bad time)", () => {
    const m = mergeDoc("quran.bookmarks", { items: [bm(0, 1), { page: 5, surah: 2, at: 1 }, bm(6, -1), bm(7, 1)], deleted: [{ page: "x" }] }, null, ctx);
    expect(m.items.map((x) => x.page)).toEqual([7]);
    expect(m.deleted).toEqual([]);
  });
});

/* ---------- quran.reciters ---------- */

describe("quran.reciters — selected: latest wins; favorites: union", () => {
  it("selected reciter: the later choice wins", () => {
    const a = { selected: { id: "afasy", at: 100 }, favorites: [] };
    const b = { selected: { id: "sudais", at: 300 }, favorites: [] };
    expect(mergeDoc("quran.reciters", a, b, ctx).selected).toEqual({ id: "sudais", at: 300 });
    expect(mergeDoc("quran.reciters", b, a, ctx).selected).toEqual({ id: "sudais", at: 300 });
  });
  it("favorites: union, unique, stable order", () => {
    const m = mergeDoc("quran.reciters", { selected: null, favorites: ["maher", "afasy"] }, { selected: null, favorites: ["afasy", "basit", "BAD ID"] }, ctx);
    expect(m.favorites).toEqual(["afasy", "basit", "maher"]);
  });
  it("one side empty: the other side is kept", () => {
    const a = { selected: { id: "husary", at: 5 }, favorites: ["husary"] };
    same(mergeDoc("quran.reciters", a, {}, ctx), a);
  });
});

/* ---------- journey ---------- */

describe("journey — merged by id, latest update wins, capped at 40 / 50", () => {
  it("same activity on both devices: the more recently updated copy wins; others are unioned", () => {
    const a = journey({ activities: [activity("quran:mushaf", 100, { metadata: { page: 10 } }), activity("only-a", 50)] });
    const b = journey({ activities: [activity("quran:mushaf", 300, { metadata: { page: 42 } }), activity("only-b", 60)] });
    const m = mergeDoc("journey", a, b, ctx);
    expect(m.activities.map((x) => x.id)).toEqual(["quran:mushaf", "only-b", "only-a"]);
    expect(m.activities[0].metadata.page).toBe(42);
  });
  it("sessions are merged by id (latest update wins) and ordered newest first", () => {
    const s1old = session("s1", 100, 100);
    const s1new = session("s1", 100, 500, { status: "completed", completedAt: 500, currentStep: 0 });
    const m = mergeDoc("journey", journey({ sessions: [s1old, session("s0", 50)] }), journey({ sessions: [s1new] }), ctx);
    expect(m.sessions.map((x) => x.id)).toEqual(["s1", "s0"]);
    expect(m.sessions[0].status).toBe("completed");
  });
  it("the 99-Names cursor takes the max", () => {
    const m = mergeDoc("journey", journey({ cursors: { names: 12 } }), journey({ cursors: { names: 30, other: 2 } }), ctx);
    expect(m.cursors).toEqual({ names: 30, other: 2 });
  });
  it("keeps at most 40 activities and 50 sessions (the most recent)", () => {
    const a = journey({ activities: Array.from({ length: 30 }, (_, i) => activity(`a${i}`, 1000 + i)), sessions: Array.from({ length: 30 }, (_, i) => session(`s${i}`, 1000 + i)) });
    const b = journey({ activities: Array.from({ length: 30 }, (_, i) => activity(`b${i}`, 2000 + i)), sessions: Array.from({ length: 30 }, (_, i) => session(`t${i}`, 2000 + i)) });
    const m = mergeDoc("journey", a, b, ctx);
    expect(m.activities).toHaveLength(JOURNEY_MAX_ACTIVITIES);
    expect(m.sessions).toHaveLength(JOURNEY_MAX_SESSIONS);
    expect(m.activities[0].id).toBe("b29");
    expect(m.activities.every((x) => x.updatedAt >= 1020)).toBe(true);
    expect(JOURNEY_MAX_ACTIVITIES).toBe(40);
    expect(JOURNEY_MAX_SESSIONS).toBe(50);
  });
  it("corrupted journey data is dropped item by item (the store's own validator)", () => {
    const m = mergeDoc("journey", { version: 1, activities: [activity("ok", 5), { id: "bad", type: "hack" }], sessions: [{ id: 1 }], cursors: { names: "x" } }, null, ctx);
    expect(m.activities.map((x) => x.id)).toEqual(["ok"]);
    expect(m.sessions).toEqual([]);
    expect(m.cursors).toEqual({});
  });
});

/* ---------- services.favorites ---------- */

describe("services.favorites — the user's order (seq) + timed deletions", () => {
  // Lists written as the adapter produces them: seq = position, at = unknown (0).
  const list = (...ids: string[]) => ({ items: ids.map((id, seq) => ({ id, at: 0, seq })), deleted: [] });
  const ids = (d: { items: { id: string }[] }) => d.items.map((x) => x.id);

  it("one list keeps its exact order (never re-sorted by name or time)", () => {
    expect(ids(mergeDoc("services.favorites", list("qibla", "quran", "athkar"), undefined, ctx))).toEqual(["qibla", "quran", "athkar"]);
    expect(ids(mergeDoc("services.favorites", list("zakat", "athkar", "mushaf", "calendar"), list(), ctx))).toEqual(["zakat", "athkar", "mushaf", "calendar"]);
  });
  it("two lists: both kept, no duplicates, not alphabetical, each list's order preserved", () => {
    const a = list("qibla", "quran", "athkar");
    const b = list("tasbeeh", "quran", "zakat");
    const m = ids(mergeDoc("services.favorites", a, b, ctx));
    expect(new Set(m).size).toBe(m.length);
    expect([...m].sort()).toEqual(["athkar", "qibla", "quran", "tasbeeh", "zakat"]);
    expect(m).not.toEqual([...m].sort());
    const keepsOrder = (order: string[], sub: string[]) => sub.every((x, i) => i === 0 || order.indexOf(sub[i - 1]) < order.indexOf(x));
    expect(keepsOrder(m, ["qibla", "quran", "athkar"])).toBe(true);
    expect(keepsOrder(m, ["tasbeeh", "quran", "zakat"])).toBe(true);
    expect(m).toEqual(["qibla", "tasbeeh", "quran", "athkar", "zakat"]);
  });
  it("conflict rule: an item takes its EARLIER place of the two; equal places are settled by id", () => {
    // quran is 2nd in a but 1st in b -> it keeps place 0; qibla and quran then share place 0 -> by id.
    expect(ids(mergeDoc("services.favorites", list("qibla", "quran"), list("quran"), ctx))).toEqual(["qibla", "quran"]);
    expect(ids(mergeDoc("services.favorites", list("tasbeeh", "quran"), list("quran"), ctx))).toEqual(["quran", "tasbeeh"]);
    // Same result whichever list is given first.
    same(mergeDoc("services.favorites", list("tasbeeh", "quran"), list("quran"), ctx), mergeDoc("services.favorites", list("quran"), list("tasbeeh", "quran"), ctx));
  });
  it("re-merging changes nothing (with itself, with either input, and after being written back)", () => {
    const a = list("qibla", "quran", "athkar");
    const b = list("tasbeeh", "quran", "zakat");
    const m = mergeDoc("services.favorites", a, b, ctx);
    same(mergeDoc("services.favorites", m, m, ctx), m);
    same(mergeDoc("services.favorites", m, b, ctx), m);
    same(mergeDoc("services.favorites", a, m, ctx), m);
    // The app stores the merged order as a plain list; reading it back renumbers seq 0..n-1 —
    // merging that with the synced copy still gives the same order and the same document.
    same(mergeDoc("services.favorites", list(...ids(m)), m, ctx), m);
  });
  it("older documents without seq keep the order in which they list their items", () => {
    const old = { items: [{ id: "quran", at: 10 }, { id: "qibla", at: 30 }, { id: "athkar", at: 20 }], deleted: [] };
    expect(ids(mergeDoc("services.favorites", old, undefined, ctx))).toEqual(["quran", "qibla", "athkar"]);
  });
  it("an un-favorite on one device removes it everywhere; a later re-favorite brings it back", () => {
    const T = NOW - 60_000;
    const has = { items: [{ id: "quran", at: T, seq: 0 }, { id: "tasbeeh", at: T + 10, seq: 1 }], deleted: [] };
    const removed = { items: [], deleted: [{ id: "tasbeeh", deletedAt: T + 20 }] };
    const gone = mergeDoc("services.favorites", has, removed, ctx);
    expect(gone.items).toEqual([{ id: "quran", at: T, seq: 0 }]);
    expect(gone.deleted).toEqual([{ id: "tasbeeh", deletedAt: T + 20 }]);
    // An unknown add time (0, from a first read) loses to a recorded deletion, too.
    expect(mergeDoc("services.favorites", { items: [{ id: "tasbeeh", at: 0, seq: 0 }], deleted: [] }, removed, ctx).items).toEqual([]);
    const again = { items: [{ id: "tasbeeh", at: T + 30, seq: 0 }], deleted: [] };
    const m = mergeDoc("services.favorites", again, removed, ctx);
    expect(m.items.map((x) => x.id)).toEqual(["tasbeeh"]);
    expect(m.deleted).toEqual([]);
  });
});

/* ---------- athkar.progress ---------- */

describe("athkar.progress — max per dhikr per day, last 7 days only", () => {
  it("takes the max of each dhikr's count for the same day and list", () => {
    const x = zeros("morning"); x[0] = 1; x[1] = 2;
    const y = zeros("morning"); y[1] = 3; y[2] = 1;
    const m = mergeDoc("athkar.progress", { days: { [day(0)]: { morning: x } } }, { days: { [day(0)]: { morning: y } } }, ctx);
    const want = zeros("morning"); want[0] = 1; want[1] = 3; want[2] = 1;
    expect(m.days[day(0)].morning).toEqual(want);
  });
  it("keeps today and the 6 previous days; older days are dropped", () => {
    const one = () => { const c = zeros("evening"); c[0] = 1; return c; };
    const m = mergeDoc("athkar.progress", { days: { [day(0)]: { evening: one() }, [day(-6)]: { evening: one() } } }, { days: { [day(-7)]: { evening: one() }, [day(-30)]: { evening: one() } } }, ctx);
    expect(Object.keys(m.days).sort()).toEqual([day(-6), day(0)].sort());
  });
  it("counts are clamped to each dhikr's target and malformed lists are dropped", () => {
    const tooMuch = zeros("sleep").map(() => 9999);
    const m = mergeDoc("athkar.progress", { days: { [day(0)]: { sleep: tooMuch, morning: [1, 2], unknown: [1] }, "not-a-day": {} } }, null, ctx);
    expect(m.days[day(0)].sleep).toEqual(ATHKAR_LISTS.sleep.items.map((it) => it.count));
    expect(m.days[day(0)].morning).toBeUndefined();
    expect(Object.keys(m.days)).toEqual([day(0)]);
  });
});

/* ---------- prefs.app ---------- */

describe("prefs.app — the latest value wins, per preference", () => {
  it("each preference is decided on its own", () => {
    const a = { lang: { value: "ar", at: 300 }, themeMode: { value: "light", at: 100 } };
    const b = { lang: { value: "en", at: 200 }, themeMode: { value: "night", at: 400 }, themeId: { value: "makkah", at: 50 } };
    same(mergeDoc("prefs.app", a, b, ctx), { lang: { value: "ar", at: 300 }, themeMode: { value: "night", at: 400 }, themeId: { value: "makkah", at: 50 } });
  });
  it("invalid values are ignored", () => {
    same(mergeDoc("prefs.app", { lang: { value: "fr", at: 9 }, themeMode: { value: "dark", at: 9 }, themeId: { value: "<x>", at: 9 } }, {}, ctx), {});
  });
});

/* ---------- whole-account properties ---------- */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function randomDocs(seed: number): RawSyncDocs {
  const r = rng(seed);
  const t = () => Math.floor(r() * 1000) + 1;
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const counts = (list: keyof typeof ATHKAR_LISTS) => ATHKAR_LISTS[list].items.map(() => Math.floor(r() * 4));
  return {
    "quran.position": r() < 0.8 ? { page: 1 + Math.floor(r() * 604), surah: 1 + Math.floor(r() * 114), at: t() } : null,
    "quran.bookmarks": {
      items: Array.from({ length: Math.floor(r() * 5) }, () => ({ page: 1 + Math.floor(r() * 20), surah: 2, label: "x", at: t() })),
      deleted: Array.from({ length: Math.floor(r() * 3) }, () => ({ page: 1 + Math.floor(r() * 20), deletedAt: NOW - t() })),
    },
    "quran.reciters": { selected: r() < 0.7 ? { id: pick(["afasy", "sudais", "maher"]), at: t() } : null, favorites: [pick(["afasy", "basit"]), pick(["maher", "husary"])] },
    journey: journey({
      activities: Array.from({ length: Math.floor(r() * 6) }, () => activity(pick(["q", "d", "s", "x"]), t())),
      sessions: Array.from({ length: Math.floor(r() * 3) }, () => session(pick(["s1", "s2"]), t(), t())),
      cursors: r() < 0.5 ? { names: Math.floor(r() * 99) } : {},
    }),
    "services.favorites": {
      items: Array.from({ length: Math.floor(r() * 4) }, () => ({ id: pick(["quran", "qibla", "athkar", "tasbeeh"]), at: t() })),
      deleted: Array.from({ length: Math.floor(r() * 2) }, () => ({ id: pick(["quran", "qibla"]), deletedAt: NOW - t() })),
    },
    "athkar.progress": { days: { [day(-Math.floor(r() * 9))]: { morning: counts("morning") }, [day(0)]: { evening: counts("evening") } } },
    "prefs.app": { lang: { value: pick(["ar", "en"]), at: t() }, themeMode: { value: pick(["system", "night", "light"]), at: t() } },
  };
}

describe("determinism — order-independent, re-runnable, no duplicates", () => {
  it("merge(a, b) = merge(b, a) for every document (100 random pairs)", () => {
    for (let i = 0; i < 100; i++) {
      const a = randomDocs(i), b = randomDocs(1000 + i);
      same(mergeAll(a, b, ctx), mergeAll(b, a, ctx));
    }
  });
  it("re-running is a no-op: merge(m, m) = m and merge(merge(a, b), b) = merge(a, b)", () => {
    for (let i = 0; i < 100; i++) {
      const a = randomDocs(i), b = randomDocs(1000 + i);
      const m = mergeAll(a, b, ctx);
      same(mergeAll(m, m, ctx), m);
      same(mergeAll(m, b, ctx), m);
      same(mergeAll(a, m, ctx), m);
    }
  });
  it("merging never duplicates ids, pages or favorites", () => {
    for (let i = 0; i < 100; i++) {
      const m = mergeAll(randomDocs(i), randomDocs(2000 + i), ctx);
      const uniq = (xs: unknown[]) => new Set(xs).size === xs.length;
      expect(uniq(m["quran.bookmarks"].items.map((x) => x.page))).toBe(true);
      expect(uniq(m["quran.reciters"].favorites)).toBe(true);
      expect(uniq(m.journey.activities.map((x) => x.id))).toBe(true);
      expect(uniq(m.journey.sessions.map((x) => x.id))).toBe(true);
      expect(uniq(m["services.favorites"].items.map((x) => x.id))).toBe(true);
    }
  });
  it("the result does not depend on the input objects being mutated afterwards", () => {
    const a = randomDocs(7);
    const before = stableStringify(a);
    mergeAll(a, randomDocs(8), ctx);
    expect(stableStringify(a)).toBe(before);
  });
});

/* ---------- guest -> account scenarios + owner guard ---------- */

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const guestData: RawSyncDocs = {
  "quran.position": { page: 42, surah: 2, at: 500 },
  "services.favorites": { items: [{ id: "qibla", at: 10 }], deleted: [] },
};
const accountData: RawSyncDocs = {
  "quran.position": { page: 7, surah: 2, at: 100 },
  "services.favorites": { items: [{ id: "quran", at: 5 }], deleted: [] },
  "prefs.app": { lang: { value: "en", at: 50 } },
};

describe("guest -> account", () => {
  it("both empty: nothing to write, still a valid merge", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: null, local: {}, remote: {}, ctx });
    expect(r).toMatchObject({ status: "ok", owner: USER, writeLocal: [], writeRemote: [] });
    if (r.status === "ok") expect(hasAnyData(r.docs)).toBe(false);
  });
  it("guest only (new account): the guest's data is uploaded unchanged", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: null, local: guestData, remote: {}, ctx });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.writeLocal).toEqual([]);
    expect(r.writeRemote.sort()).toEqual(["quran.position", "services.favorites"]);
    same(r.docs, normalizeAll(guestData, ctx));
  });
  it("account only (fresh device): the account is restored unchanged", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: null, local: {}, remote: accountData, ctx });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.writeRemote).toEqual([]);
    expect(r.writeLocal.sort()).toEqual(["prefs.app", "quran.position", "services.favorites"]);
    same(r.docs, normalizeAll(accountData, ctx));
  });
  it("both filled: merged per rule, nothing lost", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: null, local: guestData, remote: accountData, ctx });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.docs["quran.position"]).toEqual({ page: 42, surah: 2, at: 500 });
    // Each side has ONE favorite at place 0: a real conflict of places -> settled by id.
    expect(r.docs["services.favorites"].items.map((x) => x.id)).toEqual(["qibla", "quran"]);
    expect(r.docs["prefs.app"].lang?.value).toBe("en");
    // Running the same first sync again changes nothing.
    const again = mergeIntoAccount({ userId: USER, localOwner: USER, local: r.docs as unknown as RawSyncDocs, remote: r.docs as unknown as RawSyncDocs, ctx });
    expect(again).toMatchObject({ status: "ok", writeLocal: [], writeRemote: [] });
  });
});

describe("sync.owner — two accounts are never mixed silently", () => {
  it("planOwner: guest data, same account, or an empty device -> merge", () => {
    expect(planOwner(null, USER, true)).toEqual({ kind: "merge" });
    expect(planOwner(USER, USER, true)).toEqual({ kind: "merge" });
    expect(planOwner(OTHER, USER, false)).toEqual({ kind: "merge" });
  });
  it("planOwner: another account's data on the device -> owner-conflict", () => {
    expect(planOwner(OTHER, USER, true)).toEqual({ kind: "owner-conflict", localOwner: OTHER });
    expect(() => planOwner(null, "", true)).toThrow();
  });
  it("without the user's choice, another account's data is NOT merged and nothing is returned to write", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: OTHER, local: guestData, remote: accountData, ctx });
    expect(r).toEqual({ status: "owner-conflict", localOwner: OTHER });
  });
  it("choice 'use-account-only': the device takes the account's data, the account is untouched", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: OTHER, local: guestData, remote: accountData, ctx, choice: "use-account-only" });
    if (r.status !== "ok") throw new Error("expected ok");
    same(r.docs, normalizeAll(accountData, ctx));
    expect(r.writeRemote).toEqual([]);
    expect(r.owner).toBe(USER);
  });
  it("choice 'merge-into-account': merged like guest data, then owned by this account", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: OTHER, local: guestData, remote: accountData, ctx, choice: "merge-into-account" });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.owner).toBe(USER);
    same(r.docs, mergeAll(guestData, accountData, ctx));
  });
  it("every document kind is covered by the account merge", () => {
    const r = mergeIntoAccount({ userId: USER, localOwner: null, local: randomDocs(1), remote: randomDocs(2), ctx });
    if (r.status !== "ok") throw new Error("expected ok");
    expect(Object.keys(r.docs).sort()).toEqual([...SYNC_DOCS].sort());
    const docs: SyncDocs = r.docs;
    expect(docs).toBeTruthy();
  });
});
