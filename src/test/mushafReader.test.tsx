import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { MushafReader } from "@/components/mushaf/MushafReader";
import {
  EDGE_GAP, computeLayout, pageTop, readingAnchor, scrollStep, scrollTopForAnchor, scrollTopForPage, visibleRange,
} from "@/components/mushaf/readerLayout";
import { DOUBLE_TAP_MS, LONG_PRESS_MS } from "@/components/mushaf/mushafGestures";
import { LETTER_EM, LONGEST_WORD_LETTERS, readingFontPx } from "@/components/mushaf/readingZoom";
import { getPage } from "@/lib/quran";
import { ayahBody, surahNameAr } from "@/components/quran-reading/ayahDisplay";
import { TOTAL_PAGES, loadBookmarks, loadPosition, toArabicDigits as ar } from "@/lib/mushaf";

/* ---------- a phone-sized viewport for the reader's scroll container ---------- */
const viewport = { w: 390, h: 844 };
const layoutFor = (w = viewport.w, h = viewport.h) =>
  computeLayout({ width: w, height: h, safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0 });

beforeAll(() => {
  const scrollView = (el: HTMLElement) => el.dataset?.testid === "mushaf-scroller" || el.dataset?.testid === "mushaf-reading";
  const size = (dim: "w" | "h") =>
    function (this: HTMLElement) {
      return scrollView(this) ? viewport[dim] : 0;
    };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: size("w") });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: size("h") });
  // The reading text is long: room to scroll (jsdom lays nothing out).
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset?.testid === "mushaf-reading" ? 100_000 : 0;
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "ar");
  viewport.w = 390;
  viewport.h = 844;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderReader(url = "/mushaf") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider>
        <LocaleProvider>
          <MushafReader />
        </LocaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const scroller = () => screen.getByTestId("mushaf-scroller");
const shownPage = () => screen.getByTestId("mushaf-page-number").textContent;
const mounted = () => screen.getAllByTestId("mushaf-page").map((el) => Number(el.dataset.page));
const pageBox = (p: number) => document.querySelector<HTMLElement>(`[data-testid="mushaf-page"][data-page="${p}"]`);
const px = (n: number) => `${n}px`;
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
const touch = (clientX: number, clientY: number) => ({ clientX, clientY });

/** What the browser does when the user scrolls: a new offset, then a scroll event. */
async function scrollTo(y: number) {
  act(() => {
    scroller().scrollTop = y;
    fireEvent.scroll(scroller());
  });
  await frame();
  await frame();
}

/** Two fingers around (cx, cy), spreading from d0 to d1 px apart. */
function pinchAt(cx: number, cy: number, d0: number, d1: number, lift = true) {
  act(() => {
    fireEvent.touchStart(scroller(), { touches: [touch(cx - d0 / 2, cy), touch(cx + d0 / 2, cy)] });
    fireEvent.touchMove(scroller(), { touches: [touch(cx - d1 / 2, cy), touch(cx + d1 / 2, cy)] });
    if (lift) fireEvent.touchEnd(scroller(), { touches: [] });
  });
}

function doubleTap(x: number, y: number) {
  act(() => {
    fireEvent.click(scroller(), { clientX: x, clientY: y });
    fireEvent.click(scroller(), { clientX: x, clientY: y });
  });
}

