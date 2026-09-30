import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BookText, Copy, Share2, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useLocale } from "@/contexts/LocaleContext";
import { toArabicDigits } from "@/lib/mushaf";
import { getPage, QURAN_SOURCE, type QuranAyah } from "@/lib/quran";
import { cn } from "@/lib/utils";
import { ayahBody, ayahRangeShareText, surahNameAr, surahNameEn, tafsirSegments } from "@/components/quran-reading/ayahDisplay";
import { QURAN_READING_FONT } from "@/components/quran-reading/readingPrefs";
import { isSelected, selectAyah, selectedAyahs, selectionLabel, type AyahSelection } from "./ayahSelection";

export type AyahSheetView = "list" | "pageTafsir";

interface Props {
  /** The Mushaf page whose ayahs are listed; null = closed. */
  page: number | null;
  /** "pageTafsir" opens straight on the whole page's tafsir. */
  initialView?: AyahSheetView;
  night: boolean;
  onClose: () => void;
  /** Recite the selection, from its first ayah to its last, with the Mushaf's player. */
  onListen?: (from: { surah: number; ayah: number }, to: { surah: number; ayah: number }) => void;
}

const quranFont = { fontFamily: QURAN_READING_FONT.family, fontWeight: QURAN_READING_FONT.weight, letterSpacing: QURAN_READING_FONT.letterSpacing };

/**
 * The ayahs of a Mushaf page, to select one or a range and act on it (tafsir, listen, copy,
 * share). Everything shown — ayah text, numbers, surah, page, tafsir — comes from the app's local
 * KFGQPC data (Hafs text + Al-Muyassar, see src/lib/quran), mapped to this page through the same
 * verified PAGE_START table as the Mushaf and its audio. Nothing is read from the page image.
 */
