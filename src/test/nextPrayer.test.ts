import { describe, it, expect } from "vitest";
import { getNextPrayer, getPrayerTimes } from "@/lib/prayer";

// Buraydah — the app's default city.
const LAT = 26.33, LNG = 43.97;
const day = new Date("2026-09-20T09:00:00Z");
const { entries } = getPrayerTimes(day, LAT, LNG, "hanbali", {});
const at = (key: string) => entries.find((e) => e.key === key)!.time.getTime();
const nextAt = (ms: number) => getNextPrayer(entries, new Date(ms)).next.key;

describe("next prayer — five obligatory prayers only", () => {
  it("sunrise is still listed in the day's times", () => {
    expect(entries.map((e) => e.key)).toContain("sunrise");
  });
  it("after Fajr and before sunrise → Dhuhr", () => {
    expect(nextAt(at("fajr") + 60_000)).toBe("dhuhr");
  });
  it("right after sunrise → Dhuhr (never Sunrise)", () => {
    expect(nextAt(at("sunrise") + 1_000)).toBe("dhuhr");
    expect(nextAt(at("sunrise") - 1_000)).toBe("dhuhr");
  });
  it("before Dhuhr → Dhuhr, before Asr → Asr, before Maghrib → Maghrib, before Isha → Isha", () => {
    expect(nextAt(at("dhuhr") - 60_000)).toBe("dhuhr");
    expect(nextAt(at("asr") - 60_000)).toBe("asr");
    expect(nextAt(at("maghrib") - 60_000)).toBe("maghrib");
    expect(nextAt(at("isha") - 60_000)).toBe("isha");
  });
  it("after Isha and before Fajr → Fajr", () => {
    expect(nextAt(at("isha") + 60_000)).toBe("fajr");
    expect(nextAt(at("fajr") - 60_000)).toBe("fajr");
  });
  it("countdown targets the next prayer's time, and 'current' is never sunrise", () => {
    const now = new Date(at("sunrise") + 60_000);
    const r = getNextPrayer(entries, now);
    expect(r.msUntilNext).toBe(at("dhuhr") - now.getTime());
    expect(r.current.key).toBe("fajr");
  });
  it("next is never sunrise at any minute of the day", () => {
    for (let ms = at("fajr") - 3600_000; ms < at("isha") + 3600_000; ms += 60_000) {
      expect(nextAt(ms)).not.toBe("sunrise");
    }
  });
});
