import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PAGE_INFO, SURAHS } from "@/lib/mushafData";
import { PAGE_START } from "@/lib/mushafPageStart";
import { pageOfAyah, pageStartAyah } from "@/lib/quranAudio";
import {
  QURAN_SOURCE,
  TOTAL_AYAHS,
  ayahOfGlobalId,
  getAyah,
  getAyahByGlobalId,
  getPage,
  getPageForAyah,
  getSurah,
  getTafsir,
  globalIdOf,
  type QuranAyah,
  type QuranSurah,
} from "@/lib/quran";

const SRC_DIR = "data/kfgqpc/hafs_tafseerMouaser_v3";
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let surahs: QuranSurah[] = [];
let all: QuranAyah[] = [];

beforeAll(async () => {
  surahs = (await Promise.all(SURAHS.map((s) => getSurah(s.n)))).filter((s): s is QuranSurah => s !== null);
  all = surahs.flatMap((s) => s.ayahs);
});

describe("Quran data — completeness", () => {
  it("1. has 114 surahs", () => {
    expect(surahs).toHaveLength(114);
    expect(surahs.map((s) => s.surah)).toEqual(SURAHS.map((s) => s.n));
  });

  it("2. has 6236 ayahs in total", () => {
    expect(all).toHaveLength(6236);
    expect(TOTAL_AYAHS).toBe(6236);
  });

  it("3. every surah has the ayah count of the app's SURAHS", () => {
    for (const s of surahs) expect(s.ayahCount, `surah ${s.surah}`).toBe(SURAHS[s.surah - 1].ayahs);
  });

  it("4. no ayah has empty text, search text or tafsir", () => {
    for (const a of all) {
      expect(a.text.trim(), a.key).not.toBe("");
      expect(a.textImlaei.trim(), a.key).not.toBe("");
      expect(a.tafsir.text.trim(), a.key).not.toBe("");
    }
  });

  it("5. every ayah has its surah and a consecutive ayah number, key and global id", () => {
    let expectedId = 1;
    for (const s of surahs) {
      s.ayahs.forEach((a, i) => {
        expect(a.surah).toBe(s.surah);
        expect(a.ayah).toBe(i + 1);
        expect(a.key).toBe(`${s.surah}:${i + 1}`);
        expect(a.globalId).toBe(expectedId);
        expect(globalIdOf(a.surah, a.ayah)).toBe(expectedId);
        expect(ayahOfGlobalId(expectedId)).toEqual({ surah: a.surah, ayah: a.ayah });
        expectedId++;
      });
    }
  });
});

describe("Quran data — pages", () => {
  it("6. every ayah has a valid Mushaf page, in Mushaf order, with its juz and hizb", () => {
    let prev = 1;
    let prevJuz = 1;
    for (const a of all) {
      expect(a.mushafPage).toBeGreaterThanOrEqual(prev);
      expect(a.mushafPage).toBeLessThanOrEqual(604);
      expect(a.juz).toBeGreaterThanOrEqual(prevJuz);
      expect(a.juz).toBeLessThanOrEqual(30);
      expect(a.pageHizb).toBe(PAGE_INFO[a.mushafPage - 1][1]);
      prev = a.mushafPage;
      prevJuz = a.juz;
    }
  });

  it("6b. the 604 pages together hold every ayah exactly once, none empty, each starting at PAGE_START", async () => {
    const seen: string[] = [];
    for (let p = 1; p <= 604; p++) {
      const ayahs = await getPage(p);
      expect(ayahs.length, `page ${p}`).toBeGreaterThan(0);
      expect({ surah: ayahs[0].surah, ayah: ayahs[0].ayah }, `page ${p}`).toEqual(pageStartAyah(p));
      seen.push(...ayahs.map((a) => a.key));
    }
    expect(seen).toEqual(all.map((a) => a.key));
  });

  it("7. the app's pageOfAyah agrees with the new mapping for every ayah", () => {
    for (const a of all) {
      expect(a.mushafPage, a.key).toBe(pageOfAyah({ surah: a.surah, ayah: a.ayah }));
      expect(getPageForAyah(a.surah, a.ayah)).toBe(a.mushafPage);
    }
    expect(PAGE_START).toHaveLength(604);
  });

  it("7b. the source edition's page is kept verbatim; it differs from the app's Mushaf only by one page on 56 known ayahs", () => {
    const diff = all.filter((a) => a.sourcePage !== a.mushafPage);
    expect(diff).toHaveLength(56);
    for (const a of diff) expect(Math.abs(a.sourcePage - a.mushafPage), a.key).toBe(1);
    // Verified against the app's page images: 80:41–42 are printed at the bottom of page 585.
    expect(all.find((a) => a.key === "80:41")).toMatchObject({ mushafPage: 585, sourcePage: 586 });
    expect(diff.map((a) => a.key).slice(0, 4)).toEqual(["5:77", "5:83", "5:90", "6:131"]);
  });
});

