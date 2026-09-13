import { Shield, Cookie, BarChart3, Megaphone, Plug, Lock, UserCheck, Mail } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell, InfoCard, Bullets } from "@/components/site/StaticPageShell";
import { SITE_EMAIL } from "@/components/site/SiteFooter";
import { isIOSNativeApp } from "@/lib/platform";

export default function Privacy() {
  const { t } = useLocale();
  const iosNative = isIOSNativeApp();
  const updated = "2026-09-02";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("Privacy Policy", "سياسة الخصوصية"),
    url: "https://www.techsnds.com/privacy",
    inLanguage: ["ar", "en"],
    dateModified: updated,
    publisher: { "@type": "Organization", name: "TechSNDS", url: "https://www.techsnds.com/" },
  };

  return (
    <StaticPageShell
      title={t("Privacy Policy | TechSNDS", "سياسة الخصوصية | النخبة الإسلامية TechSNDS")}
      description={t(
        "How TechSNDS collects, uses and protects your data, including cookies, Google AdSense, Google Analytics and third-party APIs.",
        "كيف تجمع منصة TechSNDS بياناتك وتستخدمها وتحميها، بما في ذلك ملفات تعريف الارتباط وإعلانات Google AdSense وتحليلات Google والواجهات الخارجية.",
      )}
      path="/privacy"
      heading={t("Privacy Policy", "سياسة الخصوصية")}
      intro={t(
        `Last updated: ${updated}. This page explains what data we collect and how we protect it.`,
        `آخر تحديث: ${updated}. توضح هذه الصفحة البيانات التي نجمعها وكيف نحميها.`,
      )}
      jsonLd={jsonLd}
    >
      <InfoCard icon={Shield} title={t("Data we collect", "البيانات التي نجمعها")}>
        <Bullets
          items={[
            t(
              iosNative
                ? "The installed iOS app does not send visit analytics or IP-based location for advertising analytics."
                : "Technical data: browser type, device, approximate location and pages visited.",
              iosNative
                ? "تطبيق iOS المثبّت لا يرسل تحليلات الزيارات أو الموقع التقريبي المستنتج من عنوان IP لأغراض تحليلات الإعلانات."
                : "بيانات تقنية: نوع المتصفح، الجهاز، الموقع التقريبي، والصفحات التي تمت زيارتها.",
            ),
            t(
              "Preferences you choose: city, language, theme, prayer calculation method and notification settings — stored on your device.",
              "التفضيلات التي تختارها: المدينة، اللغة، الوضع الليلي/النهاري، طريقة حساب المواقيت وإعدادات الإشعارات — وتُحفظ على جهازك.",
            ),
            t(
              "Data you send voluntarily through the contact form (name, email, subject, message).",
              "البيانات التي ترسلها طوعاً عبر نموذج التواصل (الاسم، البريد الإلكتروني، الموضوع، الرسالة).",
            ),
            t(
              "Content you upload to the tools (images, files, text) is processed to deliver the requested result and is not sold or published.",
              "المحتوى الذي ترفعه للأدوات (صور، ملفات، نصوص) تتم معالجته لتقديم النتيجة المطلوبة فقط ولا يُباع أو يُنشر.",
            ),
          ]}
        />
      </InfoCard>

      <InfoCard icon={Cookie} title={t("Cookies", "ملفات تعريف الارتباط (Cookies)")}>
        <p>
          {t(
            "We use cookies and local storage to remember your preferences, keep the app fast, and measure usage. Advertising partners may also place cookies to show relevant ads. You can delete or block cookies from your browser settings; some features may then stop working correctly.",
            "نستخدم ملفات تعريف الارتباط والتخزين المحلي لتذكّر تفضيلاتك، وتسريع التطبيق، وقياس الاستخدام. كما قد يضع شركاء الإعلانات ملفات تعريف ارتباط لعرض إعلانات مناسبة. يمكنك حذف أو حظر هذه الملفات من إعدادات المتصفح، وقد تتوقف بعض المزايا عن العمل بشكل صحيح.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={Megaphone} title={t("Google AdSense", "إعلانات Google AdSense")}>
        <p>
          {t(
            iosNative
              ? "Google AdSense is disabled inside the installed iOS app. It may be used on the TechSNDS website."
              : "This site displays ads through Google AdSense. Google and its partners may use cookies (including the DoubleClick cookie) to serve ads based on your visits to this and other sites. You can opt out of personalized advertising through Google Ads Settings.",
            iosNative
              ? "إعلانات Google AdSense معطلة داخل تطبيق iOS المثبّت، وقد تُستخدم في موقع TechSNDS على الويب."
              : "يعرض هذا الموقع إعلانات عبر Google AdSense. قد تستخدم Google وشركاؤها ملفات تعريف الارتباط (بما فيها ملف DoubleClick) لعرض إعلانات بناءً على زياراتك لهذا الموقع ومواقع أخرى. ويمكنك إيقاف الإعلانات المخصصة من إعدادات إعلانات Google.",
          )}
        </p>
        <p>
          <a
            className="text-accent underline"
            href="https://policies.google.com/technologies/ads"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Google advertising policies", "سياسات إعلانات Google")}
          </a>
        </p>
      </InfoCard>

      <InfoCard icon={BarChart3} title={t("Google Analytics", "تحليلات Google Analytics")}>
        <p>
          {t(
            iosNative
              ? "Visit analytics are disabled inside the installed iOS app. Website analytics may still be used on TechSNDS.com."
              : "We use analytics to understand how visitors use the site (pages viewed, language, device, session duration) in aggregate form. This data helps us improve the tools and is not used to identify you personally.",
            iosNative
              ? "تحليلات الزيارات معطلة داخل تطبيق iOS المثبّت، وقد تستمر تحليلات الموقع على TechSNDS.com."
              : "نستخدم أدوات التحليلات لفهم طريقة استخدام الزوار للموقع (الصفحات المعروضة، اللغة، الجهاز، مدة الجلسة) بشكل إجمالي. تساعدنا هذه البيانات على تحسين الأدوات ولا تُستخدم للتعرف على هويتك الشخصية.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={Plug} title={t("Third-party APIs", "واجهات API الخارجية")}>
        <Bullets
          items={[
            t("Prayer time, Hijri calendar and weather services.", "خدمات مواقيت الصلاة والتقويم الهجري والطقس."),
            t(
              "When you choose OCR or AI translation, the text or image you selected is sent through our server to an external AI processor (Google Gemini through Lovable AI Gateway) only to produce the requested result. The iOS app asks for your consent before the first such transfer.",
              "عند اختيار استخراج النص OCR أو الترجمة بالذكاء الاصطناعي، يُرسل النص أو الصورة التي اخترتها عبر خادمنا إلى مزود معالجة ذكاء اصطناعي خارجي (Google Gemini عبر Lovable AI Gateway) فقط لإنتاج النتيجة المطلوبة. ويطلب تطبيق iOS موافقتك قبل أول إرسال من هذا النوع.",
            ),
            ...(!iosNative ? [t("Media extraction services used by the downloader tools.", "خدمات استخراج الوسائط المستخدمة في أدوات التحميل.")] : []),
            t(
              "Each provider processes the minimum data required for the requested feature and applies its own privacy terms.",
              "يعالج كل مزود الحد الأدنى من البيانات اللازمة للميزة المطلوبة وتُطبَّق شروط الخصوصية الخاصة به.",
            ),
          ]}
        />
      </InfoCard>

      <InfoCard icon={Lock} title={t("How we protect your data", "كيف نحمي بياناتك")}>
        <Bullets
          items={[
            t("All traffic is encrypted over HTTPS.", "جميع الاتصالات مشفّرة عبر HTTPS."),
            t("Most preferences never leave your device.", "معظم التفضيلات لا تغادر جهازك."),
            t("Access to stored messages is restricted to authorized administrators.", "الوصول إلى الرسائل المخزّنة مقصور على المشرفين المصرّح لهم."),
            t("Uploaded files are processed for your request and are not shared with third parties for marketing.", "الملفات المرفوعة تُعالج لتنفيذ طلبك ولا تُشارك مع أطراف ثالثة لأغراض تسويقية."),
          ]}
        />
      </InfoCard>

      <InfoCard icon={UserCheck} title={t("Your rights", "حقوق المستخدم")}>
        <Bullets
          items={[
            t("Request a copy of the data related to you.", "طلب نسخة من البيانات المتعلقة بك."),
            t("Request correction or deletion of your data.", "طلب تصحيح بياناتك أو حذفها."),
            t("Withdraw consent and disable analytics or personalized ads.", "سحب الموافقة وإيقاف التحليلات أو الإعلانات المخصصة."),
            t("Clear all locally stored preferences at any time from your browser.", "مسح جميع التفضيلات المحفوظة محلياً في أي وقت من متصفحك."),
          ]}
        />
      </InfoCard>

      <InfoCard icon={Mail} title={t("Contact us", "التواصل معنا")}>
        <p>
          {t("For any privacy request, email us at ", "لأي طلب يخص الخصوصية راسلنا على ")}
          <a className="text-accent underline" href={`mailto:${SITE_EMAIL}`} dir="ltr">
            {SITE_EMAIL}
          </a>
          {t(" or use the contact page.", " أو استخدم صفحة اتصل بنا.")}
        </p>
      </InfoCard>
    </StaticPageShell>
  );
}
