import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { getAyah, getPage, TOTAL_PAGES, type QuranAyah } from "@/lib/quran";
import { toArabicDigits } from "@/lib/mushaf";
import { useLocale } from "@/contexts/LocaleContext";
import { ayahAtLine } from "./readingZoom";
import { ayahBody, surahNameAr } from "@/components/quran-reading/ayahDisplay";
import { AyahMarker } from "@/components/quran-reading/AyahMarker";
import { QURAN_READING_FONT } from "@/components/quran-reading/readingPrefs";

/**
 * The Mushaf's reading zoom: the same pages' ayahs from the local KFGQPC Hafs text (verbatim,
 * through the same display rules as the reading screen), reflowed at `fontPx`. Lines wrap inside
 * the screen at every size — the text is never transformed, never cut, never dragged sideways.
 *
 * Pages keep their order and their numbers (a divider after each page), surahs their headers and
 * basmala. Only a window of pages around the reader is rendered; it grows as the reader scrolls,
 * and the ayah being read is held in place whenever content above it changes (a page loaded, the
 * window growing, the text size changing under a pinch).
 */

export interface ReadingSpot {
  key: string;
  page: number;
}

export interface MushafReadingHandle {
  scroller(): HTMLElement | null;
  /** The ayah at a viewport height (the one under a finger), or the first one on screen. */
  ayahAt(clientY: number): ReadingSpot | null;
  /** The first ayah on screen (where reading continues). */
  topAyah(): ReadingSpot | null;
  /** Keep the ayah at viewport height `clientY` exactly where it is through the coming size changes
   * (a pinch in progress); null releases it. */
  hold(clientY: number | null): void;
  /** The same for one size change only (a zoom button). */
  holdOnce(clientY: number): void;
  scrollToPage(page: number): void;
  /** Bring an ayah on screen (the recitation moving on), loading its page if needed. */
  revealAyah(key: string, page: number): void;
}

/** Where reading opens: a page, and the printed line under the fingers with their height on
 * screen (the ayah on that line is placed under them), or the top of the page. */
export interface ReadingStart {
  page: number;
  line: number | null;
  clientY: number | null;
}

interface Props {
  start: ReadingStart;
  fontPx: number;
  night: boolean;
  /** The ayah being recited (highlighted). */
  nowAyahKey: string | null;
  padTop: number;
  padBottom: number;
  padX: number;
  onPageChange: (page: number) => void;
  onClick: (e: MouseEvent) => void;
}

/** Pages rendered around the reader, and the most kept at once. */
const WINDOW_BEFORE = 1;
const WINDOW_AFTER = 2;
const GROW_BY = 2;
const MAX_WINDOW = 12;

interface Anchor {
  /** CSS selector of the element to keep in place. */
  sel: string;
  /** Its top, measured from the scroll view's top edge. */
  offset: number;
  /** Kept through several renders (a pinch) rather than applied once. */
  persistent: boolean;
}

const ayahSel = (key: string) => `[data-ayah="${key}"]`;
const pageSel = (page: number) => `[data-reading-page="${page}"]`;
const windowAround = (p: number) => ({ first: Math.max(1, p - WINDOW_BEFORE), last: Math.min(TOTAL_PAGES, p + WINDOW_AFTER) });