describe("Quran data — known ayahs", () => {
  it("8. first and last ayah of every surah", () => {
    for (const s of surahs) {
      const first = s.ayahs[0];
      const last = s.ayahs[s.ayahs.length - 1];
      expect(first.ayah).toBe(1);
      expect(first.mushafPage, `surah ${s.surah}`).toBe(SURAHS[s.surah - 1].page);
      expect(last.ayah).toBe(SURAHS[s.surah - 1].ayahs);
    }
    expect(all[0]).toMatchObject({ key: "1:1", textImlaei: "بسم الله الرحمن الرحيم", mushafPage: 1, juz: 1 });
    expect(all[all.length - 1]).toMatchObject({ key: "114:6", textImlaei: "من الجنة والناس", mushafPage: 604, juz: 30 });
  });

  it("9. Ayat al-Kursi (2:255)", async () => {
    const a = await getAyah(2, 255);
    expect(a).toMatchObject({ surah: 2, ayah: 255, juz: 3, mushafPage: 42, sourcePage: 42 });
    // Plain (imlaei) text of Ayat al-Kursi, in full.
    expect(a?.textImlaei).toBe(
      "الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السموات وما في الأرض من ذا الذي يشفع عنده إلا بإذنه يعلم ما بين أيديهم وما خلفهم ولا يحيطون بشيء من علمه إلا بما شاء وسع كرسيه السموات والأرض ولا يئوده حفظهما وهو العلي العظيم",
    );
    // Uthmani text: first word as the source encodes it — alef wasla, lam, lam, SHADDA then FATHA, ha, damma.
    expect(a?.text.startsWith("ٱللَّهُ ")).toBe(true);
    // That order is not Unicode's canonical one: proof the ingestion did NOT normalise the text.
    expect(a?.text.normalize("NFC")).not.toBe(a?.text);
    expect(a?.tafsir.text.startsWith("[255] ")).toBe(true);
    expect(await getAyahByGlobalId(262)).toBe(a);
  });

  it("10. every ayah carries its own tafsir (Al-Muyassar), numbered for that ayah — source quirks kept verbatim", async () => {
    // In the source, 8 tafsir entries are not prefixed "[n]": five miss the opening bracket, 28:33 and
    // 28:34 share one tafsir labelled "[33، 34]", and 68:22 is labelled "[21، 22]" (68:21 has its own
    // "[21]" entry). They are kept exactly as published.
    const quirks: Record<string, string> = {
      "26:99": "99] ", "28:33": "[33، 34] ", "28:34": "[33، 34] ", "38:83": "83] ",
      "50:44": "44] ", "68:22": "[21، 22] ", "82:8": "8] ", "95:3": "3] ",
    };
    const irregular: string[] = [];
    for (const a of all) {
      expect(a.tafsir.source).toBe("muyassar");
      if (a.tafsir.text.startsWith(`[${a.ayah}]`)) continue;
      irregular.push(a.key);
      expect(a.tafsir.text.startsWith(quirks[a.key] ?? "\u0000"), a.key).toBe(true);
    }
    expect(irregular.sort()).toEqual(Object.keys(quirks).sort());
    expect((await getTafsir(28, 33))?.text).toBe((await getTafsir(28, 34))?.text);
    expect((await getTafsir(68, 21))?.text.startsWith("[21] ")).toBe(true);
    const a = await getAyah(112, 1);
    expect(await getTafsir(112, 1)).toBe(a?.tafsir);
  });

  it("rejects invalid references", async () => {
    expect(await getSurah(0)).toBeNull();
    expect(await getSurah(115)).toBeNull();
    expect(await getAyah(1, 8)).toBeNull();
    expect(await getAyah(2, 0)).toBeNull();
    expect(await getAyahByGlobalId(6237)).toBeNull();
    expect(await getTafsir(9, 130)).toBeNull();
    expect(await getPage(605)).toEqual([]);
    expect(getPageForAyah(114, 7)).toBeNull();
    expect(globalIdOf(1.5, 1)).toBeNull();
  });
});

describe("Quran data — integrity against the source", () => {
  const txt = readFileSync(`${SRC_DIR}/tafseerMouaser_v03.txt`);

  it("11. every field equals the source file exactly (no change during ingestion)", () => {
    const rows = txt.toString("utf8").split("\n").filter((l) => l.length > 0);
    expect(rows.shift()).toBe("id\tjozz\tpage\tsura_no\tsura_name_en\tsura_name_ar\tline_start\tline_end\taya_no\taya_text\taya_text_emlaey\taya_tafseer");
    expect(rows).toHaveLength(6236);
    rows.forEach((row, i) => {
      const [id, jozz, page, suraNo, nameEn, nameAr, lineStart, lineEnd, ayaNo, text, emlaey, tafseer] = row.split("\t");
      const a = all[i];
      expect([a.globalId, a.juz, a.sourcePage, a.surah, a.lineStart, a.lineEnd, a.ayah].map(String)).toEqual([id, jozz, page, suraNo, lineStart, lineEnd, ayaNo]);
      expect(a.text === text && a.textImlaei === emlaey && a.tafsir.text === tafseer, `row ${i + 1} (${a.key})`).toBe(true);
      const s = surahs[a.surah - 1];
      expect(s.nameEn === nameEn && s.nameAr === nameAr).toBe(true);
    });
  });

  it("12. the source file and the package checksums are recorded and still match", () => {
    expect(sha256(txt)).toBe(QURAN_SOURCE.dataFile.sha256);
    expect(QURAN_SOURCE.zip).toMatchObject({
      file: "hafs_tafseerMouaser_v3.zip",
      md5: "b38703983d438a5cd22269b746eaac0c",
      sha1: "a8f054411c6cd14a258d5ba7bc4e30c9ea79b336",
    });
    expect(QURAN_SOURCE.version).toBe("3.0");
    const record = readFileSync("data/kfgqpc/SOURCE.md", "utf8");
    for (const v of [QURAN_SOURCE.zip.md5, QURAN_SOURCE.zip.sha1, QURAN_SOURCE.zip.sha256, QURAN_SOURCE.dataFile.sha256]) expect(record).toContain(v);
    expect(readFileSync(`${SRC_DIR}/read.me`, "utf8")).toMatch(/KFGQPC Tafseer Mouaser Data[\s\S]*Version: 3\.0/);
  });
});
