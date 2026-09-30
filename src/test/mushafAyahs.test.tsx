import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { MushafAyahSheet } from "@/components/mushaf/MushafAyahSheet";
import { isSelected, selectAyah, selectionLabel } from "@/components/mushaf/ayahSelection";
import { ayahBody, ayahRangeShareText, ayahShareText, surahNameAr, tafsirSegments } from "@/components/quran-reading/ayahDisplay";
import { getPage, QURAN_SOURCE } from "@/lib/quran";
import { PAGE_INFO } from "@/lib/mushafData";
import { toArabicDigits as ar } from "@/lib/mushaf";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "ar");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("selecting ayahs (logic)", () => {
  it("one tap = one ayah; a second tap = the range between them (either order)", () => {
    const one = selectAyah(null, { surah: 2, ayah: 30 });
    expect(one).toEqual({ surah: 2, from: 30, to: 30 });
    expect(selectAyah(one, { surah: 2, ayah: 31 })).toEqual({ surah: 2, from: 30, to: 31 });
    expect(selectAyah(one, { surah: 2, ayah: 27 })).toEqual({ surah: 2, from: 27, to: 30 });
  });

  it("tapping the selected ayah again clears it; a tap after a range starts a new selection", () => {
    const one = selectAyah(null, { surah: 2, ayah: 30 });
    expect(selectAyah(one, { surah: 2, ayah: 30 })).toBeNull();
    const range = { surah: 2, from: 30, to: 31 };
    expect(selectAyah(range, { surah: 2, ayah: 40 })).toEqual({ surah: 2, from: 40, to: 40 });
  });

  it("a range never crosses a surah (ayah numbers restart with each surah)", () => {
    const one = selectAyah(null, { surah: 2, ayah: 286 });
    expect(selectAyah(one, { surah: 3, ayah: 1 })).toEqual({ surah: 3, from: 1, to: 1 });
    expect(isSelected({ surah: 2, from: 1, to: 5 }, { surah: 3, ayah: 3 })).toBe(false);
    expect(isSelected({ surah: 2, from: 1, to: 5 }, { surah: 2, ayah: 5 })).toBe(true);
  });

  it("shows the range the way it is written: 30–31", () => {
    expect(selectionLabel({ surah: 2, from: 30, to: 31 }, "ar")).toBe(`${surahNameAr(2)} ٣٠–٣١`);
    expect(selectionLabel({ surah: 2, from: 30, to: 30 }, "ar")).toBe(`${surahNameAr(2)} ٣٠`);
    expect(selectionLabel({ surah: 2, from: 30, to: 31 }, "en")).toBe("Al-Baqara 30–31");
  });

  it("copies a range as one quotation, a single ayah exactly as before", async () => {
    const page = await getPage(2);
    const [a1, a2] = page;
    expect(ayahRangeShareText([a1])).toBe(ayahShareText(a1));
    const text = ayahRangeShareText([a1, a2]);
    expect(text.startsWith("﴿")).toBe(true);
    expect(text).toContain(ayahBody(a1));
    expect(text).toContain(ayahBody(a2));
    expect(text.endsWith(`[${surahNameAr(2)}: ١–٢]`)).toBe(true);
  });
});

function renderSheet(page: number, props: Partial<Parameters<typeof MushafAyahSheet>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <LocaleProvider>
      <MushafAyahSheet page={page} night={false} onClose={onClose} {...props} />
    </LocaleProvider>,
  );
  return { onClose };
}

const rows = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-ayah"));

