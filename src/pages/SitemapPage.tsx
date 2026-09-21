import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell } from "@/components/site/StaticPageShell";
import { isIOSNativeApp } from "@/lib/platform";

export default function SitemapPage() {
  const { t } = useLocale();
  const iosNative = isIOSNativeApp();

  const groups: { title: string; links: { to: string; label: string }[] }[] = [
    {
      title: t("Main sections", "الأقسام الرئيسية"),
      links: [
        { to: "/", label: t("Home", "الرئيسية") },
        { to: "/tools", label: t("My Tools", "أدواتي") },
        ...(!iosNative ? [{ to: "/media", label: t("Media", "الوسائط") }] : []),
        { to: "/ai", label: t("AI Tools", "أدوات الذكاء") },
        { to: "/mushaf", label: t("Mushaf", "المصحف") },
        { to: "/settings", label: t("Settings", "الإعدادات") },
      ],
    },
    {
      title: t("Islamic tools", "الأدوات الإسلامية"),
      links: [
        { to: "/prayer-times", label: t("Prayer Times", "مواقيت الصلاة") },
        { to: "/qibla", label: t("Qibla", "القبلة") },
        { to: "/athkar", label: t("Athkar", "الأذكار") },
        { to: "/quran", label: t("Quran", "القرآن") },
        { to: "/tasbeeh", label: t("Tasbeeh", "المسبحة") },
      ],
    },
    {
      title: t("Smart tools", "الأدوات الذكية"),
      links: [
        { to: "/ai/background-remover", label: t("Background Remover", "إزالة الخلفية") },
        { to: "/ai/image-enhancer", label: t("Image Enhancer", "تحسين الصور") },
        { to: "/ai/ocr", label: t("OCR Text Extraction", "استخراج النص من الصور") },
        { to: "/translate", label: t("Smart Translator", "المترجم الذكي") },
        { to: "/qr-scanner", label: t("QR Scanner", "ماسح QR") },
        { to: "/document-scanner", label: t("Document Scanner", "ماسح المستندات") },
        { to: "/notifications", label: t("Notifications", "الإشعارات") },
      ],
    },
    {
      title: t("Information & legal", "معلومات وروابط مهمة"),
      links: [
        { to: "/about", label: t("About Us", "من نحن") },
        { to: "/privacy", label: t("Privacy Policy", "سياسة الخصوصية") },
        { to: "/terms", label: t("Terms of Use", "شروط الاستخدام") },
        { to: "/cookies", label: t("Cookie Policy", "سياسة ملفات تعريف الارتباط") },
        { to: "/disclaimer", label: t("Disclaimer", "إخلاء المسؤولية") },
        { to: "/faq", label: t("FAQ", "الأسئلة الشائعة") },
        { to: "/contact", label: t("Contact Us", "اتصل بنا") },
      ],
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("Sitemap", "خريطة الموقع"),
    url: "https://www.techsnds.com/sitemap",
    inLanguage: ["ar", "en"],
    hasPart: groups.flatMap((g) =>
      g.links.map((l) => ({
        "@type": "WebPage",
        name: l.label,
        url: `https://www.techsnds.com${l.to}`,
      })),
    ),
  };

  return (
    <StaticPageShell
      title={t("Sitemap | TechSNDS", "خريطة الموقع | TechSNDS")}
      description={t(
        "Browse every page on TechSNDS: main sections, Islamic tools, smart AI tools and legal information pages.",
        "تصفح جميع صفحات TechSNDS: الأقسام الرئيسية والأدوات الإسلامية وأدوات الذكاء الاصطناعي والصفحات القانونية.",
      )}
      path="/sitemap"
      heading={t("Sitemap", "خريطة الموقع")}
      intro={t(
        "A full index of the pages and tools available on the platform.",
        "فهرس كامل لجميع الصفحات والأدوات المتاحة في المنصة.",
      )}
      jsonLd={jsonLd}
    >
      {groups.map((g) => (
        <section key={g.title} className="rounded-2xl border border-foreground/10 bg-card/60 p-4 backdrop-blur">
          <h2 className="font-display text-base font-bold">{g.title}</h2>
          <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
            {g.links.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-foreground/75 transition hover:bg-foreground/5 hover:text-accent"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-accent rtl:rotate-0 ltr:rotate-180" />
                  <span className="min-w-0 break-words">{l.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </StaticPageShell>
  );
}