export function MushafAyahSheet({ page, initialView = "list", night, onClose, onListen }: Props) {
  const { t, lang } = useLocale();
  const [ayahs, setAyahs] = useState<QuranAyah[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<AyahSelection | null>(null);
  const [tafsir, setTafsir] = useState<"selection" | "page" | null>(null);

  useEffect(() => {
    if (page === null) return;
    let alive = true;
    setAyahs(null);
    setFailed(false);
    setSel(null);
    setTafsir(initialView === "pageTafsir" ? "page" : null);
    getPage(page)
      .then((list) => {
        if (!alive) return;
        setAyahs(list);
        setFailed(list.length === 0);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [page, initialView]);

  const chosen = useMemo(() => (ayahs ? selectedAyahs(sel, ayahs) : []), [ayahs, sel]);
  const label = sel ? selectionLabel(sel, lang === "ar" ? "ar" : "en") : "";
  const shown = tafsir === "page" ? ayahs ?? [] : chosen;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ayahRangeShareText(chosen));
      toast.success(t("Ayahs copied", "نُسخت الآيات"));
    } catch {
      toast.error(t("Couldn't copy", "تعذّر النسخ"));
    }
  };
  const share = async () => {
    const text = ayahRangeShareText(chosen);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success(t("Ayahs copied", "نُسخت الآيات"));
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error(t("Couldn't share", "تعذّرت المشاركة"));
    }
  };
  const listen = () => {
    if (!sel || !onListen) return;
    onListen({ surah: sel.surah, ayah: sel.from }, { surah: sel.surah, ayah: sel.to });
  };

  const actions: { id: string; Icon: LucideIcon; label: string; run: () => void; disabled?: boolean }[] = [
    { id: "tafsir", Icon: BookText, label: t("Tafsir", "التفسير"), run: () => setTafsir("selection") },
    { id: "listen", Icon: Volume2, label: t("Listen to ayahs", "استماع"), run: listen, disabled: !onListen },
    { id: "copy", Icon: Copy, label: t("Copy ayahs", "نسخ"), run: () => void copy() },
    { id: "share", Icon: Share2, label: t("Share ayahs", "مشاركة"), run: () => void share() },
    { id: "clear", Icon: X, label: t("Clear", "مسح"), run: () => setSel(null) },
  ];

  return (
    <Sheet open={page !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        dir="rtl"
        data-testid="mushaf-ayah-sheet"
        className={cn("flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-t-3xl p-0", night && "bg-[#11161c] text-[#ece5d3]")}
      >
        <div className="shrink-0 px-5 pb-3 pt-5 pe-14">
          <SheetTitle className="font-arabic text-h3" data-testid="mushaf-ayah-sheet-title">
            {tafsir === "page"
              ? t(`Tafsir of page ${page}`, `تفسير الصفحة ${toArabicDigits(page ?? 0)}`)
              : tafsir === "selection"
                ? t(`Tafsir: ${label}`, `تفسير ${label}`)
                : t(`Ayahs of page ${page}`, `آيات الصفحة ${toArabicDigits(page ?? 0)}`)}
          </SheetTitle>
          <SheetDescription className="text-body-sm opacity-70">
            {tafsir ? QURAN_SOURCE.tafsir.nameAr : t("Tap an ayah, then another to select a range.", "اضغط آية، ثم آية أخرى لتحديد نطاق.")}
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {failed ? (
            <p className="py-10 text-center text-body-sm opacity-60">{t("Couldn't load the ayahs", "تعذّر تحميل الآيات")}</p>
          ) : !ayahs ? (
            <p className="py-10 text-center text-body-sm opacity-60">{t("Loading the ayahs…", "جارٍ تحميل الآيات…")}</p>
          ) : tafsir ? (
            <div className="space-y-5" data-testid="mushaf-tafsir">
              <button type="button" onClick={() => setTafsir(null)} data-testid="mushaf-tafsir-back" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-4 text-body-sm font-semibold">
                <ArrowRight className="h-4 w-4" />
                {t("Back to the ayahs", "العودة إلى الآيات")}
              </button>
              {shown.map((a) => (
                <article key={a.key} data-tafsir-ayah={a.key} className="space-y-2">
                  <p data-quran-text className="rounded-2xl bg-foreground/[0.04] p-3" style={{ ...quranFont, fontSize: 21, lineHeight: QURAN_READING_FONT.lineHeight, overflowWrap: "break-word" }}>
                    {ayahBody(a)} <span className="text-body-sm opacity-60">({toArabicDigits(a.ayah)})</span>
                  </p>
                  <p className="text-body leading-loose" style={{ overflowWrap: "break-word" }} data-testid="mushaf-tafsir-text">
                    {tafsirSegments(a.tafsir.text).map((s, i) =>
                      s.kind === "quran" ? (
                        <span key={i} data-quran-text style={quranFont}>{s.text}</span>
                      ) : (
                        <span key={i}>{s.text}</span>
                      ),
                    )}
                  </p>
                </article>
              ))}
              <p className="text-caption opacity-60" data-testid="mushaf-tafsir-source">
                {t("Source: ", "المصدر: ")}{QURAN_SOURCE.tafsir.nameAr} — {QURAN_SOURCE.tafsir.publisher}
              </p>
            </div>
          ) : (
            <ul className="space-y-2" data-testid="mushaf-ayah-list">
              {ayahs.map((a, i) => {
                const on = isSelected(sel, a);
                return (
                  <li key={a.key}>
                    {(i === 0 || ayahs[i - 1].surah !== a.surah) && (
                      <p className="mb-1 mt-3 text-caption font-bold opacity-60">{t(`Surah ${surahNameEn(a.surah)}`, `سورة ${surahNameAr(a.surah)}`)}</p>
                    )}
                    <button
                      type="button"
                      data-ayah={a.key}
                      aria-pressed={on}
                      onClick={() => setSel((s) => selectAyah(s, a))}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border p-3 text-start transition active:scale-[0.99]",
                        on ? "border-accent bg-accent/15" : "border-transparent bg-foreground/[0.04]",
                      )}
                    >
                      <span className="mt-1 grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-accent/15 px-1 text-caption font-bold text-accent">
                        {toArabicDigits(a.ayah)}
                      </span>
                      <span data-quran-text className="min-w-0 flex-1" style={{ ...quranFont, fontSize: 21, lineHeight: QURAN_READING_FONT.lineHeight, overflowWrap: "break-word" }}>
                        {ayahBody(a)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {ayahs && !failed && !tafsir && (
          <div className="shrink-0 border-t border-foreground/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="mushaf-ayah-actions">
            {sel ? (
              <>
                <p className="mb-2 text-center text-body-sm">
                  <span className="opacity-70">{t("Selected:", "المحدد:")}</span>{" "}
                  <strong className="font-arabic" data-testid="mushaf-ayah-selection">{label}</strong>
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {actions.map(({ id, Icon, label: text, run, disabled }) => (
                    <button
                      key={id}
                      type="button"
                      data-action={id}
                      disabled={disabled}
                      onClick={run}
                      className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-foreground/[0.06] text-caption font-semibold transition active:scale-95 disabled:opacity-40"
                    >
                      <Icon className="h-5 w-5" />
                      <span className="max-w-full truncate px-0.5">{text}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setTafsir("page")}
                data-testid="mushaf-page-tafsir"
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-foreground/[0.06] text-body-sm font-semibold"
              >
                <BookText className="h-4 w-4" />
                {t("Tafsir of the whole page", "تفسير الصفحة كاملة")}
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
