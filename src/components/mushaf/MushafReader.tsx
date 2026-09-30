import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Minimize2 } from "lucide-react";
import { useGoBack } from "@/components/site/PageHeader";
import { toast } from "sonner";
import { MushafPageView } from "./MushafPageView";
import { MushafTopBar, MushafBottomBar } from "./MushafBars";
import { MushafIndexSheet } from "./MushafIndexSheet";
import { MushafExtrasSheet, type ExtrasMode } from "./MushafExtrasSheet";
import {
  clampScroll, computeLayout, pageAtScroll, pageTop, readingAnchor, sameLayout, scrollStep,
  scrollTopForAnchor, scrollTopForPage, visiblePart, visibleRange, type ReaderLayout,
} from "./readerLayout";
import { createScrollAnimator, GOTO_MS } from "./smoothScroll";
import { createMushafGestures } from "./mushafGestures";
import { ZOOM_STEP } from "./pageZoom";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  TOTAL_PAGES, clampPage, getPageInfo, preloadWindow, loadPosition, savePosition,
  loadBookmarks, toggleBookmark, removeBookmark, toArabicDigits, type MushafBookmark,
} from "@/lib/mushaf";
import { getReciter, getSelectedReciterId, setSelectedReciterId, ayahUrl, setMediaSession } from "@/lib/reciters";
import { SURAHS } from "@/lib/mushaf";
import { noteQuranReading } from "@/lib/journey/sources";
import { pageStartAyah, pageOfAyah, nextAyah, prevAyah, type AyahRef } from "@/lib/quranAudio";

/** Pages kept mounted beyond the ones on screen, on each side. */
const BUFFER_PAGES = 2;
/** Going to a page this close scrolls there smoothly; farther jumps are instant. */
const NEAR_PAGES = 2;
/** The reading position and the Journey are written once the page has settled. */
const SAVE_DELAY_MS = 400;
const BARS_HIDE_MS = 3200;
/** Scrolling by hand this far hides the toolbars (the Mushaf stays the focus). */
const HIDE_BARS_ON_SCROLL_PX = 24;

type Keyed<T> = Record<string, T>;
const SCROLL_KEYS: Keyed<1 | -1> = { ArrowDown: 1, ArrowLeft: 1, ArrowUp: -1, ArrowRight: -1 };

/** env(safe-area-inset-*) as numbers (0 where unsupported). */
function readSafeAreas() {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof document === "undefined" || !document.body) return zero;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const insets = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  return insets;
}

const prefersReducedMotion = () => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
};

/** ?page= when it is a real page; otherwise the saved reading position. */
function startPage(param: string | null): number {
  const p = Number(param);
  return param !== null && param !== "" && Number.isFinite(p) && p >= 1 && p <= TOTAL_PAGES ? clampPage(p) : loadPosition().page;
}

/**
 * The Mushaf reader: all 604 pages on one vertical column, read top to bottom with the
 * browser's own continuous (momentum) scrolling — no paging, no horizontal movement.
 * Each page is shown whole at fit width in its original aspect ratio; pinch / double tap
 * zooms one page in place (see mushafGestures.ts). Only the pages around the screen are
 * mounted, but every page keeps its exact place in the column, so the reading position,
 * page detection, bookmarks, search and "go to page" never depend on what is mounted.
 */
