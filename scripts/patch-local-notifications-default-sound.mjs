#!/usr/bin/env node
/**
 * @capacitor/local-notifications (iOS) turns `sound: "default"` into UNNotificationSound(named:
 * "default") — a file that does not exist — and schedules NO sound at all when the field is left
 * out ("If not provided, it will produce ... no sound on iOS"). The app's «default» means the
 * system notification sound, so this patch makes the plugin use UNNotificationSound.default for
 * it. Every other value is still a bundled file name.
 *
 * Runs on every install (package.json "postinstall"), so Codemagic's `npm ci` builds the patched
 * plugin. It only touches the one line it expects, is a no-op when already applied, and fails
 * loudly if the plugin's code changes (a new version must be checked by hand, not patched blindly).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const TARGET = "node_modules/@capacitor/local-notifications/ios/Sources/LocalNotificationsPlugin/LocalNotificationsPlugin.swift";

const ORIGINAL = [
  '        if let sound = notification["sound"] as? String {',
  "            content.sound = UNNotificationSound(named: UNNotificationSoundName(sound))",
  "        }",
].join("\n");

const PATCHED = [
  '        if let sound = notification["sound"] as? String {',
  "            // Islamic Elite (scripts/patch-local-notifications-default-sound.mjs): \"default\" is the",
  "            // system notification sound itself, not a bundled file called \"default\".",
  '            content.sound = sound == "default" ? UNNotificationSound.default : UNNotificationSound(named: UNNotificationSoundName(sound))',
  "        }",
].join("\n");

/** The plugin source with the patch applied (unchanged if it already is). */
export function patchSource(source) {
  const src = source.replace(/\r\n/g, "\n");
  if (src.includes(PATCHED)) return src;
  if (!src.includes(ORIGINAL)) {
    throw new Error(`${TARGET}: the sound line is not the expected one — check the plugin version before patching`);
  }
  return src.replace(ORIGINAL, PATCHED);
}

export function applyPatch(root = process.cwd()) {
  const file = path.join(root, TARGET);
  if (!existsSync(file)) {
    console.warn(`[patch-local-notifications] ${TARGET} not found — nothing to patch`);
    return "missing";
  }
  const before = readFileSync(file, "utf8");
  const after = patchSource(before);
  if (after === before.replace(/\r\n/g, "\n") && before.includes(PATCHED)) return "already";
  writeFileSync(file, after);
  console.log("[patch-local-notifications] «default» → UNNotificationSound.default");
  return "patched";
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  applyPatch(root);
}
