import { HelpCircle } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell, InfoCard } from "@/components/site/StaticPageShell";

export default function Faq() {
  const { t } = useLocale();

  const faqs: { q: string; a: string }[] = [
    {
      q: t("Is TechSNDS free to use?", "هل استخدام TechSNDS مجاني؟"),
      a: t(
        "Yes, all tools on the platform are completely free and do not require an account or installation.",
        "نعم، جميع أدوات المنصة مجانية بالكامل ولا تحتاج إلى حساب أو تثبيت.",
      ),
    },
    {
      q: t("Do I need to create an account?", "هل أحتاج إلى إنشاء حساب؟"),
      a: t(
        "No. The tools work directly in the browser; accounts are only used for the admin dashboard.",
        "لا، تعمل الأدوات مباشرة في المتصفح، ويُستخدم الحساب فقط للدخول إلى لوحة التحكم.",
      ),
    },
    {
      q: t("How accurate are the prayer times and the Qibla?", "ما مدى دقة مواقيت الصلاة والقبلة؟"),
      a: t(
        "They are calculated from your location and the selected method. Accuracy depends on GPS and device sensors, so verify with your local mosque when needed.",
        "تُحسب من موقعك والطريقة المختارة، وتعتمد الدقة على تحديد الموقع وحساسات الجهاز، لذا تحقق من المسجد المحلي عند الحاجة.",
      ),
    },
    {
      q: t("Are my images and files uploaded to a server?", "هل تُرفع صوري وملفاتي إلى خادم؟"),
      a: t(
        "Most tools process files locally in your browser. Tools that need AI (translation and OCR) send the content for processing only and do not store it.",
        "معظم الأدوات تعالج الملفات محلياً داخل متصفحك، أما الأدوات التي تحتاج ذكاءً اصطناعياً (الترجمة واستخراج النصوص) فتُرسل المحتوى للمعالجة فقط دون تخزينه.",
      ),
    },
    {
      q: t("Can I use the app offline?", "هل يمكن استخدام التطبيق بدون إنترنت؟"),
      a: t(
        "You can install the app on your device, and several tools keep working offline. Features that need the internet (media, AI, weather) require a connection.",
        "يمكنك تثبيت التطبيق على جهازك، وتعمل عدة أدوات بدون إنترنت، أما الميزات التي تحتاج اتصالاً (الوسائط والذكاء الاصطناعي والطقس) فتتطلب إنترنت.",
      ),
    },
    {
      q: t("Why don't Athan notifications appear?", "لماذا لا تظهر تنبيهات الأذان؟"),
      a: t(
        "Make sure notifications are enabled for the site in your browser or system settings, and that the app is installed on your home screen for background alerts.",
        "تأكد من تفعيل الإشعارات للموقع في إعدادات المتصفح أو النظام، ومن تثبيت التطبيق على الشاشة الرئيسية لتصلك التنبيهات في الخلفية.",
      ),
    },
    {
      q: t("Are inheritance and Zakat results official?", "هل نتائج المواريث والزكاة رسمية؟"),
      a: t(
        "No, they are indicative for guidance only and should be verified with a qualified specialist.",
        "لا، النتائج استرشادية فقط ويجب التحقق منها مع مختص مؤهل.",
      ),
    },
    {
      q: t("How can I report a problem or suggest a feature?", "كيف أبلّغ عن مشكلة أو أقترح ميزة؟"),
      a: t(
        "Use the Contact Us page or email support@techsnds.com and we will reply as soon as possible.",
        "استخدم صفحة اتصل بنا أو راسلنا على support@techsnds.com وسنرد في أقرب وقت.",
      ),
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: "https://www.techsnds.com/faq",
    inLanguage: ["ar", "en"],
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <StaticPageShell
      title={t("FAQ | TechSNDS", "الأسئلة الشائعة | TechSNDS")}
      description={t(
        "Answers to the most common questions about TechSNDS tools: pricing, privacy, prayer times accuracy, notifications and offline use.",
        "إجابات لأكثر الأسئلة شيوعاً حول أدوات TechSNDS: التكلفة والخصوصية ودقة المواقيت والإشعارات والعمل بدون إنترنت.",
      )}
      path="/faq"
      heading={t("Frequently Asked Questions", "الأسئلة الشائعة")}
      intro={t(
        "Quick answers about how the platform works, privacy, accuracy and support.",
        "إجابات سريعة حول طريقة عمل المنصة والخصوصية والدقة والدعم.",
      )}
      jsonLd={jsonLd}
    >
      {faqs.map((f) => (
        <InfoCard key={f.q} icon={HelpCircle} title={f.q}>
          <p>{f.a}</p>
        </InfoCard>
      ))}
    </StaticPageShell>
  );
}
