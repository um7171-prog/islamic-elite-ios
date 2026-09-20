/**
 * New notification system (rebuilt from scratch — see project history).
 *
 * Every notification group owns an exclusive iOS local-notification id range.
 * A group only ever schedules/cancels ids inside its own range, so groups can
 * never step on each other. Values were deliberately chosen well away from
 * the previous system's ranges (10000-19999 / 20000-29999 / 30000-30999) so
 * a device that still has old pending notifications from a prior app version
 * can never collide with anything scheduled by this system.
 *
 * `cap` is the maximum number of items a group may schedule at once. iOS
 * enforces a hard limit of 64 pending local notifications per app across ALL
 * groups combined — the caps below (42 + 6 + 12 + 1 = 61) stay safely under
 * that shared budget.
 */
export const NOTIFICATION_RANGES = {
  /** Prayer-time + pre-prayer-reminder alerts. */
  prayer: { min: 41000, max: 41999, cap: 42 },
  /** Morning/evening Athkar reminders. */
  athkar: { min: 42000, max: 42999, cap: 6 },
  /** Calendar/appointment reminders. */
  calendar: { min: 43000, max: 43999, cap: 12 },
  /** Dedicated range for the manual "send a test notification" button —
   * production reschedules never touch it. */
  test: { min: 49000, max: 49099, cap: 1 },
} as const;

export type NotificationGroup = keyof typeof NOTIFICATION_RANGES;
