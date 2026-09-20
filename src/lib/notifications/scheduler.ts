import { isNativeApp } from "@/lib/platform";
import { NOTIFICATION_RANGES, type NotificationGroup } from "./ranges";
import { pluginCancelGroup, pluginPendingGroup, pluginScheduleGroup, type NativeScheduleItem } from "./plugin";
import { checkPermissionStatus } from "./permission";

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
  if (!isNativeApp()) return { scheduled: 0, verifiedIds: [], errors: [], reason: "not-native" };

  const status = await checkPermissionStatus();
  if (status !== "granted") return { scheduled: 0, verifiedIds: [], errors: [], reason: "permission-denied" };

  const range = NOTIFICATION_RANGES[group];
  const now = Date.now();
  const items: NativeScheduleItem[] = itemsIn
    .filter((it) => it.at.getTime() > now + 5000 && Number.isFinite(it.at.getTime()))
    .slice(0, range.cap)
    .map((it) => ({
      id: it.id,
      title: it.title,
      body: it.body,
      atMs: it.at.getTime(),
      sound: it.sound || "default",
      extra: it.extra,
    }));

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
