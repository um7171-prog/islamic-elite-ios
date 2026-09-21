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
import PrayerTimes from "./pages/PrayerTimes.tsx";
import CalendarPage from "./pages/CalendarPage.tsx";
import NotificationsPage from "./pages/NotificationsPage.tsx";
import NotificationSettingsPage from "./pages/NotificationSettingsPage.tsx";
import LocationSettingsPage from "./pages/LocationSettingsPage.tsx";
import PrayerSettingsPage from "./pages/PrayerSettingsPage.tsx";
import CalculatorsPage from "./pages/CalculatorsPage.tsx";
import DateConverterPage from "./pages/DateConverterPage.tsx";
import QuranIndexPage from "./pages/QuranIndexPage.tsx";
import MorePage from "./pages/MorePage.tsx";
import { NotificationRouter } from "./components/notifications/NotificationRouter";
import { NotificationsProvider } from "./components/notifications/NotificationsProvider";
import { NotificationOnboardingCard } from "./components/notifications/NotificationOnboardingCard";
// FileConverterPage is intentionally kept as a static (non-lazy) import —
// the file/document conversion tool must not be touched in any way,
// including how its chunk loads.
import FileConverterPage from "./pages/FileConverterPage.tsx";
import { isIOSNativeApp } from "@/lib/platform";
import { BottomNav } from "@/components/islamic/BottomNav";
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
  "/favorites",
  "/media",
  "/athkar",
  "/qibla",
  "/tasbeeh",
  "/translate",
  "/qr-scanner",
  "/document-scanner",
  "/asma-al-husna",
];


// Full-screen experiences that own the whole viewport (no tab bar).
const HIDE_NAV_PATHS = ["/mushaf", "/admin", "/reset-password"];

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
        {/* Soft fade/rise on every screen change; pointer events are never blocked. */}
        <div key={pathname} className={pathname.startsWith("/mushaf") ? undefined : "page-enter"}>
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
          <Route path="/sitemap" element={<SitemapPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/prayer-times" element={<PrayerTimes />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/notification-settings" element={<NotificationSettingsPage />} />
          <Route path="/location" element={<LocationSettingsPage />} />
          <Route path="/prayer-settings" element={<PrayerSettingsPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />
          <Route path="/date-converter" element={<DateConverterPage />} />
          <Route path="/quran" element={<QuranIndexPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </div>
        </Suspense>
      </main>
      {!HIDE_NAV_PATHS.some((p) => pathname.startsWith(p)) && <BottomNav />}
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
              <NotificationsProvider>
                <BrowserRouter>
                  <NotificationRouter />
                  <NotificationOnboardingCard />
                  <ScrollToTop />

                  <AppShell />
                </BrowserRouter>
              </NotificationsProvider>
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
