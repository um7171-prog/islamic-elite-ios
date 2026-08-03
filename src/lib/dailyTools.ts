import { toGregorian, toHijri } from "hijri-converter";

/* ============ Date helpers ============ */

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function hijriToDate(hy: number, hm: number, hd: number): Date {
  const g = toGregorian(hy, hm, hd);
  return new Date(g.gy, g.gm - 1, g.gd, 0, 0, 0, 0);
}

export function dateToHijri(d: Date) {
  return toHijri(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export const HIJRI_MONTHS_AR = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];
export const HIJRI_MONTHS_EN = [
  "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Ula", "Jumada al-Akhirah",
  "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhul Qadah", "Dhul Hijjah",
];

/** Next occurrence of a hijri month/day, from `from` (inclusive of today). */
export function nextHijriDate(hm: number, hd: number, from = new Date()): Date {
  const base = startOfDay(from);
  const h = dateToHijri(base);
  for (let y = h.hy; y <= h.hy + 2; y++) {
    try {
      const d = hijriToDate(y, hm, hd);
      if (d.getTime() >= base.getTime()) return d;
    } catch { /* out of supported range */ }
  }
  return hijriToDate(h.hy + 1, hm, hd);
}

/** Next occurrence of a gregorian month/day. */
export function nextGregorianDate(month: number, day: number, from = new Date()): Date {
  const base = startOfDay(from);
  const y = base.getFullYear();
  const d = new Date(y, month - 1, day);
  return d.getTime() >= base.getTime() ? d : new Date(y + 1, month - 1, day);
}

/** Next occurrence of a day-of-month (gregorian), e.g. citizen account on the 10th. */
export function nextMonthlyDay(day: number, from = new Date()): Date {
  const base = startOfDay(from);
  const y = base.getFullYear();
  const m = base.getMonth();
  const lastThis = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, Math.min(day, lastThis));
  if (first.getTime() >= base.getTime()) return first;
  const lastNext = new Date(y, m + 2, 0).getDate();
  return new Date(y, m + 1, Math.min(day, lastNext));
}

/** Next occurrence of a hijri day-of-month (government salaries: 27 Hijri). */
export function nextHijriMonthlyDay(day: number, from = new Date()): Date {
  const base = startOfDay(from);
  const h = dateToHijri(base);
  let hy = h.hy;
  let hm = h.hm;
  for (let i = 0; i < 3; i++) {
    try {
      const d = hijriToDate(hy, hm, day);
      if (d.getTime() >= base.getTime()) return d;
    } catch { /* skip */ }
    hm += 1;
    if (hm > 12) { hm = 1; hy += 1; }
  }
  return hijriToDate(hy, hm, day);
}

/* ============ Saudi official weekend & holidays ============ */

/** Official Saudi weekend: Friday (5) and Saturday (6). */
export function isSaudiWeekend(d: Date) {
  const w = d.getDay();
  return w === 5 || w === 6;
}

/**
 * Official Saudi public holidays (Royal Decree / Labour Law art. 112):
 * Eid al-Fitr (1–3 Shawwal, starting 29 Ramadan), Eid al-Adha (9–13 Dhul Hijjah),
 * Founding Day (22 Feb) and National Day (23 Sep).
 */
export function isSaudiHoliday(d: Date) {
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 2 && day === 22) return true;      // يوم التأسيس
  if (m === 9 && day === 23) return true;      // اليوم الوطني
  const h = dateToHijri(d);
  if (h.hm === 9 && h.hd >= 29) return true;   // بداية إجازة عيد الفطر
  if (h.hm === 10 && h.hd <= 3) return true;   // عيد الفطر
  if (h.hm === 12 && h.hd >= 9 && h.hd <= 13) return true; // عيد الأضحى
  return false;
}

export function isNonWorkingDay(d: Date) {
  return isSaudiWeekend(d) || isSaudiHoliday(d);
}

/**
 * Official payroll practice in Saudi Arabia: when the payout date falls on a
 * weekend or an official holiday, the deposit is brought forward to the last
 * working day before it.
 */
