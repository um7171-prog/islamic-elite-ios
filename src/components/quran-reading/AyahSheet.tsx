import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useLocale } from "@/contexts/LocaleContext";
import { toArabicDigits } from "@/lib/mushaf";
import { QURAN_SOURCE, type QuranAyah } from "@/lib/quran";
import { cn } from "@/lib/utils";
import { AYAH_ACTIONS, type AyahAction } from "./ayahActions";
import { ayahBody, surahNameAr, tafsirSegments } from "./ayahDisplay";
import { QURAN_READING_FONT } from "./readingPrefs";

/** The selected ayah: its text, place, actions and its own tafsir (Al-Muyassar, from the ayah itself). */
export function AyahSheet({ ayah, night, onClose, actions = AYAH_ACTIONS }: { ayah: QuranAyah | null; night: boolean; onClose: () => void; actions?: AyahAction[] }) {
  const { t } = useLocale();
  return (
    <Sheet open={ayah !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        dir="rtl"
        data-testid="ayah-sheet"
        className={cn("max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-3xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6", night && "bg-[#11161c] text-[#ece5d3]")}
      >
        {ayah && (
          <div className="min-w-0 space-y-4">
            <div className="pe-12">
              <SheetTitle className="font-arabic text-h3" data-testid="ayah-sheet-title">
                سورة {surahNameAr(ayah.surah)} · الآية {toArabicDigits(ayah.ayah)}
              </SheetTitle>
              <SheetDescription className="text-body-sm opacity-70">
                {t(`Page ${ayah.mushafPage} · Juz ${ayah.juz}`, `صفحة ${toArabicDigits(ayah.mushafPage)} · الجزء ${toArabicDigits(ayah.juz)}`)}
              </SheetDescription>
            </div>

            <p
              data-testid="ayah-sheet-text"
              data-quran-text
              className="rounded-2xl bg-foreground/[0.04] p-4"
              style={{ fontFamily: QURAN_READING_FONT.family, fontWeight: QURAN_READING_FONT.weight, fontSize: 26, lineHeight: QURAN_READING_FONT.lineHeight, letterSpacing: QURAN_READING_FONT.letterSpacing, overflowWrap: "break-word", textAlign: "justify" }}
            >
              {ayahBody(ayah)}
            </p>

            <div className="grid grid-cols-4 gap-2" data-testid="ayah-actions">
              {actions.map(({ id, Icon, label, run }) => (
                <button
                  key={id}
                  type="button"
                  data-action={id}
                  disabled={!run}
                  onClick={() => run && void run(ayah, t)}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-foreground/[0.05] text-body-sm font-semibold transition active:scale-95 disabled:opacity-45"
                >
                  <Icon className="h-5 w-5" />
                  <span>{t(label.en, label.ar)}</span>
                  {!run && <span className="text-caption font-normal opacity-70">{t("Soon", "قريبًا")}</span>}
                </button>
              ))}
            </div>

            <section data-testid="ayah-tafsir">
              <h3 className="mb-2 font-arabic text-body-lg font-bold">{QURAN_SOURCE.tafsir.nameAr}</h3>
              <p className="text-body leading-loose" style={{ overflowWrap: "break-word" }}>
                {tafsirSegments(ayah.tafsir.text).map((s, i) =>
                  s.kind === "quran" ? (
                    <span key={i} data-quran-text style={{ fontFamily: QURAN_READING_FONT.family, fontWeight: QURAN_READING_FONT.weight, letterSpacing: QURAN_READING_FONT.letterSpacing }}>{s.text}</span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </p>
              <p className="mt-3 text-caption opacity-60">{t("Source: ", "المصدر: ")}{QURAN_SOURCE.tafsir.publisher}</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
