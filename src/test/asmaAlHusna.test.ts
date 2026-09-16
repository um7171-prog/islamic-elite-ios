import { describe, it, expect } from "vitest";
import { ASMA_AL_HUSNA, stripTashkeel } from "@/lib/asmaAlHusna";

// Regression test: searching "نور" against the fully-vocalized stored name
// "النُّور" used to fail — the diacritic characters (damma + shadda) sit
// between the ن and و, breaking a plain substring match entirely.
describe("stripTashkeel — Arabic search must ignore diacritics", () => {
  it("strips damma, shadda, and other tashkeel marks", () => {
    expect(stripTashkeel("النُّور")).toBe("النور");
    expect(stripTashkeel("الرَّحْمَن")).toBe("الرحمن");
  });

  it("lets a plain, undiacritized query match a fully-vocalized name", () => {
    const target = ASMA_AL_HUSNA.find((n) => n.transliteration === "An-Nur")!;
    expect(stripTashkeel(target.ar).includes(stripTashkeel("نور"))).toBe(true);
  });
});

describe("ASMA_AL_HUSNA — data integrity", () => {
  it("has exactly 99 names, numbered 1..99 with no gaps or duplicates", () => {
    expect(ASMA_AL_HUSNA).toHaveLength(99);
    const numbers = ASMA_AL_HUSNA.map((n) => n.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 99 }, (_, i) => i + 1));
  });

  it("every entry has non-empty Arabic, transliteration, and meaning", () => {
    for (const n of ASMA_AL_HUSNA) {
      expect(n.ar.trim().length).toBeGreaterThan(0);
      expect(n.transliteration.trim().length).toBeGreaterThan(0);
      expect(n.en.trim().length).toBeGreaterThan(0);
    }
  });
});
