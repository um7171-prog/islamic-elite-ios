import { useEffect, useMemo, useState } from "react";

/** Build timestamp injected by vite.config.ts — e.g. "0804-0912". */
const BUILD_ID =
  typeof __BUILD_STAMP__ !== "undefined"
    ? __BUILD_STAMP__.slice(5, 16).replace(/[-T:]/g, "").replace(/^(\d{4})(\d{4})$/, "$1-$2")
    : "dev";

import { useLocale } from "@/contexts/LocaleContext";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useLocation, useNavigate } from "react-router-dom";
import { HeroPrayerCard } from "@/components/islamic/HeroPrayerCard";
import { PrayerStrip } from "@/components/islamic/PrayerStrip";
import { DateHeader } from "@/components/islamic/DateHeader";
import { QuickShortcuts } from "@/components/islamic/QuickShortcuts";
import { LanguageToggle } from "@/components/islamic/LanguageToggle";
import { AnnouncementsBell } from "@/components/islamic/AnnouncementsBell";
import { InstallPrompt } from "@/components/islamic/InstallPrompt";
import { EventsCalendar } from "@/components/islamic/EventsCalendar";
import { BottomNav, type TabKey } from "@/components/islamic/BottomNav";
import { DownloadManager } from "@/components/islamic/DownloadManager";
import { SEO } from "@/components/SEO";
import { ServicesHub } from "@/components/services/ServicesHub";
import { SideMenu } from "@/components/site/SideMenu";


import { Moon, Sun, Monitor, Settings as SettingsIcon, Download, Sparkles, Zap, Briefcase } from "lucide-react";
import { useNativeAthanScheduler } from "@/components/NativeAthanScheduler";
import { trackVisit } from "@/lib/analytics";
import { isIOSNativeApp } from "@/lib/platform";

/** Index.tsx keeps one internal tab ("media") that isn't a bottom-nav
 * destination anymore — the Media downloader is now also reachable as a
 * tile inside the unified Services grid, but the /media URL and its page
 * content still work exactly as before. */
type DashboardTab = TabKey | "media";

// Map URL path → (tab, tool dialog key). Each tool has its own SEO-friendly URL.
const PATH_MAP: Record<string, { tab: DashboardTab; tool: string | null; category?: "fav"; title: string; description: string }> = {
  "/":                 { tab: "home",  tool: null,        title: "النخبة الإسلامية - مواقيت الصلاة والقرآن وأدوات إسلامية ذكية", description: "النخبة الإسلامية منصة إسلامية ذكية تجمع مواقيت الصلاة والقبلة، القرآن الكريم والأذكار، تحويل الملفات، QR Code، الترجمة، الطقس، والتقويم الهجري في مكان واحد." },
  "/tools":            { tab: "tools", tool: null,        title: "أدواتي الإسلامية — القرآن، الأذكار، القبلة",          description: "مجموعة أدوات متكاملة: القرآن الكريم، الأذكار، القبلة، التسبيح، الترجمة، والطقس." },
  "/favorites":        { tab: "tools", tool: null, category: "fav", title: "المفضلة — خدماتك وأدواتك المفضلة",        description: "الوصول السريع للخدمات والأدوات التي أضفتها إلى المفضلة." },
  "/calendar":         { tab: "tools", tool: null,        title: "التقويم والمواعيد — تقويم هجري وميلادي مع تذكيرات", description: "تقويم هجري وميلادي شهري مع إضافة المواعيد، التكرار اليومي والأسبوعي والشهري والسنوي، وتنبيهات محلية." },
  "/media":            { tab: "media", tool: null,        title: "الوسائط — تنزيل الملفات وإدارة الوسائط المحفوظة",      description: "تنزيل ذكي للملفات من رابط مباشر وإدارة الوسائط المحفوظة. للتحويل بين صيغ الملفات، زر صفحة تحويل الملفات." },
  "/athkar":           { tab: "tools", tool: "athkar",    title: "الأذكار — أذكار الصباح والمساء",                       description: "أذكار الصباح والمساء وأذكار النوم من الكتاب والسنة." },
  "/qibla":            { tab: "tools", tool: "qibla",     title: "اتجاه القبلة — بوصلة القبلة",                          description: "حدد اتجاه القبلة بدقة من أي مكان في العالم باستخدام البوصلة." },
  "/quran":            { tab: "tools", tool: "quran",     title: "القرآن الكريم — قراءة واستماع",                        description: "المصحف الشريف بالرسم العثماني مع تلاوات لأشهر القراء." },
  "/tasbeeh":          { tab: "tools", tool: "tasbeeh",   title: "السبحة الرقمية — التسبيح والذكر",                      description: "سبحة رقمية للتسبيح والذكر مع عداد وحفظ للتقدم." },
  "/translate":        { tab: "tools", tool: "translate", title: "الترجمة — مترجم ذكي",                                  description: "ترجمة فورية بين العربية والإنجليزية ولغات أخرى." },
  "/weather":          { tab: "tools", tool: "weather",   title: "الطقس والرادار — مواعيد الصلاة",                        description: "حالة الطقس المباشرة، رادار الأمطار، والسحب ودرجات الحرارة." },
  "/notifications":    { tab: "tools", tool: "alerts",    title: "إعدادات الإشعارات والأذان",                            description: "تحكم في تنبيهات الأذان لكل صلاة وإعدادات الإشعارات." },
  "/qr-scanner":       { tab: "tools", tool: "scanner",   title: "ماسح رموز QR — قارئ الباركود",                         description: "ماسح ضوئي سريع لرموز QR والباركود مع فتح الروابط داخل التطبيق." },
  "/document-scanner": { tab: "tools", tool: "docscan",   title: "ماسح المستندات — PDF احترافي",                         description: "امسح المستندات ضوئياً مع كشف الحواف التلقائي والتحويل إلى PDF عالي الجودة." },
  "/asma-al-husna":    { tab: "tools", tool: "asmaAlHusna", title: "أسماء الله الحسنى",                                  description: "أسماء الله الحسنى التسعة والتسعون مع اللفظ بالإنجليزية والمعنى." },
};

