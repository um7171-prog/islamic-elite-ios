import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MushafPageView } from "./MushafPageView";
import { MushafTopBar, MushafBottomBar } from "./MushafBars";
import { MushafIndexSheet } from "./MushafIndexSheet";
import { MushafExtrasSheet, type ExtrasMode } from "./MushafExtrasSheet";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  TOTAL_PAGES, clampPage, getPageInfo, preloadWindow, loadPosition, savePosition,
  loadBookmarks, toggleBookmark, removeBookmark, toArabicDigits, type MushafBookmark,
} from "@/lib/mushaf";
import { getReciter, getSelectedReciterId, setSelectedReciterId, getPlayableUrl, setMediaSession } from "@/lib/reciters";

const SWIPE_PX = 55;

export function MushafReader() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { t } = useLocale();
  const night = theme === "night";

  const [page, setPage] = useState(() => loadPosition().page);
  const [bars, setBars] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [indexTab, setIndexTab] = useState<"surah" | "juz" | "hizb" | "page" | "bookmarks" | null>(null);
  const [extras, setExtras] = useState<ExtrasMode>(null);
  const [bookmarks, setBookmarks] = useState<MushafBookmark[]>(() => loadBookmarks());
  const [reciterId, setReciterId] = useState(() => getSelectedReciterId());
  const [playing, setPlaying] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ x: 0, y: 0, dx: 0, active: false, decided: false as boolean | "h" | "v" });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barsTimer = useRef<number | null>(null);

  const info = useMemo(() => getPageInfo(page), [page]);
  const bookmarked = bookmarks.some((b) => b.page === page);
  // RTL reading: page N+1 lives to the LEFT of page N.
  const slots = useMemo(() => [page - 1, page, page + 1].filter((p) => p >= 1 && p <= TOTAL_PAGES), [page]);

  /* ---------- persistence + preloading ---------- */
  useEffect(() => { savePosition(page); preloadWindow(page, 2); }, [page]);

  /* ---------- auto-hide toolbars ---------- */
  const scheduleHide = useCallback(() => {
    if (barsTimer.current) window.clearTimeout(barsTimer.current);
    barsTimer.current = window.setTimeout(() => setBars(false), 3200);
  }, []);
  useEffect(() => { if (bars) scheduleHide(); return () => { if (barsTimer.current) window.clearTimeout(barsTimer.current); }; }, [bars, scheduleHide]);

  const toggleBars = useCallback(() => setBars((v) => !v), []);

  /* ---------- navigation ---------- */
  const goTo = useCallback((p: number, opts?: { silent?: boolean }) => {
    const next = clampPage(p);
    setPage((cur) => {
      if (cur === next) return cur;
      setResetToken((t) => t + 1);
      return next;
    });
    if (!opts?.silent) setBars(true);
  }, []);

  const nextPage = useCallback(() => goTo(page + 1, { silent: true }), [goTo, page]);
  const prevPage = useCallback(() => goTo(page - 1, { silent: true }), [goTo, page]);

  /* ---------- swipe (transform-only, GPU) ---------- */
  const rafId = useRef<number | null>(null);
  const pendingDx = useRef(0);
  const applyOffset = (dx: number) => {
    pendingDx.current = dx;
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const el = trackRef.current;
      if (el) el.style.transform = `translate3d(${pendingDx.current}px,0,0)`;
    });
  };
  const settle = (dx: number) => {
    const el = trackRef.current;
    if (el) { el.style.transition = "transform .26s cubic-bezier(.22,.61,.36,1)"; el.style.transform = `translate3d(${dx}px,0,0)`; }
  };
  const clearTrack = () => {
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "translate3d(0,0,0)";
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoomed || e.pointerType === "mouse" && e.buttons !== 1) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: true, decided: false };
    const el = trackRef.current;
    if (el) el.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || zoomed) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.decided = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (d.decided === "v") { d.active = false; return; }
    }
    d.dx = dx;
    // Resistance at the two ends of the Mushaf.
    const atEnd = (dx > 0 && page >= TOTAL_PAGES) || (dx < 0 && page <= 1);
    applyOffset(atEnd ? dx * 0.25 : dx);
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d.active) { drag.current.active = false; return; }
    d.active = false;
    const w = trackRef.current?.clientWidth ?? window.innerWidth;
    if (d.decided !== "h" || Math.abs(d.dx) < SWIPE_PX) { settle(0); window.setTimeout(clearTrack, 270); return; }
    // Swipe right (dx > 0) reveals the previous slot on the right => higher page in RTL.
    const forward = d.dx > 0;
    const target = forward ? page + 1 : page - 1;
    if (target < 1 || target > TOTAL_PAGES) { settle(0); window.setTimeout(clearTrack, 270); return; }
    settle(forward ? w : -w);
    window.setTimeout(() => { clearTrack(); forward ? nextPage() : prevPage(); }, 240);
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") nextPage();
      else if (e.key === "ArrowRight") prevPage();
      else if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextPage, prevPage, navigate]);

  /* ---------- audio ---------- */
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const playSurah = useCallback(async (surahNumber: number) => {
    const reciter = getReciter(reciterId);
    const el = audioRef.current ?? new Audio();
    audioRef.current = el;
    el.crossOrigin = "anonymous";
    try {
      const url = await getPlayableUrl(reciter, surahNumber);
      el.src = url;
      await el.play();
      setPlaying(true);
      const meta = getPageInfo(page).mainSurah;
      setMediaSession({
        title: meta.ar, artist: reciter.name,
        onPlay: () => { void el.play(); setPlaying(true); },
        onPause: () => { el.pause(); setPlaying(false); },
        onNext: () => void playSurah(Math.min(114, surahNumber + 1)),
        onPrev: () => void playSurah(Math.max(1, surahNumber - 1)),
      });
    } catch {
      setPlaying(false);
      toast.error(t("Couldn't play the recitation — check your connection", "تعذّر تشغيل التلاوة، تحقّق من الاتصال"));
    }
  }, [reciterId, page]);

  // Auto-continue to the next surah when one finishes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      const cur = getPageInfo(page).mainSurah.n;
      if (cur < 114) void playSurah(cur + 1);
      else setPlaying(false);
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [page, playSurah]);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const onAudio = () => {
    if (playing) return stopAudio();
    void playSurah(info.mainSurah.n);
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

  /* ---------- deep link ?page= / ?surah= ---------- */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const p = Number(sp.get("page"));
    if (Number.isFinite(p) && p >= 1 && p <= TOTAL_PAGES) goTo(p, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 overflow-hidden touch-none select-none"
      style={{ background: night ? "#0b0f14" : "#f6f1e4" }}
    >
      {/* swipe track holding prev / current / next */}
      <div
        ref={trackRef}
        className="absolute inset-0"
        style={{ willChange: "transform", transform: "translate3d(0,0,0)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {slots.map((p) => (
          <div
            key={p}
            className="absolute inset-0"
            style={{
              // RTL: previous page sits to the right, next page to the left.
              transform: `translate3d(${(page - p) * 100}%,0,0)`,
              backfaceVisibility: "hidden",
              contain: "strict",
            }}
          >
            <MushafPageView
              page={p}
              active={p === page}
              night={night}
              resetToken={p === page ? resetToken : 0}
              onZoomChange={(s) => setZoomed(s > 1.01)}
              onTap={toggleBars}
            />
          </div>
        ))}
      </div>

      <MushafTopBar
        visible={bars}
        info={info}
        bookmarked={bookmarked}
        onBack={() => navigate(-1)}
        onBookmark={onBookmark}
        onOpen={(t) => { setIndexTab(t); setBars(true); }}
      />

      <MushafBottomBar
        visible={bars}
        info={info}
        playing={playing}
        onAudio={onAudio}
        onTranslation={() => setExtras("translation")}
        onTafsir={() => setExtras("tafsir")}
        onCopy={onCopy}
        onShare={onShare}
        onSettings={() => setExtras("settings")}
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
