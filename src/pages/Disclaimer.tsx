import { AlertTriangle, Compass, Calculator, Bot, LinkIcon } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell, InfoCard, Bullets } from "@/components/site/StaticPageShell";

export default function Disclaimer() {
  const { t } = useLocale();
  const updated = "2026-08-01";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("Disclaimer", "إخلاء المسؤولية"),
    url: "https://www.techsnds.com/disclaimer",
    inLanguage: ["ar", "en"],
    dateModified: updated,
    publisher: { "@type": "Organization", name: "TechSNDS", url: "https://www.techsnds.com/" },
  };

  return (
    <StaticPageShell
      title={t("Disclaimer | TechSNDS", "إخلاء المسؤولية | TechSNDS")}
      description={t(
        "TechSNDS tools are provided for guidance only. Read the limits of accuracy for prayer times, Qibla, calculators, AI results and external links.",
        "أدوات TechSNDS تُقدَّم للاسترشاد فقط. تعرّف على حدود الدقة في مواقيت الصلاة والقبلة والحاسبات ونتائج الذكاء الاصطناعي والروابط الخارجية.",
      )}
      path="/disclaimer"
      heading={t("Disclaimer", "إخلاء المسؤولية")}
      intro={t(
        `Last updated: ${updated}. All content and tools on TechSNDS are provided "as is" for general guidance and do not replace official or specialist sources.`,
        `آخر تحديث: ${updated}. جميع المحتويات والأدوات في TechSNDS تُقدَّم "كما هي" للاسترشاد العام ولا تغني عن المصادر الرسمية أو المتخصصة.`,
      )}
      jsonLd={jsonLd}
    >
      <InfoCard icon={Compass} title={t("Prayer times and Qibla", "مواقيت الصلاة والقبلة")}>
        <p>
          {t(
            "Prayer times and the Qibla direction are calculated from your location, the selected method and device sensors. Accuracy may vary due to GPS, magnetic interference or method differences — always rely on your local mosque and official calendars for certainty.",
            "تُحسب مواقيت الصلاة واتجاه القبلة من موقعك والطريقة المختارة وحساسات الجهاز، وقد تتفاوت الدقة بسبب تحديد الموقع أو التشويش المغناطيسي أو اختلاف طرق الحساب. اعتمد دائماً على المسجد المحلي والتقاويم الرسمية عند الحاجة لليقين.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={Calculator} title={t("Calculators", "الحاسبات")}>
        <Bullets
          items={[
            t("Inheritance results are indicative and do not constitute a legal or Shariah ruling.", "نتائج المواريث استرشادية ولا تُعد فتوى أو حكماً قضائياً."),
            t("Zakat, salary and date converters may differ from official announcements.", "حاسبات الزكاة والرواتب ومحولات التاريخ قد تختلف عن الإعلانات الرسمية."),
            t("Verify sensitive financial or legal outcomes with a qualified specialist.", "تحقق من النتائج المالية أو القانونية الحساسة مع مختص مؤهل."),
          ]}
        />
      </InfoCard>

      <InfoCard icon={Bot} title={t("AI and media tools", "أدوات الذكاء والوسائط")}>
        <p>
          {t(
            "Translation, OCR, background removal and image enhancement rely on automated models that can produce inaccurate output. Media downloading tools must only be used with content you are legally entitled to download; you are responsible for respecting the rights of others.",
            "الترجمة واستخراج النصوص وإزالة الخلفية وتحسين الصور تعتمد على نماذج آلية قد تنتج مخرجات غير دقيقة. كما يجب استخدام أدوات تحميل الوسائط فقط مع محتوى يحق لك تنزيله قانونياً، وأنت المسؤول عن احترام حقوق الآخرين.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={LinkIcon} title={t("External links and third parties", "الروابط الخارجية والأطراف الثالثة")}>
        <p>
          {t(
            "Some features depend on third-party providers, and the site may link to external websites. We do not control their content or policies and are not responsible for them.",
            "تعتمد بعض الميزات على مزودين خارجيين، وقد يحتوي الموقع على روابط لمواقع أخرى لا نتحكم في محتواها أو سياساتها ولا نتحمل مسؤوليتها.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={AlertTriangle} title={t("Limitation of liability", "حدود المسؤولية")}>
        <p>
          {t(
            "We are not liable for any direct or indirect damage or loss resulting from using the site or relying on its results.",
            "لا نتحمل أي مسؤولية عن أضرار أو خسائر مباشرة أو غير مباشرة ناتجة عن استخدام الموقع أو الاعتماد على نتائجه.",
          )}
        </p>
      </InfoCard>
    </StaticPageShell>
  );
}