export function adjustToWorkingDay(d: Date): Date {
  const x = new Date(d);
  let guard = 0;
  while (isNonWorkingDay(x) && guard < 20) {
    x.setDate(x.getDate() - 1);
    guard++;
  }
  return x;
}

/** Next (and the one after) adjusted payout for a Hijri day-of-month cycle. */
export function hijriPayout(day: number, from = new Date()) {
  const first = adjustToWorkingDay(nextHijriMonthlyDay(day, from));
  if (first.getTime() < startOfDay(from).getTime()) {
    const raw = nextHijriMonthlyDay(day, from);
    const after = nextHijriMonthlyDay(day, new Date(raw.getTime() + 86400000));
    return { next: adjustToWorkingDay(after), following: adjustToWorkingDay(nextHijriMonthlyDay(day, new Date(after.getTime() + 86400000))) };
  }
  const raw = nextHijriMonthlyDay(day, from);
  const after = nextHijriMonthlyDay(day, new Date(raw.getTime() + 86400000));
  return { next: first, following: adjustToWorkingDay(after) };
}

/** Next (and following) adjusted payout for a Gregorian day-of-month cycle. */
export function gregorianPayout(day: number, from = new Date()) {
  const raw = nextMonthlyDay(day, from);
  let next = adjustToWorkingDay(raw);
  let after = nextMonthlyDay(day, new Date(raw.getTime() + 86400000));
  if (next.getTime() < startOfDay(from).getTime()) {
    next = adjustToWorkingDay(after);
    after = nextMonthlyDay(day, new Date(after.getTime() + 86400000));
  }
  return { next, following: adjustToWorkingDay(after) };
}

/* ============ Countdown ============ */

export interface Countdown {
  total: number; days: number; hours: number; minutes: number; seconds: number; past: boolean;
}

export function countdown(target: Date, now = new Date()): Countdown {
  let ms = target.getTime() - now.getTime();
  const past = ms < 0;
  ms = Math.abs(ms);
  const s = Math.floor(ms / 1000);
  return {
    total: s,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    past,
  };
}

export function formatDate(d: Date, lang: "ar" | "en") {
  return d.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

export function formatHijri(d: Date, lang: "ar" | "en") {
  const h = dateToHijri(d);
  const months = lang === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  return `${h.hd} ${months[h.hm - 1]} ${h.hy}${lang === "ar" ? " هـ" : " AH"}`;
}

/* ============ Event catalogue ============ */

export type EventResolver = () => Date;

export interface CountdownEvent {
  id: string;
  en: string;
  ar: string;
  resolve: EventResolver;
  /** Optional: the occurrence right after `resolve()` (used by payout tools). */
  resolveAfter?: EventResolver;
  note?: { en: string; ar: string };
}

/**
 * Date of the last official-source review of the countdown data
 * (Umm al-Qura calendar + Saudi government payout schedules + MoE academic calendar 1448).
 */
export const DATA_LAST_UPDATED = "2026-08-02";

export function formatLastUpdated(lang: "ar" | "en") {
  const [y, m, d] = DATA_LAST_UPDATED.split("-").map(Number);
  return formatDate(new Date(y, m - 1, d), lang);
}

/** Weekday name only. */
export function formatWeekday(d: Date, lang: "ar" | "en") {
  return d.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long" });
}

/** Gregorian date only (no weekday), Umm al-Qura independent. */
export function formatGregorian(d: Date, lang: "ar" | "en") {
  return d.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
    year: "numeric", month: "long", day: "numeric",
  });
}

/**
 * Islamic events on the Umm al-Qura calendar (official calendar of Saudi Arabia).
 * Only the officially observed occasions are listed — Mawlid is intentionally excluded.
 */
