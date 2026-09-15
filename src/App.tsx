import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import Index from "./pages/Index.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Settings from "./pages/Settings.tsx";
import NotificationDiagnostics from "./pages/NotificationDiagnostics.tsx";
import { NativeNotificationRouter } from "./components/NativeNotificationRouter";
import { NativeAthanScheduler } from "./components/NativeAthanScheduler";
import { NotificationPermissionPrompt } from "./components/islamic/NotificationPermissionPrompt";
// FileConverterPage is intentionally kept as a static (non-lazy) import —
// the file/document conversion tool must not be touched in any way,
// including how its chunk loads.
import FileConverterPage from "./pages/FileConverterPage.tsx";
import { isIOSNativeApp } from "@/lib/platform";
import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";
import Contact from "./pages/Contact.tsx";
import About from "./pages/About.tsx";
import Cookies from "./pages/Cookies.tsx";
import Disclaimer from "./pages/Disclaimer.tsx";
import Faq from "./pages/Faq.tsx";
import SitemapPage from "./pages/SitemapPage.tsx";
import NotFound from "./pages/NotFound.tsx";

// Heavy, less-frequently-visited routes — code-split so a user who only
// checks prayer times doesn't download/parse the Mushaf, AI/OCR (onnxruntime
// WASM), Admin dashboard, or job-board bundles on first load.
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Mushaf = lazy(() => import("./pages/Mushaf.tsx"));
const AI = lazy(() => import("./pages/AI.tsx"));
const BackgroundRemoverPage = lazy(() => import("./pages/ai/BackgroundRemover.tsx"));
const ImageEnhancerPage = lazy(() => import("./pages/ai/ImageEnhancer.tsx"));
const OcrPage = lazy(() => import("./pages/ai/Ocr.tsx"));
const SaudiJobs = lazy(() => import("./pages/SaudiJobs.tsx"));
const SaudiJobDetails = lazy(() => import("./pages/SaudiJobDetails.tsx"));
const GovernmentJobs = lazy(() => import("./pages/GovernmentJobs.tsx"));

const queryClient = new QueryClient();

/** Minimal, theme-safe placeholder while a lazy route chunk loads. */
function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-foreground/50 text-sm">
      …
    </div>
  );
}

// Tool routes render Index and auto-open the matching dialog based on URL.
const TOOL_PATHS = [
  "/tools",
  "/media",
  "/calendar",
  "/athkar",
  "/qibla",
  "/quran",
  "/tasbeeh",
  "/translate",
  "/weather",
  "/notifications",
  "/qr-scanner",
  "/document-scanner",
];


/** Single app shell: fixed header-less flex column with ONE scroll container. */
const AppShell = () => {
  const { pathname } = useLocation();
  const iosNative = isIOSNativeApp();
  // The Mushaf reader owns its own gestures (pinch zoom / pan).
  const allowPinch = pathname.startsWith("/mushaf");

  return (
    <div className="app-shell">
      <main
        id="app-scroll"
        data-app-scroll-container
        className={`app-scroll${allowPinch ? " allow-pinch" : ""}`}
      >
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Index />} />
          {TOOL_PATHS.filter((p) => !(iosNative && p === "/media")).map((p) => (
            <Route key={p} path={p} element={<Index />} />
          ))}
          {iosNative && <Route path="/media" element={<Navigate to="/tools" replace />} />}
          <Route path="/mushaf" element={<Mushaf />} />
          <Route path="/convert" element={<FileConverterPage />} />
          <Route path="/ai" element={<AI />} />
          <Route path="/ai/background-remover" element={<BackgroundRemoverPage />} />
          <Route path="/ai/image-enhancer" element={<ImageEnhancerPage />} />
          <Route path="/ai/ocr" element={<OcrPage />} />

          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/about" element={<About />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/saudi-jobs" element={<SaudiJobs />} />
          <Route path="/saudi-jobs/:id" element={<SaudiJobDetails />} />
          <Route path="/government-jobs" element={<GovernmentJobs />} />
          <Route path="/sitemap" element={<SitemapPage />} />
          <Route path="/settings" element={<Settings />} />
          {/* Not linked from any user-facing nav — reachable only via the
              collapsed "Advanced Settings" section in Settings, for developer
              use. Kept as its own route instead of deleting the page/logic. */}
          <Route path="/notification-diagnostics" element={<NotificationDiagnostics />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ThemeProvider>
        <LocaleProvider>
          <CityProvider>
            <PrayerCalcProvider>
              <NativeAthanScheduler>
                <BrowserRouter>
                  <NativeNotificationRouter />
                  <NotificationPermissionPrompt />
                  <ScrollToTop />

                  <AppShell />
                </BrowserRouter>
              </NativeAthanScheduler>
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
