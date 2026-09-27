import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { useGoBack } from "@/components/site/PageHeader";
import { useLocale } from "@/contexts/LocaleContext";
import { useTheme } from "@/contexts/ThemeContext";
import { savePosition } from "@/lib/mushaf";
import { getAyah, getSurah, QURAN_SOURCE, TOTAL_SURAHS, type QuranAyah, type QuranSurah } from "@/lib/quran";
import { pageOfAyah, type AyahRef } from "@/lib/quranAudio";
import { noteQuranReading } from "@/lib/journey/sources";
import { AyahSheet } from "@/components/quran-reading/AyahSheet";
import { ReadingToolbar } from "@/components/quran-reading/ReadingToolbar";
import { SurahText } from "@/components/quran-reading/SurahText";
import { ayahBody, surahNameAr } from "@/components/quran-reading/ayahDisplay";
import { mushafUrlForAyah, readingStart } from "@/components/quran-reading/position";
import { FONT_SIZE, clampFontSize, loadFontSize, saveFontSize } from "@/components/quran-reading/readingPrefs";

/**
 * «القراءة» (/mushaf/read): the Quran as real text that reflows inside the screen, next to the
 * 604-page image Mushaf (/mushaf), which is untouched. One surah is rendered at a time; the reading
 * position is the top-most visible ayah and is shared with the Mushaf (mushaf:position) and the
 * Journey through their existing functions.
 */
