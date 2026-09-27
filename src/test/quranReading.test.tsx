import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import QuranReading from "@/pages/QuranReading";
import { MushafBottomBar } from "@/components/mushaf/MushafBars";
import { getAyah } from "@/lib/quran";
import { getPageInfo } from "@/lib/mushaf";
import { pageOfAyah, pageStartAyah } from "@/lib/quranAudio";
import { getLastActivity } from "@/lib/journey/store";
import { ayahBody, ayahShareText, splitAyahMark, surahNameAr, tafsirSegments } from "@/components/quran-reading/ayahDisplay";
import { mushafUrlForAyah, parseAyahParam, readingStart, readingUrlForPage } from "@/components/quran-reading/position";
import { FONT_SIZE, FONT_SIZE_KEY, QURAN_READING_FONT } from "@/components/quran-reading/readingPrefs";

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function app(initial: string, lang: "ar" | "en" = "ar") {
  localStorage.setItem("lang", lang);
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initial]}>
        <ThemeProvider>
          <LocaleProvider>
            <Routes>
              <Route path="/mushaf/read" element={<QuranReading />} />
              <Route path="*" element={<p>OTHER</p>} />
            </Routes>
            <Where />
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const ayahs = () => Array.from(document.querySelectorAll<HTMLElement>("[data-ayah]"));
const flows = () => screen.getAllByTestId("reading-flow");
const loaded = (key: string) => waitFor(() => expect(document.querySelector(`[data-ayah="${key}"]`)).toBeTruthy(), { timeout: 4000 });

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("/mushaf/read — real text, one surah at a time", () => {
  it("renders Al-Baqarah as 286 independent ayahs with stable data-ayah ids, RTL, and nothing else", async () => {
    app("/mushaf/read?ayah=2:255");
    await loaded("2:255");
    expect(screen.getByTestId("quran-reading").getAttribute("dir")).toBe("rtl");
    const keys = ayahs().map((el) => el.dataset.ayah);
    expect(keys).toHaveLength(286);
    expect(new Set(keys).size).toBe(286);
    expect(keys[0]).toBe("2:1");
    expect(keys[285]).toBe("2:286");
    expect(keys.every((k) => /^2:\d+$/.test(k ?? ""))).toBe(true); // windowing: only the requested surah
    expect(screen.getByTestId("reading-title").textContent).toBe(`سورة ${surahNameAr(2)}`);
    // The basmala (source text of 1:1) loads separately from the surah — wait for it.
    expect((await screen.findByTestId("reading-basmala", {}, { timeout: 4000 })).textContent).toBe(ayahBody((await getAyah(1, 1))!));
  });

  it("is RTL in the English UI too (the Quran text is always right-to-left)", async () => {
    app("/mushaf/read?ayah=112:1", "en");
    await loaded("112:1");
    expect(screen.getByTestId("quran-reading").getAttribute("dir")).toBe("rtl");
    expect(ayahs()).toHaveLength(4);
  });

  it("2:255 shows the source text and, when tapped, its own Al-Muyassar tafsir", async () => {
    app("/mushaf/read?ayah=2:255");
    await loaded("2:255");
    const a = (await getAyah(2, 255))!;
    const el = document.querySelector<HTMLElement>('[data-ayah="2:255"]')!;
    expect(el.textContent?.startsWith(ayahBody(a))).toBe(true);
    expect(el.textContent).toContain("٢٥٥");

    fireEvent.click(el);
    const sheet = await screen.findByTestId("ayah-sheet");
    expect(within(sheet).getByTestId("ayah-sheet-title").textContent).toBe(`سورة ${surahNameAr(2)} · الآية ٢٥٥`);
    expect(within(sheet).getByTestId("ayah-sheet-text").textContent).toBe(ayahBody(a));
    const tafsir = within(sheet).getByTestId("ayah-tafsir");
    expect(tafsir.textContent).toContain("التفسير الميسر");
    expect(tafsir.textContent).toContain(tafsirSegments(a.tafsir.text).map((s) => s.text).join(""));
    expect(tafsir.textContent).toContain("[255] الله الذي لا يستحق الألوهية");
    expect(tafsir.textContent).toContain("مجمع الملك فهد لطباعة المصحف الشريف");
    // Actions: copy/share work now; listen/save are placeholders for later phases.
    const act = (id: string) => within(sheet).getByTestId("ayah-actions").querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
    expect(act("copy").disabled).toBe(false);
    expect(act("share").disabled).toBe(false);
    expect(act("listen").disabled).toBe(true);
    expect(act("save").disabled).toBe(true);
  });
});

