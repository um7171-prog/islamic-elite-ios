import { useEffect, useMemo, useState } from "react";

/** Build timestamp injected by vite.config.ts — e.g. "0804-0912". */
const BUILD_ID =
  typeof __BUILD_STAMP__ !== "undefined"
    ? __BUILD_STAMP__.slice(5, 16).replace(/[-T:]/g, "").replace(/^(\d{4})(\d{4})$/, "$1-$2")
    : "dev";

import { useLocale } from "@/contexts/LocaleContext";
import { useLocation, useNavigate } from "react-router-dom";
import { HeroPrayerCard } from "@/components/islamic/HeroPrayerCard";
import { PrayerStrip } from "@/components/islamic/PrayerStrip";
import { QuickShortcuts } from "@/components/islamic/QuickShortcuts";
import { HomeHeader } from "@/components/islamic/HomeHeader";
import { DailyDhikrCard } from "@/components/islamic/DailyDhikrCard";
import { PageShell } from "@/components/site/PageHeader";
import { InstallPrompt } from "@/components/islamic/InstallPrompt";
import { DownloadManager } from "@/components/islamic/DownloadManager";
import { SEO } from "@/components/SEO";
import { ServicesHub } from "@/components/services/ServicesHub";


import { trackVisit } from "@/lib/analytics";
import { isIOSNativeApp } from "@/lib/platform";

/** Index.tsx keeps one internal tab ("media") that isn't a bottom-nav
 * destination anymore — the Media downloader is now also reachable as a
 * tile inside the unified Services grid, but the /media URL and its page
 * content still work exactly as before. */
type DashboardTab = "home" | "tools" | "media";

// Map URL path → (tab, tool dialog key). Each tool has its own SEO-friendly URL.
const PATH_MAP: Record<string, { tab: DashboardTab; tool: string | null; category?: "fav"; title: string; description: string }> = {
  "/":                 { tab: "home",  tool: null,        title: "النخبة الإسلامية - مواقيت الصلاة والقرآن وأدوات إسلامية ذكية", description: "النخبة الإسلامية منصة إسلامية ذكية تجمع مواقيت الصلاة والقبلة، القرآن الكريم والأذكار، تحويل الملفات، QR Code، الترجمة، والتقويم الهجري في مكان واحد." },
  "/tools":            { tab: "tools", tool: null,        title: "أدواتي الإسلامية — القرآن، الأذكار، القبلة",          description: "مجموعة أدوات متكاملة: القرآن الكريم، الأذكار، القبلة، التسبيح، والترجمة." },
  "/favorites":        { tab: "tools", tool: null, category: "fav", title: "المفضلة — خدماتك وأدواتك المفضلة",        description: "الوصول السريع للخدمات والأدوات التي أضفتها إلى المفضلة." },
  "/media":            { tab: "media", tool: null,        title: "الوسائط — تنزيل الملفات وإدارة الوسائط المحفوظة",      description: "تنزيل ذكي للملفات من رابط مباشر وإدارة الوسائط المحفوظة. للتحويل بين صيغ الملفات، زر صفحة تحويل الملفات." },
  "/athkar":           { tab: "tools", tool: "athkar",    title: "الأذكار — أذكار الصباح والمساء",                       description: "أذكار الصباح والمساء وأذكار النوم من الكتاب والسنة." },
  "/qibla":            { tab: "tools", tool: "qibla",     title: "اتجاه القبلة — بوصلة القبلة",                          description: "حدد اتجاه القبلة بدقة من أي مكان في العالم باستخدام البوصلة." },
  "/tasbeeh":          { tab: "tools", tool: "tasbeeh",   title: "السبحة الرقمية — التسبيح والذكر",                      description: "سبحة رقمية للتسبيح والذكر مع عداد وحفظ للتقدم." },
  "/translate":        { tab: "tools", tool: "translate", title: "الترجمة — مترجم ذكي",                                  description: "ترجمة فورية بين العربية والإنجليزية ولغات أخرى." },
  "/qr-scanner":       { tab: "tools", tool: "scanner",   title: "ماسح رموز QR — قارئ الباركود",                         description: "ماسح ضوئي سريع لرموز QR والباركود مع فتح الروابط داخل التطبيق." },
  "/document-scanner": { tab: "tools", tool: "docscan",   title: "ماسح المستندات — PDF احترافي",                         description: "امسح المستندات ضوئياً مع كشف الحواف التلقائي والتحويل إلى PDF عالي الجودة." },
  "/asma-al-husna":    { tab: "tools", tool: "asmaAlHusna", title: "أسماء الله الحسنى",                                  description: "أسماء الله الحسنى التسعة والتسعون مع اللفظ بالإنجليزية والمعنى." },
};

