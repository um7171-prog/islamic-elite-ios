import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — a plain .mjs build script, imported for its pure function
import { TARGET, patchSource } from "../../scripts/patch-local-notifications-default-sound.mjs";

const UNPATCHED = [
  "        if let sound = notification[\"sound\"] as? String {",
  "            content.sound = UNNotificationSound(named: UNNotificationSoundName(sound))",
  "        }",
].join("\n");

describe("«default» is the iOS system sound (UNNotificationSound.default), never silence", () => {
  it("the patch maps \"default\" to UNNotificationSound.default and keeps bundled file names", () => {
    const out: string = patchSource(`func x() {\n${UNPATCHED}\n}`);
    expect(out).toContain('content.sound = sound == "default" ? UNNotificationSound.default : UNNotificationSound(named: UNNotificationSoundName(sound))');
    expect(out).not.toContain(UNPATCHED);
  });

  it("is applied once (running it again changes nothing) and refuses a plugin it does not recognise", () => {
    const once: string = patchSource(UNPATCHED);
    expect(patchSource(once)).toBe(once);
    expect(() => patchSource("content.sound = somethingElse")).toThrow(/not the expected one/);
  });

  it("the installed plugin (what Xcode compiles) is patched", () => {
    const swift = readFileSync(TARGET, "utf8");
    expect(swift).toContain('sound == "default" ? UNNotificationSound.default');
  });

  it("every install applies it (package.json postinstall — Codemagic runs npm ci)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.postinstall).toBe("node scripts/patch-local-notifications-default-sound.mjs");
    expect(readFileSync("codemagic.yaml", "utf8")).toMatch(/npm ci/);
  });
});
