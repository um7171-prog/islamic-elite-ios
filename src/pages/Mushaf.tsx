import { MushafReader } from "@/components/mushaf/MushafReader";
import { SEO } from "@/components/SEO";
import { useLocale } from "@/contexts/LocaleContext";

const Mushaf = () => {
  const { lang, t } = useLocale();
  return (
    <>
      <SEO
        title={t("The Holy Mushaf — High-Resolution Quran Reader", "المصحف الشريف — قارئ القرآن الكريم بالصور عالية الدقة")}
        description={t(
          "Read the complete Mushaf (604 pages) in high quality with professional zoom, a surah/juz index, bookmarks, translation, tafsir, and recitation audio from popular reciters.",
          "اقرأ المصحف الشريف كاملاً (٦٠٤ صفحات) بجودة عالية مع تكبير احترافي، فهرس السور والأجزاء، العلامات المرجعية، الترجمة، التفسير، والتلاوة الصوتية لأشهر القراء.",
        )}
        path="/mushaf"
        lang={lang}
      />
      <h1 className="sr-only">{t("The Holy Mushaf — Quran Reader", "المصحف الشريف — قارئ القرآن الكريم")}</h1>
      <MushafReader />
    </>
  );
};

export default Mushaf;
