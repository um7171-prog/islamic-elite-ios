import { ScanText } from "lucide-react";
import { AiToolPage } from "@/components/ai/AiToolPage";
import { OcrTool } from "@/components/ai/OcrTool";
import { useLocale } from "@/contexts/LocaleContext";
import { SEO } from "@/components/SEO";

const GRADIENT = "linear-gradient(135deg, hsl(180 65% 38%), hsl(200 72% 52%))";

export default function OcrPage() {
  const { t, lang } = useLocale();
  return (
    <AiToolPage
      title={t("OCR Text Extraction", "استخراج النص من الصور")}
      subtitle={t("Arabic and English", "يدعم العربية والإنجليزية")}
      Icon={ScanText}
      gradient={GRADIENT}
    >
      <SEO
        title="استخراج النص من الصور OCR بالعربية والإنجليزية"
        description="استخرج النصوص العربية والإنجليزية من أي صورة أو لقطة شاشة بدقة عالية باستخدام الذكاء الاصطناعي."
        path="/ai/ocr"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <OcrTool />
    </AiToolPage>
  );
}
