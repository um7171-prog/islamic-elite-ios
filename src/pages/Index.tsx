import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { useLocation, useNavigate } from "react-router-dom";
import { HeroPrayerCard } from "@/components/islamic/HeroPrayerCard";
import { PrayerStrip } from "@/components/islamic/PrayerStrip";
import { QuickServices } from "@/components/islamic/QuickServices";
import { DateHeader } from "@/components/islamic/DateHeader";
import { EliteTools } from "@/components/islamic/EliteTools";
import { LanguageToggle } from "@/components/islamic/LanguageToggle";
import { NextAthanBanner } from "@/components/islamic/NextAthanBanner";
import { AnnouncementsBell } from "@/components/islamic/AnnouncementsBell";
import { InstallPrompt } from "@/components/islamic/InstallPrompt";
import { AppointmentsPanel } from "@/components/islamic/AppointmentsPanel";
import { BottomNav, type TabKey } from "@/components/islamic/BottomNav";
import { DownloadManager } from "@/components/islamic/DownloadManager";
import { FileConverter } from "@/components/islamic/EliteTools";
import { SEO } from "@/components/SEO";
import { ServicesHub } from "@/components/services/ServicesHub";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SideMenu } from "@/components/site/SideMenu";


import { Moon, Sun, Monitor, Settings as SettingsIcon } from "lucide-react";
import { getPrayerTimes } from "@/lib/prayer";
import { loadAthanSettings, type AthanSettings } from "@/lib/athanSettings";
import { useAthanScheduler } from "@/hooks/useAthanScheduler";
import { trackVisit } from "@/lib/analytics";

// Map URL path → (tab, tool dialog key). Each tool has its own SEO-friendly URL.
const PATH_MAP: Record<string, { tab: TabKey; tool: string | null; title: string; description: string }> = {
  "/":                 { tab: "home",  tool: null,        title: "النخبة الإسلامية - تنزيل الفيديوهات والوسائط الذكي | تحميل من TikTok وYouTube وInstagram", description: "النخبة الإسلامية منصة ذكية لتحميل الفيديوهات من TikTok وYouTube وInstagram وFacebook وX بدون علامة مائية، مع تحويل الملفات، QR Code، الترجمة، القبلة، مواقيت الصلاة، الطقس، والتقويم الهجري." },
  "/tools":            { tab: "tools", tool: null,        title: "أدواتي الإسلامية — القرآن، الأذكار، القبلة",          description: "مجموعة أدوات متكاملة: القرآن الكريم، الأذكار، القبلة، التسبيح، الترجمة، والطقس." },
  "/media":            { tab: "media", tool: null,        title: "الوسائط — تحميل ومحول الملفات",                       description: "تحميل ذكي من يوتيوب وتيك توك، محول الملفات، وإدارة الوسائط." },
  "/athkar":           { tab: "tools", tool: "athkar",    title: "الأذكار — أذكار الصباح والمساء",                       description: "أذكار الصباح والمساء وأذكار النوم من الكتاب والسنة." },
  "/qibla":            { tab: "tools", tool: "qibla",     title: "اتجاه القبلة — بوصلة القبلة",                          description: "حدد اتجاه القبلة بدقة من أي مكان في العالم باستخدام البوصلة." },
  "/quran":            { tab: "tools", tool: "quran",     title: "القرآن الكريم — قراءة واستماع",                        description: "المصحف الشريف بالرسم العثماني مع تلاوات لأشهر القراء." },
  "/tasbeeh":          { tab: "tools", tool: "tasbeeh",   title: "السبحة الرقمية — التسبيح والذكر",                      description: "سبحة رقمية للتسبيح والذكر مع عداد وحفظ للتقدم." },
  "/translate":        { tab: "tools", tool: "translate", title: "الترجمة — مترجم ذكي",                                  description: "ترجمة فورية بين العربية والإنجليزية ولغات أخرى." },
  "/weather":          { tab: "tools", tool: "weather",   title: "الطقس والرادار — مواعيد الصلاة",                        description: "حالة الطقس المباشرة، رادار الأمطار، والسحب ودرجات الحرارة." },
  "/notifications":    { tab: "tools", tool: "alerts",    title: "إعدادات الإشعارات والأذان",                            description: "تحكم في تنبيهات الأذان لكل صلاة وإعدادات الإشعارات." },
  "/qr-scanner":       { tab: "tools", tool: "scanner",   title: "ماسح رموز QR — قارئ الباركود",                         description: "ماسح ضوئي سريع لرموز QR والباركود مع فتح الروابط داخل التطبيق." },
  "/document-scanner": { tab: "tools", tool: "docscan",   title: "ماسح المستندات — PDF احترافي",                         description: "امسح المستندات ضوئياً مع كشف الحواف التلقائي والتحويل إلى PDF عالي الجودة." },
};

