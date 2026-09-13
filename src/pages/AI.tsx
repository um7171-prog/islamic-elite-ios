import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Eraser, Sparkles, ScanText, Bot } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { BottomNav, type TabKey } from "@/components/islamic/BottomNav";
import { SEO } from "@/components/SEO";


type ToolKey = "bg" | "enhance" | "ocr";

interface AiTool {
  key: ToolKey;
  en: string;
  ar: string;
  descEn: string;
  descAr: string;
  Icon: React.ElementType;
  gradient: string;
  path: string;
}

// Add new entries here — the grid and dialogs scale automatically.
const TOOLS: AiTool[] = [
  {
    key: "bg",
    en: "AI Background Remover",
    ar: "إزالة خلفية الصور",
    descEn: "Remove the background from any photo and export a transparent PNG.",
    descAr: "احذف الخلفية من أي صورة واحصل على صورة PNG بخلفية شفافة.",
    Icon: Eraser,
    path: "/ai/background-remover",
    gradient: "linear-gradient(135deg, hsl(280 55% 42%), hsl(255 65% 58%))",
  },
  {
    key: "enhance",
    en: "AI Image Enhancer",
    ar: "تحسين جودة الصور",
    descEn: "Sharpen details, upscale resolution and rebalance colors.",
    descAr: "زيادة الوضوح ورفع الدقة وتحسين الألوان بضغطة واحدة.",
    Icon: Sparkles,
    path: "/ai/image-enhancer",
    gradient: "linear-gradient(135deg, hsl(42 85% 52%), hsl(28 88% 60%))",
  },
  {
    key: "ocr",
    en: "OCR Text Extraction",
    ar: "استخراج النص من الصور",
    descEn: "Pull Arabic and English text out of any image or screenshot.",
    descAr: "استخرج النصوص العربية والإنجليزية من أي صورة أو لقطة شاشة.",
    Icon: ScanText,
    path: "/ai/ocr",
    gradient: "linear-gradient(135deg, hsl(180 65% 38%), hsl(200 72% 52%))",
  },
];

export default function AI() {
  const { t, dir, lang } = useLocale();
  const navigate = useNavigate();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  const handleTabChange = (next: TabKey) => {
    navigate(next === "home" ? "/" : `/${next}`);
  };

  return (
    <div
      dir={dir}
      className="w-full max-w-6xl min-w-0 overflow-x-hidden px-4 md:px-8 mx-auto"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)",
      }}
    >
      <SEO
        title="الذكاء — أدوات الذكاء الاصطناعي للصور والنصوص"
        description="أدوات ذكية بالذكاء الاصطناعي: إزالة خلفية الصور، تحسين جودة الصور، واستخراج النص من الصور OCR بالعربية والإنجليزية."
        path="/ai"
        lang={lang === "ar" ? "ar" : "en"}
      />

      <header className="flex items-center gap-2 mb-4">
        <button
          onClick={() => navigate("/")}
          aria-label={t("Back", "رجوع")}
          className="h-9 w-9 rounded-xl glass grid place-items-center transition hover:scale-105"
        >
          <BackIcon className="h-4 w-4 text-accent" />
        </button>
        <div
          className="h-9 w-9 rounded-xl grid place-items-center text-accent-foreground"
          style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
        >
          <Bot className="h-5 w-5" />
        </div>
        <span className="font-display text-sm font-bold leading-none">{t("Elite Islamic", "النخبة الإسلامية")}</span>
      </header>

      <section className="mb-6 animate-fade-in">
        <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
          🤖 {t("AI", "الذكاء")}
        </h1>
        <p className="mt-2 text-[13px] text-foreground/70 leading-relaxed max-w-xl">
          {t(
            "Smart tools that help you get things done fast with artificial intelligence.",
            "أدوات ذكية تساعدك على إنجاز مهامك بسرعة باستخدام الذكاء الاصطناعي.",
          )}
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {TOOLS.map((tool) => (
          <article
            key={tool.key}
            className="glass rounded-2xl p-4 border border-foreground/10 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-start gap-3">
              <span
                className="h-11 w-11 shrink-0 rounded-xl grid place-items-center text-accent-foreground shadow-md"
                style={{ background: tool.gradient }}
              >
                <tool.Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-sm font-bold leading-snug text-foreground">
                  {t(tool.en, tool.ar)}
                </h2>
                <p className="mt-1 text-[12px] text-foreground/65 leading-relaxed">
                  {t(tool.descEn, tool.descAr)}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(tool.path)}
              className="mt-4 w-full h-12 rounded-xl text-xs font-bold text-accent-foreground transition active:scale-[0.98]"
              style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
            >
              {t("Start", "ابدأ")}
            </button>
          </article>
        ))}
      </section>

      <BottomNav active="other" onChange={handleTabChange} />
    </div>
  );
}
