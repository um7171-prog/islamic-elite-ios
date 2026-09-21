/**
 * A faithful in-memory stand-in for iOS's notification centre, exposed through the SAME
 * `@capacitor/local-notifications` API the app uses. It behaves like the real thing where it
 * matters for the app's logic:
 *  - permission is a real state ("prompt" -> the user answers once -> "granted"/"denied")
 *  - schedule() with an existing id REPLACES it; a time in the past is rejected
 *  - cancel() removes; getPending() lists what is actually held
 *  - an optional cap of 64 pending (iOS's limit) and a "refuse these ids" switch to prove that
 *    the app verifies by reading back instead of trusting schedule()
 *
 * It is a test double: it proves the app's request/replace/cancel logic, NOT that a real iPhone
 * delivers a notification. That needs the physical-device test plan.
 */
export interface FakeNotification {
  id: number;
  title: string;
  body: string;
  at: Date;
  sound?: string;
  extra?: Record<string, unknown>;
}

type Display = "granted" | "denied" | "prompt";

export const center = {
  permission: "granted" as Display,
  /** what the user answers when iOS asks */
  promptAnswer: "granted" as "granted" | "denied",
  pending: new Map<number, FakeNotification>(),
  calls: [] as { op: "schedule" | "cancel" | "requestPermissions" | "getPending" | "checkPermissions"; ids?: number[] }[],
  refuseIds: new Set<number>(),
  failSchedule: false,
  failPermissionRead: false,
  limit: 64,
};

export function resetCenter() {
  center.permission = "granted";
  center.promptAnswer = "granted";
  center.pending.clear();
  center.calls.length = 0;
  center.refuseIds.clear();
  center.failSchedule = false;
  center.failPermissionRead = false;
}

export const pendingIn = (min: number, max: number): FakeNotification[] =>
  [...center.pending.values()].filter((n) => n.id >= min && n.id <= max).sort((a, b) => a.id - b.id);

export const fakeLocalNotifications = {
  checkPermissions: async () => {
    center.calls.push({ op: "checkPermissions" });
    if (center.failPermissionRead) throw new Error("plugin unavailable");
    return { display: center.permission };
  },
  requestPermissions: async () => {
    center.calls.push({ op: "requestPermissions" });
    if (center.permission === "prompt") center.permission = center.promptAnswer; // iOS asks only this once
    return { display: center.permission };
  },
  getPending: async () => {
    center.calls.push({ op: "getPending" });
    return { notifications: [...center.pending.values()].map((n) => ({ id: n.id, title: n.title, body: n.body })) };
  },
  schedule: async (opts: { notifications: { id: number; title: string; body: string; schedule?: { at?: Date }; sound?: string; extra?: Record<string, unknown> }[] }) => {
    center.calls.push({ op: "schedule", ids: opts.notifications.map((n) => n.id) });
    if (center.failSchedule) throw new Error("schedule failed");
    for (const n of opts.notifications) {
      const at = n.schedule?.at;
      if (!at || at.getTime() <= Date.now()) throw new Error(`notification ${n.id} is not in the future`);
      if (center.refuseIds.has(n.id)) continue;
      if (!center.pending.has(n.id) && center.pending.size >= center.limit) continue;
      center.pending.set(n.id, { id: n.id, title: n.title, body: n.body, at, sound: n.sound, extra: n.extra });
    }
    return { notifications: opts.notifications.map((n) => ({ id: n.id })) };
  },
  cancel: async (opts: { notifications: { id: number }[] }) => {
    center.calls.push({ op: "cancel", ids: opts.notifications.map((n) => n.id) });
    for (const n of opts.notifications) center.pending.delete(n.id);
  },
  addListener: async () => ({ remove: async () => undefined }),
};
