import {
  CalculationMethod,
  Coordinates,
  PrayerTimes,
  Madhab,
  Qibla,
  SunnahTimes,
} from "adhan";
import { toHijri } from "hijri-converter";
import { buildParams, type MethodId } from "./prayerMethods";

export type PrayerKey = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface PrayerEntry {
  key: PrayerKey;
  nameEn: string;
  nameAr: string;
  time: Date;
  gradient: string;
}

// Al-Qassim → Buraydah, Saudi Arabia
export const AL_QASSIM = {
  name: { en: "Al-Qassim, Buraydah", ar: "القصيم، بريدة" },
  latitude: 26.3260,
  longitude: 43.9750,
  timezone: "Asia/Riyadh",
};

/**
 * Build today's prayer times using the official Umm Al-Qura method (Saudi Arabia).
 * Asr uses the Standard madhab (Shafi'i / Hanbali / Maliki) by default; Hanafi uses later Asr.
 */
export type MadhabPref = "hanbali" | "shafi" | "maliki" | "hanafi";

export interface CalcOptions {
  /** Calculation authority (Umm Al-Qura, MWL, Egyptian, Karachi…). */
  method?: MethodId;
  /** Manual per-prayer offsets in minutes (-60…+60). */
  adjustments?: Partial<Record<PrayerKey, number>>;
  /** Extra minutes added to Isha only (e.g. the +30 min option). */
  ishaDelayMinutes?: number;
}

export function getPrayerTimes(
  date: Date = new Date(),
  lat: number = AL_QASSIM.latitude,
  lng: number = AL_QASSIM.longitude,
  madhab: MadhabPref = "hanbali",
  opts: CalcOptions = {},
): { times: PrayerTimes; sunnah: SunnahTimes; entries: PrayerEntry[]; qibla: number } {
  const coords = new Coordinates(lat, lng);
  const params = opts.method ? buildParams(opts.method) : CalculationMethod.UmmAlQura();
  params.madhab = madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;

  const adj = opts.adjustments || {};
  params.adjustments = {
    fajr: adj.fajr || 0,
    sunrise: adj.sunrise || 0,
    dhuhr: adj.dhuhr || 0,
    asr: adj.asr || 0,
    maghrib: adj.maghrib || 0,
    isha: (adj.isha || 0) + (opts.ishaDelayMinutes || 0),
  };

  const times = new PrayerTimes(coords, date, params);
  const sunnah = new SunnahTimes(times);
  const qibla = Qibla(coords);

  const entries: PrayerEntry[] = [
    { key: "fajr",    nameEn: "Fajr",    nameAr: "الفجر",   time: times.fajr,    gradient: "bg-fajr" },
    { key: "sunrise", nameEn: "Sunrise", nameAr: "الشروق",  time: times.sunrise, gradient: "bg-sunrise" },
    { key: "dhuhr",   nameEn: "Dhuhr",   nameAr: "الظهر",   time: times.dhuhr,   gradient: "bg-dhuhr" },
    { key: "asr",     nameEn: "Asr",     nameAr: "العصر",   time: times.asr,     gradient: "bg-asr" },
    { key: "maghrib", nameEn: "Maghrib", nameAr: "المغرب",  time: times.maghrib, gradient: "bg-maghrib" },
    { key: "isha",    nameEn: "Isha",    nameAr: "العشاء",  time: times.isha,    gradient: "bg-isha" },
  ];

  return { times, sunnah, entries, qibla };
}


export function getNextPrayer(entries: PrayerEntry[], now: Date = new Date()): {
  current: PrayerEntry;
  next: PrayerEntry;
  msUntilNext: number;
  progress: number; // 0..1 within current interval
} {
  // Only the five obligatory prayers can be "next"/"current" — sunrise stays
  // in `entries` as a display-only time but is never a countdown target.
  const salah = entries.filter((e) => e.key !== "sunrise");
  const fajr = salah.find(e => e.key === "fajr")!;
  const isha = salah.find(e => e.key === "isha")!;

  // Case A: now is before today's Fajr → next is Fajr, current is yesterday's Isha
  if (now < fajr.time) {
    const yesterdayIsha = new Date(isha.time.getTime() - 24 * 3600 * 1000);
    const total = fajr.time.getTime() - yesterdayIsha.getTime();
    const elapsed = now.getTime() - yesterdayIsha.getTime();
    return {
      current: isha,
      next: fajr,
      msUntilNext: fajr.time.getTime() - now.getTime(),
      progress: Math.min(1, Math.max(0, elapsed / total)),
    };
  }

  let currentIdx = 0;
  for (let i = 0; i < salah.length; i++) {
    if (now >= salah[i].time) currentIdx = i;
  }
  const current = salah[currentIdx];
  let next = salah[(currentIdx + 1) % salah.length];
  let nextTime = next.time.getTime();

  if (nextTime <= now.getTime()) {
    // After today's Isha → next is tomorrow's Fajr (approx +24h)
    nextTime = fajr.time.getTime() + 24 * 3600 * 1000;
    next = fajr;
  }

  const total = nextTime - current.time.getTime();
  const elapsed = now.getTime() - current.time.getTime();
  const progress = Math.min(1, Math.max(0, elapsed / total));

  return {
    current,
    next,
    msUntilNext: nextTime - now.getTime(),
    progress,
  };
}

export function formatTime(date: Date, locale: string = "en-US", h12 = true): string {
  // Force Latin digits regardless of locale.
  const loc = locale.includes("-u-") ? locale : `${locale}-u-nu-latn`;
  return new Intl.DateTimeFormat(loc, {
    hour: "numeric",
    minute: "2-digit",
    hour12: h12,
  }).format(date);
}

export function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const HIJRI_MONTHS_AR = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
const HIJRI_MONTHS_EN = ["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani","Jumada al-Ula","Jumada al-Akhira","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];
const GREGORIAN_MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const GREGORIAN_WEEKDAYS_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const GREGORIAN_MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const GREGORIAN_WEEKDAYS_EN = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function getHijriDate(date: Date = new Date(), locale: "en" | "ar" = "en"): string {
  try {
    const h = toHijri(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const dd = String(h.hd).padStart(2, "0");
    const mm = String(h.hm).padStart(2, "0");
    return locale === "ar" ? `${dd}/${mm}/${h.hy} هـ` : `${dd}/${mm}/${h.hy} AH`;
  } catch {
    const fmt = new Intl.DateTimeFormat(
      locale === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-US-u-ca-islamic-umalqura",
      { day: "2-digit", month: "2-digit", year: "numeric" },
    );
    return fmt.format(date);
  }
}

export function getGregorianDate(date: Date = new Date(), locale: "en" | "ar" = "en"): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const weekday = date.getDay();

  if (locale === "ar") {
    return `${GREGORIAN_WEEKDAYS_AR[weekday]}، ${day}/${month}/${year} م`;
  }
  return `${GREGORIAN_WEEKDAYS_EN[weekday]}, ${day}/${month}/${year}`;
}

