import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// Same build-time bundled-sound check (and the same file list) vite.config.ts does for the real build, so notification
// sound tests exercise the REAL "is this .caf actually in the iOS bundle" logic instead of always
// falling back to "default" (which would make every sound-name assertion trivially true).
function bundledCafs(): string[] {
  const CAF_NAMES = ["pre_athan_alert_v2.caf", "astaghfirullah_night_v2.caf", "astaghfirullah.caf", "athan_makkah_v2.caf", "athan_madinah_v2.caf", "athan_fajr_v2.caf", "athan_ibn_majid_v2.caf", "notif_bell_v2.caf", "notif_chime_v2.caf", "notif_alert_v2.caf", "notif_calm_v2.caf"];
  try {
    const pbx = fs.readFileSync(path.resolve(__dirname, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    return CAF_NAMES.filter((name) => fs.existsSync(path.resolve(__dirname, "ios/App/App", name)) && pbx.includes(`${name} in Resources`));
  } catch {
    return [];
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUNDLED_CAFS__: JSON.stringify(bundledCafs()),
    __PRE_REMINDER_CAF_BUNDLED__: JSON.stringify(bundledCafs().includes("pre_athan_alert_v2.caf")),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
