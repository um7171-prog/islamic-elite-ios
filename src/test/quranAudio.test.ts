import { describe, it, expect } from "vitest";
import { PAGE_START } from "@/lib/mushafPageStart";
import { pageStartAyah, pageOfAyah, nextAyah, prevAyah } from "@/lib/quranAudio";
import { SURAHS } from "@/lib/mushafData";
import { PAGE_INFO } from "@/lib/mushafData";
import { RECITERS, ayahUrl } from "@/lib/reciters";

describe("page -> starting ayah mapping", () => {
  it("has one entry per Mushaf page, every ayah valid", () => {
    expect(PAGE_START.length).toBe(604);
    for (const [s, a] of PAGE_START) {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(114);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(SURAHS[s - 1].ayahs);
    }
  });

  it("is strictly increasing and continuous with the surah list", () => {
    let prev = pageStartAyah(1);
    expect(prev).toEqual({ surah: 1, ayah: 1 });
    for (let p = 2; p <= 604; p++) {
      const cur = pageStartAyah(p);
      expect(cur.surah * 1000 + cur.ayah, `page ${p}`).toBeGreaterThan(prev.surah * 1000 + prev.ayah);
      prev = cur;
    }
  });

  it("each surah's first ayah lands on that surah's start page", () => {
    for (const s of SURAHS) {
      expect(pageOfAyah({ surah: s.n, ayah: 1 }), `surah ${s.n}`).toBe(s.page);
    }
  });

  it("agrees with the page index: a page's first surah is one of the surahs listed for that page", () => {
    for (let p = 1; p <= 604; p++) {
      const first = pageStartAyah(p).surah;
      expect(PAGE_INFO[p - 1][2], `page ${p}`).toContain(first);
    }
  });

  it("a mid-surah page starts mid-surah, NOT at ayah 1 (Al-Baqarah 2:58 is on page 9)", () => {
    expect(pageStartAyah(9)).toEqual({ surah: 2, ayah: 58 });
    expect(pageStartAyah(2)).toEqual({ surah: 2, ayah: 1 });
    expect(pageStartAyah(604)).toEqual({ surah: 112, ayah: 1 });
  });

  it("pageOfAyah is the inverse for arbitrary ayahs (Ayat al-Kursi 2:255 is on page 42)", () => {
    expect(pageOfAyah({ surah: 2, ayah: 255 })).toBe(42);
    expect(pageOfAyah({ surah: 114, ayah: 6 })).toBe(604);
    expect(pageOfAyah({ surah: 2, ayah: 58 })).toBe(9);
    expect(pageOfAyah({ surah: 2, ayah: 57 })).toBe(8);
  });
});

describe("ayah stepping", () => {
  it("moves within, across and at the ends of the Quran", () => {
    expect(nextAyah({ surah: 1, ayah: 7 })).toEqual({ surah: 2, ayah: 1 });
    expect(nextAyah({ surah: 2, ayah: 5 })).toEqual({ surah: 2, ayah: 6 });
    expect(nextAyah({ surah: 114, ayah: 6 })).toBeNull();
    expect(prevAyah({ surah: 2, ayah: 1 })).toEqual({ surah: 1, ayah: 7 });
    expect(prevAyah({ surah: 1, ayah: 1 })).toBeNull();
  });
  it("playing on across a page boundary reaches the next page's first ayah", () => {
    let r = pageStartAyah(9);
    let guard = 0;
    while (pageOfAyah(r) === 9 && guard++ < 50) r = nextAyah(r)!;
    expect(r).toEqual(pageStartAyah(10));
  });
});

describe("ayah audio URLs", () => {
  it("every reciter has a per-ayah source and the file name is SSSAAA.mp3", () => {
    for (const r of RECITERS) expect(r.ayahFolder).toBeTruthy();
    expect(ayahUrl(RECITERS[2], 2, 58)).toBe("https://everyayah.com/data/Alafasy_128kbps/002058.mp3");
  });
});