function Dashboard() {
  const { t, dir, lang } = useLocale();
  const { theme, mode, setMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const iosNative = isIOSNativeApp();

  const routeInfo = PATH_MAP[location.pathname] ?? PATH_MAP["/"];
  const seoInfo = iosNative && location.pathname === "/"
    ? {
        ...routeInfo,
        title: "النخبة الإسلامية — مواقيت الصلاة والقرآن والأذكار والأدوات الذكية",
        description: "النخبة الإسلامية: مواقيت الصلاة والأذان والقبلة والقرآن والأذكار والتقويم والحاسبات والطقس وأدوات الملفات والذكاء الاصطناعي.",
      }
    : routeInfo;
  const [tab, setTab] = useState<DashboardTab>(routeInfo.tab);
  const [initialTool, setInitialTool] = useState<string | null>(routeInfo.tool);
  const [initialCategory, setInitialCategory] = useState<"fav" | null>(routeInfo.category ?? null);

  useEffect(() => {
    const info = PATH_MAP[location.pathname] ?? PATH_MAP["/"];
    setTab(info.tab);
    setInitialTool(info.tool);
    setInitialCategory(info.category ?? null);
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

  useEffect(() => { trackVisit(lang); }, [lang]);
  const {
    settings: athanSettings,
    setSettings: setAthanSettings,
    scheduledCount,
    reschedule: rescheduleNative,
  } = useNativeAthanScheduler();

  const handleTabChange = (next: TabKey) => {
    if (next === "settings") {
      // Its own dedicated page, not one of Index's internal tabs.
      navigate("/settings");
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
      className="w-full max-w-6xl min-w-0 overflow-x-hidden px-4 md:px-8 pb-28 mx-auto"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)",
      }}
    >
      <SEO
        title={seoInfo.title}
        description={seoInfo.description}
        path={location.pathname}
        lang={lang === "ar" ? "ar" : "en"}
        jsonLd={jsonLd}
      />
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate("/"); }}
          aria-label={t("Elite Islamic — Home", "النخبة الإسلامية — الرئيسية")}
          title={t("Elite Islamic", "النخبة الإسلامية")}
          className="glass rounded-2xl ps-3 pe-2 py-1.5 flex items-center gap-2.5 shrink-0 transition hover:scale-[1.02]"
          style={{ touchAction: "manipulation" }}
        >
          <img
            src="/icons/icon-192.png"
            alt={t("Elite Islamic logo", "شعار النخبة الإسلامية")}
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl object-contain shrink-0"
            style={{ boxShadow: "var(--shadow-glow-gold)" }}
          />
          <span className="font-display text-[13px] sm:text-sm font-bold leading-tight text-foreground whitespace-nowrap">
            {t("Elite Islamic", "النخبة الإسلامية")}
          </span>
        </a>

        <div className="flex items-center gap-2" style={{ touchAction: "manipulation" }}>
          <SideMenu />
          <button
            onClick={cycleMode}
            className="h-11 min-w-11 px-2 rounded-xl glass shadow-sm flex items-center justify-center transition hover:scale-105"
            aria-label={t("Theme: ", "الوضع: ") + modeLabel}
            title={modeLabel}
            style={{ touchAction: "manipulation" }}
          >
            {mode === "system" ? (
              <Monitor className="h-5 w-5 text-foreground/80" />
            ) : theme === "night" ? (
              <Moon className="h-5 w-5 text-slate-300" />
            ) : (
              <Sun className="h-5 w-5 text-yellow-500" />
            )}
          </button>

          <button
            onClick={() => navigate("/settings")}
            aria-label={t("Settings", "الإعدادات")}
            title={t("Settings", "الإعدادات")}
            className="h-11 w-11 rounded-xl glass shadow-sm grid place-items-center transition hover:scale-105"
            style={{ touchAction: "manipulation" }}
          >
            <SettingsIcon className="h-5 w-5 text-accent" />
          </button>

          <AnnouncementsBell />
          <LanguageToggle />
        </div>
      </header>

      {tab === "home" && (
        <>
          <section className="mb-3 text-center">
            <h1 className="font-display font-bold leading-tight text-foreground" style={{ fontSize: "clamp(1.15rem, 5.5vw, 1.75rem)" }}>
              {t("Elite Islamic", "النخبة الإسلامية")}
            </h1>
            <p className="mt-1 text-foreground/70 leading-relaxed max-w-md mx-auto" style={{ fontSize: "clamp(0.75rem, 3.2vw, 0.875rem)" }}>
              {iosNative
                ? t(
                    "Prayer times, Quran, Athkar and useful smart tools",
                    "مواقيت الصلاة والقرآن والأذكار وأدوات ذكية مفيدة",
                  )
                : t(
                    "A platform for file downloads, conversion and smart tools",
                    "منصة لتنزيل الملفات وتحويلها وأدوات ذكية مفيدة",
                  )}
            </p>
            <ul className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              {[
                ...(!iosNative ? [{ icon: Download, label: t("File downloads", "تنزيل الملفات") }] : []),
                { icon: Sparkles, label: t("Smart tools", "أدوات ذكية") },
                { icon: Zap, label: t("Fast & easy", "سريعة وسهلة") },
              ].map((p) => (
                <li
                  key={p.label}
                  className="glass rounded-full px-2.5 py-1 flex items-center gap-1.5 text-[11px] text-foreground/80"
                >
                  <p.icon className="h-3.5 w-3.5 text-accent shrink-0" />
                  <span className="whitespace-nowrap">{p.label}</span>
                </li>
              ))}
            </ul>
            {!iosNative && (
              <p className="mt-2 text-[10px] tracking-wide text-foreground/40" dir="ltr">
                {`v1.0.0 · build ${BUILD_ID}`}
              </p>
            )}
          </section>

          <div className="mb-2">
            <DateHeader />
          </div>

          <section className="mb-6 space-y-2">
            <HeroPrayerCard />
            <PrayerStrip />
          </section>

          <section className="mb-6">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60 mb-3 px-1">
              {t("Quick Access", "اختصارات سريعة")}
            </h2>
            <QuickShortcuts />
          </section>

          <section className="mb-6">
            <article className="glass rounded-2xl p-4 border border-border/40 flex items-start gap-3">
              <span
                className="h-12 w-12 shrink-0 rounded-xl grid place-items-center text-accent-foreground"
                style={{ background: "linear-gradient(135deg, hsl(150 60% 30%), hsl(140 65% 42%))", boxShadow: "var(--shadow-glow-gold)" }}
              >
                <Briefcase className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-sm font-bold text-foreground">
                  {t("Saudi Jobs", "وظائف السعودية")}
                </h2>
                <p className="mt-0.5 text-xs text-foreground/70 leading-relaxed">
                  {t("Latest job opportunities in the Kingdom.", "أحدث فرص العمل داخل المملكة.")}
                </p>
                <button
                  onClick={() => navigate("/saudi-jobs")}
                  className="mt-3 rounded-xl bg-accent text-accent-foreground px-3.5 py-2 text-xs font-semibold hover:opacity-90 transition"
                >
                  {t("Browse jobs", "استعرض الوظائف")}
                </button>
              </div>
            </article>
          </section>
        </>
      )}


      {tab === "tools" && (
        <>
          {/* Unified Services grid — replaces the old three-block stack
              (QuickServices + ServicesHub + EliteTools) with one consistent,
              searchable, category-filterable grid covering every
              confirmed-working service (see REDESIGN_PROGRESS.md Phase 3). */}
          <section className="mb-6 mt-2">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60 mb-3 px-1">
              {t("Services", "الخدمات")}
            </h2>
            <ServicesHub
              athanSettings={athanSettings}
              onAthanChange={setAthanSettings}
              scheduledCount={scheduledCount}
              onReschedule={rescheduleNative}
              initialOpen={initialTool}
              initialCategory={initialCategory}
            />
          </section>

          {/* Kept as its own rich embedded widget rather than a grid tile —
              it's a live calendar view, not a single launchable tool, so a
              tile that just reopened this same page would be circular. */}
          <section className="mb-6">
            <EventsCalendar />
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
                { to: "/convert", label: t("File Converter", "تحويل الملفات") },
                { to: "/calendar", label: t("Calendar", "التقويم") },
                { to: "/asma-al-husna", label: t("99 Names of Allah", "أسماء الله الحسنى") },
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

      {!iosNative && tab === "media" && (
        <section className="mb-6 mt-2 space-y-4">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60 mb-1 px-1">
            {t("Media", "الوسائط")}
          </h2>
          <DownloadManager />
        </section>
      )}

      <InstallPrompt />

      {/* Favorites reuses the "tools" tab's content (the Services grid,
          pre-filtered to the fav category) rather than a separate page, but
          the bottom nav should still highlight "Favorites" specifically
          while on that URL, not "Services". */}
      <BottomNav
        active={tab === "media" ? "other" : location.pathname === "/favorites" ? "favorites" : tab}
        onChange={handleTabChange}
      />
    </div>
  );
}

const Index = () => <Dashboard />;

export default Index;
