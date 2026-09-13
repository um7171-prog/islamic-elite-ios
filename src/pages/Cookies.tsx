import { Cookie, Settings2, BarChart3, ShieldCheck } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell, InfoCard, Bullets } from "@/components/site/StaticPageShell";

export default function Cookies() {
  const { t } = useLocale();
  const updated = "2026-08-01";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("Cookie Policy", "سياسة ملفات تعريف الارتباط"),
    url: "https://www.techsnds.com/cookies",
    inLanguage: ["ar", "en"],
    dateModified: updated,
    publisher: { "@type": "Organization", name: "TechSNDS", url: "https://www.techsnds.com/" },
  };

  return (
    <StaticPageShell
      title={t("Cookie Policy | TechSNDS", "سياسة ملفات تعريف الارتباط | TechSNDS")}
      description={t(
        "How TechSNDS uses cookies and local storage: essential preferences, analytics and advertising cookies, and how to control them.",
        "كيف تستخدم TechSNDS ملفات تعريف الارتباط والتخزين المحلي: تفضيلات أساسية، تحليلات، إعلانات، وكيفية التحكم بها.",
      )}
      path="/cookies"
      heading={t("Cookie Policy", "سياسة ملفات تعريف الارتباط")}
      intro={t(
        `Last updated: ${updated}. This page explains the cookies and local storage used on TechSNDS and how you can control them.`,
        `آخر تحديث: ${updated}. توضح هذه الصفحة ملفات تعريف الارتباط والتخزين المحلي المستخدمة في TechSNDS وكيفية التحكم بها.`,
      )}
      jsonLd={jsonLd}
    >
      <InfoCard icon={Cookie} title={t("What are cookies?", "ما هي ملفات تعريف الارتباط؟")}>
        <p>
          {t(
            "Cookies are small text files stored on your device by the browser. We also use local storage to remember your settings so the tools work the way you left them.",
            "ملفات تعريف الارتباط ملفات نصية صغيرة يخزّنها المتصفح على جهازك. كما نستخدم التخزين المحلي لحفظ إعداداتك حتى تعمل الأدوات كما تركتها.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={Settings2} title={t("Essential and preference cookies", "ملفات أساسية وتفضيلات")}>
        <Bullets
          items={[
            t("Language (Arabic / English) and theme (light / dark).", "اللغة (عربي/إنجليزي) والمظهر (فاتح/داكن)."),
            t("Selected city, prayer calculation method and Athan settings.", "المدينة المختارة وطريقة حساب المواقيت وإعدادات الأذان."),
            t("Reciter choice, Mushaf page and tool preferences.", "القارئ المختار وصفحة المصحف وتفضيلات الأدوات."),
            t("These are required for the site to function and are stored on your device.", "هذه ضرورية لعمل الموقع وتُخزَّن على جهازك."),
          ]}
        />
      </InfoCard>

      <InfoCard icon={BarChart3} title={t("Analytics and advertising", "التحليلات والإعلانات")}>
        <p>
          {t(
            "We may use analytics to understand aggregate usage, and Google AdSense to display ads. Google and its partners may use cookies to serve ads based on your prior visits to this or other sites. You can opt out of personalized advertising through Google Ads Settings.",
            "قد نستخدم أدوات تحليلات لفهم الاستخدام بشكل إجمالي، ونستخدم Google AdSense لعرض الإعلانات. وقد تستخدم Google وشركاؤها ملفات تعريف الارتباط لعرض إعلانات بناءً على زياراتك السابقة لهذا الموقع أو مواقع أخرى. ويمكنك إيقاف الإعلانات المخصصة من إعدادات إعلانات Google.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={ShieldCheck} title={t("Controlling cookies", "التحكم بملفات تعريف الارتباط")}>
        <Bullets
          items={[
            t("You can delete or block cookies from your browser settings at any time.", "يمكنك حذف ملفات تعريف الارتباط أو حظرها من إعدادات المتصفح في أي وقت."),
            t("Clearing site data resets your saved preferences on this device.", "مسح بيانات الموقع يعيد ضبط تفضيلاتك المحفوظة على هذا الجهاز."),
            t("Blocking essential storage may stop some tools from working correctly.", "حظر التخزين الأساسي قد يمنع بعض الأدوات من العمل بشكل صحيح."),
          ]}
        />
      </InfoCard>
    </StaticPageShell>
  );
}