describe("text size — font-size and reflow, never a transform", () => {
  it("A+ / A− change font-size, are clamped, and are remembered", async () => {
    const first = app("/mushaf/read?ayah=108:1");
    await loaded("108:1");
    const size = () => flows()[0].style.fontSize;
    expect(size()).toBe(`${FONT_SIZE.default}px`);
    fireEvent.click(screen.getByTestId("font-larger"));
    expect(size()).toBe(`${FONT_SIZE.default + FONT_SIZE.step}px`);
    expect(localStorage.getItem(FONT_SIZE_KEY)).toBe(String(FONT_SIZE.default + FONT_SIZE.step));
    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByTestId("font-larger"));
    expect(size()).toBe(`${FONT_SIZE.max}px`);
    expect((screen.getByTestId("font-larger") as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByTestId("font-smaller"));
    expect(size()).toBe(`${FONT_SIZE.min}px`);
    expect((screen.getByTestId("font-smaller") as HTMLButtonElement).disabled).toBe(true);
    first.unmount();

    app("/mushaf/read?ayah=108:1");
    await loaded("108:1");
    expect(flows()[0].style.fontSize).toBe(`${FONT_SIZE.min}px`);
  });

  it("no element of the reader is scaled, letter-spaced, or allowed to break words or scroll sideways", async () => {
    app("/mushaf/read?ayah=2:255");
    await loaded("2:255");
    fireEvent.click(screen.getByTestId("font-larger"));
    const root = screen.getByTestId("quran-reading");
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      expect(el.style.transform, el.tagName).not.toMatch(/scale|matrix/);
      expect(el.style.letterSpacing).toMatch(/^(0(px)?)?$/); // unset, or the explicit reset to 0
      expect(el.style.wordBreak).not.toBe("break-all");
      expect(el.style.whiteSpace).not.toBe("nowrap");
    }
    expect(screen.getByTestId("reading-scroll").className).toMatch(/\boverflow-x-hidden\b/);
    for (const f of flows()) {
      expect(f.style.overflowWrap).toBe("break-word");
      expect(f.style.wordBreak).toBe("normal");
      expect(f.style.maxWidth).toBe("100%");
    }
  });

  it("the reading-mode source never uses transform scale, zoom, break-all, nowrap, sideways scroll or content-visibility", () => {
    const files = [...readdirSync("src/components/quran-reading").map((f) => `src/components/quran-reading/${f}`), "src/pages/QuranReading.tsx"];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/scale\(|\bzoom\b|break-all|nowrap|overflow-x-(auto|scroll)|contentVisibility|containIntrinsicSize|content-visibility\s*:/i);
      // The only letter-spacing allowed is the explicit reset to 0 from QURAN_READING_FONT.
      expect(src, f).not.toMatch(/letter-spacing\s*:|tracking-/);
      for (const m of src.matchAll(/letterSpacing:\s*([^,}\n]+)/g)) {
        expect(m[1].trim(), f).toMatch(/^(QURAN_READING_FONT\.letterSpacing|0)$/);
      }
    }
    expect(QURAN_READING_FONT.letterSpacing).toBe(0);
  });

  it("Quran text has letter-spacing 0 even though body sets one (computed style, not just inline)", async () => {
    // The same rule as src/index.css's body — Quran text must not inherit it.
    expect(readFileSync("src/index.css", "utf8")).toMatch(/body\s*{[^}]*letter-spacing:\s*0\.005em/);
    const style = document.createElement("style");
    style.textContent = "body { letter-spacing: 0.005em; }";
    document.head.appendChild(style);
    try {
      app("/mushaf/read?ayah=2:255");
      await loaded("2:255");
      fireEvent.click(document.querySelector<HTMLElement>('[data-ayah="2:255"]')!);
      await screen.findByTestId("ayah-sheet-text");
      const quranText = Array.from(document.querySelectorAll<HTMLElement>("[data-quran-text]"));
      // reading flows (one per page) + basmala + the sheet's ayah text
      expect(quranText.length).toBe(flows().length + 2);
      for (const el of quranText) expect(getComputedStyle(el).letterSpacing, el.dataset.testid).toMatch(/^0(px)?$/);
      expect(getComputedStyle(document.body).letterSpacing).toBe("0.005em");
    } finally {
      style.remove();
    }
  });

  it("the surah is laid out for real: no content-visibility / placeholder sizes", async () => {
    app("/mushaf/read?ayah=2:255");
    await loaded("2:255");
    const sections = Array.from(document.querySelectorAll<HTMLElement>("article section[data-page]"));
    expect(sections.length).toBeGreaterThan(40);
    for (const s of sections) expect(s.getAttribute("style") ?? "").not.toMatch(/content-visibility|contain-intrinsic/);
  });
});