describe("vertical reading: whole pages, fit width, one column", () => {
  it("opens at the saved page, each page whole at fit width, centred, top to bottom, no horizontal overflow", () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 250, surah: 12, at: 1 }));
    renderReader();
    const L = layoutFor();
    const el = scroller();

    expect(el.style.overflowX).toBe("hidden");
    expect(el.style.overflowY).toBe("auto");
    expect(el.style.touchAction).toBe("pan-y");
    expect(el.getAttribute("style") ?? "").not.toMatch(/snap/);
    expect(el.getAttribute("dir")).toBe("ltr"); // the app's RTL never turns the column sideways
    expect(el.scrollTop).toBe(scrollTopForPage(L, 250));
    expect(screen.getByTestId("mushaf-column").style.height).toBe(px(L.contentH));
    expect(shownPage()).toBe(ar(250));

    // Virtualized: the pages around the screen, not all 604.
    const r = visibleRange(L, el.scrollTop, 2);
    const pages = mounted();
    expect(pages).toEqual(Array.from({ length: r.last - r.first + 1 }, (_, i) => r.first + i));
    expect(pages).toContain(250);
    expect(pages.length).toBeLessThan(10);

    let previousBottom = -Infinity;
    for (const p of pages) {
      const box = pageBox(p)!;
      expect(box.style.width).toBe(px(L.pageW));
      expect(box.style.height).toBe(px(L.pageH));
      expect(box.style.left).toBe(px(L.left));
      expect(box.style.top).toBe(px(pageTop(L, p)));
      const top = parseFloat(box.style.top);
      expect(top).toBeGreaterThanOrEqual(previousBottom); // no overlap
      previousBottom = top + L.pageH;
    }
    expect(L.left).toBeGreaterThanOrEqual(0);
    expect(L.left + L.pageW).toBeLessThanOrEqual(viewport.w);
    expect(Math.abs(L.pageW / L.pageH - 1280 / 2071)).toBeLessThan(0.002);

    const img = within(pageBox(250)!).getByRole("img");
    expect(img).toHaveAttribute("alt", "صفحة 250 من المصحف");
    expect(img).toHaveAttribute("width", "1280");
    expect(img).toHaveAttribute("height", "2071");
    expect(img.style.objectFit).toBe("contain");
  });

  it("?page= opens that page (search results, shared links, reading mode)", () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 250, surah: 12, at: 1 }));
    renderReader("/mushaf?page=77");
    expect(scroller().scrollTop).toBe(scrollTopForPage(layoutFor(), 77));
    expect(shownPage()).toBe(ar(77));
  });

  it("the first and the last page stay inside the column", async () => {
    renderReader(`/mushaf?page=${TOTAL_PAGES}`);
    const L = layoutFor();
    expect(scroller().scrollTop).toBe(L.maxScroll);
    const lastBottom = pageTop(L, TOTAL_PAGES) + L.pageH - scroller().scrollTop;
    expect(lastBottom).toBe(viewport.h - EDGE_GAP);
    expect(shownPage()).toBe(ar(TOTAL_PAGES));
    act(() => { fireEvent.keyDown(window, { key: "Home" }); });
    expect(scroller().scrollTop).toBe(0);
    expect(pageTop(L, 1)).toBe(EDGE_GAP);
    expect(shownPage()).toBe(ar(1));
  });
});

describe("continuous scrolling and the current page", () => {
  it("any scroll offset is kept (no paging / snapping) and the page shown follows the most visible page", async () => {
    renderReader();
    const L = layoutFor();
    await scrollTo(scrollTopForPage(L, 10) + 100);
    expect(shownPage()).toBe(ar(10));
    await scrollTo(scrollTopForPage(L, 10) + 500); // page 11 now fills more of the screen
    expect(shownPage()).toBe(ar(11));
    const odd = 12_345;
    await scrollTo(odd);
    await pause(120);
    expect(scroller().scrollTop).toBe(odd);
  });

  it("the mounted window follows the reader without moving anything", async () => {
    renderReader();
    const L = layoutFor();
    await scrollTo(scrollTopForPage(L, 300));
    const pages = mounted();
    expect(pages).toContain(300);
    expect(pages).not.toContain(1);
    for (const p of pages) expect(pageBox(p)!.style.top).toBe(px(pageTop(L, p)));
    expect(scroller().scrollTop).toBe(scrollTopForPage(L, 300)); // mounting pages never shifts the reader
    await scrollTo(0);
    expect(mounted()).toContain(1);
    expect(mounted()).not.toContain(300);
  });

  it("reopening the Mushaf returns to the last page read", async () => {
    const first = renderReader();
    const L = layoutFor();
    await scrollTo(scrollTopForPage(L, 120) + 30);
    expect(shownPage()).toBe(ar(120));
    first.unmount();
    expect(loadPosition().page).toBe(120);
    renderReader();
    expect(scroller().scrollTop).toBe(scrollTopForPage(L, 120));
    expect(shownPage()).toBe(ar(120));
  });
});

