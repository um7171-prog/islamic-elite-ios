/**
 * User Journey — the data model shared by «يومك في النخبة», «جلسة الآن», «أكمل رحلتي» and «رحلتي».
 * Everything stays on the device (localStorage); nothing is sent anywhere.
 */

/** Kinds of useful activity. Add new kinds here (e.g. "dua", "reading", "travel") — no migration needed. */
export type ActivityType = "quran" | "dhikr" | "session" | "names" | "dua" | "reading";

export type ActivityStatus = "active" | "completed";

export interface LocalizedText {
  ar: string;
  en: string;
}

export type ActivityMeta = Record<string, string | number | boolean>;

export interface JourneyActivity {
  /** Stable id per activity, e.g. "quran:mushaf", "athkar:morning:2026-09-27", "session:<id>". */
  id: string;
  type: ActivityType;
  title: LocalizedText;
  /** In-app route that continues this activity. */
  route: string;
  /** 0..1 when the activity has a real, measurable progress; null otherwise. */
  progress: number | null;
  status: ActivityStatus;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  /** After this moment an unfinished activity is no longer offered to be continued. */
  expiresAt: number | null;
  metadata: ActivityMeta;
}

/* ---------------- sessions («جلسة الآن») ---------------- */

export const SESSION_LENGTHS = [5, 10, 20, 30] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

/** Session parts are built ONLY from content the app already has. */
export type SessionStepKind = "quran" | "dhikr" | "names";

export type SessionStepStatus = "pending" | "active" | "done";

export interface SessionStep {
  kind: SessionStepKind;
  /** Suggested share of the session's time (organisation only — never a religious amount). */
  minutes: number;
  status: SessionStepStatus;
  startedAt: number | null;
  completedAt: number | null;
  /** quran: startPage/endPage · dhikr: list · names: from/to (0-based, end exclusive). */
  data: ActivityMeta;
}

export type SessionStatus = "active" | "completed" | "stopped";

export interface JourneySession {
  id: string;
  minutes: SessionLength;
  steps: SessionStep[];
  currentStep: number;
  status: SessionStatus;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface JourneyState {
  version: 1;
  activities: JourneyActivity[];
  sessions: JourneySession[];
  /** Where a sequential reading continues next time (e.g. names: next index into the 99 Names). */
  cursors: Record<string, number>;
}
