import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Build-time verification that a notification sound is really part of the iOS
// App Bundle (file on disk AND listed in Copy Bundle Resources). Anything that
// is not verified here is scheduled with the system default sound instead —
// iOS delivers a *silent* notification when it cannot find the named file.
const CAF_NAMES = [
  "astaghfirullah.caf",
  "athan_makkah.caf",
  "athan_madinah.caf",
  "athan_fajr.caf",
  "athan_ibn_majid.caf",
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __PRE_REMINDER_CAF_BUNDLED__: JSON.stringify(bundledCafs().includes("astaghfirullah.caf")),
    __BUNDLED_CAFS__: JSON.stringify(bundledCafs()),
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD__: JSON.stringify(String(APP_BUILD)),
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
}));