describe("ayah actions — Copy and Share", () => {
  async function openAyah(key: string) {
    app(`/mushaf/read?ayah=${key}`);
    await loaded(key);
    fireEvent.click(document.querySelector<HTMLElement>(`[data-ayah="${key}"]`)!);
    const sheet = await screen.findByTestId("ayah-sheet");
    return (id: string) => within(sheet).getByTestId("ayah-actions").querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("Copy puts ﴿ayah﴾ [surah: n] on the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText }, share: undefined });
    const act = await openAyah("2:255");
    fireEvent.click(act("copy"));
    const a = (await getAyah(2, 255))!;
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ayahShareText(a)));
    expect(ayahShareText(a)).toBe(`﴿${ayahBody(a)}﴾ [${surahNameAr(2)}: ٢٥٥]`);
  });

  it("Share uses the system share sheet when available, and falls back to copying", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText }, share });
    const act = await openAyah("112:1");
    fireEvent.click(act("share"));
    const a = (await getAyah(112, 1))!;
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: ayahShareText(a) }));
    expect(writeText).not.toHaveBeenCalled();
    cleanup();

    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText }, share: undefined });
    const act2 = await openAyah("112:1");
    fireEvent.click(act2("share"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ayahShareText(a)));
  });
});

describe("position — shared with the Mushaf through PAGE_START", () => {
  it("without ?ayah, reading starts at pageStartAyah of the Mushaf's saved page", async () => {
    localStorage.setItem("mushaf:position", JSON.stringify({ page: 42, surah: 2, at: 1 }));
    expect(readingStart(null)).toEqual(pageStartAyah(42));
    expect(readingStart("9:999")).toEqual(pageStartAyah(42)); // invalid ayah → the saved page
    app("/mushaf/read");
    const s = pageStartAyah(42);
    await loaded(`${s.surah}:${s.ayah}`);
    expect(ayahs()[0].dataset.ayah).toBe("2:1");
  });

  it("pageOfAyah / pageStartAyah hand the position over both ways, for all 604 pages", () => {
    expect(parseAyahParam("2:255")).toEqual({ surah: 2, ayah: 255 });
    expect(parseAyahParam("2:287")).toBeNull();
    expect(mushafUrlForAyah({ surah: 2, ayah: 255 })).toBe("/mushaf?page=42");
    for (let p = 1; p <= 604; p++) {
      const a = pageStartAyah(p);
      expect(readingUrlForPage(p)).toBe(`/mushaf/read?ayah=${a.surah}:${a.ayah}`);
      expect(pageOfAyah(a)).toBe(p);
    }
  });

  it("«المصحف» opens the Mushaf page of the ayah being read", async () => {
    app("/mushaf/read?ayah=2:255");
    await loaded("2:255");
    fireEvent.click(screen.getByTestId("to-mushaf"));
    expect(screen.getByTestId("where").textContent).toBe("/mushaf?page=42");
  });

  it("the Mushaf's «القراءة» button opens reading mode at the first ayah of its page", () => {
    localStorage.setItem("lang", "ar");
    const noop = () => undefined;
    render(
      <MemoryRouter initialEntries={["/mushaf"]}>
        <LocaleProvider>
          <MushafBottomBar visible info={getPageInfo(42)} playing={false} audioActive={false} nowAyah={null}
            onAudio={noop} onStop={noop} onPrevAyah={noop} onNextAyah={noop} onTranslation={noop} onShare={noop} onCopy={noop} onTafsir={noop} onSettings={noop} />
          <Where />
        </LocaleProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("القراءة"));
    const a = pageStartAyah(42);
    expect(screen.getByTestId("where").textContent).toBe(`/mushaf/read?ayah=${a.surah}:${a.ayah}`);
  });

  it("moving to the next surah renders that surah only", async () => {
    app("/mushaf/read?ayah=112:1");
    await loaded("112:1");
    fireEvent.click(screen.getByTestId("next-surah"));
    await loaded("113:1");
    expect(ayahs().every((el) => el.dataset.ayah?.startsWith("113:"))).toBe(true);
    expect(screen.getByTestId("where").textContent).toBe("/mushaf/read?ayah=113:1");
  });
});

describe("Journey and data", () => {
  it("opening the reader records the existing Quran activity (no new Journey system)", async () => {
    app("/mushaf/read?ayah=2:255");
    await loaded("2:255");
    expect(getLastActivity()).toMatchObject({ id: "quran:mushaf", type: "quran", route: "/mushaf", metadata: { page: 42 } });
  });

  it("the display split of the ayah-number glyph is lossless for every ayah shown", async () => {
    for (const [s, a] of [[1, 1], [2, 255], [2, 286], [114, 6]] as const) {
      const ayah = (await getAyah(s, a))!;
      const { body, mark } = splitAyahMark(ayah.text);
      expect(mark).not.toBeNull();
      expect(`${body}\u00A0${mark}`).toBe(ayah.text);
      expect(body.endsWith("\u00A0")).toBe(false);
    }
  });
});
