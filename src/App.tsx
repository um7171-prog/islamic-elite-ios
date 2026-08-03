import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";
import Index from "./pages/Index.tsx";
import Admin from "./pages/Admin.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Settings from "./pages/Settings.tsx";
import Mushaf from "./pages/Mushaf.tsx";
import AI from "./pages/AI.tsx";
import TikTokAnalyzer from "./pages/TikTok.tsx";
import BackgroundRemoverPage from "./pages/ai/BackgroundRemover.tsx";
import ImageEnhancerPage from "./pages/ai/ImageEnhancer.tsx";
import OcrPage from "./pages/ai/Ocr.tsx";
import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";
import Contact from "./pages/Contact.tsx";
import About from "./pages/About.tsx";
import Cookies from "./pages/Cookies.tsx";
import Disclaimer from "./pages/Disclaimer.tsx";
import Faq from "./pages/Faq.tsx";
import SitemapPage from "./pages/SitemapPage.tsx";

import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

// Tool routes render Index and auto-open the matching dialog based on URL.
const TOOL_PATHS = [
  "/tools",
  "/media",
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ThemeProvider>
        <LocaleProvider>
          <CityProvider>
            <PrayerCalcProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  {TOOL_PATHS.map((p) => (
                    <Route key={p} path={p} element={<Index />} />
                  ))}
                  <Route path="/mushaf" element={<Mushaf />} />
                  <Route path="/tiktok" element={<TikTokAnalyzer />} />
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
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </PrayerCalcProvider>
          </CityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
