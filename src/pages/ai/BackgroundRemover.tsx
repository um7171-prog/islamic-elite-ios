import { Eraser } from "lucide-react";
import { AiToolPage } from "@/components/ai/AiToolPage";
import { ImageToolStudio } from "@/components/ai/ImageToolStudio";
import { removeBackgroundHQ } from "@/lib/aiImage";
import { useLocale } from "@/contexts/LocaleContext";
import { SEO } from "@/components/SEO";

const GRADIENT = "linear-gradient(135deg, hsl(280 55% 42%), hsl(255 65% 58%))";

export default function BackgroundRemoverPage() {
  const { t, lang } = useLocale();
  return (
    <AiToolPage
      title={t("AI Background Remover", "إزالة خلفية الصور")}
      subtitle={t("Transparent PNG in seconds", "صورة PNG بخلفية شفافة خلال ثوانٍ")}
      Icon={Eraser}
      gradient={GRADIENT}
    >
      <SEO
        title="إزالة خلفية الصور بالذكاء الاصطناعي"
        description="أداة احترافية لإزالة خلفية الصور بدقة عالية مع الحفاظ على تفاصيل الشعر والحواف، وتصدير PNG شفاف أو JPG."
        path="/ai/background-remover"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <ImageToolStudio
        fileBase="background-removed"
        transparent
        run={removeBackgroundHQ}
        hint={t(
          "High-precision AI matting that preserves hair, fingers and soft edges. The first run downloads the AI model.",
          "قص دقيق بالذكاء الاصطناعي يحافظ على الشعر والأصابع والحواف الشفافة. التشغيل الأول يحمّل نموذج الذكاء الاصطناعي.",
        )}
      />
    </AiToolPage>
  );
}