export const ISLAMIC_EVENTS: CountdownEvent[] = [
  { id: "ramadan", en: "Ramadan", ar: "رمضان", resolve: () => nextHijriDate(9, 1), note: { en: "1 Ramadan — Umm al-Qura calendar", ar: "١ رمضان — تقويم أم القرى" } },
  { id: "eid-fitr", en: "Eid al-Fitr", ar: "عيد الفطر", resolve: () => nextHijriDate(10, 1), note: { en: "1 Shawwal — Umm al-Qura calendar", ar: "١ شوال — تقويم أم القرى" } },
  { id: "arafah", en: "Day of Arafah", ar: "يوم عرفة", resolve: () => nextHijriDate(12, 9), note: { en: "9 Dhul Hijjah — Umm al-Qura calendar", ar: "٩ ذو الحجة — تقويم أم القرى" } },
  { id: "eid-adha", en: "Eid al-Adha", ar: "عيد الأضحى", resolve: () => nextHijriDate(12, 10), note: { en: "10 Dhul Hijjah — Umm al-Qura calendar", ar: "١٠ ذو الحجة — تقويم أم القرى" } },
  { id: "hijri-new", en: "Hijri New Year", ar: "رأس السنة الهجرية", resolve: () => nextHijriDate(1, 1), note: { en: "1 Muharram — Umm al-Qura calendar", ar: "١ محرم — تقويم أم القرى" } },
  { id: "ashura", en: "Ashura", ar: "عاشوراء", resolve: () => nextHijriDate(1, 10), note: { en: "10 Muharram — Umm al-Qura calendar", ar: "١٠ محرم — تقويم أم القرى" } },
];

export const NATIONAL_EVENTS: CountdownEvent[] = [
  { id: "national-day", en: "Saudi National Day", ar: "اليوم الوطني السعودي", resolve: () => nextGregorianDate(9, 23) },
  { id: "founding-day", en: "Founding Day", ar: "يوم التأسيس", resolve: () => nextGregorianDate(2, 22) },
  { id: "flag-day", en: "Saudi Flag Day", ar: "يوم العلم السعودي", resolve: () => nextGregorianDate(3, 11) },
];

/* ============ Private sector payout day (user configurable) ============ */

export const PRIVATE_SALARY_DAY_KEY = "tool.privateSalary.day";
const PRIVATE_SALARY_DEFAULT = 1;

export function getPrivateSalaryDay(): number {
  try {
    const raw = localStorage.getItem(PRIVATE_SALARY_DAY_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 31) return Math.round(n);
  } catch { /* SSR / private mode */ }
  return PRIVATE_SALARY_DEFAULT;
}

