import { FileText, Ban, AlertTriangle, Copyright, RefreshCw, Scale } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell, InfoCard, Bullets } from "@/components/site/StaticPageShell";

export default function Terms() {
  const { t } = useLocale();
  const updated = "2026-08-01";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("Terms of Use", "شروط الاستخدام"),
    url: "https://www.techsnds.com/terms",
    inLanguage: ["ar", "en"],
    dateModified: updated,
    publisher: { "@type": "Organization", name: "TechSNDS", url: "https://www.techsnds.com/" },
  };

  return (
    <StaticPageShell
      title={t("Terms of Use | TechSNDS", "شروط الاستخدام | النخبة الإسلامية TechSNDS")}
      description={t(
        "The terms governing the use of TechSNDS tools: acceptable use, disclaimer of results, intellectual property and applicable law.",
        "الشروط التي تحكم استخدام أدوات TechSNDS: الاستخدام المقبول، إخلاء المسؤولية عن النتائج، الملكية الفكرية، والقانون المعمول به.",
      )}
      path="/terms"
      heading={t("Terms of Use", "شروط الاستخدام")}
      intro={t(
        `Last updated: ${updated}. By using the site or any of its tools you agree to these terms.`,
        `آخر تحديث: ${updated}. باستخدامك الموقع أو أي من أدواته فإنك توافق على هذه الشروط.`,
      )}
      jsonLd={jsonLd}
    >
      <InfoCard icon={FileText} title={t("Using the tools", "شروط استخدام الأدوات")}>
        <Bullets
          items={[
            t("All tools are provided free of charge for personal and lawful use.", "جميع الأدوات مقدَّمة مجاناً للاستخدام الشخصي والمشروع."),
            t("You must be legally entitled to process any content you upload or download.", "يجب أن تكون مخوّلاً قانونياً بمعالجة أي محتوى ترفعه أو تنزّله."),
            t("Automated or excessive requests that harm service stability are not allowed.", "لا يُسمح بالطلبات الآلية أو المفرطة التي تضر باستقرار الخدمة."),
            t("Service availability may vary and some tools depend on third-party providers.", "قد تتفاوت إتاحة الخدمة، وتعتمد بعض الأدوات على مزودين خارجيين."),
          ]}
        />
      </InfoCard>

      <InfoCard icon={Ban} title={t("No misuse of the services", "عدم إساءة استخدام الخدمات")}>
        <Bullets
          items={[
            t("Do not use the tools for illegal, harmful or offensive content.", "لا تستخدم الأدوات في محتوى غير قانوني أو ضار أو مسيء."),
            t("Do not infringe copyrights or download protected media without permission.", "لا تنتهك حقوق النشر ولا تنزّل وسائط محمية دون إذن."),
            t("Do not attempt to breach, reverse engineer or overload the platform.", "لا تحاول اختراق المنصة أو الهندسة العكسية أو إثقالها بالطلبات."),
            t("We may restrict access to anyone violating these terms.", "يحق لنا تقييد الوصول لأي شخص يخالف هذه الشروط."),
          ]}
        />
      </InfoCard>

      <InfoCard icon={AlertTriangle} title={t("Disclaimer of results", "إخلاء المسؤولية عن النتائج")}>
        <p>
          {t(
            "All tools — including prayer times, Qibla, inheritance and financial calculators, translation, OCR and AI image tools — are provided \"as is\" for guidance only. Results may contain errors, and you should verify critical outcomes with official or specialist sources. We are not liable for any direct or indirect damages resulting from relying on the results.",
            "جميع الأدوات — بما فيها مواقيت الصلاة والقبلة وحاسبات المواريث والحاسبات المالية والترجمة واستخراج النصوص وأدوات الصور بالذكاء الاصطناعي — تُقدَّم \"كما هي\" للاسترشاد فقط. قد تحتوي النتائج على أخطاء، وعليك التحقق من النتائج الحسّاسة من المصادر الرسمية أو المتخصصة. ولا نتحمل أي مسؤولية عن أضرار مباشرة أو غير مباشرة ناتجة عن الاعتماد على النتائج.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={Copyright} title={t("Intellectual property", "حقوق الملكية الفكرية")}>
        <p>
          {t(
            "The name TechSNDS, the design, the interface, the code and the original content of the platform are owned by us and protected by law. You may not copy, resell or redistribute them without written permission. Content you upload remains yours, and you grant us only the limited permission needed to process it and deliver the result.",
            "اسم TechSNDS والتصميم والواجهة والشيفرة والمحتوى الأصلي للمنصة مملوكة لنا ومحمية بالقانون، ولا يجوز نسخها أو إعادة بيعها أو توزيعها دون إذن كتابي. أما المحتوى الذي ترفعه فيبقى ملكاً لك، وتمنحنا فقط الإذن المحدود اللازم لمعالجته وتسليم النتيجة.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={RefreshCw} title={t("Changes to services and terms", "تعديل الخدمات والشروط")}>
        <p>
          {t(
            "We may add, modify or discontinue any tool, and update these terms at any time. The updated date at the top of this page always reflects the latest version, and continuing to use the site means you accept the changes.",
            "يجوز لنا إضافة أي أداة أو تعديلها أو إيقافها، وتحديث هذه الشروط في أي وقت. ويعكس تاريخ التحديث أعلى الصفحة أحدث نسخة، واستمرارك في استخدام الموقع يعني موافقتك على التغييرات.",
          )}
        </p>
      </InfoCard>

      <InfoCard icon={Scale} title={t("Applicable law", "القانون المعمول به")}>
        <p>
          {t(
            "These terms are governed by the laws and regulations of the Kingdom of Saudi Arabia, and the competent Saudi courts have jurisdiction over any dispute.",
            "تخضع هذه الشروط لأنظمة ولوائح المملكة العربية السعودية، وتختص الجهات القضائية السعودية بالنظر في أي نزاع ينشأ عنها.",
          )}
        </p>
      </InfoCard>
    </StaticPageShell>
  );
}
