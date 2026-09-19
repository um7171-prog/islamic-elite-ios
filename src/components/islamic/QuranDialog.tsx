import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Bookmark, BookmarkCheck, Play, Pause, Share2, Languages, ChevronsDown, ChevronLeft, ChevronRight, BookText, Mic, Star, Download, Check } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useLocale } from "@/contexts/LocaleContext";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { RECITERS, type Reciter, getFavorites, toggleFavorite, sortByFavorites, getSelectedReciterId, setSelectedReciterId, getReciter, getPlayableUrl, cacheSurah, isCached, setMediaSession } from "@/lib/reciters";
import { toast } from "@/hooks/use-toast";

interface SurahMeta { number: number; name: string; englishName: string; englishNameTranslation: string; numberOfAyahs: number; revelationType: string; }
interface Ayah { number: number; text: string; numberInSurah: number; page?: number; juz?: number; }

const JUZ_AR = ["","الأول","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن","التاسع","العاشر","الحادي عشر","الثاني عشر","الثالث عشر","الرابع عشر","الخامس عشر","السادس عشر","السابع عشر","الثامن عشر","التاسع عشر","العشرون","الحادي والعشرون","الثاني والعشرون","الثالث والعشرون","الرابع والعشرون","الخامس والعشرون","السادس والعشرون","السابع والعشرون","الثامن والعشرون","التاسع والعشرون","الثلاثون"];

