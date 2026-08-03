import { Sparkles } from "lucide-react";
import { AiToolPage } from "@/components/ai/AiToolPage";
import { ImageToolStudio } from "@/components/ai/ImageToolStudio";
import { enhanceImage } from "@/lib/aiImage";
import { useLocale } from "@/contexts/LocaleContext";
import { SEO } from "@/components/SEO";

const GRADIENT = "linear-gradient(135deg, hsl(42 85% 52%), hsl(28 88% 60%))";

export default function ImageEnhancerPage() {
  const { t, lang } = useLocale();
  return (
    <AiToolPage
      title={t("AI Image Enhancer", "تحسين جودة الصور")}
      subtitle={t("Sharper details and richer colors", "وضوح أعلى وألوان أفضل")}
      Icon={Sparkles}
      gradient={GRADIENT}
    >
      <SEO
        title="تحسين جودة الصور بالذكاء الاصطناعي"
        description="ارفع دقة صورك وحسّن وضوحها وألوانها مباشرة على جهازك، مع مقارنة قبل/بعد وحفظ بصيغة PNG أو JPG."
        path="/ai/image-enhancer"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <ImageToolStudio
        fileBase="enhanced"
        run={enhanceImage}
        hint={t(
          "Sharpen, upscale and rebalance colors — all processed on your device.",
          "زيادة الوضوح ورفع الدقة وتحسين الألوان — تتم المعالجة على جهازك.",
        )}
      />
    </AiToolPage>
  );
}
