import { isNativeApp } from "@/lib/platform";
import { NOTIFICATION_RANGES, type NotificationGroup } from "./ranges";
import { pluginCancelGroup, pluginPendingGroup, pluginScheduleGroup, type NativeScheduleItem } from "./plugin";
import { checkPermissionStatus } from "./permission";
import { isDryRun, logDryRun } from "./dryRun";

export interface ScheduleItemInput {
  id: number;
  title: string;
  body: string;
  at: Date;
  sound: string;
  extra?: Record<string, unknown>;
}

export interface ScheduleGroupResult {
  scheduled: number;
  verifiedIds: number[];
  errors: string[];
  reason?: "not-native" | "permission-denied" | "empty";
}

/**
 * Rebuilds every notification in one group (prayer / athkar / calendar).
 * Always clears stale ids in the group's range first (handled natively by
 * NativeNotificationPlugin.scheduleGroup, which only removes requests whose
 * id is NOT in the new item list), then schedules the new list, then reads
 * back what iOS actually accepted — nothing is ever reported as scheduled
 * unless it comes back from `pendingGroup`.
 */
export async function scheduleGroup(group: NotificationGroup, itemsIn: ScheduleItemInput[]): Promise<ScheduleGroupResult> {
  const range = NOTIFICATION_RANGES[group];
  const now = Date.now();
  const build = (): NativeScheduleItem[] =>
    itemsIn
      .filter((it) => it.at.getTime() > now + 5000 && Number.isFinite(it.at.getTime()))
      // Soonest first, so when a group has more items than its cap (many
      // calendar events) it is the nearest ones that get scheduled.
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, range.cap)
      .map((it) => ({
        id: it.id,
        title: it.title,
        body: it.body,
        atMs: it.at.getTime(),
        sound: it.sound || "default",
        extra: it.extra,
      }));

  if (!isNativeApp()) {
    // Browser: nothing can be scheduled. In dry-run mode only, record the request
    // that WOULD be sent so tests can verify it (never reported as delivered).
    if (isDryRun()) logDryRun({ group, minId: range.min, maxId: range.max, items: build().map((i) => ({ id: i.id, atMs: i.atMs, title: i.title, body: i.body })) });
    return { scheduled: 0, verifiedIds: [], errors: [], reason: "not-native" };
  }

  const status = await checkPermissionStatus();
  if (status !== "granted") return { scheduled: 0, verifiedIds: [], errors: [], reason: "permission-denied" };

  const items = build();

  if (items.length === 0) {
    // An intentional empty rebuild (e.g. every prayer switch turned off) still
    // clears this group's stale ids via the same native call.
    const result = await pluginScheduleGroup(range.min, range.max, []);
    return { scheduled: 0, verifiedIds: result.verifiedIds, errors: result.errors, reason: "empty" };
  }

  const result = await pluginScheduleGroup(range.min, range.max, items);
  return { scheduled: result.verifiedIds.length, verifiedIds: result.verifiedIds, errors: result.errors };
}

export async function pendingInGroup(group: NotificationGroup): Promise<number[]> {
  if (!isNativeApp()) return [];
  const range = NOTIFICATION_RANGES[group];
  return pluginPendingGroup(range.min, range.max);
}

export async function cancelGroup(group: NotificationGroup): Promise<void> {
  if (!isNativeApp()) return;
  const range = NOTIFICATION_RANGES[group];
  await pluginCancelGroup(range.min, range.max);
}
