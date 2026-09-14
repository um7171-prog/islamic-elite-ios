import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Repeat } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { BottomNav, type TabKey } from "@/components/islamic/BottomNav";
import { SEO } from "@/components/SEO";
import { FileConverter } from "@/components/islamic/EliteTools";

export default function FileConverterPage() {
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
        title="تحويل الملفات — صور إلى PDF، دمج وضغط PDF، وتحويل الصيغ"
        description="حوّل ملفاتك مباشرة على جهازك: صور إلى PDF، دمج وضغط ملفات PDF، Word إلى PDF، ونص إلى PDF، بالإضافة إلى تحويل الصور بين JPG وPNG وWEBP وSVG."
        path="/convert"
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
          <Repeat className="h-5 w-5" />
        </div>
        <span className="font-display text-sm font-bold leading-none">{t("Elite Islamic", "النخبة الإسلامية")}</span>
      </header>

      <section className="mb-6 animate-fade-in">
        <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
          🔁 {t("File Converter", "تحويل الملفات")}
        </h1>
        <p className="mt-2 text-[13px] text-foreground/70 leading-relaxed max-w-xl">
          {t(
            "Convert files right on your device — images to PDF, merge and compress PDFs, Word to PDF, and image format conversion.",
            "حوّل ملفاتك مباشرة على جهازك: صور إلى PDF، دمج وضغط ملفات PDF، Word إلى PDF، وتحويل صيغ الصور.",
          )}
        </p>
      </section>

      <section className="mb-8 max-w-xl">
        <FileConverter />
      </section>

      <BottomNav active="convert" onChange={handleTabChange} />
    </div>
  );
}
