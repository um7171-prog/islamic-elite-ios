import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { ATHAN_SOUNDS, REMINDER_SOUNDS } from "@/lib/notifications/NotificationSounds";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const srcFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("src/test/"));

describe("ONE notification architecture (the old system is gone)", () => {
  it("the old implementation files no longer exist", () => {
    for (const f of ["permission", "plugin", "scheduler", "coordinator", "ranges", "dryRun", "prayerSchedule", "settings", "sounds", "test"]) {
      expect(existsSync(`src/lib/notifications/${f}.ts`), f).toBe(false);
    }
    expect(existsSync("ios/App/App/NativeNotificationPlugin.swift")).toBe(false);
    expect(read("ios/App/App.xcodeproj/project.pbxproj")).not.toMatch(/NativeNotificationPlugin/);
    expect(read("ios/App/App/MainViewController.swift")).not.toMatch(/NativeNotification/);
  });

  it("nothing in src refers to the old modules or the old native plugin", () => {
    const bad = /@\/lib\/notifications\/(permission|plugin|scheduler|coordinator|ranges|dryRun|prayerSchedule|settings|sounds|test)"|registerPlugin\("NativeNotification"|pluginScheduleGroup|checkPermissionStatus|syncEventNotifications|schedulePrayerNotifications|scheduleGroup\(/;
    for (const f of srcFiles) expect(read(f), f).not.toMatch(bad);
  });

  it("the five services exist with their single responsibility", () => {
    for (const f of ["NotificationPermissionService", "NotificationScheduler", "PrayerNotificationService", "AppointmentNotificationService", "NotificationSettings"]) {
      expect(existsSync(`src/lib/notifications/${f}.ts`), f).toBe(true);
    }
  });

  it("only the NotificationScheduler schedules or cancels; only the permission service asks iOS for permission", () => {
    for (const f of srcFiles) {
      const text = read(f);
      if (f !== "src/lib/notifications/NotificationScheduler.ts") expect(text, f).not.toMatch(/LocalNotifications\.(schedule|cancel|getPending)\(/);
      if (f !== "src/lib/notifications/NotificationPermissionService.ts") expect(text, f).not.toMatch(/LocalNotifications\.(requestPermissions|checkPermissions)\(/);
    }
  });

  it("delivery never depends on the web: no JS timers or browser Notification API in the scheduling code", () => {
    for (const f of ["NotificationScheduler", "PrayerNotificationService", "AppointmentNotificationService", "NotificationPermissionService"]) {
      const text = read(`src/lib/notifications/${f}.ts`);
      expect(text, f).not.toMatch(/setTimeout\(|setInterval\(|new Notification\(|Notification\.requestPermission/);
    }
  });

  it("screens and pages do not build notification logic: they only ask the scheduler for a rebuild", () => {
    for (const f of srcFiles.filter((x) => x.startsWith("src/pages/") || x.startsWith("src/components/islamic/"))) {
      expect(read(f), f).not.toMatch(/replaceGroup\(|prepareItems\(|buildPrayerItems\(|buildAppointmentItems\(/);
    }
  });

  it("appointments and Athkar go through the same scheduler as prayers", () => {
    expect(read("src/lib/notifications/AppointmentNotificationService.ts")).toMatch(/replaceGroup\("calendar"/);
    expect(read("src/lib/notifications/PrayerNotificationService.ts")).toMatch(/replaceGroup\("prayer"/);
    expect(read("src/lib/athkarReminders.ts")).toMatch(/replaceGroup\("athkar"/);
  });

  it("the notification centre (inbox) is display-only: it cannot schedule anything", () => {
    for (const f of ["src/lib/notificationInbox.ts", "src/lib/notificationCenter.ts", "src/pages/NotificationsPage.tsx"]) {
      expect(read(f), f).not.toMatch(/NotificationScheduler|LocalNotifications|replaceGroup/);
    }
  });

  it("no user-facing test/diagnostic notification UI", () => {
    for (const f of srcFiles) expect(read(f), f).not.toMatch(/sendTestNotification|NotificationTestGroup/);
  });
});

describe("iOS sound files (Phase 10 evidence available without a device)", () => {
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
  const files = [...ATHAN_SOUNDS.map((s) => s.nativeFile), ...REMINDER_SOUNDS.map((s) => s.nativeFile)].filter(Boolean) as string[];

  it("every sound the app can schedule exists in the app folder and is bundled as a resource", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      expect(existsSync(`ios/App/App/${f}`), f).toBe(true);
      expect(pbx, f).toMatch(new RegExp(`${f.replace(".", "\\.")} in Resources`));
    }
  });

  it("they are .caf files under iOS's 30-second notification-sound limit (long adhan files are < 3 MB)", () => {
    for (const f of files) {
      expect(f.endsWith(".caf")).toBe(true);
      const size = readFileSync(`ios/App/App/${f}`).length;
      expect(size, f).toBeLessThan(3 * 1024 * 1024);
    }
  });
});

describe("iOS notification configuration", () => {
  it("remote-push entitlement + background mode stay for admin announcements only", () => {
    expect(read("ios/App/App/App.entitlements")).toMatch(/aps-environment/);
    expect(read("ios/App/App/Info.plist")).toMatch(/remote-notification/);
    // the announcements push is a separate feature and never schedules prayer/appointment alerts
    expect(read("src/lib/pushDevice.ts")).toMatch(/admin announcements/i);
    expect(read("src/lib/pushDevice.ts")).not.toMatch(/replaceGroup|LocalNotifications/);
  });

  it("foreground presentation is configured so an alert shows while the app is open", () => {
    expect(read("capacitor.config.ts")).toMatch(/presentationOptions:\s*\[[^\]]*banner/);
  });
});
