import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Minimize2 } from "lucide-react";
import { useGoBack } from "@/components/site/PageHeader";
import { toast } from "sonner";
import { MushafPageView } from "./MushafPageView";
import { MushafTopBar, MushafBottomBar } from "./MushafBars";
import { MushafIndexSheet } from "./MushafIndexSheet";
import { MushafExtrasSheet, type ExtrasMode } from "./MushafExtrasSheet";
import { MushafAyahSheet, type AyahSheetView } from "./MushafAyahSheet";
import { MushafAutoScrollPanel } from "./MushafAutoScrollPanel";
import {
  clampScroll, computeLayout, pageAtScroll, pageAtY, pageTop, readingAnchor, sameLayout, scrollStep,
  scrollTopForAnchor, scrollTopForPage, visibleRange, type ReaderLayout,
} from "./readerLayout";
import { createScrollAnimator, GOTO_MS } from "./smoothScroll";
import { createMushafGestures } from "./mushafGestures";
import { MushafReadingView, type MushafReadingHandle, type ReadingStart } from "./MushafReadingView";
import { createPinchInput, type PinchEvent } from "./pinchInput";
import { startNativePinch } from "./nativePinch";
import {
  ENTER_READING, PAGE_LINES, clampZoom, lineAtFraction, lineTopFraction, loadReadingZoom, nextMode, readingFontPx,
  saveReadingZoom, stepZoom, type ReaderMode,
} from "./readingZoom";
import {
  autoScrollSpeed, clampAutoScrollLevel, createAutoScroller, loadAutoScrollLevel, saveAutoScrollLevel,
} from "./autoScroll";
import { QURAN_READING_FONT } from "@/components/quran-reading/readingPrefs";
import { ayahKey, getPage, globalIdOf } from "@/lib/quran";
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
/** Reading zoom: space around the text (plus the safe areas). */
const READING_PAD_X = 16;
const READING_PAD_TOP = 16;
const READING_PAD_BOTTOM = 72;
/** Ctrl + wheel steps that stop for this long end the trackpad "pinch". */
const WHEEL_ZOOM_IDLE_MS = 300;

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
  // Reading zoom: "page" = the printed pages at fit width (1x); "reading" = the same pages' ayahs
  // from the local text, reflowed at `zoom` times the page's letter size (see readingZoom.ts).
  const [mode, setMode] = useState<ReaderMode>("page");
  const [zoom, setZoom] = useState(1);
  const [readingStart, setReadingStart] = useState<ReadingStart>({ page: 1, line: null, clientY: null });
  const [bars, setBars] = useState(true);
  const [indexTab, setIndexTab] = useState<"surah" | "juz" | "hizb" | "page" | "bookmarks" | null>(null);
  const [extras, setExtras] = useState<ExtrasMode>(null);
  const [ayahSheet, setAyahSheet] = useState<{ page: number; view: AyahSheetView; ayahKey?: string } | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [autoLevel, setAutoLevel] = useState(() => loadAutoScrollLevel());
  const [bookmarks, setBookmarks] = useState<MushafBookmark[]>(() => loadBookmarks());
  const [reciterId, setReciterId] = useState(() => getSelectedReciterId());
  const [playing, setPlaying] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const readingRef = useRef<MushafReadingHandle | null>(null);
  const modeRef = useRef<ReaderMode>(mode);
  modeRef.current = mode;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const safeRef = useRef({ top: 0, right: 0, bottom: 0, left: 0 });
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
  sheetOpenRef.current = indexTab !== null || extras !== null || ayahSheet !== null;
  const autoModeRef = useRef(autoMode);
  autoModeRef.current = autoMode;

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

  // The view being read — the page images, or the reading text — and its scroll limits.
  const activeScroller = () => (modeRef.current === "reading" ? readingRef.current?.scroller() ?? null : scrollerRef.current);
  const clampActive = (y: number) => {
    if (modeRef.current === "reading") {
      const el = readingRef.current?.scroller();
      return el ? Math.min(Math.max(0, el.scrollHeight - el.clientHeight), Math.max(0, y)) : Math.max(0, y);
    }
    return layoutRef.current ? clampScroll(layoutRef.current, y) : Math.max(0, y);
  };

  const animator = useMemo(
    () =>
      createScrollAnimator(
        () => activeScroller(),
        (y) => clampActive(y),
        { onFrame: () => { programmaticUntil.current = Date.now() + 150; }, reducedMotion: prefersReducedMotion },
      ),
    [],
  );

  // Auto-scroll: requestAnimationFrame only, eased speed, scrollTop only (never sideways).
  const autoScroller = useMemo(
    () =>
      createAutoScroller(() => activeScroller(), {
        clamp: (y) => clampActive(y),
        onFrame: () => { programmaticUntil.current = Date.now() + 150; },
        onStateChange: setAutoPlaying,
      }),
    [],
  );
  useEffect(() => () => autoScroller.destroy(), [autoScroller]);

  // In auto-scroll mode a tap plays / pauses; otherwise it shows / hides the toolbars.
  const tapRef = useRef(() => {});
  tapRef.current = () => {
    if (autoModeRef.current) autoScroller.toggle();
    else setBars((v) => !v);
  };

  /* ---------- reading zoom: the printed page ↔ its text, at the size the fingers set ---------- */

  /** The page, and its printed line, under a viewport height of the page images. */
  const pagePointAt = (clientY: number): { page: number; line: number } | null => {
    const L = layoutRef.current;
    const el = scrollerRef.current;
    if (!L || !el) return null;
    const cy = clientY - el.getBoundingClientRect().top + el.scrollTop;
    const p = pageAtY(L, cy);
    return { page: p, line: lineAtFraction((cy - pageTop(L, p)) / L.pageH) };
  };

  /** Reading zoom at `z`, opening on the ayah printed at (the page, line) under `clientY`. */
  const openReading = (clientY: number, z: number) => {
    const at = pagePointAt(clientY);
    autoScroller.pause();
    animator.stop();
    setReadingStart({ page: at?.page ?? pageRef.current, line: at?.line ?? null, clientY: at ? clientY : null });
    zoomRef.current = z;
    setZoom(z);
    modeRef.current = "reading";
    setMode("reading");
  };

  /** Back to the printed page, at the ayah that was being read (its printed line at the top). */
  const closeReading = () => {
    const spot = readingRef.current?.topAyah() ?? null;
    const target = spot?.page ?? pageRef.current;
    autoScroller.pause();
    animator.stop();
    modeRef.current = "page";
    setMode("page");
    zoomRef.current = 1;
    setZoom(1);
    const L = layoutRef.current;
    const el = scrollerRef.current;
    if (!L || !el) return;
    const place = (y: number) => {
      markProgrammatic();
      el.scrollTop = clampScroll(L, y);
      lastScrollTop.current = el.scrollTop;
      setRange(visibleRange(L, el.scrollTop, BUFFER_PAGES));
      showPage(target);
    };
    place(scrollTopForPage(L, target));
    if (!spot) return;
    void getPage(spot.page).then((ayahs) => {
      const a = ayahs.find((x) => x.key === spot.key);
      if (!a || a.sourcePage !== a.mushafPage || modeRef.current !== "page") return;
      place(pageTop(L, spot.page) + lineTopFraction(a.lineStart) * L.pageH - L.top);
    });
  };

  /** Reading zoom to `z` (kept exactly: no snapping), holding the ayah at `clientY` in place. */
  const setReadingZoom = (z: number, clientY: number) => {
    if (nextMode("reading", z) === "page") {
      closeReading();
      return;
    }
    readingRef.current?.holdOnce(clientY);
    zoomRef.current = z;
    setZoom(z);
    saveReadingZoom(z);
  };

  const viewCenter = () => (layoutRef.current?.viewportH ?? window.innerHeight) / 2;
  const zoomIn = () => {
    if (modeRef.current === "page") openReading(viewCenter(), loadReadingZoom());
    else setReadingZoom(stepZoom(zoomRef.current, 1), viewCenter());
  };
  const zoomOut = () => {
    if (modeRef.current === "reading") setReadingZoom(stepZoom(zoomRef.current, -1), viewCenter());
  };

  // Two fingers: pinch start → move → end. The zoom follows the fingers continuously and stays
  // exactly where they leave it; the page opens reading zoom once the pinch passes ENTER_READING.
  const pinchRef = useRef<{ startZoom: number } | null>(null);
  const onPinchRef = useRef<(e: PinchEvent) => void>(() => {});
  onPinchRef.current = (e) => {
    if (e.phase === "start") {
      animator.stop();
      autoScroller.pause();
      pinchRef.current = { startZoom: modeRef.current === "reading" ? zoomRef.current : 1 };
      if (modeRef.current === "reading") readingRef.current?.hold(e.y);
      return;
    }
    const pinch = pinchRef.current;
    if (!pinch) return;
    const z = clampZoom(pinch.startZoom * e.scale);
    if (e.phase === "change") {
      if (modeRef.current === "page") {
        if (nextMode("page", z) === "reading") openReading(e.y, z);
        return;
      }
      readingRef.current?.hold(e.y);
      zoomRef.current = z;
      setZoom(z);
      return;
    }
    pinchRef.current = null;
    readingRef.current?.hold(null);
    if (modeRef.current !== "reading") return;
    if (nextMode("reading", zoomRef.current) === "page") closeReading();
    else saveReadingZoom(zoomRef.current);
  };

  // Trackpad pinch (Ctrl + wheel) on the web: the same, one wheel step at a time.
  const wheelRef = useRef<{ z: number; timer: number } | null>(null);
  const onWheelZoomRef = useRef<(factor: number, x: number, y: number) => void>(() => {});
  onWheelZoomRef.current = (factor, _x, y) => {
    if (modeRef.current === "reading") {
      setReadingZoom(clampZoom(zoomRef.current * factor), y);
      return;
    }
    const w = wheelRef.current ?? { z: 1, timer: 0 };
    window.clearTimeout(w.timer);
    w.z = clampZoom(w.z * factor);
    w.timer = window.setTimeout(() => (wheelRef.current = null), WHEEL_ZOOM_IDLE_MS);
    wheelRef.current = w;
    if (w.z >= ENTER_READING) {
      wheelRef.current = null;
      openReading(y, w.z);
    }
  };

  // Double tap: the page opens reading zoom at the tapped ayah; reading zoom returns to the page.
  const doubleTapRef = useRef<(y: number) => void>(() => {});
  doubleTapRef.current = (y) => {
    if (modeRef.current === "reading") closeReading();
    else openReading(y, loadReadingZoom());
  };
  // A finger held still: the ayahs there (in reading zoom, with the held ayah already selected).
  const longPressRef = useRef<(y: number) => void>(() => {});
  longPressRef.current = (y) => {
    autoScroller.pause();
    if (modeRef.current === "reading") {
      const spot = readingRef.current?.ayahAt(y);
      if (spot) setAyahSheet({ page: spot.page, view: "list", ayahKey: spot.key });
      return;
    }
    const at = pagePointAt(y);
    if (at) setAyahSheet({ page: at.page, view: "list" });
  };

  const zoomRefs = useRef({ in: zoomIn, out: zoomOut, close: closeReading });
  zoomRefs.current = { in: zoomIn, out: zoomOut, close: closeReading };

  const gestures = useMemo(
    () =>
      createMushafGestures({
        onTap: () => tapRef.current(),
        onDoubleTap: (_x, y) => doubleTapRef.current(y),
        onLongPress: (_x, y) => longPressRef.current(y),
        onUserInput: () => animator.stop(),
      }),
    [animator],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gestures.attach(root);
    // The pinch: natively in the iPhone app (a UIKit recognizer the vertical scroll can't take
    // over), in the browser from touch events. Either way two fingers freeze scrolling.
    const input = createPinchInput(root, {
      onPinch: (e) => onPinchRef.current(e),
      onWheelZoom: (f, x, y) => onWheelZoomRef.current(f, x, y),
    });
    let alive = true;
    let stopNative: (() => void) | null = null;
    void startNativePinch((e) => onPinchRef.current(e)).then((stop) => {
      if (!alive) {
        stop?.();
        return;
      }
      stopNative = stop;
      if (stop) input.setEmit(false);
    });
    return () => {
      alive = false;
      gestures.detach();
      input.detach();
      stopNative?.();
    };
  }, [gestures]);
  useEffect(() => () => animator.stop(), [animator]);

  /* ---------- layout: fit width from the real viewport and safe areas ---------- */
  const readingPadX = READING_PAD_X + Math.max(safeRef.current.left, safeRef.current.right);
  const fontPx = readingFontPx(zoom, (layout?.viewportW ?? 390) - 2 * readingPadX);
  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const safe = readSafeAreas();
    safeRef.current = safe;
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
    const y = prev ? scrollTopForAnchor(layout, readingAnchor(prev, lastScrollTop.current)) : scrollTopForPage(layout, pageRef.current);
    markProgrammatic();
    el.scrollTop = y;
    lastScrollTop.current = y;
    setRange(visibleRange(layout, y, BUFFER_PAGES));
    if (prev) showPage(pageAtScroll(layout, y));
  }, [layout, markProgrammatic, showPage]);

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

  /* ---------- auto-scroll ---------- */
  // The speed is set in seconds per page, so it reads the same on every screen size — and in
  // reading zoom the same pace in lines (15 lines a page, at the reading line height).
  useEffect(() => {
    if (mode === "reading") autoScroller.setSpeed(autoScrollSpeed(PAGE_LINES * fontPx * QURAN_READING_FONT.lineHeight, autoLevel));
    else if (layout) autoScroller.setSpeed(autoScrollSpeed(layout.pageH, autoLevel));
  }, [layout, autoLevel, autoScroller, mode, fontPx]);
  // Switching between the page and reading zoom hands the scrolling back to the reader.
  useEffect(() => autoScroller.pause(), [mode, autoScroller]);
  // The app going to the background, or any sheet opening over the Mushaf, pauses it (in place).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") autoScroller.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [autoScroller]);
  useEffect(() => {
    if (indexTab !== null || extras !== null || ayahSheet !== null) autoScroller.pause();
  }, [indexTab, extras, ayahSheet, autoScroller]);

  const startAuto = useCallback(() => {
    setAutoMode(true);
    setBars(false);
    autoScroller.play();
  }, [autoScroller]);
  const closeAuto = useCallback(() => {
    autoScroller.pause();
    setAutoMode(false);
  }, [autoScroller]);
  const changeAutoLevel = useCallback((delta: 1 | -1) => {
    setAutoLevel((l) => {
      const next = clampAutoScrollLevel(l + delta);
      saveAutoScrollLevel(next);
      return next;
    });
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
    autoScroller.pause();
    if (!opts?.silent) setBars(true);
    if (modeRef.current === "reading") {
      readingRef.current?.scrollToPage(target);
      showPage(target);
      return;
    }
    const L = layoutRef.current;
    const el = scrollerRef.current;
    if (!L || !el) {
      // Before the first layout: the layout effect opens at pageRef.
      showPage(target);
      return;
    }
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
  }, [animator, autoScroller, markProgrammatic, showPage]);

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
          setAyahSheet(null);
        }
        return;
      }
      const L = layoutRef.current;
      if (!L) return;
      if (autoModeRef.current && e.key === " " && !target?.closest?.("button, a")) {
        e.preventDefault();
        autoScroller.toggle();
        return;
      }
      const dir = SCROLL_KEYS[e.key];
      if (dir || e.key === "PageDown" || e.key === "PageUp" || e.key === " " || e.key === "Home" || e.key === "End") {
        autoScroller.pause(); // moving by hand takes over from auto-scroll
      }
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
          zoomRefs.current.in();
          return;
        case "-":
          e.preventDefault();
          zoomRefs.current.out();
          return;
        case "0":
          if (modeRef.current === "reading") zoomRefs.current.close();
          return;
        case "Escape":
          if (modeRef.current === "reading") zoomRefs.current.close();
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
  }, [animator, autoScroller, goTo]);

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
  // Listening to a selected range: the last ayah's global id; null = recite on until stopped.
  const stopAfterRef = useRef<number | null>(null);

  const stopAudio = useCallback(() => {
    const el = audioRef.current;
    if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
    cursorRef.current = null;
    stopAfterRef.current = null;
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
      // Keep the reader on the ayah / page being recited.
      const target = pageOfAyah(ref);
      if (modeRef.current === "reading") readingRef.current?.revealAyah(ayahKey(ref.surah, ref.ayah), target);
      else if (target !== pageRef.current) goTo(target, { silent: true });
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
      const last = stopAfterRef.current;
      // A selected range ends with its last ayah.
      if (cur && last !== null && (globalIdOf(cur.surah, cur.ayah) ?? 0) >= last) {
        stopAudio();
        return;
      }
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
    // The recitation turns the pages itself: auto-scroll steps aside.
    autoScroller.pause();
    const cur = cursorRef.current;
    // Paused on this page: resume. Otherwise (idle, or the reader was moved to a
    // different page while paused) start from the first ayah of the current page.
    if (audioState === "paused" && cur && pageOfAyah(cur) === page) return resumeAudio();
    stopAfterRef.current = null;
    void playAyah(pageStartAyah(page));
  };

  /** Recite a selected range: from its first ayah, stopping after its last. */
  const playRange = (from: AyahRef, to: AyahRef) => {
    autoScroller.pause();
    setAyahSheet(null);
    stopAfterRef.current = globalIdOf(to.surah, to.ayah);
    void playAyah(from);
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
      ref={rootRef}
      dir="rtl"
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: night ? "#0b0f14" : "#f6f1e4" }}
    >
      {/* The printed pages: one vertical scroll view, top to bottom, no horizontal overflow, no
          snapping. Kept mounted (hidden) during reading zoom, so a pinch that started on it keeps
          reporting, and the place is kept for the way back. */}
      <div
        ref={scrollerRef}
        data-testid="mushaf-scroller"
        data-mushaf-scroll
        dir="ltr"
        role="region"
        aria-label={t("Mushaf pages", "صفحات المصحف")}
        aria-hidden={mode === "reading" || undefined}
        onClick={(e) => gestures.click(e.nativeEvent)}
        className="absolute inset-0"
        style={{
          overflowX: "hidden",
          overflowY: "auto",
          overscrollBehavior: "contain",
          overflowAnchor: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          visibility: mode === "reading" ? "hidden" : undefined,
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Reading zoom: the same pages' ayahs as text, at the size the fingers set. */}
      {mode === "reading" && layout && (
        <MushafReadingView
          ref={readingRef}
          start={readingStart}
          fontPx={fontPx}
          night={night}
          nowAyahKey={nowAyah ? ayahKey(nowAyah.surah, nowAyah.ayah) : null}
          padTop={safeRef.current.top + READING_PAD_TOP}
          padBottom={safeRef.current.bottom + READING_PAD_BOTTOM}
          padX={readingPadX}
          onPageChange={showPage}
          onClick={(e) => gestures.click(e)}
        />
      )}

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
        onTafsir={() => setAyahSheet({ page: pageRef.current, view: "pageTafsir" })}
        onCopy={onCopy}
        onShare={onShare}
        onSettings={() => setExtras("settings")}
        zoomed={mode === "reading"}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onAyahs={() => setAyahSheet({ page: pageRef.current, view: "list" })}
        onAutoScroll={() => (autoMode ? closeAuto() : startAuto())}
        autoScrollActive={autoMode}
      />

      {autoMode && !bars && (
        <MushafAutoScrollPanel
          playing={autoPlaying}
          level={autoLevel}
          onToggle={() => autoScroller.toggle()}
          onSlower={() => changeAutoLevel(-1)}
          onFaster={() => changeAutoLevel(1)}
          onClose={closeAuto}
        />
      )}

      {/* In reading zoom with the toolbars hidden: one tap back to the printed page. */}
      {mode === "reading" && !bars && (
        <button
          type="button"
          data-testid="mushaf-zoom-fit"
          onClick={closeReading}
          className="fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/65 px-4 py-2.5 text-label text-white shadow-lg active:scale-95 transition-transform"
          style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${autoMode ? 80 : 16}px)`, touchAction: "manipulation" }}
        >
          <Minimize2 className="h-4 w-4" />
          {t("Show full page", "عرض الصفحة كاملة")}
        </button>
      )}

      <MushafAyahSheet
        page={ayahSheet?.page ?? null}
        initialView={ayahSheet?.view ?? "list"}
        initialAyahKey={ayahSheet?.ayahKey ?? null}
        night={night}
        onClose={() => setAyahSheet(null)}
        onListen={playRange}
      />

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
