import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { installAthanAudioBridge } from "./lib/swAudioBridge";
import { isIOSNativeApp } from "./lib/platform";

installAthanAudioBridge();

// Boot-time platform log — searchable in Xcode/Console.app as "[app:boot]".
// This is the very first thing that runs, before React mounts, so if this
// line is missing from a real-device log the JS bundle itself never
// executed (a native/bundling problem), not a React-level bug.
try {
  const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  console.info(
    "[app:boot]",
    "commit=" + (typeof __GIT_COMMIT__ !== "undefined" ? __GIT_COMMIT__ : "unknown"),
    "capacitorGlobal=" + (cap ? "present" : "MISSING"),
    "isNativePlatform=" + (cap?.isNativePlatform?.() ?? "n/a"),
    "platform=" + (cap?.getPlatform?.() ?? "n/a"),
    "isIOSNativeApp=" + isIOSNativeApp(),
  );
} catch (e) {
  console.info("[app:boot] platform detection threw", e);
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
