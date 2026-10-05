import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";
import { supabaseEnvProblems } from "./src/lib/supabaseEnv";

// Build-time verification that a notification sound is really part of the iOS
// App Bundle (file on disk AND listed in Copy Bundle Resources). Anything that
// is not verified here is scheduled with the system default sound instead —
// iOS delivers a *silent* notification when it cannot find the named file.
const CAF_NAMES = [
  "pre_athan_alert_v2.caf",
  "astaghfirullah_night_v2.caf",
  "astaghfirullah.caf",
  "athan_makkah_v2.caf",
  "athan_madinah_v2.caf",
  "athan_fajr_v2.caf",
  "athan_ibn_majid_v2.caf",
  // Calendar-event and Athkar reminder sounds (src/lib/reminderSounds.ts) —
  // previously not verified here, so a renamed/removed file would have
  // silently fallen back to no sound with no build-time warning.
  "notif_bell_v2.caf",
  "notif_chime_v2.caf",
  "notif_alert_v2.caf",
  "notif_calm_v2.caf",
];

function bundledCafs(): string[] {
  try {
    const pbx = fs.readFileSync(path.resolve(__dirname, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    return CAF_NAMES.filter(
      (name) =>
        fs.existsSync(path.resolve(__dirname, "ios/App/App", name)) &&
        pbx.includes(`${name} in Resources`),
    );
  } catch {
    return [];
  }
}

const BUILD_STAMP = new Date().toISOString();

// Marketing version is owned by the iOS project (MARKETING_VERSION) and mirrored
// here for the web build. The build number comes from CI ($BUILD_NUMBER).
const APP_VERSION = "1.0.0";
const APP_BUILD = process.env.BUILD_NUMBER || process.env.CM_BUILD_ID || "0";

// Exact commit + branch baked into this build, so an installed IPA's actual
// source can always be verified (Settings -> Advanced) instead of guessing
// whether a real device is running a stale build from before the latest push.
function gitInfo(): { commit: string; branch: string } {
  try {
    const commit = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: __dirname }).toString().trim();
    return { commit, branch };
  } catch {
    return { commit: "unknown", branch: "unknown" };
  }
}
const GIT_INFO = gitInfo();

// A malformed Supabase value (e.g. quotes pasted into a CI variable) builds "successfully" but the
// app then dies while loading — a black screen on iOS. Refuse to build it instead (names only in
// the message, never values). Missing values are allowed: the app runs without them.
function assertBuildEnv(mode: string) {
  const problems = supabaseEnvProblems(loadEnv(mode, process.cwd(), "VITE_"));
  if (problems.length) throw new Error(`Invalid build environment:\n  - ${problems.join("\n  - ")}`);
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  if (command === "build") assertBuildEnv(mode);
  return {
  define: {
    __PRE_REMINDER_CAF_BUNDLED__: JSON.stringify(bundledCafs().includes("pre_athan_alert_v2.caf")),
    __BUNDLED_CAFS__: JSON.stringify(bundledCafs()),
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD__: JSON.stringify(String(APP_BUILD)),
    __GIT_COMMIT__: JSON.stringify(GIT_INFO.commit),
    __GIT_BRANCH__: JSON.stringify(GIT_INFO.branch),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
