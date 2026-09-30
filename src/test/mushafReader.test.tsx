import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { MushafReader } from "@/components/mushaf/MushafReader";
import {
  EDGE_GAP, computeLayout, pageTop, readingAnchor, scrollStep, scrollTopForAnchor, scrollTopForPage, visibleRange,
} from "@/components/mushaf/readerLayout";
import { DOUBLE_TAP_ZOOM, MAX_ZOOM } from "@/components/mushaf/pageZoom";
import { DOUBLE_TAP_MS } from "@/components/mushaf/mushafGestures";
import { TOTAL_PAGES, loadBookmarks, loadPosition, toArabicDigits as ar } from "@/lib/mushaf";

/* ---------- a phone-sized viewport for the reader's scroll container ---------- */
const viewport = { w: 390, h: 844 };
const layoutFor = (w = viewport.w, h = viewport.h) =>
  computeLayout({ width: w, height: h, safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0 });

beforeAll(() => {
  const size = (dim: "w" | "h") =>
    function (this: HTMLElement) {
      return this.dataset?.testid === "mushaf-scroller" ? viewport[dim] : 0;
    };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: size("w") });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: size("h") });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
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
const layerOf = (p: number) => pageBox(p)?.querySelector<HTMLElement>("[data-zoom-layer]") ?? null;
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

