import { isNativeApp } from "@/lib/platform";
import { NOTIFICATION_RANGES } from "./ranges";
import { checkPermissionStatus } from "./permission";
import { pluginScheduleGroup } from "./plugin";

export type TestNotificationResult =
  | { ok: true; scheduledFor: Date }
  | { ok: false; reason: "not-native" | "permission-denied" | "rejected"; detail?: string };

/**
 * Schedules ONE real notification a few seconds out, in the dedicated test
 * range (never the same range as real prayer/athkar/calendar alerts, so this
 * can never leave a stray production notification behind). Returns only
 * after the OS has actually accepted it — never a fabricated success.
 */
export async function sendTestNotification(lang: "ar" | "en", secondsFromNow = 10): Promise<TestNotificationResult> {
  if (!isNativeApp()) return { ok: false, reason: "not-native" };

  const status = await checkPermissionStatus();
  if (status !== "granted") return { ok: false, reason: "permission-denied" };

  const range = NOTIFICATION_RANGES.test;
  const at = new Date(Date.now() + secondsFromNow * 1000);
  const result = await pluginScheduleGroup(range.min, range.max, [
    {
      id: range.min,
      title: lang === "ar" ? "إشعار تجريبي" : "Test notification",
      body: lang === "ar"
        ? "وصل هذا الإشعار فعليًا — نظام الإشعارات يعمل."
        : "This notification actually arrived — notifications are working.",
      atMs: at.getTime(),
      sound: "default",
      extra: { route: "/settings" },
    },
  ]);

  if (result.verifiedIds.includes(range.min)) return { ok: true, scheduledFor: at };
  return { ok: false, reason: "rejected", detail: result.errors.join(" · ") || undefined };
}