function Dashboard() {
  const { t, dir, lang } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const iosNative = isIOSNativeApp();

  const routeInfo = PATH_MAP[location.pathname] ?? PATH_MAP["/"];
  const seoInfo = iosNative && location.pathname === "/"
    ? {
        ...routeInfo,
        title: "النخبة الإسلامية — مواقيت الصلاة والقرآن والأذكار والأدوات الذكية",
        description: "النخبة الإسلامية: مواقيت الصلاة والأذان والقبلة والقرآن والأذكار والتقويم والحاسبات وأدوات الملفات والذكاء الاصطناعي.",
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

  useEffect(() => { trackVisit(lang); }, [lang]);

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

  const seo = (
    <SEO
      title={seoInfo.title}
      description={seoInfo.description}
      path={location.pathname}
      lang={lang === "ar" ? "ar" : "en"}
      jsonLd={jsonLd}
    />
  );

  if (tab === "home") {
    return (
      <div dir={dir} className="w-full min-w-0 overflow-x-hidden">
        {seo}
        <HomeHeader />
        <div className="mx-auto w-full max-w-2xl min-w-0 px-4 pb-6 md:px-8">
          {/* Next prayer overlaps the header's bottom edge */}
          <section className="-mt-10 space-y-4">
            <div className="rise-in" style={{ animationDelay: "80ms" }}><HeroPrayerCard className="relative z-10" /></div>
            <div className="rise-in" style={{ animationDelay: "180ms" }}><PrayerStrip /></div>
          </section>

          <div className="rise-in mt-5" style={{ animationDelay: "280ms" }}>
            <DailyDhikrCard />
          </div>

          <section className="rise-in mt-7" style={{ animationDelay: "380ms" }}>
            <h2 className="mb-4 px-1 font-display text-h3 font-bold text-foreground">
              {t("Quick Access", "اختصارات سريعة")}
            </h2>
            <QuickShortcuts />
          </section>

          {!iosNative && (
            <p className="mt-6 text-center text-xs tracking-wide text-foreground/40" dir="ltr">
              {`v1.0.0 · build ${BUILD_ID}`}
            </p>
          )}
        </div>
        <InstallPrompt />
      </div>
    );
  }

  if (tab === "media") {
    return (
      <PageShell titleAr="الوسائط" titleEn="Media" fallback="/tools">
        {seo}
        {!iosNative && <DownloadManager />}
        <InstallPrompt />
      </PageShell>
    );
  }

  // Services / Favorites (same hub, favorites pre-filtered)
  const isFav = location.pathname === "/favorites";
  return (
    <PageShell titleAr={isFav ? "المفضلة" : "الخدمات"} titleEn={isFav ? "Favorites" : "Services"} hideBack>
      {seo}
      <ServicesHub initialOpen={initialTool} initialCategory={initialCategory} />

      {/* Internal linking (SEO): every tool discoverable via its own crawlable URL. */}
      <nav aria-label={t("All tools", "كل الأدوات")} className="mt-8">
        <h2 className="sr-only">{t("All tools", "كل الأدوات")}</h2>
        <ul className="flex flex-wrap gap-2 text-xs text-foreground/70">
          {[
            { to: "/athkar", label: t("Athkar", "الأذكار") },
            { to: "/qibla", label: t("Qibla", "القبلة") },
            { to: "/quran", label: t("Quran", "القرآن") },
            { to: "/tasbeeh", label: t("Tasbeeh", "السبحة") },
            { to: "/translate", label: t("Translate", "الترجمة") },
            { to: "/prayer-times", label: t("Prayer Times", "مواقيت الصلاة") },
            { to: "/notifications", label: t("Notifications", "الإشعارات") },
            { to: "/qr-scanner", label: t("QR Scanner", "ماسح QR") },
            { to: "/document-scanner", label: t("Document Scanner", "ماسح المستندات") },
            { to: "/convert", label: t("File Converter", "تحويل الملفات") },
            { to: "/calendar", label: t("Calendar", "التقويم") },
            { to: "/calculators", label: t("Calculators", "الحاسبات") },
            { to: "/date-converter", label: t("Date Converter", "تحويل التاريخ") },
            { to: "/asma-al-husna", label: t("99 Names of Allah", "أسماء الله الحسنى") },
          ].map((l) => (
            <li key={l.to}>
              <a href={l.to} onClick={(e) => { e.preventDefault(); navigate(l.to); }} className="rounded-md bg-card px-2 py-1 ring-1 ring-foreground/[0.07] hover:text-primary">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <InstallPrompt />
    </PageShell>
  );
}

const Index = () => <Dashboard />;

export default Index;