describe("pinch zoom", () => {
  it("zooms the page under the fingers, around them, between fit and the maximum — the page box never grows", () => {
    renderReader();
    const L = layoutFor();
    const cx = L.left + 187;
    const cy = pageTop(L, 1) + 292; // scrollTop 0: client y = column y
    pinchAt(cx, cy, 100, 200, false); // fingers twice as far apart → 2x
    expect(layerOf(1)!.style.transform).toBe("translate(-187px, -292px) scale(2)");
    expect(layerOf(1)!.style.transformOrigin).toMatch(/^0(px)? 0(px)?/);
    expect(layerOf(2)!.style.transform).toBe(""); // the next page is untouched
    expect(pageBox(1)!.style.width).toBe(px(L.pageW));
    expect(pageBox(1)!.style.height).toBe(px(L.pageH));
    expect(pageBox(1)!.style.touchAction).toBe("none"); // one finger now pans inside the page
    expect(pageBox(2)!.style.touchAction).toBe("pan-y");

    act(() => { fireEvent.touchMove(scroller(), { touches: [touch(cx - 900, cy), touch(cx + 900, cy)] }); });
    expect(layerOf(1)!.style.transform).toMatch(new RegExp(`scale\\(${MAX_ZOOM}\\)$`));
    act(() => { fireEvent.touchEnd(scroller(), { touches: [] }); });
    expect(screen.getByTestId("mushaf-zoom-out")).not.toBeDisabled();

    pinchAt(cx, cy, 300, 20); // pinch back in, past the minimum
    expect(layerOf(1)!.style.transform).toBe("");
    expect(pageBox(1)!.style.touchAction).toBe("pan-y");
    expect(screen.getByTestId("mushaf-zoom-out")).toBeDisabled();
    expect(scroller().scrollLeft).toBe(0);
  });

  it("a second finger landing during a native scroll does not start a zoom that would fight it", () => {
    renderReader();
    const L = layoutFor();
    const cx = L.left + 187;
    const cy = pageTop(L, 1) + 292;
    act(() => {
      // The browser is already scrolling: its touch events can't be cancelled.
      fireEvent.touchStart(scroller(), { touches: [touch(cx - 50, cy), touch(cx + 50, cy)], cancelable: false });
      fireEvent.touchMove(scroller(), { touches: [touch(cx - 150, cy), touch(cx + 150, cy)], cancelable: false });
      fireEvent.touchEnd(scroller(), { touches: [] });
    });
    expect(layerOf(1)!.style.transform).toBe("");
    expect(pageBox(1)!.style.touchAction).toBe("pan-y");
  });

  it("a one-finger pan stays inside the zoomed page, then carries on as reader scrolling", () => {
    renderReader();
    const L = layoutFor();
    const cx = L.left + L.pageW / 2;
    const cy = pageTop(L, 1) + L.pageH / 2;
    pinchAt(cx, cy, 100, 200); // 2x, kept after lifting
    expect(layerOf(1)!.style.transform).toContain("scale(2)");

    act(() => {
      fireEvent.touchStart(scroller(), { touches: [touch(cx, cy)] });
      fireEvent.touchMove(scroller(), { touches: [touch(cx + 2000, cy + 2000)] });
    });
    // Pulled far right/down: the page stops at its own top-left corner, nothing blank shows.
    expect(layerOf(1)!.style.transform).toBe("translate(0px, 0px) scale(2)");
    expect(scroller().scrollTop).toBe(0);

    act(() => { fireEvent.touchMove(scroller(), { touches: [touch(cx + 2000, cy - 1000)] }); });
    // Up 3000 px: the page takes what it has (its bottom edge), the reader scrolls the rest.
    expect(layerOf(1)!.style.transform).toBe(`translate(0px, -${L.pageH}px) scale(2)`);
    expect(scroller().scrollTop).toBe(3000 - L.pageH);
    expect(scroller().scrollLeft).toBe(0);
    act(() => { fireEvent.touchEnd(scroller(), { touches: [] }); });
  });

  it("double tap zooms at the tapped point; double tap again returns the page to fit, in place", async () => {
    renderReader();
    const L = layoutFor();
    const x = L.left + 100;
    const y = pageTop(L, 1) + 200;
    doubleTap(x, y);
    expect(layerOf(1)!.style.transform).toContain(`scale(${DOUBLE_TAP_ZOOM})`);
    doubleTap(x, y);
    expect(layerOf(1)!.style.transform).toBe("");
    // And reading carries on normally.
    await scrollTo(scrollTopForPage(L, 5));
    expect(shownPage()).toBe(ar(5));
  });

  it("zooming another page returns the first one to fit (each page keeps its own zoom)", () => {
    renderReader();
    const L = layoutFor();
    doubleTap(L.left + 100, pageTop(L, 1) + 200);
    expect(layerOf(1)!.style.transform).toContain("scale(");
    doubleTap(L.left + 100, pageTop(L, 2) + 100);
    expect(layerOf(2)!.style.transform).toContain(`scale(${DOUBLE_TAP_ZOOM})`);
    expect(layerOf(1)!.style.transform).toBe("");
  });

  it("a zoomed page that scrolls off screen is back at fit width when it returns", async () => {
    renderReader();
    const L = layoutFor();
    doubleTap(L.left + 100, pageTop(L, 1) + 200);
    expect(screen.getByTestId("mushaf-zoom-out")).not.toBeDisabled();
    await scrollTo(scrollTopForPage(L, 20));
    expect(screen.getByTestId("mushaf-zoom-out")).toBeDisabled();
    await scrollTo(0);
    expect(layerOf(1)!.style.transform).toBe("");
  });

  it("zoom works without gestures: buttons, keys, and a «show full page» button while zoomed", async () => {
    renderReader();
    fireEvent.click(screen.getByLabelText("تكبير"));
    expect(layerOf(1)!.style.transform).toContain("scale(1.5)");
    fireEvent.click(screen.getByLabelText("تصغير"));
    expect(layerOf(1)!.style.transform).toBe("");

    act(() => { fireEvent.keyDown(window, { key: "+" }); });
    expect(layerOf(1)!.style.transform).toContain("scale(1.5)");
    // A single tap hides the toolbars; the zoomed page then offers a one-tap way back.
    act(() => { fireEvent.click(scroller(), { clientX: 50, clientY: 50 }); });
    await pause(DOUBLE_TAP_MS + 60);
    fireEvent.click(await screen.findByTestId("mushaf-zoom-fit"));
    expect(layerOf(1)!.style.transform).toBe("");
    expect(screen.queryByTestId("mushaf-zoom-fit")).toBeNull();
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
      expect(observers).toHaveLength(1);
      expect(observers[0].observe).toHaveBeenCalledWith(el);
      view.unmount();
      expect(observers[0].disconnect).toHaveBeenCalled();

      const added = [...calls(spies.protoAdd), ...calls(spies.winAdd, window)];
      const removed = [...calls(spies.protoRemove), ...calls(spies.winRemove, window)];
      const ours = added.filter(({ target, type }) => (target === window || target === document || target === el) && READER_TYPES.has(type));
      const where = (x: EventTarget) => (x === el ? "scroller" : x === window ? "window" : "document");
      expect(ours.map(({ target, type }) => `${where(target)}:${type}`)).toEqual(
        expect.arrayContaining(["scroller:scroll", "scroller:touchstart", "scroller:touchmove", "scroller:wheel", "window:keydown", "window:resize", "document:visibilitychange"]),
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