describe("keyboard / scroll controls: small smooth steps, never a page jump", () => {
  it("one press moves a small step, presses add up, and both ends are hard limits", async () => {
    renderReader();
    const L = layoutFor();
    const step = scrollStep(L);
    expect(step).toBeLessThan(L.pageH / 3);

    act(() => { fireEvent.keyDown(window, { key: "ArrowDown" }); });
    await waitFor(() => expect(scroller().scrollTop).toBe(step));
    await scrollTo(scroller().scrollTop);
    expect(shownPage()).toBe(ar(1)); // still reading page 1: a press never jumps to the next page
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
      fireEvent.keyDown(window, { key: "ArrowLeft" }); // the Mushaf's "forward"
    });
    await waitFor(() => expect(scroller().scrollTop).toBe(3 * step));

    act(() => {
      for (let i = 0; i < 6; i++) fireEvent.keyDown(window, { key: "ArrowUp" });
    });
    await waitFor(() => expect(scroller().scrollTop).toBe(0));

    // Page Down is a bigger step, but still less than a page and not snapped to one.
    act(() => { fireEvent.keyDown(window, { key: "PageDown" }); });
    await waitFor(() => expect(scroller().scrollTop).toBe(Math.round(viewport.h / 2)));
    expect(scroller().scrollTop).toBeLessThan(L.pageH);
    act(() => { fireEvent.keyDown(window, { key: "PageUp" }); });
    await waitFor(() => expect(scroller().scrollTop).toBe(0));

    act(() => { fireEvent.keyDown(window, { key: "End" }); });
    expect(scroller().scrollTop).toBe(L.maxScroll);
    act(() => { fireEvent.keyDown(window, { key: "ArrowDown" }); });
    await pause(300);
    expect(scroller().scrollTop).toBe(L.maxScroll);
  });

  it("holding a key keeps moving smoothly and stops when released", async () => {
    renderReader();
    const L = layoutFor();
    act(() => { fireEvent.keyDown(window, { key: "ArrowDown", repeat: true }); });
    await pause(200);
    act(() => { fireEvent.keyUp(window, { key: "ArrowDown" }); });
    const y = scroller().scrollTop;
    expect(y).toBeGreaterThan(30);
    expect(y).toBeLessThan(L.pageH);
    await pause(100);
    expect(scroller().scrollTop).toBe(y);
  });

  it("keys typed into the search box never scroll the Mushaf", async () => {
    renderReader();
    fireEvent.click(screen.getByLabelText("بحث"));
    const input = screen.getByPlaceholderText("رقم الصفحة أو آية مثل 2:255");
    act(() => { fireEvent.keyDown(input, { key: "ArrowDown" }); });
    await pause(300);
    expect(scroller().scrollTop).toBe(0);
  });
});

describe("going to a page: index, search, bookmarks", () => {
  it("a far page from the index opens directly at that page (no scrolling through the pages between)", () => {
    renderReader();
    const L = layoutFor();
    fireEvent.click(screen.getByLabelText("بحث"));
    fireEvent.click(screen.getByRole("button", { name: ar(300) }));
    expect(scroller().scrollTop).toBe(scrollTopForPage(L, 300));
    expect(shownPage()).toBe(ar(300));
    expect(mounted()).toContain(300);
    expect(screen.queryByPlaceholderText("رقم الصفحة أو آية مثل 2:255")).toBeNull(); // sheet closed
  });

  it("typing a page number goes to it", async () => {
    renderReader();
    fireEvent.click(screen.getByLabelText("بحث"));
    const input = screen.getByPlaceholderText("رقم الصفحة أو آية مثل 2:255");
    fireEvent.change(input, { target: { value: "450" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(shownPage()).toBe(ar(450)));
    expect(scroller().scrollTop).toBe(scrollTopForPage(layoutFor(), 450));
  });

  it("a verse search result opens its page, shown whole at the top", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ data: { page: 42 } }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderReader();
    fireEvent.click(screen.getByLabelText("بحث"));
    const verse = screen.getByPlaceholderText("سورة:آية — مثال 18:10");
    fireEvent.change(verse, { target: { value: "2:255" } });
    fireEvent.click(within(verse.parentElement!).getByRole("button", { name: "بحث" }));
    await waitFor(() => expect(shownPage()).toBe(ar(42)));
    expect(fetchMock).toHaveBeenCalledWith("https://api.alquran.cloud/v1/ayah/2:255");
    const L = layoutFor();
    expect(scroller().scrollTop).toBe(scrollTopForPage(L, 42));
    expect(pageTop(L, 42) - scroller().scrollTop).toBe(L.top);
    expect(L.top + L.pageH).toBeLessThanOrEqual(viewport.h);
  });

  it("a near page scrolls there smoothly, through intermediate positions", async () => {
    renderReader();
    const L = layoutFor();
    const target = scrollTopForPage(L, 2);
    fireEvent.click(screen.getAllByText("ٱلْفَاتِحَةِ")[0]); // the surah pill in the top bar
    fireEvent.click(screen.getByText("البَقَرَةِ"));
    const seen: number[] = [];
    await waitFor(() => {
      seen.push(scroller().scrollTop);
      expect(scroller().scrollTop).toBe(target);
    }, { interval: 16 });
    expect(seen.some((y) => y > 0 && y < target)).toBe(true);
    await scrollTo(target);
    expect(shownPage()).toBe(ar(2));
  });

  it("bookmarks: saving never moves, scrolling never changes them, opening one goes to its page", async () => {
    localStorage.setItem("mushaf:bookmarks", JSON.stringify([{ page: 377, surah: 17, label: "الإسراء", at: 1 }]));
    renderReader();
    const L = layoutFor();
    fireEvent.click(screen.getByLabelText("حفظ الصفحة"));
    expect(loadBookmarks().map((b) => b.page)).toEqual([1, 377]);
    expect(scroller().scrollTop).toBe(0);
    await scrollTo(40);
    await scrollTo(90);
    expect(loadBookmarks().map((b) => b.page)).toEqual([1, 377]);

    fireEvent.click(screen.getByLabelText("بحث"));
    fireEvent.click(screen.getByRole("button", { name: "المفضلة" }));
    fireEvent.click(screen.getByText("الإسراء"));
    expect(scroller().scrollTop).toBe(scrollTopForPage(L, 377));
    expect(shownPage()).toBe(ar(377));
    expect(loadBookmarks().map((b) => b.page)).toEqual([1, 377]);
  });
});