export default function QuranReading() {
  const { t, lang } = useLocale();
  const { theme } = useTheme();
  const night = theme === "night";
  const navigate = useNavigate();
  const goBack = useGoBack("/quran");
  const [params] = useSearchParams();
  // Keeps ?ayah= in the same "s:a" form the Mushaf button uses (replace: no history entry per scroll).
  const setAyahParam = useCallback((ref: AyahRef) => navigate(`/mushaf/read?ayah=${ref.surah}:${ref.ayah}`, { replace: true }), [navigate]);

  // Where reading starts: ?ayah=s:a, else the first ayah of the Mushaf's current page.
  const start = useMemo(() => readingStart(params.get("ayah")), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [anchor, setAnchor] = useState<AyahRef>(start);
  const [surahNo, setSurahNo] = useState(start.surah);
  const [surah, setSurah] = useState<QuranSurah | null>(null);
  const [failed, setFailed] = useState(false);
  const [basmala, setBasmala] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [selected, setSelected] = useState<QuranAyah | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTo = useRef<AyahRef | null>(start);
  const userScrolled = useRef(false);
  const lastPage = useRef<number | null>(null);

  /* ---------- data ---------- */
  useEffect(() => {
    let alive = true;
    setSurah(null);
    setFailed(false);
    getSurah(surahNo).then(
      (s) => { if (alive) { setSurah(s); setFailed(s === null); } },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [surahNo]);

  // The basmala shown above each surah is the source's own text of 1:1 (Al-Fatiha's first ayah).
  useEffect(() => {
    let alive = true;
    getAyah(1, 1).then((a) => { if (alive && a) setBasmala(ayahBody(a)); }, () => undefined);
    return () => { alive = false; };
  }, []);

  // Opening the reader counts as reading, through the Journey's existing Quran activity.
  useEffect(() => { noteQuranReading(pageOfAyah(start)); }, [start]);

  /* ---------- scrolling to an ayah ---------- */
  const scrollToAyah = useCallback((ref: AyahRef) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-ayah="${ref.surah}:${ref.ayah}"]`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
  }, []);

  useLayoutEffect(() => {
    if (!surah || !scrollTo.current || scrollTo.current.surah !== surah.surah) return;
    scrollToAyah(scrollTo.current);
    scrollTo.current = null;
  }, [surah, scrollToAyah]);

  // Keep the reading position on screen when the text size changes.
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  useLayoutEffect(() => {
    if (surah && anchorRef.current.surah === surah.surah) scrollToAyah(anchorRef.current);
  }, [fontSize]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- reading position = top-most visible ayah ---------- */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !surah) return;
    let timer: number | undefined;
    const markUser = () => { userScrolled.current = true; };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const spans = root.querySelectorAll<HTMLElement>("[data-ayah]");
        if (!spans.length) return;
        const top = root.getBoundingClientRect().top + 4;
        let lo = 0, hi = spans.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (spans[mid].getBoundingClientRect().bottom > top) hi = mid;
          else lo = mid + 1;
        }
        const [s, a] = (spans[lo].dataset.ayah ?? "").split(":").map(Number);
        if (!s || !a) return;
        setAnchor((cur) => (cur.surah === s && cur.ayah === a ? cur : { surah: s, ayah: a }));
        if (!userScrolled.current) return;
        setAyahParam({ surah: s, ayah: a });
        const page = pageOfAyah({ surah: s, ayah: a });
        if (page !== lastPage.current) {
          lastPage.current = page;
          savePosition(page);
          noteQuranReading(page);
        }
      }, 200);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("touchmove", markUser, { passive: true });
    root.addEventListener("wheel", markUser, { passive: true });
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("touchmove", markUser);
      root.removeEventListener("wheel", markUser);
    };
  }, [surah, setAyahParam]);

  /* ---------- actions ---------- */
  const changeFont = (delta: number) => {
    setFontSize((cur) => {
      const next = clampFontSize(cur + delta);
      saveFontSize(next);
      return next;
    });
  };

  const openSurah = (n: number) => {
    if (n < 1 || n > TOTAL_SURAHS) return;
    const ref = { surah: n, ayah: 1 };
    scrollTo.current = ref;
    setAnchor(ref);
    setSurahNo(n);
    setAyahParam(ref);
    scrollRef.current?.scrollTo?.({ top: 0 });
  };

  // Mode switch: the Mushaf page this ayah is printed on (replace: the two modes are one screen).
  const toMushaf = () => navigate(mushafUrlForAyah(anchor), { replace: true });

  const bg = night ? "#0b0f14" : "#f6f1e4";

  return (
    <div dir="rtl" data-testid="quran-reading" className="fixed inset-0 flex flex-col" style={{ background: bg }}>
      <SEO
        title={t("Quran — Reading mode", "القرآن الكريم — وضع القراءة")}
        description={t("Read the Quran as text that fits your screen, with Al-Muyassar tafsir.", "اقرأ القرآن نصًا يتكيّف مع شاشتك، مع التفسير الميسر.")}
        path="/mushaf/read"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <ReadingToolbar
        title={`سورة ${surahNameAr(surahNo)}`}
        fontSize={fontSize}
        onBack={goBack}
        onSmaller={() => changeFont(-FONT_SIZE.step)}
        onLarger={() => changeFont(FONT_SIZE.step)}
        onMushaf={toMushaf}
      />

      <div
        ref={scrollRef}
        data-testid="reading-scroll"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
      >
        <div className="mx-auto w-full min-w-0 max-w-2xl px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
          {failed ? (
            <p className="py-16 text-center text-body opacity-70" data-testid="reading-error">{t("Couldn't open this surah.", "تعذّر فتح السورة.")}</p>
          ) : !surah ? (
            <div className="grid place-items-center py-16 opacity-60" data-testid="reading-loading"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <>
              <SurahText
                surah={surah}
                basmala={surah.surah !== 1 && surah.surah !== 9 ? basmala : null}
                fontSize={fontSize}
                night={night}
                selectedKey={selected?.key ?? null}
                onSelectAyah={setSelected}
              />
              <nav className="mt-6 flex items-center justify-between gap-3" aria-label={t("Surahs", "السور")}>
                <button type="button" onClick={() => openSurah(surah.surah - 1)} disabled={surah.surah <= 1} data-testid="prev-surah" className="inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-body-sm font-semibold opacity-80 active:scale-95 disabled:opacity-30">
                  <ChevronRight className="h-4 w-4" />
                  {surah.surah > 1 ? `سورة ${surahNameAr(surah.surah - 1)}` : ""}
                </button>
                <button type="button" onClick={() => openSurah(surah.surah + 1)} disabled={surah.surah >= TOTAL_SURAHS} data-testid="next-surah" className="inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-body-sm font-semibold opacity-80 active:scale-95 disabled:opacity-30">
                  {surah.surah < TOTAL_SURAHS ? `سورة ${surahNameAr(surah.surah + 1)}` : ""}
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </nav>
              <p className="mt-6 text-center text-caption opacity-55" data-testid="reading-attribution">
                {t("Quran text and Al-Muyassar tafsir: ", "النص القرآني والتفسير الميسر: ")}{QURAN_SOURCE.tafsir.publisher}
              </p>
            </>
          )}
        </div>
      </div>

      <AyahSheet ayah={selected} night={night} onClose={() => setSelected(null)} />
    </div>
  );
}