export function setPrivateSalaryDay(day: number) {
  const n = Math.min(31, Math.max(1, Math.round(day)));
  try { localStorage.setItem(PRIVATE_SALARY_DAY_KEY, String(n)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("private-salary-day-changed", { detail: n }));
  return n;
}

/**
 * Official Saudi payout schedules only.
 * Every date is brought forward to the previous working day when it falls on
 * the weekend (Fri/Sat) or an official holiday.
 */
export const PAYOUT_EVENTS: CountdownEvent[] = [
  {
    id: "gov-salary", en: "Government salary", ar: "رواتب القطاع الحكومي",
    resolve: () => gregorianPayout(27).next,
    resolveAfter: () => gregorianPayout(27).following,
    note: { en: "27 of each Gregorian month — brought forward on weekends and official holidays", ar: "٢٧ من كل شهر ميلادي — ويُقدَّم الصرف إذا صادف عطلة رسمية أو نهاية الأسبوع" },
  },
  {
    id: "private-salary", en: "Private sector salary", ar: "راتب القطاع الخاص",
    resolve: () => gregorianPayout(getPrivateSalaryDay()).next,
    resolveAfter: () => gregorianPayout(getPrivateSalaryDay()).following,
    note: { en: "No fixed national date — set your own payout day below", ar: "لا يوجد تاريخ موحّد — حدّد يوم نزول راتبك بالأسفل" },
  },
  {
    id: "social-security", en: "Developed Social Security", ar: "الضمان الاجتماعي المطور",
    resolve: () => gregorianPayout(1).next,
    resolveAfter: () => gregorianPayout(1).following,
    note: { en: "1st of each Gregorian month — brought forward on holidays", ar: "اليوم الأول من كل شهر ميلادي — ويُقدَّم إذا صادف عطلة" },
  },
  {
    id: "citizen-account", en: "Citizen Account", ar: "حساب المواطن",
    resolve: () => gregorianPayout(10).next,
    resolveAfter: () => gregorianPayout(10).following,
    note: { en: "10th of each Gregorian month — brought forward on holidays", ar: "اليوم العاشر من كل شهر ميلادي — ويُقدَّم إذا صادف عطلة" },
  },
  {
    id: "retirement-pension", en: "Retirement pension", ar: "راتب التقاعد",
    resolve: () => gregorianPayout(1).next,
    resolveAfter: () => gregorianPayout(1).following,
    note: { en: "1st of each Gregorian month — brought forward on holidays", ar: "اليوم الأول من كل شهر ميلادي — ويُقدَّم إذا صادف عطلة" },
  },
];

/* ============ Saudi academic calendar (MoE — 1448 / 2026-2027) ============ */

export interface SchoolEvent { id: string; en: string; ar: string; date: string /* YYYY-MM-DD */; }

/**
 * Official Ministry of Education academic calendar for 1448 AH (2026–2027).
 * Source: MoE unified four-year calendar (1447–1450), two-semester system.
 */
export const SCHOOL_EVENTS: SchoolEvent[] = [
  { id: "school-start", en: "Start of school year", ar: "بداية الدراسة للطلاب", date: "2026-08-23" },
  { id: "national-day-break", en: "National Day break", ar: "إجازة اليوم الوطني", date: "2026-09-23" },
  { id: "autumn-break", en: "Autumn break", ar: "إجازة الخريف (المطولة)", date: "2026-11-20" },
  { id: "term1-end", en: "End of first term", ar: "نهاية الفصل الدراسي الأول", date: "2027-01-07" },
  { id: "midyear-break", en: "Mid-year break", ar: "إجازة منتصف العام", date: "2027-01-08" },
  { id: "term2-start", en: "Start of second term", ar: "بداية الفصل الدراسي الثاني", date: "2027-01-17" },
  { id: "founding-day-break", en: "Founding Day break", ar: "إجازة يوم التأسيس", date: "2027-02-22" },
  { id: "eid-fitr-break", en: "Eid al-Fitr break", ar: "إجازة عيد الفطر", date: "2027-02-26" },
  { id: "eid-adha-break", en: "Eid al-Adha break", ar: "إجازة عيد الأضحى", date: "2027-05-07" },
  { id: "year-end", en: "End of school year", ar: "نهاية العام الدراسي", date: "2027-06-24" },
  { id: "summer-break", en: "Summer holiday", ar: "الإجازة الصيفية", date: "2027-06-25" },
];

/** Resolve a fixed calendar date; once it passes, roll forward one year as an estimate. */
function resolveSchoolDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const base = startOfDay(new Date());
  let target = new Date(y, m - 1, d);
  while (target.getTime() < base.getTime()) target = new Date(target.getFullYear() + 1, m - 1, d);
  return target;
}

export const SCHOOL_COUNTDOWNS: CountdownEvent[] = SCHOOL_EVENTS.map((e) => ({
  id: e.id,
  en: e.en,
  ar: e.ar,
  resolve: () => resolveSchoolDate(e.date),
  note: { en: "Official MoE academic calendar 1448", ar: "التقويم الدراسي الرسمي ١٤٤٨هـ" },
}));


/** All official Saudi holidays (national + Islamic) sorted by next occurrence. */
export function officialHolidays(): CountdownEvent[] {
  return [...NATIONAL_EVENTS, ...ISLAMIC_EVENTS].sort(
    (a, b) => a.resolve().getTime() - b.resolve().getTime(),
  );
}

/* ============ Calculators ============ */