describe("reading zoom: pinch, double tap and levels read the page's text, never a cut picture", () => {
  const COLUMN = viewport.w - 2 * 16; // the reading column on a 390 pt phone
  const reading = () => screen.queryByTestId("mushaf-reading");
  const readingText = () => screen.getByTestId("mushaf-reading-text");
  const fontOf = () => parseFloat(readingText().style.fontSize);
  /** A viewport height on `page` (`at` of its height) in the page images. */
  const onPage = (page: number, at = 0.5) => pageTop(layoutFor(), page) - scroller().scrollTop + layoutFor().pageH * at;
  const twoFingers = (cx: number, cy: number, d: number) => [touch(cx - d / 2, cy), touch(cx + d / 2, cy)];

  it("1x is the printed page: page images, no reading layer, no transform anywhere", () => {
    renderReader("/mushaf?page=50");
    expect(reading()).toBeNull();
    for (const p of mounted()) {
      expect(pageBox(p)!.querySelector("[style*='transform']")).toBeNull();
      expect(pageBox(p)!.style.touchAction).toBe("pan-y");
    }
    expect(screen.getByTestId("mushaf-zoom-out")).toBeDisabled();
  });

  it("pinch start → move → end: past 1.15 the pinched page opens as its text, which grows with the fingers and stays exactly where they leave it", async () => {
    renderReader("/mushaf?page=50");
    const cx = 195;
    const cy = onPage(50);
    act(() => { fireEvent.touchStart(scroller(), { touches: twoFingers(cx, cy, 100) }); });
    act(() => { fireEvent.touchMove(scroller(), { touches: twoFingers(cx, cy, 110) }); });
    expect(reading()).toBeNull(); // 1.1x: still the page
    act(() => { fireEvent.touchMove(scroller(), { touches: twoFingers(cx, cy, 150) }); });
    expect(reading()).not.toBeNull(); // 1.5x: reading
    expect(fontOf()).toBeCloseTo(readingFontPx(1.5, COLUMN), 5);
    act(() => { fireEvent.touchMove(scroller(), { touches: twoFingers(cx, cy, 237) }); });
    expect(fontOf()).toBeCloseTo(readingFontPx(2.37, COLUMN), 5);
    act(() => { fireEvent.touchEnd(scroller(), { touches: [] }); });
    expect(fontOf()).toBeCloseTo(readingFontPx(2.37, COLUMN), 5); // no snap after lifting
    expect(localStorage.getItem("mushaf:readingZoom")).toBe("2.37");
    expect(shownPage()).toBe(ar(50));
    const expected = await getPage(50);
    await waitFor(() => expect(reading()!.querySelectorAll(`[data-page="50"][data-ayah]`)).toHaveLength(expected.length));
  });

  it("zoom levels 1.5x, 2x, 2.5x and 3x are real text sizes — never beyond 3x, and zooming out returns to the page", async () => {
    localStorage.setItem("mushaf:readingZoom", "1.5");
    renderReader("/mushaf?page=20");
    fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
    expect(fontOf()).toBeCloseTo(readingFontPx(1.5, COLUMN), 5);
    const sizes = [fontOf()];
    for (const z of [1.875, 2.34375, 2.9296875, 3]) {
      fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
      expect(fontOf()).toBeCloseTo(readingFontPx(z, COLUMN), 5);
      sizes.push(fontOf());
    }
    fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
    expect(fontOf()).toBeCloseTo(readingFontPx(3, COLUMN), 5); // capped at 3x
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(readingFontPx(2, COLUMN)).toBeGreaterThan(1.9 * readingFontPx(1, COLUMN));
    for (let i = 0; i < 8 && reading(); i++) fireEvent.click(screen.getByTestId("mushaf-zoom-out"));
    expect(reading()).toBeNull();
    expect(shownPage()).toBe(ar(20));
  });

  it("pinching the text back below 1.1x returns to the printed page, at the page being read", async () => {
    renderReader("/mushaf?page=50");
    const cx = 195;
    const cy = onPage(50);
    act(() => {
      fireEvent.touchStart(scroller(), { touches: twoFingers(cx, cy, 100) });
      fireEvent.touchMove(scroller(), { touches: twoFingers(cx, cy, 150) });
      fireEvent.touchEnd(scroller(), { touches: [] });
    });
    expect(reading()).not.toBeNull();
    await waitFor(() => expect(reading()!.querySelector("[data-ayah]")).not.toBeNull());
    act(() => {
      fireEvent.touchStart(reading()!, { touches: twoFingers(cx, 300, 200) });
      fireEvent.touchMove(reading()!, { touches: twoFingers(cx, 300, 120) }); // 1.5 × 0.6 = 0.9
      fireEvent.touchEnd(reading()!, { touches: [] });
    });
    expect(reading()).toBeNull();
    expect(scroller().style.visibility).toBe("");
    // Back on page 50 (then refined to the printed line of the ayah that was being read).
    const L = layoutFor();
    await waitFor(() => expect(scroller().scrollTop).toBeGreaterThanOrEqual(scrollTopForPage(L, 50)));
    expect(scroller().scrollTop).toBeLessThan(scrollTopForPage(L, 50) + L.pageH);
    expect(shownPage()).toBe(ar(50));
  });

  it("double tap: the page opens its text at 2x where it was tapped; double tap on the text returns to the page", () => {
    renderReader("/mushaf?page=120");
    doubleTap(195, onPage(120, 0.4));
    expect(reading()).not.toBeNull();
    expect(fontOf()).toBeCloseTo(readingFontPx(2, COLUMN), 5);
    expect(shownPage()).toBe(ar(120));
    act(() => {
      fireEvent.click(reading()!, { clientX: 195, clientY: 300 });
      fireEvent.click(reading()!, { clientX: 195, clientY: 300 });
    });
    expect(reading()).toBeNull();
    expect(shownPage()).toBe(ar(120));
  });

  it("scroll → pinch → scroll: one finger always scrolls natively; two fingers freeze scrolling only while they are down", async () => {
    renderReader("/mushaf?page=30");
    await scrollTo(scrollTopForPage(layoutFor(), 31));
    expect(shownPage()).toBe(ar(31));
    act(() => { fireEvent.touchStart(scroller(), { touches: twoFingers(195, 300, 100) }); });
    expect(scroller().style.overflowY).toBe("hidden"); // the scroll can't take the pinch over
    act(() => { fireEvent.touchEnd(scroller(), { touches: [touch(145, 300)] }); });
    expect(scroller().style.overflowY).toBe("auto"); // one finger left: scrolling again
    await scrollTo(scrollTopForPage(layoutFor(), 32));
    expect(shownPage()).toBe(ar(32));
    expect(reading()).toBeNull();
  });

  it("the zoom stays while reading on: scrolling through pages and going to a far page keep it, and the place is saved", async () => {
    renderReader("/mushaf?page=100");
    doubleTap(195, onPage(100));
    const size = fontOf();
    // Reading on: the section of page 101 reaches the top of the screen.
    await waitFor(() => expect(reading()!.querySelector('[data-reading-page="101"]')).not.toBeNull());
    for (const sec of Array.from(reading()!.querySelectorAll<HTMLElement>("[data-reading-page]"))) {
      const p = Number(sec.dataset.readingPage);
      sec.getBoundingClientRect = () => ({ top: p <= 101 ? -50 : 900, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
    act(() => { fireEvent.scroll(reading()!); });
    await frame();
    await frame();
    expect(shownPage()).toBe(ar(101));
    expect(fontOf()).toBe(size);
    // A far page from the index: shown in the text, at the same size.
    fireEvent.click(screen.getByLabelText("بحث"));
    fireEvent.click(screen.getByRole("button", { name: ar(300) }));
    expect(shownPage()).toBe(ar(300));
    await waitFor(() => expect(reading()!.querySelector('[data-reading-page="300"] [data-ayah]')).not.toBeNull());
    expect(fontOf()).toBe(size);
    await pause(500);
    expect(loadPosition().page).toBe(300);
  });

  it("the text is the local Quran text verbatim, and never cut: sized with font-size (no transform), wrapping, no sideways scroll", async () => {
    renderReader("/mushaf?page=2");
    fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
    const expected = await getPage(2);
    await waitFor(() => expect(reading()!.querySelectorAll('[data-page="2"][data-ayah]')).toHaveLength(expected.length));
    for (const a of expected) {
      expect(reading()!.querySelector(`[data-ayah="${a.key}"]`)!.textContent).toContain(ayahBody(a));
    }
    expect(within(reading()!).getByText(`سورة ${surahNameAr(2)}`)).toBeInTheDocument(); // Al-Baqara starts on page 2
    expect(reading()!.style.overflowX).toBe("hidden");
    expect(reading()!.style.touchAction).toBe("pan-y");
    expect(readingText().style.whiteSpace).toBe("normal");
    expect(readingText().style.overflowWrap).toBe("break-word");
    expect(readingText().style.maxWidth).toBe("100%");
    expect(reading()!.querySelector("[style*='transform']")).toBeNull();
    expect(fontOf() * LONGEST_WORD_LETTERS * LETTER_EM).toBeLessThanOrEqual(COLUMN);
  });

  it("holding a finger on the text opens that ayah, already selected", async () => {
    renderReader("/mushaf?page=2");
    fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
    await waitFor(() => expect(reading()!.querySelector('[data-ayah="2:3"]')).not.toBeNull());
    for (const span of Array.from(reading()!.querySelectorAll<HTMLElement>("[data-ayah]"))) {
      const held = span.dataset.ayah === "2:3";
      span.getBoundingClientRect = () => ({ top: held ? 280 : 2000, bottom: held ? 330 : 2050, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
    act(() => { fireEvent.touchStart(reading()!, { touches: [touch(195, 300)] }); });
    await pause(LONG_PRESS_MS + 100);
    act(() => { fireEvent.touchEnd(reading()!, { touches: [] }); });
    expect(await screen.findByTestId("mushaf-ayah-sheet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("mushaf-ayah-selection")).toHaveTextContent(`${surahNameAr(2)} ${ar(3)}`));
  });

  it("«Show full page» leaves the text for the printed page; Escape does the same", async () => {
    renderReader("/mushaf?page=40");
    fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
    act(() => { fireEvent.click(reading()!, { clientX: 100, clientY: 400 }); }); // a tap hides the toolbars
    await pause(DOUBLE_TAP_MS + 60);
    fireEvent.click(screen.getByTestId("mushaf-zoom-fit"));
    expect(reading()).toBeNull();
    fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
    expect(reading()).not.toBeNull();
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(reading()).toBeNull();
    expect(shownPage()).toBe(ar(40));
  });
});

describe("screen size changes", () => {
  it("keeps the reading place and never overflows sideways (bigger phone, then a narrow window)", async () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 100, surah: 7, at: 1 }));
    renderReader();
    const L1 = layoutFor();
    await scrollTo(scrollTopForPage(L1, 100) + 150);
    const before = scroller().scrollTop;

    viewport.w = 430;
    viewport.h = 932;
    act(() => { window.dispatchEvent(new Event("resize")); });
    const L2 = layoutFor();
    expect(pageBox(100)!.style.width).toBe(px(L2.pageW));
    expect(L2.left + L2.pageW).toBeLessThanOrEqual(viewport.w);
    expect(scroller().scrollTop).toBe(scrollTopForAnchor(L2, readingAnchor(L1, before)));
    expect(shownPage()).toBe(ar(100));

    viewport.w = 320;
    viewport.h = 700;
    act(() => { window.dispatchEvent(new Event("resize")); });
    const L3 = layoutFor();
    expect(pageBox(100)!.style.width).toBe(px(304));
    expect(L3.left + L3.pageW).toBeLessThanOrEqual(320);
    expect(shownPage()).toBe(ar(100));
  });
});

describe("language and accessibility", () => {
  it("English UI: page images and zoom controls are labelled in English", () => {
    localStorage.setItem("lang", "en");
    renderReader("/mushaf?page=250");
    expect(within(pageBox(250)!).getByRole("img")).toHaveAttribute("alt", "Mushaf page 250");
    expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom out")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mushaf pages" })).toBe(scroller());
  });
});

describe("no leaks", () => {
  it("every listener and observer the reader adds is removed when it closes", () => {
    const observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
        constructor() {
          observers.push(this);
        }
      },
    );
    // Elements and document go through EventTarget.prototype; jsdom's window has its own methods.
    const spies = {
      protoAdd: vi.spyOn(EventTarget.prototype, "addEventListener"),
      protoRemove: vi.spyOn(EventTarget.prototype, "removeEventListener"),
      winAdd: vi.spyOn(window, "addEventListener"),
      winRemove: vi.spyOn(window, "removeEventListener"),
    };
    type Spy = (typeof spies)["protoAdd"] | (typeof spies)["winAdd"];
    const calls = (spy: Spy, self?: EventTarget) =>
      spy.mock.calls.map((args, i) => ({ target: self ?? (spy.mock.contexts[i] as EventTarget), type: String(args[0]), listener: args[1] }));
    // Everything the reader, its gestures and its toolbars listen to.
    const READER_TYPES = new Set([
      "scroll", "touchstart", "touchmove", "touchend", "touchcancel", "wheel", "gesturestart", "gesturechange", "gestureend",
      "mousedown", "mousemove", "mouseup", "keydown", "keyup", "blur", "resize", "orientationchange", "visibilitychange", "pagehide",
    ]);
    try {
      const view = renderReader();
      const el = scroller();
      const root = el.parentElement as HTMLElement;
      expect(observers).toHaveLength(1);
      expect(observers[0].observe).toHaveBeenCalledWith(el);
      view.unmount();
      expect(observers[0].disconnect).toHaveBeenCalled();

      const added = [...calls(spies.protoAdd), ...calls(spies.winAdd, window)];
      const removed = [...calls(spies.protoRemove), ...calls(spies.winRemove, window)];
      const ours = added.filter(({ target, type }) => (target === window || target === document || target === el || target === root) && READER_TYPES.has(type));
      const where = (x: EventTarget) => (x === el ? "scroller" : x === root ? "root" : x === window ? "window" : "document");
      expect(ours.map(({ target, type }) => `${where(target)}:${type}`)).toEqual(
        expect.arrayContaining(["scroller:scroll", "root:touchstart", "root:touchmove", "root:wheel", "root:gesturestart", "window:keydown", "window:resize", "document:visibilitychange"]),
      );
      for (const { target, type, listener } of ours) {
        const gone = removed.some((r) => r.target === target && r.type === type && r.listener === listener);
        expect(gone, `${type} listener on ${where(target)}`).toBe(true);
      }
    } finally {
      Object.values(spies).forEach((s) => s.mockRestore());
    }
  });
});

