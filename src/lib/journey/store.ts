import {
  SESSION_LENGTHS,
  type ActivityMeta,
  type ActivityType,
  type JourneyActivity,
  type JourneySession,
  type JourneyState,
  type LocalizedText,
  type SessionStep,
} from "./types";

/**
 * The Journey store: ONE versioned localStorage key, validated on every read (a corrupt or foreign
 * value is ignored item by item, never trusted), capped so it cannot grow without bound, and
 * observable (`subscribeJourney`) so React can read it with useSyncExternalStore. No React here.
 */
export const JOURNEY_KEY = "elite.journey.v1";
const MAX_ACTIVITIES = 40;
const MAX_SESSIONS = 50;

const ACTIVITY_TYPES: readonly ActivityType[] = ["quran", "dhikr", "session", "names", "dua", "reading"];

const emptyState = (): JourneyState => ({ version: 1, activities: [], sessions: [], cursors: {} });

/* ---------------- validation ---------------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

function toText(v: unknown): LocalizedText | null {
  return isObj(v) && typeof v.ar === "string" && typeof v.en === "string" ? { ar: v.ar, en: v.en } : null;
}

function toMeta(v: unknown): ActivityMeta {
  const out: ActivityMeta = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "string" || typeof x === "boolean" || isNum(x)) out[k] = x;
  }
  return out;
}

function toActivity(v: unknown): JourneyActivity | null {
  if (!isObj(v)) return null;
  const title = toText(v.title);
  if (typeof v.id !== "string" || !v.id || !ACTIVITY_TYPES.includes(v.type as ActivityType) || !title) return null;
  if (typeof v.route !== "string" || !v.route.startsWith("/") || !isNum(v.startedAt) || !isNum(v.updatedAt)) return null;
  const progress = isNum(v.progress) ? Math.min(1, Math.max(0, v.progress)) : null;
  return {
    id: v.id,
    type: v.type as ActivityType,
    title,
    route: v.route,
    progress,
    status: v.status === "completed" ? "completed" : "active",
    startedAt: v.startedAt,
    updatedAt: v.updatedAt,
    completedAt: numOrNull(v.completedAt),
    expiresAt: numOrNull(v.expiresAt),
    metadata: toMeta(v.metadata),
  };
}

function toStep(v: unknown): SessionStep | null {
  if (!isObj(v) || !["quran", "dhikr", "names"].includes(v.kind as string) || !isNum(v.minutes)) return null;
  const status = v.status === "done" || v.status === "active" ? v.status : "pending";
  return {
    kind: v.kind as SessionStep["kind"],
    minutes: v.minutes,
    status,
    startedAt: numOrNull(v.startedAt),
    completedAt: numOrNull(v.completedAt),
    data: toMeta(v.data),
  };
}

function toSession(v: unknown): JourneySession | null {
  if (!isObj(v) || typeof v.id !== "string" || !SESSION_LENGTHS.includes(v.minutes as JourneySession["minutes"])) return null;
  if (!Array.isArray(v.steps) || !isNum(v.startedAt) || !isNum(v.updatedAt) || !isNum(v.currentStep)) return null;
  const steps = v.steps.map(toStep);
  if (steps.length === 0 || steps.some((s) => s === null)) return null;
  const status = v.status === "completed" || v.status === "stopped" ? v.status : "active";
  return {
    id: v.id,
    minutes: v.minutes as JourneySession["minutes"],
    steps: steps as SessionStep[],
    currentStep: Math.min(steps.length - 1, Math.max(0, Math.floor(v.currentStep))),
    status,
    startedAt: v.startedAt,
    updatedAt: v.updatedAt,
    completedAt: numOrNull(v.completedAt),
  };
}

export function parseJourney(raw: string | null): JourneyState {
  if (!raw) return emptyState();
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v) || v.version !== 1) return emptyState();
    const cursors: Record<string, number> = {};
    if (isObj(v.cursors)) for (const [k, x] of Object.entries(v.cursors)) if (isNum(x)) cursors[k] = x;
    return {
      version: 1,
      activities: (Array.isArray(v.activities) ? v.activities : []).map(toActivity).filter((a): a is JourneyActivity => a !== null),
      sessions: (Array.isArray(v.sessions) ? v.sessions : []).map(toSession).filter((s): s is JourneySession => s !== null),
      cursors,
    };
  } catch {
    return emptyState();
  }
}

/* ---------------- read / write / observe ---------------- */

let cache: { raw: string | null; state: JourneyState } | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(JOURNEY_KEY);
  } catch {
    return null;
  }
}

/** Current state. The same object is returned until the stored value changes (safe for useSyncExternalStore). */
export function getJourneyState(): JourneyState {
  const raw = readRaw();
  if (!cache || cache.raw !== raw) cache = { raw, state: parseJourney(raw) };
  return cache.state;
}

