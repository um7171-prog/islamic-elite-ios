import { uid } from "@/lib/id";
import { ASMA_AL_HUSNA } from "@/lib/asmaAlHusna";
import type { AthkarListKey } from "@/lib/athkarProgress";
import { minutesTextAr } from "./format";
import { NAMES_CURSOR } from "./sources";
import { SESSION_RESUME_MS, findActiveSession, getJourneyState, writeJourney } from "./store";
import {
  SESSION_LENGTHS,
  type ActivityMeta,
  type JourneySession,
  type JourneyState,
  type SessionLength,
  type SessionStep,
  type SessionStepKind,
} from "./types";

/**
 * «جلسة الآن»: a short, resumable session ORGANISED from content the app already has — the user's
 * own place in the Mushaf, one of the app's Athkar lists (with the counts already written in it),
 * and the next few of the 99 Names. The minutes only split the chosen time between the parts; they
 * are a suggestion for the user's own pace, never a religious amount or ruling.
 */
export const SESSION_PLANS: Record<SessionLength, { kind: SessionStepKind; minutes: number }[]> = {
  5: [{ kind: "quran", minutes: 3 }, { kind: "dhikr", minutes: 2 }],
  10: [{ kind: "quran", minutes: 5 }, { kind: "dhikr", minutes: 3 }, { kind: "names", minutes: 2 }],
  20: [{ kind: "quran", minutes: 12 }, { kind: "dhikr", minutes: 5 }, { kind: "names", minutes: 3 }],
  30: [{ kind: "quran", minutes: 20 }, { kind: "dhikr", minutes: 7 }, { kind: "names", minutes: 3 }],
};

/** How many of the 99 Names a names part shows per suggested minute. */
const NAMES_PER_MINUTE = 2;

export const isSessionLength = (v: unknown): v is SessionLength => SESSION_LENGTHS.includes(v as SessionLength);

export interface SessionStartInput {
  /** Athkar list for the dhikr part (chosen from the time of day by the caller). */
  dhikrList: AthkarListKey;
  /** The user's current Mushaf page — the Quran part continues from it. */
  quranPage: number;
  /** Next index into the 99 Names. */
  namesCursor: number;
}

/** The parts of a session of `minutes` (pure). The first part starts immediately. */
export function buildSessionSteps(minutes: SessionLength, input: SessionStartInput, now = Date.now()): SessionStep[] {
  const total = ASMA_AL_HUSNA.length;
  const from = input.namesCursor >= 0 && input.namesCursor < total ? Math.floor(input.namesCursor) : 0;
  return SESSION_PLANS[minutes].map((p, i) => {
    let data: ActivityMeta = {};
    if (p.kind === "quran") data = { startPage: input.quranPage };
    if (p.kind === "dhikr") data = { list: input.dhikrList };
    if (p.kind === "names") data = { from, to: Math.min(total, from + p.minutes * NAMES_PER_MINUTE) };
    return { kind: p.kind, minutes: p.minutes, status: i === 0 ? "active" : "pending", startedAt: i === 0 ? now : null, completedAt: null, data };
  });
}

export const sessionActivityId = (s: JourneySession) => `session:${s.id}`;

/** Keeps the session's mirror activity (what «أكمل رحلتي» / «رحلتي» show) in step with it. */
function mirror(draft: JourneyState, s: JourneySession, now: number) {
  const done = s.steps.filter((x) => x.status === "done").length;
  const id = sessionActivityId(s);
  const prev = draft.activities.find((a) => a.id === id);
  const activity = {
    id,
    type: "session" as const,
    title: { ar: `جلسة الآن — ${minutesTextAr(s.minutes)}`, en: `Session — ${s.minutes} min` },
    route: "/session",
    progress: done / s.steps.length,
    status: s.status === "completed" ? ("completed" as const) : ("active" as const),
    startedAt: prev?.startedAt ?? s.startedAt,
    updatedAt: now,
    completedAt: s.status === "completed" ? now : null,
    // A stopped session is no longer offered; an open one only for a day.
    expiresAt: s.status === "stopped" ? now : s.startedAt + SESSION_RESUME_MS,
    metadata: { minutes: s.minutes, stepsDone: done, steps: s.steps.length },
  };
  draft.activities = [activity, ...draft.activities.filter((a) => a.id !== id)];
}

export function getActiveSession(now = Date.now()): JourneySession | null {
  return findActiveSession(getJourneyState(), now);
}

/** Starts a new session (an unfinished one is stopped first — only one session is ever open). */
export function startSession(minutes: SessionLength, input: SessionStartInput, now = Date.now()): JourneySession {
  const session: JourneySession = {
    id: uid(),
    minutes,
    steps: buildSessionSteps(minutes, input, now),
    currentStep: 0,
    status: "active",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
  writeJourney((d) => {
    for (const s of d.sessions) {
      if (s.status === "active") {
        s.status = "stopped";
        s.updatedAt = now;
        mirror(d, s, now);
      }
    }
    d.sessions.unshift(session);
    mirror(d, session, now);
  });
  return session;
}

function withSession(id: string, now: number, change: (s: JourneySession, d: JourneyState) => void): JourneySession | null {
  let out: JourneySession | null = null;
  writeJourney((d) => {
    const s = d.sessions.find((x) => x.id === id);
    if (!s || s.status !== "active") return;
    change(s, d);
    s.updatedAt = now;
    mirror(d, s, now);
    out = s;
  });
  return out;
}

/** Records progress inside the current part (e.g. the dhikr list the user switched to). */
export function updateSessionStep(id: string, data: ActivityMeta, now = Date.now()): JourneySession | null {
  return withSession(id, now, (s) => {
    const step = s.steps[s.currentStep];
    step.data = { ...step.data, ...data };
  });
}

/** Finishes the current part and moves to the next; finishing the last part completes the session. */
export function completeSessionStep(id: string, data: ActivityMeta = {}, now = Date.now()): JourneySession | null {
  return withSession(id, now, (s, d) => {
    const step = s.steps[s.currentStep];
    step.data = { ...step.data, ...data };
    step.status = "done";
    step.completedAt = now;
    if (step.kind === "names" && typeof step.data.to === "number") {
      d.cursors[NAMES_CURSOR] = step.data.to >= ASMA_AL_HUSNA.length ? 0 : step.data.to;
    }
    const next = s.currentStep + 1;
    if (next < s.steps.length) {
      s.currentStep = next;
      s.steps[next].status = "active";
      s.steps[next].startedAt = now;
    } else {
      s.status = "completed";
      s.completedAt = now;
    }
  });
}

/** Completes the whole session now (remaining parts are left as they are). */
export function completeSession(id: string, now = Date.now()): JourneySession | null {
  return withSession(id, now, (s) => {
    s.status = "completed";
    s.completedAt = now;
  });
}

/** Ends an unfinished session without completing it. */
export function stopSession(id: string, now = Date.now()): JourneySession | null {
  return withSession(id, now, (s) => {
    s.status = "stopped";
  });
}
