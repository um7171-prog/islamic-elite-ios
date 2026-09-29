import { uid } from "./id";
import { SURAHS } from "./mushafData";

/**
 * «القراءة مع المعلم» — phase 1: SELF-practice. The user picks a surah and a range of ayahs, reads
 * it (the text on screen, the reciter's recording to listen to), records their own recitation to
 * hear it back, then rates themselves. Sessions and progress stay on this device.
 *
 * Built to grow into real teacher review later WITHOUT pretending one exists today: every session
 * has a review `status` and a `reviewer`; today they are always "self-reviewed" / null. A teacher
 * service (accounts, matching, audio upload, notes, homework) needs a backend — see the plan.
 * The recording itself is never stored or uploaded: it lives in memory for the session only.
 */

export type PracticeMode = "memorize" | "review";
/** 1 = could not recite it … 5 = recited it perfectly from memory. */
export type SelfRating = 1 | 2 | 3 | 4 | 5;
export type ReviewStatus = "self-reviewed" | "awaiting-teacher" | "teacher-reviewed";

export interface PracticeSession {
  id: string;
  at: number;
  surah: number;
  fromAyah: number;
  toAyah: number;
  mode: PracticeMode;
  rating: SelfRating;
  /** Length of the user's recording, seconds (0 when they practised without recording). */
  recordedSeconds: number;
  notes: string;
  status: ReviewStatus;
  /** Who reviewed it — null for self-review (the only kind that exists today). */
  reviewer: null | { kind: "teacher"; id: string };
  teacherNotes: string | null;
}

export type MemorizationLevel = "not-started" | "learning" | "needs-review" | "memorized";

const KEY = "recite:sessions";
export const MAX_SESSIONS = 300;

export function validRange(surah: number, fromAyah: number, toAyah: number): boolean {
  const meta = SURAHS[surah - 1];
  return !!meta && Number.isInteger(fromAyah) && Number.isInteger(toAyah) && fromAyah >= 1 && toAyah >= fromAyah && toAyah <= meta.ayahs;
}

function isSession(v: unknown): v is PracticeSession {
  const s = v as PracticeSession;
  return !!s && typeof s.id === "string" && typeof s.at === "number" && validRange(s.surah, s.fromAyah, s.toAyah)
    && (s.mode === "memorize" || s.mode === "review") && [1, 2, 3, 4, 5].includes(s.rating);
}

export function loadSessions(): PracticeSession[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(isSession).sort((a, b) => b.at - a.at) : [];
  } catch {
    return [];
  }
}

export interface NewSession {
  surah: number;
  fromAyah: number;
  toAyah: number;
  mode: PracticeMode;
  rating: SelfRating;
  recordedSeconds: number;
  notes: string;
}

export function saveSession(input: NewSession, now = Date.now()): PracticeSession {
  if (!validRange(input.surah, input.fromAyah, input.toAyah)) throw new Error("invalid ayah range");
  const session: PracticeSession = {
    id: uid(),
    at: now,
    surah: input.surah,
    fromAyah: input.fromAyah,
    toAyah: input.toAyah,
    mode: input.mode,
    rating: input.rating,
    recordedSeconds: Math.max(0, Math.round(input.recordedSeconds)),
    notes: input.notes.trim().slice(0, 500),
    status: "self-reviewed",
    reviewer: null,
    teacherNotes: null,
  };
  const all = [session, ...loadSessions()].slice(0, MAX_SESSIONS);
  localStorage.setItem(KEY, JSON.stringify(all));
  return session;
}

export function deleteSession(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(loadSessions().filter((s) => s.id !== id)));
}

/**
 * Level of a surah from the user's OWN ratings (never invented): the latest session that covered
 * the whole surah decides; partial ranges only mark it as being learned.
 *   memorized     last whole-surah session rated 4-5
 *   needs-review  last whole-surah session rated 1-3, or a memorized surah not revisited in 30 days
 *   learning      only partial sessions so far
 */
export function surahLevel(sessions: PracticeSession[], surah: number, now = Date.now()): MemorizationLevel {
  const mine = sessions.filter((s) => s.surah === surah).sort((a, b) => b.at - a.at);
  if (!mine.length) return "not-started";
  const whole = mine.find((s) => s.fromAyah === 1 && s.toAyah === SURAHS[surah - 1].ayahs);
  if (!whole) return "learning";
  if (whole.rating <= 3) return "needs-review";
  return now - mine[0].at > 30 * 24 * 60 * 60 * 1000 ? "needs-review" : "memorized";
}

export interface PracticeStats {
  sessions: number;
  surahsPractised: number;
  memorized: number;
  needsReview: number;
  /** Consecutive days with at least one session, ending today or yesterday. */
  streakDays: number;
  recordedMinutes: number;
}

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function practiceStats(sessions: PracticeSession[], now = Date.now()): PracticeStats {
  const surahs = [...new Set(sessions.map((s) => s.surah))];
  const levels = surahs.map((n) => surahLevel(sessions, n, now));
  const days = new Set(sessions.map((s) => dayKey(s.at)));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return {
    sessions: sessions.length,
    surahsPractised: surahs.length,
    memorized: levels.filter((l) => l === "memorized").length,
    needsReview: levels.filter((l) => l === "needs-review").length,
    streakDays: streak,
    recordedMinutes: Math.round(sessions.reduce((n, s) => n + s.recordedSeconds, 0) / 60),
  };
}