export function ageBreakdown(birth: Date, now = new Date()) {
  const g = diffYMD(birth, now);
  const hb = dateToHijri(birth);
  const hn = dateToHijri(now);
  let hy = hn.hy - hb.hy;
  let hm = hn.hm - hb.hm;
  let hd = hn.hd - hb.hd;
  if (hd < 0) { hd += 30; hm -= 1; }
  if (hm < 0) { hm += 12; hy -= 1; }
  const totalDays = Math.floor((startOfDay(now).getTime() - startOfDay(birth).getTime()) / 86400000);
  return {
    gregorian: g,
    hijri: { years: hy, months: hm, days: hd },
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalHours: totalDays * 24,
    nextBirthday: nextGregorianDate(birth.getMonth() + 1, birth.getDate()),
  };
}

function diffYMD(from: Date, to: Date) {
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  if (months < 0) { months += 12; years -= 1; }
  return { years, months, days };
}

/** Simplified Islamic inheritance (fara'id) for common heir combinations. */
export interface HeirInput {
  estate: number;
  spouse: "none" | "husband" | "wife";
  wives: number;
  sons: number;
  daughters: number;
  father: boolean;
  mother: boolean;
  fullBrothers: number;
  fullSisters: number;
}

export interface Share { key: string; en: string; ar: string; fraction: string; amount: number; }

export function inheritance(input: HeirInput): { shares: Share[]; remainder: number } {
  const { estate } = input;
  const hasChildren = input.sons > 0 || input.daughters > 0;
  const hasDescendantOrSiblings = hasChildren || input.fullBrothers + input.fullSisters > 1;
  const shares: Share[] = [];
  let assigned = 0;

  const add = (key: string, en: string, ar: string, frac: number, label: string) => {
    const amount = estate * frac;
    assigned += frac;
    shares.push({ key, en, ar, fraction: label, amount });
  };

  if (input.spouse === "husband") {
    hasChildren ? add("husband", "Husband", "الزوج", 1 / 4, "1/4") : add("husband", "Husband", "الزوج", 1 / 2, "1/2");
  } else if (input.spouse === "wife") {
    const frac = hasChildren ? 1 / 8 : 1 / 4;
    add("wife", input.wives > 1 ? `Wives (${input.wives})` : "Wife", input.wives > 1 ? `الزوجات (${input.wives})` : "الزوجة", frac, hasChildren ? "1/8" : "1/4");
  }
  if (input.mother) {
    const frac = hasDescendantOrSiblings ? 1 / 6 : 1 / 3;
    add("mother", "Mother", "الأم", frac, hasDescendantOrSiblings ? "1/6" : "1/3");
  }
  if (input.father) {
    if (hasChildren) add("father", "Father", "الأب", 1 / 6, "1/6");
  }

  let remainder = Math.max(0, 1 - assigned);

  // Residuary (asaba): sons 2 : daughters 1, otherwise father, otherwise siblings.
  if (input.sons > 0) {
    const units = input.sons * 2 + input.daughters;
    const unit = remainder / units;
    if (input.sons) shares.push({ key: "sons", en: `Sons (${input.sons})`, ar: `الأبناء (${input.sons})`, fraction: "عصبة", amount: estate * unit * 2 * input.sons });
    if (input.daughters) shares.push({ key: "daughters", en: `Daughters (${input.daughters})`, ar: `البنات (${input.daughters})`, fraction: "عصبة", amount: estate * unit * input.daughters });
    remainder = 0;
  } else if (input.daughters > 0) {
    const frac = input.daughters === 1 ? 1 / 2 : 2 / 3;
    const use = Math.min(frac, remainder);
    shares.push({ key: "daughters", en: `Daughters (${input.daughters})`, ar: `البنات (${input.daughters})`, fraction: input.daughters === 1 ? "1/2" : "2/3", amount: estate * use });
    remainder -= use;
    if (input.father && remainder > 0) {
      shares.push({ key: "father-res", en: "Father (residuary)", ar: "الأب (تعصيب)", fraction: "الباقي", amount: estate * remainder });
      remainder = 0;
    }
  } else if (input.father) {
    shares.push({ key: "father-res", en: "Father (residuary)", ar: "الأب (تعصيب)", fraction: "الباقي", amount: estate * remainder });
    remainder = 0;
  } else if (input.fullBrothers + input.fullSisters > 0 && remainder > 0) {
    const units = input.fullBrothers * 2 + input.fullSisters;
    const unit = remainder / units;
    if (input.fullBrothers) shares.push({ key: "brothers", en: `Brothers (${input.fullBrothers})`, ar: `الإخوة (${input.fullBrothers})`, fraction: "عصبة", amount: estate * unit * 2 * input.fullBrothers });
    if (input.fullSisters) shares.push({ key: "sisters", en: `Sisters (${input.fullSisters})`, ar: `الأخوات (${input.fullSisters})`, fraction: "عصبة", amount: estate * unit * input.fullSisters });
    remainder = 0;
  }

  return { shares, remainder: estate * remainder };
}

