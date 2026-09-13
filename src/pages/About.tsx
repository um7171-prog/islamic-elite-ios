import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Target, Eye, Sparkles, Download, BookOpen, Languages, Calculator, Bot, ScanText, Info } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell, InfoCard } from "@/components/site/StaticPageShell";
import { getAppVersion, type AppVersionInfo } from "@/lib/appVersion";
import { isIOSNativeApp } from "@/lib/platform";

export default function About() {
  const { t } = useLocale();
  const iosNative = isIOSNativeApp();
  const [appInfo, setAppInfo] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    let alive = true;
    getAppVersion().then((info) => {
      if (alive) setAppInfo(info);
    });
    return () => {
      alive = false;
    };
  }, []);


  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: t("About TechSNDS", "من نحن — TechSNDS"),
    url: "https://www.techsnds.com/about",
    inLanguage: ["ar", "en"],
    mainEntity: {
      "@type": "Organization",
      name: "TechSNDS",
      alternateName: t("Elite Islamic", "النخبة الإسلامية"),
      url: "https://www.techsnds.com/",
      logo: "https://www.techsnds.com/icons/icon-512.png",
    },
  };

  const services = [
    ...(!iosNative ? [{ to: "/media", Icon: Download, title: t("Smart Media Downloader", "تحميل الوسائط الذكي"), desc: t("Download files from a direct link, plus a built-in file converter.", "نزّل الملفات من رابط مباشر، مع محول ملفات مدمج.") }] : []),
    { to: "/ai", Icon: Bot, title: t("AI Tools", "أدوات الذكاء الاصطناعي"), desc: t("Background removal, image enhancement and more.", "إزالة الخلفية وتحسين جودة الصور والمزيد.") },
    { to: "/ai/ocr", Icon: ScanText, title: t("OCR Text Extraction", "استخراج النص من الصور"), desc: t("Extract Arabic and English text from any image.", "استخرج النصوص العربية والإنجليزية من أي صورة.") },
    { to: "/mushaf", Icon: BookOpen, title: t("Quran Mushaf Reader", "المصحف الشريف"), desc: t("A premium full-screen Mushaf with recitations.", "مصحف كامل الشاشة بتجربة احترافية مع التلاوات.") },
    { to: "/qibla", Icon: Compass, title: t("Prayer Times & Qibla", "مواقيت الصلاة والقبلة"), desc: t("Accurate prayer times, Athan alerts and Qibla compass.", "مواقيت دقيقة وتنبيهات أذان وبوصلة قبلة.") },
    { to: "/translate", Icon: Languages, title: t("Smart Translator", "المترجم الذكي"), desc: t("Instant translation for text and images.", "ترجمة فورية للنصوص والصور.") },
    { to: "/tools", Icon: Calculator, title: t("Daily Services Center", "مركز الخدمات اليومية"), desc: t("Inheritance, Zakat, salary countdowns and calendars.", "المواريث والزكاة وعدادات الرواتب والتقاويم.") },
  ];

  return (
    <StaticPageShell
      title={t("About Us | TechSNDS", "من نحن | النخبة الإسلامية TechSNDS")}
      description={t(
        "TechSNDS is an Arabic platform combining digital tools, AI and Islamic services in one fast, free place.",
        "TechSNDS منصة عربية تجمع الأدوات الرقمية والذكاء الاصطناعي والخدمات الإسلامية في مكان واحد سريع ومجاني.",
      )}
      path="/about"
      heading={t("About TechSNDS", "من نحن — TechSNDS")}
      intro={t(
        "TechSNDS (Elite Islamic) is a free Arabic platform that brings together smart digital tools, artificial intelligence and Islamic services in one fast and simple experience — no installation and no complexity.",
        "منصة TechSNDS (النخبة الإسلامية) منصة عربية مجانية تجمع الأدوات الرقمية الذكية والذكاء الاصطناعي والخدمات الإسلامية في تجربة واحدة سريعة وبسيطة، دون تثبيت ودون تعقيد.",
      )}
      jsonLd={jsonLd}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoCard icon={Target} title={t("Our mission", "رسالتنا")}>
          <p>
            {t(
              "To put powerful, reliable and easy tools in the hands of every Arabic-speaking user — free, fast and respectful of privacy.",
              "أن نضع أدوات قوية وموثوقة وسهلة بين يدي كل مستخدم عربي، مجاناً وبسرعة وباحترام كامل للخصوصية.",
            )}
          </p>
        </InfoCard>
        <InfoCard icon={Eye} title={t("Our vision", "رؤيتنا")}>
          <p>
            {t(
              "To become the largest Arabic platform for digital tools, artificial intelligence and Islamic services.",
              "أن نكون أكبر منصة عربية للأدوات الرقمية والذكاء الاصطناعي والأدوات الإسلامية.",
            )}
          </p>
        </InfoCard>
      </div>

      <InfoCard icon={Sparkles} title={t("Our goal", "هدفنا")}>
        <p>
          {t(
            "One platform that serves your day: worship tools, everyday calculators and modern AI utilities — continuously improved based on user feedback.",
            "منصة واحدة تخدم يومك: أدوات العبادة، وحاسبات الحياة اليومية، وأدوات الذكاء الاصطناعي الحديثة، مع تطوير مستمر بناءً على ملاحظات المستخدمين.",
          )}
        </p>
      </InfoCard>

      <section>
        <h2 className="mb-3 font-display text-base font-bold">{t("Top services", "أهم خدماتنا")}</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {services.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="flex items-start gap-3 rounded-2xl border border-foreground/10 bg-card/60 p-3.5 transition hover:bg-foreground/5 active:scale-[0.98]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <s.Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground break-words">{s.title}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-foreground/65 break-words">{s.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <InfoCard icon={Info} title={t("App version", "إصدار التطبيق")}>
        <p>
          {t("Version", "الإصدار")} {appInfo?.version ?? "—"}
        </p>
        <p>
          {t("Build", "رقم البناء")} {appInfo?.build ?? "—"}
        </p>
      </InfoCard>
    </StaticPageShell>

  );
}