export function MushafReader() {
  // Back returns to the previous screen; opened directly (no history) it goes to the Quran index.
  const goBack = useGoBack("/quran");
  const { theme } = useTheme();
  const { t } = useLocale();
  const night = theme === "night";
  const [searchParams] = useSearchParams();
  const pageParam = searchParams.get("page");

  const [page, setPage] = useState(() => startPage(pageParam));
  const [layout, setLayout] = useState<ReaderLayout | null>(null);
  const [range, setRange] = useState({ first: page, last: page });
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [bars, setBars] = useState(true);
  const [indexTab, setIndexTab] = useState<"surah" | "juz" | "hizb" | "page" | "bookmarks" | null>(null);
  const [extras, setExtras] = useState<ExtrasMode>(null);
  const [bookmarks, setBookmarks] = useState<MushafBookmark[]>(() => loadBookmarks());
  const [reciterId, setReciterId] = useState(() => getSelectedReciterId());
  const [playing, setPlaying] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const layers = useRef(new Map<number, HTMLElement>());
  // Always the page on screen (updated together with `page`, never behind it).
  const pageRef = useRef(page);
  const layoutRef = useRef<ReaderLayout | null>(layout);
  layoutRef.current = layout;
  const lastScrollTop = useRef(0);
  const placedLayout = useRef<ReaderLayout | null>(null);
  const programmaticUntil = useRef(0);
  const barsRef = useRef(bars);
  barsRef.current = bars;
  const barsShownAt = useRef(0);
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const sheetOpenRef = useRef(false);
  sheetOpenRef.current = indexTab !== null || extras !== null;

  const info = useMemo(() => getPageInfo(page), [page]);
  const bookmarked = bookmarks.some((b) => b.page === page);

  const markProgrammatic = useCallback((ms = 150) => {
    programmaticUntil.current = Date.now() + ms;
  }, []);

  const showPage = useCallback((p: number) => {
    if (p === pageRef.current) return;
    pageRef.current = p;
    setPage(p);
  }, []);

  const animator = useMemo(
    () =>
      createScrollAnimator(
        () => scrollerRef.current,
        (y) => (layoutRef.current ? clampScroll(layoutRef.current, y) : Math.max(0, y)),
        { onFrame: () => { programmaticUntil.current = Date.now() + 150; }, reducedMotion: prefersReducedMotion },
      ),
    [],
  );

  const toggleBarsRef = useRef(() => setBars((v) => !v));
  const registerLayer = useCallback((p: number, el: HTMLElement | null) => {
    if (el) layers.current.set(p, el);
    else layers.current.delete(p);
  }, []);

  const settleRef = useRef(() => {});
  const gestures = useMemo(
    () =>
      createMushafGestures({
        scroller: () => scrollerRef.current,
        layout: () => layoutRef.current,
        layer: (p) => layers.current.get(p) ?? null,
        onZoomPage: setZoomPage,
        onTap: () => toggleBarsRef.current(),
        onUserInput: () => animator.stop(),
        onSettle: () => settleRef.current(),
      }),
    [animator],
  );
  // A zoomed page that has left the screen goes back to fit width (never mid-gesture).
  settleRef.current = () => {
    const L = layoutRef.current;
    const el = scrollerRef.current;
    const z = gestures.zoomedPage();
    if (L && el && z !== null && !gestures.gestureActive() && visiblePart(L, el.scrollTop, z) === 0) gestures.resetZoom(false);
  };

  useEffect(() => {
    gestures.attach();
    return () => gestures.detach();
  }, [gestures]);
  useEffect(() => () => animator.stop(), [animator]);

  /* ---------- layout: fit width from the real viewport and safe areas ---------- */
  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const safe = readSafeAreas();
    const next = computeLayout({
      width: el.clientWidth || window.innerWidth,
      height: el.clientHeight || window.innerHeight,
      safeTop: safe.top,
      safeBottom: safe.bottom,
      safeLeft: safe.left,
      safeRight: safe.right,
    });
    setLayout((cur) => (sameLayout(cur, next) ? cur : next));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = scrollerRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(() => measure()) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure]);

  // First layout: open at the starting page. Any later relayout (rotation, split view,
  // window resize): keep the same place in the same page under the viewport centre.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!layout || !el) return;
    const prev = placedLayout.current;
    placedLayout.current = layout;
    if (prev) gestures.resetZoom(false);
    const y = prev ? scrollTopForAnchor(layout, readingAnchor(prev, lastScrollTop.current)) : scrollTopForPage(layout, pageRef.current);
    markProgrammatic();
    el.scrollTop = y;
    lastScrollTop.current = y;
    setRange(visibleRange(layout, y, BUFFER_PAGES));
    if (prev) showPage(pageAtScroll(layout, y));
  }, [layout, gestures, markProgrammatic, showPage]);

  /* ---------- scrolling: current page, mounted range, toolbars ---------- */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const L = layoutRef.current;
      if (!L) return;
      const st = el.scrollTop;
      lastScrollTop.current = st;
      showPage(pageAtScroll(L, st));
      const r = visibleRange(L, st, BUFFER_PAGES);
      setRange((cur) => (cur.first === r.first && cur.last === r.last ? cur : r));
      settleRef.current();
      if (barsRef.current && Date.now() > programmaticUntil.current && Math.abs(st - barsShownAt.current) > HIDE_BARS_ON_SCROLL_PX) {
        setBars(false);
      }
    };
    // One update per frame at most, however many scroll events arrive.
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [showPage]);

  /* ---------- persistence + preloading ---------- */
  const savedPage = useRef<number | null>(null);
  useEffect(() => {
    preloadWindow(page, 2);
    const id = window.setTimeout(() => {
      savePosition(page);
      noteQuranReading(page);
      savedPage.current = page;
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [page]);
  // Leaving the reader (or the app going to the background) never loses the last page.
  useEffect(() => {
    const flush = () => {
      const p = pageRef.current;
      if (savedPage.current === p) return;
      savePosition(p);
      noteQuranReading(p);
      savedPage.current = p;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /* ---------- toolbars: auto-hide ---------- */
  useEffect(() => {
    if (!bars) return;
    barsShownAt.current = scrollerRef.current?.scrollTop ?? 0;
    const id = window.setTimeout(() => setBars(false), BARS_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [bars]);

  /* ---------- navigation ---------- */
  const goTo = useCallback((p: number, opts?: { silent?: boolean; smooth?: boolean }) => {
    const target = clampPage(p);
    if (!opts?.silent) setBars(true);
    const L = layoutRef.current;
    const el = scrollerRef.current;
    if (!L || !el) {
      // Before the first layout: the layout effect opens at pageRef.
      showPage(target);
      return;
    }
    gestures.resetZoom(false);
    const y = scrollTopForPage(L, target);
    const smooth = opts?.smooth ?? Math.abs(target - pageRef.current) <= NEAR_PAGES;
    if (smooth) {
      markProgrammatic(GOTO_MS + 150);
      animator.to(y, GOTO_MS);
      return;
    }
    // Far away (index, search, bookmark): straight there, not through every page between.
    animator.stop();
    markProgrammatic();
    el.scrollTop = y;
    lastScrollTop.current = y;
    setRange(visibleRange(L, y, BUFFER_PAGES));
    showPage(pageAtScroll(L, y));
  }, [animator, gestures, markProgrammatic, showPage]);

  // A new ?page= while the reader is open (the first one is the starting page).
  const seenParam = useRef(pageParam);
  useEffect(() => {
    if (pageParam === seenParam.current) return;
    seenParam.current = pageParam;
    const p = Number(pageParam);
    if (pageParam && Number.isFinite(p) && p >= 1 && p <= TOTAL_PAGES) goTo(p, { silent: true, smooth: false });
  }, [pageParam, goTo]);

  /* ---------- keyboard: small smooth steps, never a page jump ---------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (sheetOpenRef.current) {
        if (e.key === "Escape") {
          setIndexTab(null);
          setExtras(null);
        }
        return;
      }
      const L = layoutRef.current;
      if (!L) return;
      const dir = SCROLL_KEYS[e.key];
      if (dir) {
        e.preventDefault();
        // A tap moves a little; holding the key keeps moving smoothly until it is released.
        if (e.repeat) animator.hold(dir);
        else animator.by(dir * scrollStep(L));
        return;
      }
      switch (e.key) {
        case " ":
          if (target?.closest?.("button, a")) return;
        // falls through
        case "PageDown":
        case "PageUp": {
          // A bigger step (half a screen), still smooth and never aligned to a page turn.
          e.preventDefault();
          const down = e.key === "PageDown" || (e.key === " " && !e.shiftKey);
          animator.by((down ? 1 : -1) * Math.round(L.viewportH / 2));
          return;
        }
        case "Home":
          e.preventDefault();
          goTo(1, { silent: true });
          return;
        case "End":
          e.preventDefault();
          goTo(TOTAL_PAGES, { silent: true });
          return;
        case "+":
        case "=":
          e.preventDefault();
          gestures.zoomBy(ZOOM_STEP, pageRef.current);
          return;
        case "-":
          e.preventDefault();
          gestures.zoomBy(1 / ZOOM_STEP, pageRef.current);
          return;
        case "0":
          gestures.resetZoom(true);
          return;
        case "Escape":
          if (gestures.zoomedPage() !== null) gestures.resetZoom(true);
          else goBackRef.current();
          return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (SCROLL_KEYS[e.key]) animator.release();
    };
    const onBlur = () => animator.release();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [animator, gestures, goTo]);

  /* ---------- audio (page-aware, ayah by ayah) ---------- */
  // Playback always starts at the first ayah printed on the CURRENT page
  // (never the start of the surah), then walks ayah by ayah, turning the page
  // when the recitation crosses into the next one.
  const [audioState, setAudioState] = useState<"idle" | "playing" | "paused">("idle");
  const [nowAyah, setNowAyah] = useState<AyahRef | null>(null);
  const cursorRef = useRef<AyahRef | null>(null);
  const reciterRef = useRef(reciterId);
  reciterRef.current = reciterId;
  const playAyahRef = useRef<(ref: AyahRef) => Promise<void>>(async () => undefined);

  const stopAudio = useCallback(() => {
    const el = audioRef.current;
    if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
    cursorRef.current = null;
    setNowAyah(null);
    setAudioState("idle");
    setPlaying(false);
  }, []);

  const playAyah = useCallback(async (ref: AyahRef) => {
    const reciter = getReciter(reciterRef.current);
    const el = audioRef.current ?? new Audio();
    audioRef.current = el;
    cursorRef.current = ref;
    setNowAyah(ref);
    try {
      el.src = ayahUrl(reciter, ref.surah, ref.ayah);
      await el.play();
      setAudioState("playing");
      setPlaying(true);
      // Keep the reader on the page being recited.
      const target = pageOfAyah(ref);
      if (target !== pageRef.current) goTo(target, { silent: true });
      const meta = SURAHS[ref.surah - 1];
      setMediaSession({
        title: `${meta.ar} · ${ref.ayah}`, artist: reciter.name,
        onPlay: () => resumeAudioRef.current(),
        onPause: () => pauseAudioRef.current(),
        onNext: () => stepAyahRef.current(1),
        onPrev: () => stepAyahRef.current(-1),
      });
    } catch {
      // A newer play() interrupting this one is not an error.
      if (cursorRef.current !== ref) return;
      setAudioState("idle");
      setPlaying(false);
      toast.error(t("Couldn't play the recitation — check your connection", "تعذّر تشغيل التلاوة، تحقّق من الاتصال"));
    }
  }, [goTo, t]);
  playAyahRef.current = playAyah;

  const pauseAudio = useCallback(() => {
    audioRef.current?.pause();
    setAudioState("paused");
    setPlaying(false);
  }, []);
  const resumeAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el || !cursorRef.current) return;
    void el.play().then(() => { setAudioState("playing"); setPlaying(true); }).catch(() => undefined);
  }, []);
  const stepAyah = useCallback((dir: 1 | -1) => {
    const cur = cursorRef.current;
    if (!cur) return;
    const to = dir === 1 ? nextAyah(cur) : prevAyah(cur);
    if (to) void playAyahRef.current(to);
    else stopAudio();
  }, [stopAudio]);
  const pauseAudioRef = useRef(pauseAudio); pauseAudioRef.current = pauseAudio;
  const resumeAudioRef = useRef(resumeAudio); resumeAudioRef.current = resumeAudio;
  const stepAyahRef = useRef(stepAyah); stepAyahRef.current = stepAyah;

  // Continue with the next ayah when one finishes.
  useEffect(() => {
    const el = audioRef.current ?? new Audio();
    audioRef.current = el;
    const onEnded = () => {
      const cur = cursorRef.current;
      const nxt = cur ? nextAyah(cur) : null;
      if (nxt) void playAyahRef.current(nxt);
      else stopAudio();
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [stopAudio]);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const onAudio = () => {
    if (audioState === "playing") return pauseAudio();
    const cur = cursorRef.current;
    // Paused on this page: resume. Otherwise (idle, or the reader was moved to a
    // different page while paused) start from the first ayah of the current page.
    if (audioState === "paused" && cur && pageOfAyah(cur) === page) return resumeAudio();
    void playAyah(pageStartAyah(page));
  };

  /* ---------- actions ---------- */
  const onBookmark = () => {
    setBookmarks(toggleBookmark(page));
    toast.success(bookmarked ? t("Removed from favorites", "أُزيلت من المفضلة") : t(`Page ${page} saved`, `حُفظت صفحة ${toArabicDigits(page)}`));
  };

  const shareUrl = `${window.location.origin}/mushaf?page=${page}`;
  const onShare = async () => {
    const surahName = t(info.mainSurah.en, info.mainSurah.ar);
    const data = { title: t(`Mushaf — ${surahName}`, `المصحف — ${surahName}`), text: t(`Page ${page} · ${surahName}`, `صفحة ${toArabicDigits(page)} · ${surahName}`), url: shareUrl };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(shareUrl); toast.success(t("Link copied", "تم نسخ الرابط")); }
    } catch { /* dismissed */ }
  };
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success(t("Page link copied", "تم نسخ رابط الصفحة")); }
    catch { toast.error(t("Couldn't copy", "تعذّر النسخ")); }
  };

  const pages = useMemo(() => {
    if (!layout) return [];
    const list: number[] = [];
    for (let p = range.first; p <= range.last; p++) list.push(p);
    return list;
  }, [layout, range]);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: night ? "#0b0f14" : "#f6f1e4" }}
    >
      {/* The one vertical scroll view: pages top to bottom, no horizontal overflow, no snapping. */}
      <div
        ref={scrollerRef}
        data-testid="mushaf-scroller"
        dir="ltr"
        role="region"
        aria-label={t("Mushaf pages", "صفحات المصحف")}
        onClick={(e) => gestures.click(e.nativeEvent)}
        className="absolute inset-0"
        style={{
          overflowX: "hidden",
          overflowY: "auto",
          overscrollBehavior: "contain",
          overflowAnchor: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        {layout && (
          <div data-testid="mushaf-column" className="relative w-full" style={{ height: layout.contentH }}>
            {pages.map((p) => (
              <MushafPageView
                key={p}
                page={p}
                top={pageTop(layout, p)}
                left={layout.left}
                width={layout.pageW}
                height={layout.pageH}
                night={night}
                zoomed={zoomPage === p}
                registerLayer={registerLayer}
              />
            ))}
          </div>
        )}
      </div>

      <MushafTopBar
        visible={bars}
        info={info}
        bookmarked={bookmarked}
        onBack={goBack}
        onBookmark={onBookmark}
        onOpen={(tab) => { setIndexTab(tab); setBars(true); }}
      />

      <MushafBottomBar
        visible={bars}
        info={info}
        playing={playing}
        audioActive={audioState !== "idle"}
        nowAyah={nowAyah}
        onAudio={onAudio}
        onStop={stopAudio}
        onPrevAyah={() => stepAyah(-1)}
        onNextAyah={() => stepAyah(1)}
        onTranslation={() => setExtras("translation")}
        onTafsir={() => setExtras("tafsir")}
        onCopy={onCopy}
        onShare={onShare}
        onSettings={() => setExtras("settings")}
        zoomed={zoomPage !== null}
        onZoomIn={() => gestures.zoomBy(ZOOM_STEP, pageRef.current)}
        onZoomOut={() => gestures.zoomBy(1 / ZOOM_STEP, pageRef.current)}
      />

      {/* While a page is zoomed and the toolbars are hidden: one tap back to the whole page. */}
      {zoomPage !== null && !bars && (
        <button
          type="button"
          data-testid="mushaf-zoom-fit"
          onClick={() => gestures.resetZoom(true)}
          className="fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/65 px-4 py-2.5 text-label text-white shadow-lg active:scale-95 transition-transform"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", touchAction: "manipulation" }}
        >
          <Minimize2 className="h-4 w-4" />
          {t("Show full page", "عرض الصفحة كاملة")}
        </button>
      )}

      <MushafIndexSheet
        key={indexTab ?? "closed"}
        open={indexTab !== null}
        initialTab={indexTab ?? "surah"}
        onClose={() => setIndexTab(null)}
        currentPage={page}
        bookmarks={bookmarks}
        onGoTo={(p) => goTo(p)}
        onRemoveBookmark={(p) => setBookmarks(removeBookmark(p))}
      />

      <MushafExtrasSheet
        mode={extras}
        onClose={() => setExtras(null)}
        info={info}
        reciterId={reciterId}
        onReciterChange={(id) => { setSelectedReciterId(id); setReciterId(id); }}
      />
    </div>
  );
}
