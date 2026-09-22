import { describe, it, expect } from "vitest";
import { getAtmospherePeriod } from "@/lib/prayerAtmosphere";
import { getPrayerTimes } from "@/lib/prayer";

const BURAYDAH = { lat: 26.33, lng: 43.97 };
const entriesFor = (d: Date) => getPrayerTimes(d, BURAYDAH.lat, BURAYDAH.lng, "hanbali", undefined).entries;

describe("getAtmospherePeriod: automatic, time-based, from the app's real prayer times", () => {
  const day = new Date("2026-09-20T00:00:00Z");
  const entries = entriesFor(day);
  const at = (key: string, offsetMin: number) => {
    const t = entries.find((e) => e.key === key)!.time;
    return new Date(t.getTime() + offsetMin * 60_000);
  };

  it("each prayer's own moment (and just after) reports that period, including sunrise", () => {
    for (const key of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
      expect(getAtmospherePeriod(entries, at(key, 1)).key).toBe(key);
    }
  });

  it("just BEFORE maghrib it is still asr; the moment maghrib arrives it switches automatically", () => {
    expect(getAtmospherePeriod(entries, at("maghrib", -1)).key).toBe("asr");
    expect(getAtmospherePeriod(entries, at("maghrib", 0)).key).toBe("maghrib");
  });

  it("just before isha it is still maghrib; entering isha switches automatically", () => {
    expect(getAtmospherePeriod(entries, at("isha", -1)).key).toBe("maghrib");
    expect(getAtmospherePeriod(entries, at("isha", 0)).key).toBe("isha");
  });

  it("before today's Fajr, the period is still (yesterday's) Isha — cyclical, never undefined", () => {
    const beforeFajr = new Date(entries.find((e) => e.key === "fajr")!.time.getTime() - 5 * 60_000);
    expect(getAtmospherePeriod(entries, beforeFajr).key).toBe("isha");
  });

  it("each entry carries the design-system gradient class already used elsewhere (bg-fajr, bg-sunrise, …)", () => {
    const bykey: Record<string, string> = {};
    for (const e of entries) bykey[e.key] = e.gradient;
    expect(bykey.fajr).toBe("bg-fajr");
    expect(bykey.sunrise).toBe("bg-sunrise");
    expect(bykey.dhuhr).toBe("bg-dhuhr");
    expect(bykey.asr).toBe("bg-asr");
    expect(bykey.maghrib).toBe("bg-maghrib");
    expect(bykey.isha).toBe("bg-isha");
    // sunrise must be its own gradient now, not a re-use of dhuhr's
    expect(bykey.sunrise).not.toBe(bykey.dhuhr);
  });

  it("recomputes correctly on any date (works across a date change / app resume)", () => {
    const otherDay = new Date("2026-12-05T00:00:00Z");
    const otherEntries = entriesFor(otherDay);
    const dhuhrPlus1 = new Date(otherEntries.find((e) => e.key === "dhuhr")!.time.getTime() + 60_000);
    expect(getAtmospherePeriod(otherEntries, dhuhrPlus1).key).toBe("dhuhr");
  });
});