/* ======================= auto-scroll, ayahs ======================= */

const bottomAction = (key: string) => document.querySelector<HTMLElement>(`[data-bar-action="${key}"]`)!;

describe("auto-scroll", () => {
  it("plays, pauses in place, resumes from the same place, changes speed, and closes", async () => {
    localStorage.setItem("mushaf:autoScrollLevel", "5");
    renderReader();
    fireEvent.click(bottomAction("autoscroll"));
    expect(screen.getByTestId("mushaf-autoscroll")).toBeInTheDocument();
    expect(screen.getByTestId("mushaf-bottom-bar").className).toContain("pointer-events-none"); // toolbars out of the way
    expect(screen.getByTestId("mushaf-autoscroll-toggle")).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(scroller().scrollTop).toBeGreaterThan(3), { timeout: 3000 });
    expect(scroller().scrollLeft).toBe(0);

    fireEvent.click(screen.getByTestId("mushaf-autoscroll-toggle")); // pause
    expect(screen.getByTestId("mushaf-autoscroll-toggle")).toHaveAttribute("aria-pressed", "false");
    await pause(700); // eases out, then stops
    const kept = scroller().scrollTop;
    await pause(300);
    expect(scroller().scrollTop).toBe(kept);

    fireEvent.click(screen.getByTestId("mushaf-autoscroll-toggle")); // play again
    await waitFor(() => expect(scroller().scrollTop).toBeGreaterThan(kept + 1), { timeout: 3000 });

    expect(screen.getByTestId("mushaf-autoscroll-faster")).toBeDisabled(); // already the fastest
    fireEvent.click(screen.getByTestId("mushaf-autoscroll-slower"));
    expect(screen.getByTestId("mushaf-autoscroll-speed")).toHaveTextContent(`سريع · ${ar(4)}/${ar(5)}`);
    expect(localStorage.getItem("mushaf:autoScrollLevel")).toBe("4");

    fireEvent.click(screen.getByTestId("mushaf-autoscroll-close"));
    expect(screen.queryByTestId("mushaf-autoscroll")).toBeNull();
    await pause(700);
    const closedAt = scroller().scrollTop;
    await pause(300);
    expect(scroller().scrollTop).toBe(closedAt);
  });

  it("a tap pauses / resumes; a pinch takes over and pauses it", async () => {
    localStorage.setItem("mushaf:autoScrollLevel", "5");
    renderReader();
    const L = layoutFor();
    fireEvent.click(bottomAction("autoscroll"));
    act(() => { fireEvent.click(scroller(), { clientX: 120, clientY: 300 }); });
    await pause(DOUBLE_TAP_MS + 60);
    expect(screen.getByTestId("mushaf-autoscroll-toggle")).toHaveAttribute("aria-pressed", "false");
    act(() => { fireEvent.click(scroller(), { clientX: 120, clientY: 300 }); });
    await pause(DOUBLE_TAP_MS + 60);
    expect(screen.getByTestId("mushaf-autoscroll-toggle")).toHaveAttribute("aria-pressed", "true");
    pinchAt(L.left + 150, pageTop(L, 1) + 200, 100, 180);
    expect(screen.getByTestId("mushaf-autoscroll-toggle")).toHaveAttribute("aria-pressed", "false");
  });

  it("in reading zoom it scrolls the text vertically — its size and sideways position are untouched", async () => {
    localStorage.setItem("mushaf:autoScrollLevel", "5");
    renderReader("/mushaf?page=10");
    fireEvent.click(screen.getByTestId("mushaf-zoom-in"));
    const text = screen.getByTestId("mushaf-reading");
    const size = screen.getByTestId("mushaf-reading-text").style.fontSize;
    // The text has loaded and been placed under the reader before auto-scroll is started.
    await waitFor(() => expect(text.querySelector('[data-page="10"][data-ayah]')).not.toBeNull());
    await frame();
    fireEvent.click(bottomAction("autoscroll"));
    const from = Math.max(0, text.scrollTop); // jsdom does not clamp a placement at the top
    await waitFor(() => expect(text.scrollTop).toBeGreaterThan(from + 3), { timeout: 3000 });
    expect(screen.getByTestId("mushaf-reading-text").style.fontSize).toBe(size);
    expect(text.scrollLeft).toBe(0);
  });

  it("closing the reader stops it (no frame keeps running)", async () => {
    localStorage.setItem("mushaf:autoScrollLevel", "5");
    const view = renderReader();
    fireEvent.click(bottomAction("autoscroll"));
    await waitFor(() => expect(scroller().scrollTop).toBeGreaterThan(1), { timeout: 3000 });
    const el = scroller();
    view.unmount();
    const at = el.scrollTop;
    await pause(400);
    expect(el.scrollTop).toBe(at);
  });
});

