import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  DEFAULT_READING_ZOOM, ENTER_READING, EXIT_READING, LETTER_EM, LONGEST_WORD_LETTERS, MAX_ZOOM, MIN_ZOOM,
  ayahAtLine, baseFontPx, clampZoom, lineAtFraction, lineTopFraction, loadReadingZoom, nextMode, readingFontPx,
  saveReadingZoom, stepZoom,
} from "@/components/mushaf/readingZoom";
import { getPage } from "@/lib/quran";

/** A phone's reading column (390 pt screen, 16 pt padding each side). */
const COLUMN = 358;

beforeEach(() => localStorage.clear());

describe("zoom levels: 1x is the printed page, 1.5x–3x is reading text", () => {
  it("1x stays on the page; 1.5x, 2x, 2.5x and 3x are reading mode", () => {
    expect(nextMode("page", 1)).toBe("page");
    for (const z of [1.5, 2, 2.5, 3]) expect(nextMode("page", z)).toBe("reading");
  });

  it("the text really gets bigger with the zoom — 2x is twice the page's own letter size", () => {
    const base = baseFontPx(COLUMN);
    const sizes = [1.5, 2, 2.5, 3].map((z) => readingFontPx(z, COLUMN));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    expect(readingFontPx(1.5, COLUMN)).toBeCloseTo(base * 1.5, 5);
    expect(readingFontPx(2, COLUMN)).toBeCloseTo(base * 2, 5);
    expect(readingFontPx(2.5, COLUMN)).toBeCloseTo(base * 2.5, 5);
    expect(readingFontPx(3, COLUMN) / base).toBeGreaterThan(2.8);
  });

  it("the base size is the Mushaf page's own letter size at fit width (a sensible size on any screen)", () => {
    expect(baseFontPx(COLUMN)).toBeGreaterThan(16);
    expect(baseFontPx(COLUMN)).toBeLessThan(22);
    expect(baseFontPx(200)).toBeGreaterThanOrEqual(15);
    expect(baseFontPx(2000)).toBeLessThanOrEqual(26);
  });

  it("never below the page or beyond 3x", () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(stepZoom(3, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(1, -1)).toBe(MIN_ZOOM);
  });
});

describe("pinch start → move → end: continuous, with hysteresis, and no snap", () => {
  it("the page opens reading mode past ENTER_READING; reading returns to the page only below EXIT_READING", () => {
    expect(nextMode("page", ENTER_READING - 0.01)).toBe("page");
    expect(nextMode("page", ENTER_READING)).toBe("reading");
    expect(nextMode("reading", EXIT_READING + 0.01)).toBe("reading");
    expect(nextMode("reading", EXIT_READING - 0.01)).toBe("page");
    expect(EXIT_READING).toBeLessThan(ENTER_READING);
  });

  it("the zoom the fingers leave is kept exactly (no rounding to steps)", () => {
    saveReadingZoom(2.37);
    expect(loadReadingZoom()).toBe(2.37);
    expect(readingFontPx(2.37, COLUMN)).toBeCloseTo(baseFontPx(COLUMN) * 2.37, 5);
  });

  it("a stored zoom is read back safely; the default is 2x", () => {
    expect(loadReadingZoom()).toBe(DEFAULT_READING_ZOOM);
    expect(DEFAULT_READING_ZOOM).toBe(2);
    localStorage.setItem("mushaf:readingZoom", "banana");
    expect(loadReadingZoom()).toBe(DEFAULT_READING_ZOOM);
    localStorage.setItem("mushaf:readingZoom", "1.05"); // below reading: reading opens at its minimum
    expect(loadReadingZoom()).toBe(ENTER_READING);
    saveReadingZoom(7);
    expect(loadReadingZoom()).toBe(MAX_ZOOM);
  });
});

describe("zoomed text is never cut: every word fits the column at every zoom", () => {
  it("LONGEST_WORD_LETTERS is the real longest word in the local Quran text", () => {
    let longest = 0;
    for (const f of readdirSync("src/lib/quran/data").filter((n) => n.endsWith(".json"))) {
      const surah = JSON.parse(readFileSync(`src/lib/quran/data/${f}`, "utf8")) as { ayahs: { text: string }[] };
      for (const a of surah.ayahs) {
        const body = a.text.replace(/\u00A0[\uFB50-\uFDFF\uFE70-\uFEFF]+$/u, "");
        for (const w of body.split(/\s+/)) longest = Math.max(longest, [...w].filter((c) => /\p{Lo}/u.test(c)).length);
      }
    }
    expect(longest).toBe(LONGEST_WORD_LETTERS);
  });

  it("the longest word fits at 1.5x, 2x, 2.5x and 3x on every screen width — lines wrap, never cut", () => {
    for (const w of [280, 320, 343, 358, 398, 430, 600, 800]) {
      for (const z of [1.5, 2, 2.5, 3]) {
        expect(readingFontPx(z, w) * LONGEST_WORD_LETTERS * LETTER_EM).toBeLessThanOrEqual(w + 1e-9);
      }
    }
  });
});

describe("the ayah under the fingers (page image → local text)", () => {
  it("a point on the page maps to its printed line, 1 to 15", () => {
    expect(lineAtFraction(0)).toBe(1);
    expect(lineAtFraction(0.5)).toBe(8);
    expect(lineAtFraction(0.9999)).toBe(15);
    expect(lineAtFraction(-1)).toBe(1);
    expect(lineAtFraction(2)).toBe(15);
    for (let line = 1; line <= 15; line++) expect(lineAtFraction(lineTopFraction(line) + 0.001)).toBe(line);
  });

  it("each line of a real page gives an ayah of that page, in reading order", async () => {
    const ayahs = await getPage(50);
    let last = 0;
    for (let line = 1; line <= 15; line++) {
      const a = ayahAtLine(ayahs, line);
      expect(a).not.toBeNull();
      expect(a!.mushafPage).toBe(50);
      expect(a!.globalId).toBeGreaterThanOrEqual(last);
      last = a!.globalId;
    }
    expect(ayahAtLine(ayahs, 1)).toBe(ayahs[0]);
    expect(ayahAtLine(ayahs, 15)).toBe(ayahs[ayahs.length - 1]);
    expect(ayahAtLine([], 3)).toBeNull();
  });
});
