import { describe, it, expect } from "vitest";
import { getLatestPrayerSince, SINCE_WINDOW_MINUTES } from "@/lib/prayerSince";
import type { PrayerEntry, PrayerKey } from "@/lib/prayer";

const NAMES: Record<PrayerKey, string> = {
  fajr: "الفجر", sunrise: "الشروق", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء",
};

/** A day of prayer times at fixed local clock times. */
function day(y: number, m: number, d: number): PrayerEntry[] {
  const at = (h: number, min: number) => new Date(y, m, d, h, min, 0, 0);
  const rows: [PrayerKey, Date][] = [
    ["fajr", at(4, 30)], ["sunrise", at(5, 50)], ["dhuhr", at(11, 56)],
    ["asr", at(15, 20)], ["maghrib", at(17, 58)], ["isha", at(19, 28)],
  ];
  return rows.map(([key, time]) => ({ key, time, nameEn: key, nameAr: NAMES[key], gradient: `bg-${key}` }));
}

const today = day(2026, 8, 20);
const yesterday = day(2026, 8, 19);
const all = [...yesterday, ...today];
const at = (h: number, m: number, s = 0) => new Date(2026, 8, 20, h, m, s);
const mmss = (ms: number) => {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

describe("«منذ» follows the prayer that actually entered last", () => {
  it("starts at 00:00 at Dhuhr's adhan, then 01:00 and 05:00", () => {
    expect(getLatestPrayerSince(at(11, 56), all)?.entry.key).toBe("dhuhr");
    expect(mmss(getLatestPrayerSince(at(11, 56), all)!.ms)).toBe("00:00");
    expect(mmss(getLatestPrayerSince(at(11, 57), all)!.ms)).toBe("01:00");
    expect(mmss(getLatestPrayerSince(at(12, 1), all)!.ms)).toBe("05:00");
  });

  it("10 minutes after Dhuhr and before Asr: «الظهر منذ 10:00»", () => {
    const s = getLatestPrayerSince(at(12, 6), all)!;
    expect(s.entry.nameAr).toBe("الظهر");
    expect(mmss(s.ms)).toBe("10:00");
  });

  it("disappears at 45:00 (shows 44:59 one second before)", () => {
    expect(mmss(getLatestPrayerSince(at(12, 40, 59), all)!.ms)).toBe("44:59");
    expect(getLatestPrayerSince(at(12, 41), all)).toBeNull();
    expect(SINCE_WINDOW_MINUTES).toBe(45);
  });

  it("Asr's adhan resets it to «العصر منذ 00:00», then 01:00, 02:00", () => {
    expect(getLatestPrayerSince(at(15, 19, 59), all)).toBeNull(); // Dhuhr's window long over
    const s0 = getLatestPrayerSince(at(15, 20), all)!;
    expect(s0.entry.key).toBe("asr");
    expect(mmss(s0.ms)).toBe("00:00");
    expect(mmss(getLatestPrayerSince(at(15, 21), all)!.ms)).toBe("01:00");
    expect(mmss(getLatestPrayerSince(at(15, 22), all)!.ms)).toBe("02:00");
  });

  it("a newer prayer inside the previous one's 45 minutes takes over and restarts at 00:00", () => {
    // Maghrib 17:58 → Isha 19:28 is 90 min apart; use a tight synthetic pair to prove the reset.
    const tight = today.map((e) => (e.key === "isha" ? { ...e, time: at(18, 20) } : e));
    const s = getLatestPrayerSince(at(18, 20), tight)!;
    expect(s.entry.key).toBe("isha");
    expect(mmss(s.ms)).toBe("00:00");
  });

  it("goes Fajr → Dhuhr → Asr → Maghrib → Isha through the day; sunrise never counts", () => {
    const seq = [at(4, 31), at(11, 57), at(15, 21), at(17, 59), at(19, 29)].map((t) => getLatestPrayerSince(t, all)?.entry.key);
    expect(seq).toEqual(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
    // 10 minutes after sunrise: sunrise isn't a prayer, and Fajr is 90 min old → nothing
    expect(getLatestPrayerSince(at(6, 0), all)).toBeNull();
  });

  it("works across midnight: yesterday's Isha is the latest prayer until today's Fajr", () => {
    const lateIsha = [...yesterday.map((e) => (e.key === "isha" ? { ...e, time: new Date(2026, 8, 19, 23, 40) } : e)), ...today];
    const s = getLatestPrayerSince(new Date(2026, 8, 20, 0, 5), lateIsha)!;
    expect(s.entry.key).toBe("isha");
    expect(mmss(s.ms)).toBe("25:00");
    // and next day's Fajr takes over from 00:00
    expect(mmss(getLatestPrayerSince(at(4, 30), lateIsha)!.ms)).toBe("00:00");
    expect(getLatestPrayerSince(at(4, 30), lateIsha)!.entry.key).toBe("fajr");
  });

  it("depends only on the clock: a late launch 20 minutes after Asr shows 20:00 straight away", () => {
    expect(mmss(getLatestPrayerSince(at(15, 40), all)!.ms)).toBe("20:00");
  });
});