export function loanPayment(principal: number, annualRate: number, years: number) {
  const n = Math.max(1, Math.round(years * 12));
  const r = annualRate / 100 / 12;
  const monthly = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  const total = monthly * n;
  return { monthly, total, interest: total - principal, months: n };
}

export const UNIT_GROUPS: Record<string, { en: string; ar: string; units: Record<string, { en: string; ar: string; factor: number }> }> = {
  length: {
    en: "Length", ar: "الطول",
    units: {
      mm: { en: "Millimeter", ar: "مليمتر", factor: 0.001 },
      cm: { en: "Centimeter", ar: "سنتيمتر", factor: 0.01 },
      m: { en: "Meter", ar: "متر", factor: 1 },
      km: { en: "Kilometer", ar: "كيلومتر", factor: 1000 },
      inch: { en: "Inch", ar: "بوصة", factor: 0.0254 },
      ft: { en: "Foot", ar: "قدم", factor: 0.3048 },
      mile: { en: "Mile", ar: "ميل", factor: 1609.344 },
    },
  },
  weight: {
    en: "Weight", ar: "الوزن",
    units: {
      g: { en: "Gram", ar: "غرام", factor: 1 },
      kg: { en: "Kilogram", ar: "كيلوغرام", factor: 1000 },
      ton: { en: "Ton", ar: "طن", factor: 1e6 },
      lb: { en: "Pound", ar: "رطل", factor: 453.592 },
      oz: { en: "Ounce", ar: "أونصة", factor: 28.3495 },
    },
  },
  area: {
    en: "Area", ar: "المساحة",
    units: {
      m2: { en: "Square meter", ar: "متر مربع", factor: 1 },
      km2: { en: "Square kilometer", ar: "كيلومتر مربع", factor: 1e6 },
      ft2: { en: "Square foot", ar: "قدم مربع", factor: 0.092903 },
      acre: { en: "Acre", ar: "فدان", factor: 4046.86 },
      hectare: { en: "Hectare", ar: "هكتار", factor: 10000 },
    },
  },
  volume: {
    en: "Volume", ar: "الحجم",
    units: {
      ml: { en: "Milliliter", ar: "مليلتر", factor: 0.001 },
      l: { en: "Liter", ar: "لتر", factor: 1 },
      m3: { en: "Cubic meter", ar: "متر مكعب", factor: 1000 },
      gal: { en: "Gallon (US)", ar: "غالون", factor: 3.78541 },
    },
  },
  speed: {
    en: "Speed", ar: "السرعة",
    units: {
      kmh: { en: "km/h", ar: "كم/س", factor: 1 },
      ms: { en: "m/s", ar: "م/ث", factor: 3.6 },
      mph: { en: "mph", ar: "ميل/س", factor: 1.60934 },
      knot: { en: "Knot", ar: "عقدة", factor: 1.852 },
    },
  },
};

export function convertUnit(group: string, from: string, to: string, value: number) {
  const g = UNIT_GROUPS[group];
  if (!g) return 0;
  return (value * g.units[from].factor) / g.units[to].factor;
}

export function convertTemperature(from: string, to: string, v: number) {
  const c = from === "c" ? v : from === "f" ? (v - 32) / 1.8 : v - 273.15;
  return to === "c" ? c : to === "f" ? c * 1.8 + 32 : c + 273.15;
}