describe("the ayah sheet (real Quran data)", () => {
  it("lists exactly the ayahs printed on the page, with their real text and numbers", async () => {
    const expected = await getPage(2);
    renderSheet(2);
    await waitFor(() => expect(rows()).toHaveLength(expected.length));
    expect(rows().map((r) => r.dataset.ayah)).toEqual(expected.map((a) => a.key));
    expect(expected.map((a) => a.key)).toEqual(["2:1", "2:2", "2:3", "2:4", "2:5"]);
    expect(rows()[2]).toHaveTextContent(ayahBody(expected[2]));
    expect(rows()[2]).toHaveTextContent(ar(3));
    expect(screen.getByTestId("mushaf-ayah-sheet-title")).toHaveTextContent(`آيات الصفحة ${ar(2)}`);
  });

  it("select 3 then 5 → «البقرة ٣–٥» and its actions", async () => {
    renderSheet(2);
    await waitFor(() => expect(rows()).toHaveLength(5));
    fireEvent.click(rows()[2]);
    expect(screen.getByTestId("mushaf-ayah-selection")).toHaveTextContent(`${surahNameAr(2)} ${ar(3)}`);
    fireEvent.click(rows()[4]);
    expect(screen.getByTestId("mushaf-ayah-selection")).toHaveTextContent(`${surahNameAr(2)} ${ar(3)}–${ar(5)}`);
    expect(rows().map((r) => r.getAttribute("aria-pressed"))).toEqual(["false", "false", "true", "true", "true"]);
    const actions = within(screen.getByTestId("mushaf-ayah-actions"));
    for (const id of ["tafsir", "listen", "copy", "share", "clear"]) {
      expect(actions.getAllByRole("button").some((b) => b.dataset.action === id)).toBe(true);
    }
  });

  it("«التفسير» shows the Al-Muyassar tafsir of exactly the selected ayahs, verbatim, with its source", async () => {
    const page = await getPage(2);
    renderSheet(2);
    await waitFor(() => expect(rows()).toHaveLength(5));
    fireEvent.click(rows()[2]);
    fireEvent.click(rows()[3]);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.dataset.action === "tafsir")!);
    const blocks = screen.getByTestId("mushaf-tafsir").querySelectorAll("[data-tafsir-ayah]");
    expect(Array.from(blocks).map((b) => b.getAttribute("data-tafsir-ayah"))).toEqual(["2:3", "2:4"]);
    const texts = screen.getAllByTestId("mushaf-tafsir-text").map((p) => p.textContent);
    expect(texts).toEqual([page[2], page[3]].map((a) => tafsirSegments(a.tafsir.text).map((s) => s.text).join("")));
    expect(screen.getByTestId("mushaf-tafsir-source")).toHaveTextContent(QURAN_SOURCE.tafsir.nameAr);
    expect(screen.getByTestId("mushaf-tafsir-source")).toHaveTextContent(QURAN_SOURCE.tafsir.publisher);
    expect(screen.getByTestId("mushaf-ayah-sheet-title")).toHaveTextContent(`تفسير ${surahNameAr(2)} ${ar(3)}–${ar(4)}`);
    fireEvent.click(screen.getByTestId("mushaf-tafsir-back"));
    expect(rows()).toHaveLength(5);
  });

  it("the page's tafsir (the Mushaf's «التفسير» button) covers every ayah of the page", async () => {
    const page = await getPage(2);
    renderSheet(2, { initialView: "pageTafsir" });
    await waitFor(() => expect(screen.getByTestId("mushaf-tafsir")).toBeInTheDocument());
    const keys = Array.from(screen.getByTestId("mushaf-tafsir").querySelectorAll("[data-tafsir-ayah]")).map((b) => b.getAttribute("data-tafsir-ayah"));
    expect(keys).toEqual(page.map((a) => a.key));
  });

  it("listen recites from the first selected ayah to the last", async () => {
    const onListen = vi.fn();
    renderSheet(2, { onListen });
    await waitFor(() => expect(rows()).toHaveLength(5));
    fireEvent.click(rows()[1]);
    fireEvent.click(rows()[3]);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.dataset.action === "listen")!);
    expect(onListen).toHaveBeenCalledWith({ surah: 2, ayah: 2 }, { surah: 2, ayah: 4 });
  });

  it("copy puts the selected ayahs on the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const page = await getPage(2);
    renderSheet(2);
    await waitFor(() => expect(rows()).toHaveLength(5));
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[1]);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.dataset.action === "copy")!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ayahRangeShareText([page[0], page[1]])));
  });

  it("on a page holding two surahs, each surah is labelled and a range stays inside one", async () => {
    const pageNo = PAGE_INFO.findIndex(([, , surahs]) => surahs.length >= 2) + 1;
    const page = await getPage(pageNo);
    const surahs = [...new Set(page.map((a) => a.surah))];
    expect(surahs.length).toBeGreaterThanOrEqual(2);
    renderSheet(pageNo);
    await waitFor(() => expect(rows()).toHaveLength(page.length));
    for (const s of surahs) expect(screen.getByText(`سورة ${surahNameAr(s)}`)).toBeInTheDocument();
    const firstOfA = rows().find((r) => r.dataset.ayah?.startsWith(`${surahs[0]}:`))!;
    const firstOfB = rows().find((r) => r.dataset.ayah?.startsWith(`${surahs[1]}:`))!;
    fireEvent.click(firstOfA);
    fireEvent.click(firstOfB);
    const sel = screen.getByTestId("mushaf-ayah-selection").textContent ?? "";
    expect(sel).toContain(surahNameAr(surahs[1]));
    expect(sel).not.toContain("–");
  });
});