function Dashboard() {
  const { t, dir, lang } = useLocale();
  const { city } = useCity();
  const { madhab } = usePrayerCalc();
  const { theme, mode, setMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const routeInfo = PATH_MAP[location.pathname] ?? PATH_MAP["/"];
  const [tab, setTab] = useState<TabKey>(routeInfo.tab);
  const [initialTool, setInitialTool] = useState<string | null>(routeInfo.tool);

  useEffect(() => {
    const info = PATH_MAP[location.pathname] ?? PATH_MAP["/"];
    setTab(info.tab);
    setInitialTool(info.tool);
  }, [location.pathname]);

  const cycleMode = () => {
    const next: ThemeMode = mode === "system" ? "light" : mode === "light" ? "night" : "system";
    setMode(next);
  };
  const modeLabel =
    mode === "system"
      ? t("System", "تلقائي")
      : mode === "night"
      ? t("Night", "ليلي")
      : t("Day", "نهاري");
  const [today] = useState(() => new Date());

  useEffect(() => { trackVisit(lang); }, [lang]);
  const { entries, sunnah } = useMemo(
    () => getPrayerTimes(today, city.lat, city.lng, madhab),
    [today.toDateString(), city.id, madhab],
  );
  const [athanSettings, setAthanSettings] = useState<AthanSettings>(() => loadAthanSettings());
  const { scheduledCount } = useAthanScheduler(entries, athanSettings, lang, sunnah);

  const handleTabChange = (next: TabKey) => {
    if (next === "tiktok") {
      navigate("/tiktok");
      return;
    }
    setTab(next);
    // Sync URL so the tab has its own SEO-friendly canonical.
    const pathForTab = next === "home" ? "/" : `/${next}`;
    if (location.pathname !== pathForTab) navigate(pathForTab);
  };


  const jsonLd = useMemo(() => {
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://www.techsnds.com/" },
        ...(location.pathname !== "/"
          ? [{ "@type": "ListItem", position: 2, name: routeInfo.title, item: `https://www.techsnds.com${location.pathname}` }]
          : []),
      ],
    };
    return breadcrumb;
  }, [location.pathname, routeInfo.title]);

  return (
    <div
      dir={dir}
      className="min-h-screen w-full px-4 md:px-8 max-w-6xl mx-auto"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
      }}
    >
      <SEO
        title={routeInfo.title}
        description={routeInfo.description}
        path={location.pathname}
        lang={lang === "ar" ? "ar" : "en"}
        jsonLd={jsonLd}
      />
      <header className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl grid place-items-center font-arabic text-xl text-accent-foreground"
               style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}>
          </div>
          <span className="font-display text-sm font-bold leading-none">
            {t("Elite Islamic", "النخبة الإسلامية")}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <SideMenu />
          <button
            onClick={cycleMode}
            className="h-8 px-2 gap-1.5 rounded-lg glass flex items-center justify-center transition hover:scale-105"
            aria-label={t("Theme: ", "الوضع: ") + modeLabel}
            title={modeLabel}
          >
            {mode === "system" ? (
              <Monitor className="h-4 w-4 text-foreground/80" />
            ) : theme === "night" ? (
              <Moon className="h-4 w-4 text-slate-300" />
            ) : (
              <Sun className="h-4 w-4 text-yellow-500" />
            )}
            <span className="text-[10px] font-semibold text-foreground/80 leading-none">{modeLabel}</span>
          </button>

          <button
            onClick={() => navigate("/settings")}
            aria-label={t("Settings", "الإعدادات")}
            title={t("Settings", "الإعدادات")}
            className="h-8 w-8 rounded-lg glass grid place-items-center transition hover:scale-105"
          >
            <SettingsIcon className="h-4 w-4 text-accent" />
          </button>

          <AnnouncementsBell />
          <LanguageToggle />
        </div>
      </header>

      {tab === "home" && (
        <>
          <section className="mb-3 mt-1 text-center">
            <h1 className="font-display text-lg md:text-2xl font-bold leading-tight text-foreground">
              {t(
                "Elite Islamic — Best Platform for Downloading Videos, Media & Smart Tools",
                "النخبة الإسلامية - أفضل منصة لتحميل الفيديوهات والوسائط والأدوات الذكية",
              )}
            </h1>
            <p className="mt-2 text-[12px] md:text-sm text-foreground/70 leading-relaxed max-w-2xl mx-auto">
              {t(
                "Use free and fast tools to download videos from TikTok, YouTube, Instagram, Facebook, and X, convert files, generate QR Codes, translate, find the Qibla, prayer times, weather, and the Hijri calendar — all in one place.",
                "استخدم أدوات مجانية وسريعة لتحميل الفيديوهات من TikTok وYouTube وInstagram وFacebook وX، وتحويل الملفات، وإنشاء QR Code، والترجمة، ومعرفة القبلة، ومواقيت الصلاة، والطقس، والتقويم الهجري، كل ذلك في مكان واحد وبسهولة.",
              )}
            </p>
          </section>
          <div className="mb-2">
            <DateHeader />
          </div>

          <NextAthanBanner entries={entries} active={athanSettings.enabled} />

          <section className="mb-3 space-y-2">
            <HeroPrayerCard />
            <PrayerStrip />
          </section>

          <section className="mb-6">
            <AppointmentsPanel />
          </section>
        </>
      )}

      {tab === "tools" && (
        <>
          <section className="mb-4 mt-2">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60 mb-3 px-1">
              {t("My Tools", "أدواتي")}
            </h2>
            <QuickServices
              athanSettings={athanSettings}
              onAthanChange={setAthanSettings}
              scheduledCount={scheduledCount}
              initialOpen={initialTool}
            />
          </section>

          <section className="mb-6">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60 mb-3 px-1">
              {t("Daily Services Center", "مركز الخدمات اليومية")}
            </h2>
            <ServicesHub />
          </section>

          <section className="mb-6">
            <EliteTools />
          </section>


          {/* Internal linking (SEO): every tool discoverable via its own crawlable URL. */}
          <nav aria-label={t("All tools", "كل الأدوات")} className="mb-6">
            <h2 className="sr-only">{t("All tools", "كل الأدوات")}</h2>
            <ul className="flex flex-wrap gap-2 text-[11px] text-foreground/70">
              {[
                { to: "/athkar", label: t("Athkar", "الأذكار") },
                { to: "/qibla", label: t("Qibla", "القبلة") },
                { to: "/quran", label: t("Quran", "القرآن") },
                { to: "/tasbeeh", label: t("Tasbeeh", "السبحة") },
                { to: "/translate", label: t("Translate", "الترجمة") },
                { to: "/weather", label: t("Weather", "الطقس") },
                { to: "/notifications", label: t("Notifications", "الإشعارات") },
                { to: "/qr-scanner", label: t("QR Scanner", "ماسح QR") },
                { to: "/document-scanner", label: t("Document Scanner", "ماسح المستندات") },
              ].map((l) => (
                <li key={l.to}>
                  <a href={l.to} onClick={(e) => { e.preventDefault(); navigate(l.to); }} className="px-2 py-1 rounded-md glass hover:text-accent">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      {tab === "media" && (
        <section className="mb-6 mt-2 space-y-4">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60 mb-1 px-1">
            {t("Media", "الوسائط")}
          </h2>
          <DownloadManager />
          <FileConverter />
        </section>
      )}

      <SiteFooter />

      <InstallPrompt />

      <BottomNav active={tab} onChange={handleTabChange} />
    </div>
  );
}

const Index = () => <Dashboard />;

export default Index;