export const MushafReadingView = forwardRef<MushafReadingHandle, Props>(function MushafReadingView(
  { start, fontPx, night, nowAyahKey, padTop, padBottom, padX, onPageChange, onClick },
  ref,
) {
  const { t } = useLocale();
  const startPage = start.page;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [win, setWin] = useState(() => windowAround(startPage));
  const [pages, setPages] = useState<Record<number, QuranAyah[]>>({});
  const [basmala, setBasmala] = useState<string | null>(null);
  const anchor = useRef<Anchor | null>(null);
  const pageRef = useRef(startPage);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const topOf = (el: Element) => {
    const s = scrollRef.current;
    return s ? el.getBoundingClientRect().top - s.getBoundingClientRect().top : 0;
  };

  /** Hold the first ayah on screen where it is, across the next render. */
  const holdReadingPlace = useCallback(() => {
    const s = scrollRef.current;
    if (!s || anchor.current?.persistent) return;
    const nodes = s.querySelectorAll<HTMLElement>("[data-ayah]");
    for (const n of Array.from(nodes)) {
      const top = topOf(n);
      if (top + n.offsetHeight > padTop) {
        anchor.current = { sel: ayahSel(n.dataset.ayah as string), offset: top, persistent: false };
        return;
      }
    }
  }, [padTop]);

  // Opening: the ayah printed on the pinched / tapped line goes under the fingers (resolved once its
  // page's ayahs are loaded); without a line, the top of the page.
  const pendingStart = useRef<(ReadingStart & { hold: boolean }) | null>(start.line !== null && start.clientY !== null ? { ...start, hold: false } : null);
  useLayoutEffect(() => {
    if (!pendingStart.current) anchor.current = { sel: pageSel(startPage), offset: padTop, persistent: false };
    // Only the first placement: later moves go through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the pages of the window (each page's ayahs, from the local data).
  useEffect(() => {
    let alive = true;
    for (let p = win.first; p <= win.last; p++) {
      if (pages[p]) continue;
      void getPage(p).then((list) => {
        if (!alive) return;
        holdReadingPlace();
        setPages((cur) => (cur[p] ? cur : { ...cur, [p]: list }));
      });
    }
    return () => {
      alive = false;
    };
  }, [win, pages, holdReadingPlace]);

  // The basmala above each surah is the source's own text of 1:1 (as on the reading screen).
  useEffect(() => {
    let alive = true;
    getAyah(1, 1).then((a) => {
      if (alive && a) setBasmala(ayahBody(a));
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // After every render: keep the held element where it was (content above it may have changed).
  useLayoutEffect(() => {
    const s = scrollRef.current;
    const ps = pendingStart.current;
    if (ps && pages[ps.page]) {
      pendingStart.current = null;
      const a = ayahAtLine(pages[ps.page], ps.line ?? 1);
      anchor.current = a
        ? { sel: ayahSel(a.key), offset: (ps.clientY ?? 0) - (s?.getBoundingClientRect().top ?? 0), persistent: ps.hold }
        : { sel: pageSel(ps.page), offset: padTop, persistent: false };
    }
    const a = anchor.current;
    if (!s || !a) return;
    const node = s.querySelector(a.sel);
    if (!node) return; // not rendered yet (its page is loading): try again after the next render
    const delta = topOf(node) - a.offset;
    if (delta) s.scrollTop += delta;
    if (!a.persistent) anchor.current = null;
  });

  /* ---------- scrolling: the current page, and growing the window ---------- */
  useEffect(() => {
    const s = scrollRef.current;
    if (!s) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = s.clientHeight;
      const probe = s.getBoundingClientRect().top + padTop + h * 0.25;
      let current = pageRef.current;
      for (const sec of Array.from(s.querySelectorAll<HTMLElement>("[data-reading-page]"))) {
        if (sec.getBoundingClientRect().top <= probe) current = Number(sec.dataset.readingPage);
        else break;
      }
      if (current !== pageRef.current) {
        pageRef.current = current;
        onPageChangeRef.current(current);
      }
      const nearEnd = s.scrollTop + h > s.scrollHeight - 1.5 * h;
      const nearStart = s.scrollTop < h;
      setWin((w) => {
        let { first, last } = w;
        if (nearEnd && last < TOTAL_PAGES) last = Math.min(TOTAL_PAGES, last + GROW_BY);
        if (nearStart && first > 1) first = Math.max(1, first - GROW_BY);
        // Bounded: drop pages far from the one being read.
        if (last - first + 1 > MAX_WINDOW) {
          if (current - first > last - current) first = last - MAX_WINDOW + 1;
          else last = first + MAX_WINDOW - 1;
        }
        if (first === w.first && last === w.last) return w;
        holdReadingPlace();
        return { first, last };
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    s.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      s.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [padTop, holdReadingPlace]);

  const goToPage = useCallback((page: number, sel: string, offset: number) => {
    const p = Math.min(TOTAL_PAGES, Math.max(1, page));
    anchor.current = { sel, offset, persistent: false };
    pageRef.current = p;
    onPageChangeRef.current(p);
    setWin((w) => (p >= w.first && p <= w.last ? { ...w } : windowAround(p)));
  }, []);

  /** Hold the ayah at viewport height `clientY` at its current place. */
  const holdAt = useCallback((clientY: number, persistent: boolean) => {
    const s = scrollRef.current;
    if (!s) return;
    const nodes = Array.from(s.querySelectorAll<HTMLElement>("[data-ayah]"));
    let hit: HTMLElement | null = null;
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        hit = n;
        break;
      }
      if (r.top <= clientY) hit = n;
    }
    hit ??= nodes[0] ?? null;
    if (hit) anchor.current = { sel: ayahSel(hit.dataset.ayah as string), offset: topOf(hit), persistent };
    // topOf only reads refs.
  }, []);

  useImperativeHandle(
    ref,
    (): MushafReadingHandle => ({
      scroller: () => scrollRef.current,
      ayahAt(clientY) {
        const s = scrollRef.current;
        if (!s) return null;
        const nodes = Array.from(s.querySelectorAll<HTMLElement>("[data-ayah]"));
        let best: HTMLElement | null = null;
        for (const n of nodes) {
          const r = n.getBoundingClientRect();
          if (clientY >= r.top && clientY <= r.bottom) {
            best = n;
            break;
          }
          if (r.top <= clientY) best = n;
        }
        const n = best ?? nodes[0];
        return n ? { key: n.dataset.ayah as string, page: Number(n.dataset.page) } : null;
      },
      topAyah() {
        const s = scrollRef.current;
        if (!s) return null;
        const top = s.getBoundingClientRect().top + padTop;
        const nodes = Array.from(s.querySelectorAll<HTMLElement>("[data-ayah]"));
        const n = nodes.find((x) => x.getBoundingClientRect().bottom > top) ?? nodes.find((x) => Number(x.dataset.page) === pageRef.current);
        return n ? { key: n.dataset.ayah as string, page: Number(n.dataset.page) } : null;
      },
      hold(clientY) {
        if (clientY === null) {
          if (anchor.current) anchor.current.persistent = false;
          if (pendingStart.current) pendingStart.current.hold = false;
          return;
        }
        // Still placing the opening ayah: keep it held once placed.
        if (pendingStart.current) {
          pendingStart.current.hold = true;
          return;
        }
        if (anchor.current) {
          anchor.current.persistent = true;
          return;
        }
        holdAt(clientY, true);
      },
      holdOnce(clientY) {
        holdAt(clientY, false);
      },
      scrollToPage(page) {
        goToPage(page, pageSel(page), padTop);
      },
      revealAyah(key, page) {
        const s = scrollRef.current;
        const node = s?.querySelector(ayahSel(key));
        if (s && node) {
          const top = topOf(node);
          if (top >= padTop && top + (node as HTMLElement).offsetHeight <= s.clientHeight - padBottom) return;
        }
        goToPage(page, ayahSel(key), padTop + (s?.clientHeight ?? 0) * 0.2);
      },
    }),
    [goToPage, holdAt, padTop, padBottom],
  );

  const list: number[] = [];
  for (let p = win.first; p <= win.last; p++) list.push(p);
  const ink = night ? "#ece5d3" : "#1d2621";
  const soft = night ? "rgba(236,229,211,.55)" : "rgba(29,38,33,.5)";

  return (
    <div
      ref={scrollRef}
      data-testid="mushaf-reading"
      data-mushaf-scroll
      dir="rtl"
      role="region"
      aria-label={t("Enlarged reading", "القراءة المكبّرة")}
      onClick={(e) => onClick(e.nativeEvent)}
      className="absolute inset-0"
      style={{
        overflowX: "hidden",
        overflowY: "auto",
        overscrollBehavior: "contain",
        overflowAnchor: "none",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        WebkitTouchCallout: "none",
        background: night ? "#0b0f14" : "#f6f1e4",
        color: ink,
        paddingTop: padTop,
        paddingBottom: padBottom,
        paddingLeft: padX,
        paddingRight: padX,
      }}
    >
      <div
        data-testid="mushaf-reading-text"
        data-quran-text
        style={{
          fontFamily: QURAN_READING_FONT.family,
          fontWeight: QURAN_READING_FONT.weight,
          fontSize: fontPx,
          lineHeight: QURAN_READING_FONT.lineHeight,
          letterSpacing: QURAN_READING_FONT.letterSpacing,
          maxWidth: "100%",
          overflowWrap: "break-word",
          wordBreak: "normal",
          whiteSpace: "normal",
        }}
      >
        {list.map((p) => (
          <section key={p} data-reading-page={p} data-page={p}>
            {pages[p] ? <PageText ayahs={pages[p]} basmala={basmala} night={night} nowAyahKey={nowAyahKey} /> : <div style={{ minHeight: "60vh" }} aria-busy="true" />}
            <div className="my-3 flex items-center gap-3 font-display text-caption" style={{ color: soft, fontSize: 13, lineHeight: 1.4 }} aria-hidden="true">
              <span className="h-px flex-1" style={{ background: soft, opacity: 0.35 }} />
              <span className="tabular-nums" data-testid="mushaf-reading-page-number">{toArabicDigits(p)}</span>
              <span className="h-px flex-1" style={{ background: soft, opacity: 0.35 }} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
});

/** One page's ayahs as flowing paragraphs, with a surah's header and basmala where it starts. */
function PageText({ ayahs, basmala, night, nowAyahKey }: { ayahs: QuranAyah[]; basmala: string | null; night: boolean; nowAyahKey: string | null }) {
  const runs: QuranAyah[][] = [];
  for (const a of ayahs) {
    const last = runs[runs.length - 1];
    if (last && last[0].surah === a.surah && a.ayah !== 1) last.push(a);
    else runs.push([a]);
  }
  const ink = night ? "#ece5d3" : "#1d2621";
  return (
    <>
      {runs.map((run) => {
        const first = run[0];
        const opensSurah = first.ayah === 1;
        return (
          <Fragment key={first.key}>
            {opensSurah && (
              <header className="mb-3 mt-2 flex justify-center">
                <h2
                  className="rounded-full border px-5 py-1 text-center font-arabic"
                  style={{ borderColor: "hsl(var(--elite-gold-start) / .6)", color: ink, fontSize: "0.7em", lineHeight: 1.6 }}
                >
                  سورة {surahNameAr(first.surah)}
                </h2>
              </header>
            )}
            {opensSurah && basmala && first.surah !== 1 && first.surah !== 9 && (
              <p data-testid="mushaf-reading-basmala" className="mb-2 text-center">
                {basmala}
              </p>
            )}
            <p className="min-w-0" style={{ textAlign: "justify", maxWidth: "100%" }}>
              {run.map((a) => (
                <span
                  key={a.key}
                  data-ayah={a.key}
                  data-page={a.mushafPage}
                  className="rounded-lg transition-colors"
                  style={nowAyahKey === a.key ? { background: night ? "rgba(212,175,55,.18)" : "rgba(16,94,72,.12)" } : undefined}
                >
                  {ayahBody(a)}
                  {"\u00A0"}
                  <AyahMarker ayah={a.ayah} night={night} />{" "}
                </span>
              ))}
            </p>
          </Fragment>
        );
      })}
    </>
  );
}