export function subscribeJourney(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applies `change` to a copy of the state, caps it, persists it once and notifies subscribers. */
export function writeJourney(change: (draft: JourneyState) => void): JourneyState {
  const current = getJourneyState();
  const draft: JourneyState = {
    version: 1,
    activities: current.activities.map((a) => ({ ...a, metadata: { ...a.metadata } })),
    sessions: current.sessions.map((s) => ({ ...s, steps: s.steps.map((st) => ({ ...st, data: { ...st.data } })) })),
    cursors: { ...current.cursors },
  };
  change(draft);
  draft.activities.sort((a, b) => b.updatedAt - a.updatedAt);
  draft.activities = draft.activities.slice(0, MAX_ACTIVITIES);
  draft.sessions.sort((a, b) => b.startedAt - a.startedAt);
  draft.sessions = draft.sessions.slice(0, MAX_SESSIONS);
  const raw = JSON.stringify(draft);
  try {
    localStorage.setItem(JOURNEY_KEY, raw);
    cache = { raw, state: draft };
  } catch {
    // Storage full/unavailable: keep the change for this app run only.
    cache = { raw: readRaw(), state: draft };
  }
  for (const l of [...listeners]) l();
  return draft;
}

/* ---------------- activities ---------------- */

export interface ActivityInput {
  id: string;
  type: ActivityType;
  title: LocalizedText;
  route: string;
  progress?: number | null;
  expiresAt?: number | null;
  metadata?: ActivityMeta;
}

const clamp01 = (p: number | null | undefined) => (typeof p === "number" && Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null);

/** Creates or refreshes an activity (it becomes the most recent one). A completed activity is reopened. */
export function recordActivity(input: ActivityInput, now = Date.now()): JourneyActivity {
  const prev = getJourneyState().activities.find((a) => a.id === input.id);
  const next: JourneyActivity = {
    id: input.id,
    type: input.type,
    title: input.title,
    route: input.route,
    progress: input.progress === undefined ? prev?.progress ?? null : clamp01(input.progress),
    status: "active",
    startedAt: prev?.startedAt ?? now,
    updatedAt: now,
    completedAt: null,
    expiresAt: input.expiresAt === undefined ? prev?.expiresAt ?? null : input.expiresAt,
    metadata: { ...(prev?.metadata ?? {}), ...(input.metadata ?? {}) },
  };
  writeJourney((s) => {
    s.activities = [next, ...s.activities.filter((a) => a.id !== input.id)];
  });
  return next;
}

/** Updates the measured progress of an existing activity; unknown ids are ignored. */
export function updateActivityProgress(id: string, progress: number | null, metadata: ActivityMeta = {}, now = Date.now()): JourneyActivity | null {
  let result: JourneyActivity | null = null;
  writeJourney((s) => {
    const a = s.activities.find((x) => x.id === id);
    if (!a) return;
    a.progress = clamp01(progress);
    a.updatedAt = now;
    a.metadata = { ...a.metadata, ...metadata };
    result = a;
  });
  return result;
}

export function completeActivity(id: string, now = Date.now()): JourneyActivity | null {
  let result: JourneyActivity | null = null;
  writeJourney((s) => {
    const a = s.activities.find((x) => x.id === id);
    if (!a) return;
    a.status = "completed";
    a.progress = a.progress === null ? null : 1;
    a.updatedAt = now;
    a.completedAt = now;
    result = a;
  });
  return result;
}

/** Most recently touched activity (any status), or null. */
export function getLastActivity(state: JourneyState = getJourneyState()): JourneyActivity | null {
  return state.activities.reduce<JourneyActivity | null>((best, a) => (!best || a.updatedAt > best.updatedAt ? a : best), null);
}

/** Most recent activity that is still open and not expired — what «أكمل رحلتي» offers to continue. */
export function getUnfinishedActivity(now = Date.now(), state: JourneyState = getJourneyState()): JourneyActivity | null {
  const open = state.activities.filter((a) => a.status === "active" && (a.expiresAt === null || a.expiresAt > now));
  return getLastActivity({ ...state, activities: open });
}

export interface JourneySummary {
  current: JourneyActivity | null;
  last: JourneyActivity | null;
  lastCompleted: JourneyActivity | null;
  recent: JourneyActivity[];
  completedCount: number;
  sessions: { started: number; completed: number; active: JourneySession | null };
}

export function getJourneySummary(now = Date.now(), state: JourneyState = getJourneyState()): JourneySummary {
  const completed = state.activities.filter((a) => a.status === "completed");
  return {
    current: getUnfinishedActivity(now, state),
    last: getLastActivity(state),
    lastCompleted: completed.reduce<JourneyActivity | null>((b, a) => (!b || (a.completedAt ?? 0) > (b.completedAt ?? 0) ? a : b), null),
    recent: [...state.activities].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    completedCount: completed.length,
    sessions: {
      started: state.sessions.length,
      completed: state.sessions.filter((x) => x.status === "completed").length,
      active: findActiveSession(state, now),
    },
  };
}

/** A session left unfinished for a day is no longer resumed. */
export const SESSION_RESUME_MS = 24 * 60 * 60 * 1000;

export function findActiveSession(state: JourneyState, now = Date.now()): JourneySession | null {
  return state.sessions.find((s) => s.status === "active" && now - s.startedAt < SESSION_RESUME_MS) ?? null;
}