function toArabicDigits(n: number | string) {
  return String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

function pagePad(p: number) { return String(p).padStart(3, "0"); }

// Madinah Mushaf page image — King Fahd Complex pages mirrored on jsDelivr CDN
function pageImageUrl(p: number) {
  return `https://cdn.jsdelivr.net/gh/GovarJabbar/Quran-PNG@master/${pagePad(p)}.png`;
}
function pageImageFallback(p: number) {
  return `https://raw.githubusercontent.com/GovarJabbar/Quran-PNG/master/${pagePad(p)}.png`;
}

const BOOKMARK_KEY = "quran:bookmark";

export function QuranDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, dir, lang } = useLocale();
  const { isNight } = useTheme();
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SurahMeta | null>(null);
  const [ayat, setAyat] = useState<Ayah[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  // Keyed by surah number, then by numberInSurah — kept namespaced so an
  // ayah key from one surah can never collide with another surah's ayah
  // key (both spaces range 1..N and previously shared one flat map).
  const [translations, setTranslations] = useState<Record<number, Record<number, string>>>({});
  const [autoScroll, setAutoScroll] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const [bookmark, setBookmark] = useState<{ surah: number; ayah: number; name: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "null"); } catch { return null; }
  });

  /* theme tokens */
  const M = isNight;
  const mushafBg   = M ? "#0f2922" : "#E8EBD2";
  const barBg      = M ? "#0f2922" : "#DDE2C2";
  const mushafText = M ? "#e8d5a3" : "#0d3a1f";
  const strokeCol  = M ? "#c8b464" : "#3d6b3d";
  const textCol    = M ? "#c8b464" : "#1a4d2b";
  const cartStart  = M ? "#5a4a2a" : "#E8EBD2";
  const cartMid    = M ? "#7a6a3a" : "#E8EBD2";
  const rosette0   = M ? "#c8b464" : "#E8EBD2";
  const rosette1   = M ? "#a08a40" : "#cfd8b0";
  const rosette2   = M ? "#6b5c2e" : "#7a9b6e";

  const [surahsError, setSurahsError] = useState(false);

  const loadSurahs = () => {
    setSurahsError(false);
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(j => setSurahs(j.data || []))
      .catch(() => setSurahsError(true));
  };

  useEffect(() => {
    if (!open || surahs.length) return;
    loadSurahs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, surahs.length]);

  // Fetch surah ayat metadata (used for page list, translation, navigation)
  useEffect(() => {
    if (!active) return;
    setLoading(true); setAyat([]); setPageIndex(0);
    fetch(`https://api.alquran.cloud/v1/surah/${active.number}/quran-uthmani`)
      .then(r => r.json()).then(j => setAyat(j.data?.ayahs || [])).finally(() => setLoading(false));
  }, [active]);

  useEffect(() => {
    if (!active || !showTranslation || translations[active.number]) return;
    fetch(`https://api.alquran.cloud/v1/surah/${active.number}/en.sahih`)
      .then(r => r.json())
      .then(j => {
        const map: Record<number, string> = {};
        (j.data?.ayahs || []).forEach((a: any) => { map[a.numberInSurah] = a.text; });
        // Namespaced by surah so an ayah's numberInSurah key can never
        // collide with another surah's — each surah keeps its own map.
        setTranslations(prev => ({ ...prev, [active.number]: map }));
      }).catch(() => {});
  }, [active, showTranslation]);

  /* ---------- Reciter selection + favorites ---------- */
  const [reciterId, setReciterId] = useState<string>(() => getSelectedReciterId());
  const [favs, setFavs] = useState<string[]>(() => getFavorites());
  const [reciterPickerOpen, setReciterPickerOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [cachedNow, setCachedNow] = useState(false);
  const reciter = useMemo(() => getReciter(reciterId), [reciterId]);

  const pickReciter = (id: string) => {
    setReciterId(id); setSelectedReciterId(id); setReciterPickerOpen(false);
    // stop current audio so next play uses the new reciter
    audioRef.current?.pause(); audioRef.current = null; setPlaying(false);
  };
  const onToggleFav = (id: string) => setFavs(toggleFavorite(id));

  // Update cached-indicator when surah or reciter changes
  useEffect(() => {
    if (!active) { setCachedNow(false); return; }
    isCached(reciter, active.number).then(setCachedNow);
  }, [active, reciter]);

  const togglePlay = async () => {
    const a = audioRef.current;
    if (a && !a.paused) { a.pause(); setPlaying(false); return; }
    if (a && a.paused && a.currentTime > 0) {
      a.play().then(() => setPlaying(true)).catch(() => {}); return;
    }
    if (!active) return;
    try {
      const src = await getPlayableUrl(reciter, active.number);
      const audio = new Audio(src);
      audio.preload = "auto";
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => { setPlaying(false); toast({ title: "تعذّر تشغيل التلاوة" }); };
      audio.onplay = () => setPlaying(true);
      audio.onpause = () => setPlaying(false);
      setMediaSession({
        title: active.name, artist: reciter.name, album: "المصحف الشريف",
        onPlay: () => audio.play().catch(() => {}),
        onPause: () => audio.pause(),
      });
      await audio.play();
      setPlaying(true);
      // refresh cache indicator after the background cache completes
      setTimeout(() => isCached(reciter, active.number).then(setCachedNow), 1500);
    } catch {
      setPlaying(false);
      toast({ title: "تعذّر تشغيل التلاوة" });
    }
  };

  const downloadCurrentSurah = async () => {
    if (!active) return;
    setDownloadingId(active.number);
    const ok = await cacheSurah(reciter, active.number);
    setDownloadingId(null);
    setCachedNow(ok);
    toast({ title: ok ? "تم حفظ السورة للاستماع دون إنترنت" : "تعذّر تحميل السورة" });
  };

  // Stop audio when surah changes
  useEffect(() => {
    return () => { audioRef.current?.pause(); audioRef.current = null; setPlaying(false); };
  }, [active]);

  const shareSurah = async () => {
    if (!active) return;
    const url = `https://quran.com/${active.number}`;
    const title = `${active.name} — ${active.englishName}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          toast({ title: "تعذّرت المشاركة" });
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "تم نسخ رابط السورة" });
      } catch {
        toast({ title: "تعذّر نسخ الرابط" });
      }
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return surahs;
    return surahs.filter(s => s.name.toLowerCase().includes(q) || s.englishName.toLowerCase().includes(q) || String(s.number) === q);
  }, [surahs, query]);

  // Unique pages spanned by this surah (in order)
  const pages = useMemo(() => {
    const set: number[] = [];
    for (const a of ayat) {
      if (a.page && !set.includes(a.page)) set.push(a.page);
    }
    return set;
  }, [ayat]);

  const currentPage = pages[pageIndex];
  const firstJuz = ayat[0]?.juz;

  const [textMode, setTextMode] = useState(false);

  // (Audio plays the full surah and is not interrupted by page navigation.)

  // Auto-scroll for text mode
  useEffect(() => {
    if (!autoScroll) {
      if (scrollTimerRef.current) { window.clearInterval(scrollTimerRef.current); scrollTimerRef.current = null; }
      return;
    }
    scrollTimerRef.current = window.setInterval(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>("[data-scrollable]") || scrollRef.current;
      if (!el) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { setAutoScroll(false); return; }
      el.scrollTop += 1;
    }, 50);
    return () => { if (scrollTimerRef.current) window.clearInterval(scrollTimerRef.current); };
  }, [autoScroll, textMode]);

  const saveBookmark = () => {
    if (!active) return;
    const bm = { surah: active.number, ayah: 1, name: active.name };
    setBookmark(bm); localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bm));
  };

  const openBookmark = () => {
    if (!bookmark) return;
    const s = surahs.find(x => x.number === bookmark.surah);
    if (s) setActive(s);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setActive(null); setTextMode(false); } }}>
      <DialogContent
        dir={dir}
        className={cn(
          active
            ? "max-w-full sm:max-w-3xl w-full h-[100svh] sm:h-[88vh] p-0 sm:p-0 rounded-none sm:rounded-xl gap-0 flex flex-col overflow-hidden"
            : "max-w-3xl"
        )}
      >
        {!active && (
          <DialogHeader>
            <DialogTitle className="text-elite-gold flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t("Holy Quran", "المصحف الشريف")}
            </DialogTitle>
          </DialogHeader>
        )}

        {!active ? (
          <>
            <div className="flex gap-2 items-center">
              <Input placeholder={t("Search surah…", "ابحث عن سورة…")} value={query} onChange={e => setQuery(e.target.value)} />
              {bookmark && (
                <Button size="sm" variant="outline" onClick={openBookmark} className="shrink-0">
                  <BookmarkCheck className="h-3 w-3 mr-1 text-emerald-500" />
                  {bookmark.name}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto">
              {filtered.map(s => (
                <button key={s.number} onClick={() => setActive(s)}
                  className="text-right rounded-xl bg-secondary/50 hover:bg-secondary px-3 py-2 transition flex items-center justify-between gap-2">
                  <span className="text-[10px] text-foreground/50 tabular-nums">{s.number}</span>
                  <span>
                    <div className="font-arabic text-base">{s.name}</div>
                    <div className="text-[10px] text-foreground/55">{s.englishName} · {s.numberOfAyahs}</div>
                  </span>
                </button>
              ))}
              {!surahs.length && (
                surahsError ? (
                  <div className="col-span-full flex flex-col items-center gap-2 text-center text-xs text-foreground/60 py-8">
                    <p>{t("Failed to load the surah list. Check your connection.", "تعذّر تحميل قائمة السور. تحقق من اتصالك بالإنترنت.")}</p>
                    <Button variant="secondary" size="sm" onClick={loadSurahs}>{t("Retry", "إعادة المحاولة")}</Button>
                  </div>
                ) : (
                  <div className="col-span-full text-center text-xs text-foreground/50 py-8"><Loader2 className="inline h-4 w-4 animate-spin" /> {t("Loading…", "جاري التحميل…")}</div>
                )
              )}
            </div>
          </>
        ) : (
          <div
            className="flex-1 flex flex-col overflow-hidden"
            style={{ background: mushafBg }}
          >
            {/* Header: surah cartouche + back */}
            <div className="border-b-2 border-double px-2 py-2 flex items-center gap-2" style={{ borderColor: isNight ? "rgba(200,180,100,0.35)" : "rgba(20,80,40,0.50)" }}>
              <Button variant="ghost" size="sm" className="h-8 px-2 shrink-0" style={{ color: textCol }} onClick={() => setActive(null)}>→ رجوع</Button>
              <div className="flex-1 flex items-center justify-center gap-1.5 font-arabic min-w-0" style={{ color: mushafText }}>
                <Cartouche label={`سُورَةُ ${active.name.replace(/^سورة\s*/, "")}`} {...{ cartStart, cartMid, strokeCol, textCol }} />
                <div className="relative shrink-0">
                  <svg viewBox="0 0 64 64" width="36" height="36">
                    <defs>
                      <radialGradient id="pgG" cx="35%" cy="35%" r="70%">
                        <stop offset="0%" stopColor={rosette0} />
                        <stop offset="60%" stopColor={rosette1} />
                        <stop offset="100%" stopColor={rosette2} />
                      </radialGradient>
                    </defs>
                    <circle cx="32" cy="32" r="30" fill="url(#pgG)" stroke={strokeCol} strokeWidth="1.5" />
                    <circle cx="32" cy="32" r="22" fill="none" stroke={strokeCol} strokeWidth="0.8" strokeDasharray="2 2" />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-[12px] font-bold tabular-nums" style={{ color: textCol }}>
                    {toArabicDigits(currentPage)}
                  </span>
                </div>
                {!!firstJuz && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap" style={{ borderColor: strokeCol, color: textCol }}>
                    الجزء {toArabicDigits(firstJuz)}
                  </span>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-8 px-2 shrink-0" style={{ color: textCol }} onClick={saveBookmark}>
                {bookmark?.surah === active.number ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              </Button>
            </div>

            {loading || !pages.length ? (
              <div className="flex-1 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin opacity-60" /></div>
            ) : (
              <>
                {/* Page viewer or continuous text */}
                <div ref={scrollRef} className="flex-1 overflow-hidden relative" style={{ background: mushafBg }}>
                  {textMode ? (
                    <ContinuousTextView ayat={ayat} surahNumber={active.number} translations={translations} showTranslation={showTranslation} isNight={isNight} mushafText={mushafText} />
                  ) : (
                    <PageImage page={currentPage} onDoubleTapToText={() => setTextMode(true)} />
                  )}
                </div>

                {/* Bottom action bar with inline page nav */}
                <div className="border-t-2 border-double px-1.5 py-1.5" style={{ background: barBg, borderColor: isNight ? "rgba(200,180,100,0.35)" : "rgba(20,80,40,0.40)" }}>
                  {/* page navigation row */}
                  {!textMode && (
                    <div className="flex items-center justify-between px-2 pb-1.5 mb-1.5 border-b" style={{ borderColor: isNight ? "rgba(200,180,100,0.2)" : "rgba(20,80,40,0.2)" }}>
                      <button onClick={() => setPageIndex(i => Math.min(pages.length - 1, i + 1))} disabled={pageIndex >= pages.length - 1}
                        className="flex items-center gap-1 text-xs font-arabic disabled:opacity-30 px-2 py-1" style={{ color: textCol }}>
                        <ChevronRight className="h-4 w-4" /> التالي
                      </button>
                      <span className="text-[11px] font-arabic tabular-nums" style={{ color: textCol }}>
                        صفحة {toArabicDigits(currentPage)} — {toArabicDigits(pageIndex + 1)}/{toArabicDigits(pages.length)}
                      </span>
                      <button onClick={() => setPageIndex(i => Math.max(0, i - 1))} disabled={pageIndex <= 0}
                        className="flex items-center gap-1 text-xs font-arabic disabled:opacity-30 px-2 py-1" style={{ color: textCol }}>
                        السابق <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {/* Reciter strip */}
                  <div className="flex items-center justify-between gap-2 px-2 pb-1.5 mb-1.5 border-b" style={{ borderColor: isNight ? "rgba(200,180,100,0.2)" : "rgba(20,80,40,0.2)" }}>
                    <button onClick={() => setReciterPickerOpen(true)}
                      className="flex items-center gap-1.5 text-[11px] font-arabic px-2 py-1 rounded-md transition hover:bg-current/10"
                      style={{ color: textCol }}>
                      <Mic className="h-3.5 w-3.5" />
                      <span className="truncate max-w-[160px]">{reciter.name}</span>
                      <span className="opacity-60">▾</span>
                    </button>
                    <button onClick={downloadCurrentSurah} disabled={downloadingId === active.number || cachedNow}
                      className="flex items-center gap-1 text-[11px] font-arabic px-2 py-1 rounded-md transition disabled:opacity-60 hover:bg-current/10"
                      style={{ color: textCol }}
                      title={cachedNow ? "محفوظة للاستماع دون إنترنت" : "تحميل للاستماع دون إنترنت"}>
                      {downloadingId === active.number
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : cachedNow ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      <span>{cachedNow ? "محفوظة" : "تحميل"}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-0.5">
                    <ToolBtn icon={BookText} label={textMode ? "صفحات" : "نص"} isNight={isNight} active={textMode} onClick={() => setTextMode(v => !v)} />
                    <ToolBtn icon={Share2} label={t("Share", "مشاركة")} isNight={isNight} onClick={shareSurah} />
                    <ToolBtn icon={ChevronsDown} label={t("Auto", "تمرير")} isNight={isNight} active={autoScroll} onClick={() => setAutoScroll(v => !v)} />
                    <ToolBtn icon={Languages} label={t("Translate", "ترجمة")} isNight={isNight} active={showTranslation} onClick={() => setShowTranslation(v => !v)} />
                    <ToolBtn icon={playing ? Pause : Play} label={t("Listen", "سماع")} isNight={isNight} active={playing} onClick={togglePlay} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>

      {/* Reciter picker */}
      <Dialog open={reciterPickerOpen} onOpenChange={setReciterPickerOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-elite-gold">
              <Mic className="h-4 w-4" /> اختر القارئ
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {sortByFavorites(RECITERS, favs).map(r => {
              const isFav = favs.includes(r.id);
              const isSel = r.id === reciterId;
              return (
                <div key={r.id} className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition",
                  isSel ? "bg-emerald-700/15" : "hover:bg-secondary/60"
                )}>
                  <button onClick={() => pickReciter(r.id)} className="flex-1 flex items-center gap-2 text-right">
                    <span className={cn("inline-grid place-items-center h-7 w-7 rounded-full text-[10px]",
                      isSel ? "bg-emerald-600 text-white" : "bg-secondary text-foreground/70")}>
                      {isSel ? <Check className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    </span>
                    <span className="flex-1">
                      <div className="font-arabic text-sm">{r.name}</div>
                      <div className="text-[10px] text-foreground/55">{r.nameEn}{r.rewaya ? ` · ${r.rewaya}` : ""}</div>
                    </span>
                  </button>
                  <button onClick={() => onToggleFav(r.id)} className="p-1.5 rounded-md hover:bg-current/10" aria-label="favorite">
                    <Star className={cn("h-4 w-4", isFav ? "fill-amber-400 text-amber-400" : "text-foreground/40")} />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-foreground/50 text-center mt-1">
            تُحفظ السور التي تستمع إليها تلقائياً للاستماع لاحقاً دون إنترنت.
          </p>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

const QURAN_FONT_STACK = '"KFGQPC Uthman Taha","Amiri Quran","Scheherazade New","Amiri",serif';
const TEXT_ZOOM_MIN = 18;
const TEXT_ZOOM_MAX = 42;
const TEXT_ZOOM_DEFAULT = 26;

function ContinuousTextView({ ayat, surahNumber, translations, showTranslation, isNight, mushafText }: { ayat: Ayah[]; surahNumber: number; translations: Record<number, Record<number, string>>; showTranslation: boolean; isNight: boolean; mushafText: string }) {
  const [fontSize, setFontSize] = useState(TEXT_ZOOM_DEFAULT);
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ dist: number; startSize: number } | null>(null);

  // Change font size while keeping the ayah nearest the top of the
  // viewport anchored in place — plain font-size reflow otherwise jumps
  // the scroll position around, "losing" the reader inside the surah.
  const applyFontSize = (next: number) => {
    const clamped = Math.round(Math.min(TEXT_ZOOM_MAX, Math.max(TEXT_ZOOM_MIN, next)));
    const el = containerRef.current;
    if (!el) { setFontSize(clamped); return; }
    const containerTop = el.getBoundingClientRect().top;
    let anchor: HTMLElement | null = null;
    let anchorTopOffset = 0;
    for (const node of Array.from(el.querySelectorAll<HTMLElement>("[data-ayah]"))) {
      const r = node.getBoundingClientRect();
      if (r.bottom >= containerTop) { anchor = node; anchorTopOffset = r.top - containerTop; break; }
    }
    setFontSize(clamped);
    requestAnimationFrame(() => {
      if (!anchor || !containerRef.current) return;
      const newTop = containerRef.current.getBoundingClientRect().top;
      const r = anchor.getBoundingClientRect();
      containerRef.current.scrollTop += (r.top - newTop) - anchorTopOffset;
    });
  };

  // Real two-finger pinch → font-size (a page-image "zoom" is a scale()
  // transform on a raster image; here the content is live text, so the
  // equivalent of "zooming in" is growing the actual font and letting it
  // reflow — matches the reference app's behavior in text/reading mode).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const dist = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinchRef.current = { dist: dist(e.touches), startSize: fontSizeRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const scale = dist(e.touches) / pinchRef.current.dist;
        setFontSize(Math.round(Math.min(TEXT_ZOOM_MAX, Math.max(TEXT_ZOOM_MIN, pinchRef.current.startSize * scale))));
      }
    };
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinchRef.current = null; };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      data-scrollable
      className="h-full overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-5 text-right"
      dir="rtl"
      style={{ color: mushafText, touchAction: "pan-y" }}
    >
      {/* Text zoom controls — discrete, reliably testable equivalent of pinch */}
      <div
        className="sticky top-0 z-10 flex items-center justify-center gap-1 mb-3 -mt-1 py-1 rounded-full w-fit mx-auto px-2"
        style={{ background: isNight ? "rgba(15,41,34,0.85)" : "rgba(232,235,210,0.85)", backdropFilter: "blur(4px)" }}
      >
        <button
          type="button"
          aria-label="تصغير النص"
          onClick={() => applyFontSize(fontSize - 2)}
          disabled={fontSize <= TEXT_ZOOM_MIN}
          className={cn("h-7 w-7 grid place-items-center rounded-full border text-xs font-bold disabled:opacity-30",
            isNight ? "border-amber-300/50 text-amber-200 bg-black/20" : "border-emerald-700/50 text-emerald-900 bg-white/50")}
        >−</button>
        <span className="text-[10px] px-1 opacity-70 tabular-nums" style={{ fontFamily: "inherit" }}>A</span>
        <button
          type="button"
          aria-label="تكبير النص"
          onClick={() => applyFontSize(fontSize + 2)}
          disabled={fontSize >= TEXT_ZOOM_MAX}
          className={cn("h-7 w-7 grid place-items-center rounded-full border text-sm font-bold disabled:opacity-30",
            isNight ? "border-amber-300/50 text-amber-200 bg-black/20" : "border-emerald-700/50 text-emerald-900 bg-white/50")}
        >+</button>
      </div>

      {surahNumber !== 1 && surahNumber !== 9 && (
        <div className="text-center mb-5 opacity-90" style={{ fontFamily: QURAN_FONT_STACK, fontSize: fontSize - 2 }}>
          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </div>
      )}

      <div className="space-y-5">
        {ayat.map(a => {
          const cleaned = a.text.replace(/^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَٰنِ\s+ٱلرَّحِيمِ\s*/, "");
          return (
            <p
              key={a.number}
              data-ayah={a.numberInSurah}
              className="break-words"
              style={{ fontFamily: QURAN_FONT_STACK, fontSize, lineHeight: 2, wordSpacing: "normal" }}
            >
              {cleaned}
              <span
                className={cn("inline-grid place-items-center align-middle mx-1.5 rounded-full border-2 text-[13px] font-bold tabular-nums",
                  isNight ? "border-amber-300/70 text-amber-200 bg-amber-300/10" : "border-emerald-700/70 text-emerald-900 bg-emerald-700/10")}
                style={{ width: Math.max(24, fontSize - 6), height: Math.max(24, fontSize - 6), fontFamily: "inherit" }}
              >
                {toArabicDigits(a.numberInSurah)}
              </span>
            </p>
          );
        })}
      </div>

      {showTranslation && (
        <div className="mt-6 pt-4 border-t border-current/20 space-y-2 text-left" dir="ltr" style={{ fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, overflowWrap: "break-word" }}>
          {ayat.map(a => {
            const tr = translations[surahNumber]?.[a.numberInSurah];
            if (!tr) return null;
            return (
              <div key={a.number} className={cn("italic break-words", isNight ? "text-amber-200/80" : "text-emerald-900/80")}>
                <span className="font-bold">{a.numberInSurah}.</span> {tr}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Cartouche({ label, cartStart, cartMid, strokeCol, textCol }: { label: string; cartStart: string; cartMid: string; strokeCol: string; textCol: string }) {
  return (
    <div className="relative shrink-0 max-w-[40%]">
      <svg viewBox="0 0 200 44" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`cg-${label}`} x1="0" x2="1">
            <stop offset="0" stopColor={cartStart} />
            <stop offset="0.5" stopColor={cartMid} />
            <stop offset="1" stopColor={cartStart} />
          </linearGradient>
        </defs>
        <path d="M14,2 H186 Q198,2 198,22 Q198,42 186,42 H14 Q2,42 2,22 Q2,2 14,2 Z" fill={`url(#cg-${label})`} stroke={strokeCol} strokeWidth="1.2" />
        <path d="M8,22 Q14,14 22,22 Q14,30 8,22 Z M192,22 Q186,14 178,22 Q186,30 192,22 Z" fill={strokeCol} />
      </svg>
      <div className="relative px-5 py-1.5 text-[13px] sm:text-sm font-bold truncate text-center" style={{ color: textCol }}>
        {label}
      </div>
    </div>
  );
}

function PageImage({ page, onDoubleTapToText }: { page: number; onDoubleTapToText?: () => void }) {
  const [src, setSrc] = useState(pageImageUrl(page));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setSrc(pageImageUrl(page)); setLoaded(false); }, [page]);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#f5ecd0" }}>
      {!loaded && (
        <div className="absolute inset-0 grid place-items-center z-10 pointer-events-none">
          <Loader2 className="h-5 w-5 animate-spin opacity-60" />
        </div>
      )}
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={6}
        centerOnInit
        doubleClick={{ mode: "toggle", step: 2 }}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <img
            src={src}
            alt={`صفحة ${page}`}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => { if (!src.includes("raw.githubusercontent")) setSrc(pageImageFallback(page)); }}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", userSelect: "none" }}
            draggable={false}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

function ToolBtn({ icon: Icon, label, onClick, href, active, isNight }: { icon: any; label: string; onClick?: () => void; href?: string; active?: boolean; isNight?: boolean }) {
  const inner = (
    <span className={cn(
      "flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition",
      active
        ? (isNight ? "bg-amber-900 text-amber-100" : "bg-emerald-700 text-white")
        : (isNight ? "text-amber-200 hover:bg-amber-900/20" : "text-emerald-900 hover:bg-emerald-700/10")
    )}>
      <Icon className="h-4 w-4" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </span>
  );
  if (href) return <a href={href} target="_blank" rel="noreferrer" className="block">{inner}</a>;
  return <button onClick={onClick} className="block w-full">{inner}</button>;
}
