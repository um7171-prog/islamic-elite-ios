import { MushafReader } from "@/components/mushaf/MushafReader";
import { SEO } from "@/components/SEO";

const Mushaf = () => (
  <>
    <SEO
      title="المصحف الشريف — قارئ القرآن الكريم بالصور عالية الدقة"
      description="اقرأ المصحف الشريف كاملاً (٦٠٤ صفحات) بجودة عالية مع تكبير احترافي، فهرس السور والأجزاء، العلامات المرجعية، الترجمة، التفسير، والتلاوة الصوتية لأشهر القراء."
      path="/mushaf"
      lang="ar"
    />
    <h1 className="sr-only">المصحف الشريف — قارئ القرآن الكريم</h1>
    <MushafReader />
  </>
);

export default Mushaf;