describe("ayahs from the page: long press, «الآيات», «التفسير», listen", () => {
  it("holding a finger on a page opens that page's ayahs (from the Quran data)", async () => {
    renderReader();
    const L = layoutFor();
    act(() => { fireEvent.touchStart(scroller(), { touches: [touch(L.left + 100, pageTop(L, 1) + 200)] }); });
    await pause(LONG_PRESS_MS + 100);
    act(() => { fireEvent.touchEnd(scroller(), { touches: [] }); });
    expect(await screen.findByTestId("mushaf-ayah-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("mushaf-ayah-sheet-title")).toHaveTextContent(`آيات الصفحة ${ar(1)}`);
    const expected = await getPage(1);
    await waitFor(() => expect(document.querySelectorAll("[data-ayah]")).toHaveLength(expected.length));
  });

  it("a finger that moves (a scroll) is not a long press", async () => {
    renderReader();
    const L = layoutFor();
    act(() => {
      fireEvent.touchStart(scroller(), { touches: [touch(L.left + 100, pageTop(L, 1) + 200)] });
      fireEvent.touchMove(scroller(), { touches: [touch(L.left + 100, pageTop(L, 1) + 150)] });
    });
    await pause(LONG_PRESS_MS + 100);
    act(() => { fireEvent.touchEnd(scroller(), { touches: [] }); });
    expect(screen.queryByTestId("mushaf-ayah-sheet")).toBeNull();
  });

  it("«التفسير» opens the whole page's tafsir from the local data", async () => {
    renderReader();
    fireEvent.click(bottomAction("tafsir"));
    const expected = await getPage(1);
    await waitFor(() => expect(screen.getByTestId("mushaf-tafsir")).toBeInTheDocument());
    const keys = Array.from(document.querySelectorAll("[data-tafsir-ayah]")).map((b) => b.getAttribute("data-tafsir-ayah"));
    expect(keys).toEqual(expected.map((a) => a.key));
  });

  it("listening to a selected range recites from its first ayah and stops after its last", async () => {
    const played: string[] = [];
    const players: HTMLMediaElement[] = [];
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      players.push(this);
      played.push(this.src);
      return Promise.resolve();
    });
    const ended = () => players[players.length - 1].dispatchEvent(new Event("ended"));
    try {
      renderReader();
      fireEvent.click(bottomAction("ayahs"));
      await waitFor(() => expect(document.querySelectorAll("[data-ayah]").length).toBeGreaterThan(3));
      const row = (k: string) => document.querySelector<HTMLElement>(`[data-ayah="${k}"]`)!;
      fireEvent.click(row("1:2"));
      fireEvent.click(row("1:3"));
      expect(screen.getByTestId("mushaf-ayah-selection")).toHaveTextContent(`${surahNameAr(1)} ${ar(2)}–${ar(3)}`);
      fireEvent.click(document.querySelector<HTMLElement>('[data-action="listen"]')!);
      await waitFor(() => expect(played).toHaveLength(1));
      expect(played[0]).toMatch(/\/001002\.mp3$/);
      await act(async () => { ended(); });
      await waitFor(() => expect(played).toHaveLength(2));
      expect(played[1]).toMatch(/\/001003\.mp3$/);
      await act(async () => { ended(); });
      await pause(50);
      expect(played).toHaveLength(2); // stopped after 1:3 — not on to 1:4
      expect(screen.queryByTestId("mushaf-audio-controls")).toBeNull();
    } finally {
      play.mockRestore();
    }
  });
});
