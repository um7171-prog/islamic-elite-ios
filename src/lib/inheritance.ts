/**
 * Islamic inheritance (علم الفرائض) engine.
 *
 * Supports: أصحاب الفروض، العصبات، الحجب، العول، الرد،
 * والمسألتان العمريتان، والأخوات عصبة مع الغير.
 * Every heir is returned individually (الابن الأول، الزوجة الثانية …)
 * and the sum of all shares always equals the estate exactly.
 */

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

export interface HeirShare {
  id: string;
  en: string;
  ar: string;
  fraction: string;        // النسبة الشرعية (1/8، عصبة، رد …)
  reasonEn: string;
  reasonAr: string;
  percent: number;         // 0..100 من التركة
  amount: number;
}

export interface Bilingual { en: string; ar: string }

export interface InheritanceResult {
  shares: HeirShare[];
  total: number;           // إجمالي التركة
  distributed: number;     // مجموع الأنصبة
  notes: Bilingual[];
  blocked: Bilingual[];
  method: "normal" | "awl" | "radd" | "empty";
}

/* ---------- helpers ---------- */

const AR_ORD = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
const AR_ORD_F = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];
const EN_ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

const ord = (i: number, f = false) => (i < 10 ? (f ? AR_ORD_F[i] : AR_ORD[i]) : `رقم ${i + 1}`);
const ordEn = (i: number) => (i < 10 ? EN_ORD[i] : `#${i + 1}`);

function fracLabel(v: number): string {
  const known: [number, string][] = [
    [1 / 2, "1/2"], [1 / 4, "1/4"], [1 / 8, "1/8"], [1 / 3, "1/3"],
    [2 / 3, "2/3"], [1 / 6, "1/6"], [1, "الكل"],
  ];
  for (const [n, l] of known) if (Math.abs(v - n) < 1e-9) return l;
  return `${(v * 100).toFixed(2)}%`;
}

interface Group {
  id: string;
  count: number;
  female?: boolean;
  en: string; ar: string;               // اسم الصنف بالمفرد
  share: number;                        // نصيب الصنف كاملاً (كسر من التركة)
  label: string;                        // وصف النسبة
  reasonEn: string; reasonAr: string;
  weights?: number[];                   // توزيع داخلي (للعصبة ٢:١)
  isFard: boolean;
  raddEligible?: boolean;
}

/* ---------- engine ---------- */

export function calculateInheritance(input: HeirInput): InheritanceResult {
  const estate = Math.max(0, input.estate || 0);
  const sons = Math.max(0, Math.floor(input.sons || 0));
  const daughters = Math.max(0, Math.floor(input.daughters || 0));
  const wives = input.spouse === "wife" ? Math.max(1, Math.floor(input.wives || 1)) : 0;
  const brothers = Math.max(0, Math.floor(input.fullBrothers || 0));
  const sisters = Math.max(0, Math.floor(input.fullSisters || 0));
  const { father, mother } = input;

  const notes: Bilingual[] = [];
  const blocked: Bilingual[] = [];

  const hasMaleDesc = sons > 0;
  const hasDesc = sons + daughters > 0;
  const siblingsTotal = brothers + sisters;

  /* ----- الحجب ----- */
  let sibsActive = siblingsTotal > 0;
  if (sibsActive && (hasMaleDesc || father)) {
    sibsActive = false;
    const cause = hasMaleDesc
      ? { en: "blocked by the son (asabah bi-nafsih)", ar: "محجوبون بالابن" }
      : { en: "blocked by the father", ar: "محجوبون بالأب" };
    if (brothers > 0) blocked.push({ en: `Full brothers (${brothers}) — ${cause.en}`, ar: `الإخوة الأشقاء (${brothers}) — ${cause.ar}` });
    if (sisters > 0) blocked.push({ en: `Full sisters (${sisters}) — ${cause.en}`, ar: `الأخوات الشقيقات (${sisters}) — ${cause.ar}` });
  }
  const aBrothers = sibsActive ? brothers : 0;
  const aSisters = sibsActive ? sisters : 0;

  const groups: Group[] = [];

  /* ----- المسألتان العمريتان: زوج/زوجة + أب + أم فقط ----- */
  const umariyya =
    mother && father && !hasDesc && siblingsTotal === 0 && input.spouse !== "none";

  /* ----- أصحاب الفروض ----- */
  // الزوجية
  if (input.spouse === "husband") {
    const s = hasDesc ? 1 / 4 : 1 / 2;
    groups.push({
      id: "husband", count: 1, en: "Husband", ar: "الزوج", share: s, label: fracLabel(s),
      reasonEn: hasDesc ? "1/4 — with a descendant" : "1/2 — no descendant",
      reasonAr: hasDesc ? "الربع لوجود الفرع الوارث" : "النصف لعدم وجود الفرع الوارث",
      isFard: true, raddEligible: false,
    });
  } else if (wives > 0) {
    const s = hasDesc ? 1 / 8 : 1 / 4;
    groups.push({
      id: "wife", count: wives, female: true, en: "Wife", ar: "الزوجة", share: s, label: fracLabel(s),
      reasonEn: hasDesc ? "1/8 shared between the wives — with a descendant" : "1/4 shared between the wives — no descendant",
      reasonAr: hasDesc ? "الثمن يقسم بالتساوي بين الزوجات لوجود الفرع الوارث" : "الربع يقسم بالتساوي بين الزوجات لعدم وجود الفرع الوارث",
      isFard: true, raddEligible: false,
    });
  }

  const spouseShare = groups.reduce((a, g) => a + g.share, 0);

  // الأم
  if (mother) {
    let s: number, rEn: string, rAr: string;
    if (umariyya) {
      s = (1 - spouseShare) / 3;
      rEn = "1/3 of the remainder after the spouse (Umariyyatan case)";
      rAr = "ثلث الباقي بعد نصيب الزوجية (المسألة العمرية)";
      notes.push({
        en: "Umariyyatan case applied: the mother takes 1/3 of the remainder, the father takes the rest.",
        ar: "طُبِّقت المسألة العمرية: للأم ثلث الباقي بعد الزوجية، والباقي للأب تعصيباً.",
      });
    } else if (hasDesc || siblingsTotal >= 2) {
      s = 1 / 6;
      rEn = hasDesc ? "1/6 — with a descendant" : "1/6 — with two or more siblings";
      rAr = hasDesc ? "السدس لوجود الفرع الوارث" : "السدس لوجود اثنين فأكثر من الإخوة";
    } else {
      s = 1 / 3;
      rEn = "1/3 — no descendant and fewer than two siblings";
      rAr = "الثلث لعدم وجود الفرع الوارث ولا عدد من الإخوة";
    }
    groups.push({
      id: "mother", count: 1, female: true, en: "Mother", ar: "الأم", share: s,
      label: umariyya ? "ثلث الباقي" : fracLabel(s), reasonEn: rEn, reasonAr: rAr,
      isFard: true, raddEligible: true,
    });
  }

  // الأب: فرض السدس مع الفرع الوارث، وتعصيب عند عدمه
  let fatherIsResiduary = false;
  if (father) {
    if (hasMaleDesc) {
      groups.push({
        id: "father", count: 1, en: "Father", ar: "الأب", share: 1 / 6, label: "1/6",
        reasonEn: "1/6 — with a male descendant", reasonAr: "السدس فرضاً لوجود الابن",
        isFard: true, raddEligible: true,
      });
    } else if (daughters > 0) {
      groups.push({
        id: "father", count: 1, en: "Father", ar: "الأب", share: 1 / 6, label: "1/6",
        reasonEn: "1/6 as a fixed share, plus the residue", reasonAr: "السدس فرضاً مع الباقي تعصيباً",
        isFard: true, raddEligible: true,
      });
      fatherIsResiduary = true;
    } else {
      fatherIsResiduary = true;
    }
  }

  // البنات عند عدم وجود الابن
  if (!hasMaleDesc && daughters > 0) {
    const s = daughters === 1 ? 1 / 2 : 2 / 3;
    groups.push({
      id: "daughter", count: daughters, female: true, en: "Daughter", ar: "البنت", share: s,
      label: fracLabel(s),
      reasonEn: daughters === 1 ? "1/2 — a single daughter with no son" : "2/3 shared — two or more daughters with no son",
      reasonAr: daughters === 1 ? "النصف لانفرادها وعدم وجود الابن" : "الثلثان بالتساوي لتعددهن وعدم وجود الابن",
      isFard: true, raddEligible: true,
    });
  }

  // الأخوات الشقيقات: عصبة مع الغير عند وجود البنات، وإلا فرض
  const sistersWithDaughters = aSisters > 0 && !hasMaleDesc && daughters > 0;
  if (aSisters > 0 && aBrothers === 0 && !sistersWithDaughters && !hasDesc) {
    const s = aSisters === 1 ? 1 / 2 : 2 / 3;
    groups.push({
      id: "sister", count: aSisters, female: true, en: "Full sister", ar: "الأخت الشقيقة", share: s,
      label: fracLabel(s),
      reasonEn: aSisters === 1 ? "1/2 — a single full sister (kalalah)" : "2/3 shared — two or more full sisters",
      reasonAr: aSisters === 1 ? "النصف لانفرادها (كلالة)" : "الثلثان بالتساوي لتعددهن",
      isFard: true, raddEligible: true,
    });
  }

  /* ----- مجموع الفروض والعول ----- */
  let fardTotal = groups.reduce((a, g) => a + g.share, 0);
  let method: InheritanceResult["method"] = "normal";

  if (fardTotal > 1 + 1e-9) {
    const k = 1 / fardTotal;
    groups.forEach((g) => { g.share *= k; g.label += " (عول)"; });
    notes.push({
      en: "Awl applied: the fixed shares exceed the estate, so every share is reduced proportionally.",
      ar: "طُبِّق العول: مجموع الفروض تجاوز التركة، فنُقصت أنصبة الجميع بنسبة واحدة.",
    });
    method = "awl";
    fardTotal = 1;
  }

  let remainder = Math.max(0, 1 - fardTotal);

  /* ----- العصبات ----- */
  if (method !== "awl" && remainder > 1e-9) {
    if (sons > 0) {
      const units = sons * 2 + daughters;
      groups.push({
        id: "son", count: sons, en: "Son", ar: "الابن", share: (remainder * sons * 2) / units,
        label: "عصبة", reasonEn: "Residuary — a male takes the share of two females",
        reasonAr: "عصبة بالنفس، للذكر مثل حظ الأنثيين", isFard: false,
      });
      if (daughters > 0) {
        groups.push({
          id: "daughter", count: daughters, female: true, en: "Daughter", ar: "البنت",
          share: (remainder * daughters) / units, label: "عصبة",
          reasonEn: "Residuary with her brothers — half a brother's share",
          reasonAr: "عصبة بالغير مع إخوتها، للذكر مثل حظ الأنثيين", isFard: false,
        });
      }
      remainder = 0;
    } else if (fatherIsResiduary) {
      groups.push({
        id: "father-res", count: 1, en: "Father (residuary)", ar: "الأب (تعصيباً)",
        share: remainder, label: "الباقي",
        reasonEn: "Takes the remaining estate as the nearest male agnate",
        reasonAr: "يأخذ الباقي تعصيباً لعدم وجود عاصب أقرب", isFard: false,
      });
      remainder = 0;
    } else if (aBrothers > 0 || sistersWithDaughters || (aSisters > 0 && !hasDesc && aBrothers > 0)) {
      if (aBrothers > 0) {
        const units = aBrothers * 2 + aSisters;
        groups.push({
          id: "brother", count: aBrothers, en: "Full brother", ar: "الأخ الشقيق",
          share: (remainder * aBrothers * 2) / units, label: "عصبة",
          reasonEn: "Residuary — a male takes the share of two females",
          reasonAr: "عصبة بالنفس، للذكر مثل حظ الأنثيين", isFard: false,
        });
        if (aSisters > 0) {
          groups.push({
            id: "sister", count: aSisters, female: true, en: "Full sister", ar: "الأخت الشقيقة",
            share: (remainder * aSisters) / units, label: "عصبة",
            reasonEn: "Residuary with her brothers", reasonAr: "عصبة بالغير مع إخوتها", isFard: false,
          });
        }
      } else {
        groups.push({
          id: "sister", count: aSisters, female: true, en: "Full sister", ar: "الأخت الشقيقة",
          share: remainder, label: "عصبة مع الغير",
          reasonEn: "Residuary alongside the daughters (asabah ma'a al-ghayr)",
          reasonAr: "عصبة مع الغير لوجود البنات", isFard: false,
        });
      }
      remainder = 0;
    }
  }

  /* ----- الرد ----- */
  if (remainder > 1e-9) {
    const raddGroups = groups.filter((g) => g.isFard && g.raddEligible);
    const base = raddGroups.reduce((a, g) => a + g.share, 0);
    if (base > 1e-9) {
      raddGroups.forEach((g) => { g.share += (remainder * g.share) / base; g.label += " + رد"; });
      notes.push({
        en: "Radd applied: the surplus is returned proportionally to the eligible heirs (the spouse is excluded).",
        ar: "طُبِّق الرد: أُعيد الفائض على أصحاب الفروض بنسبة أنصبتهم، ولا يدخل فيه الزوج أو الزوجة.",
      });
      method = method === "awl" ? method : "radd";
      remainder = 0;
    } else if (groups.length > 0) {
      // لا يوجد إلا الزوجية: الباقي لذوي الأرحام أو بيت المال
      notes.push({
        en: "No other heirs were entered: the surplus goes to distant kin (dhawu al-arham) or the public treasury.",
        ar: "لا يوجد وارث آخر: الباقي لذوي الأرحام، فإن لم يوجدوا فلبيت المال.",
      });
    }
  }

  if (groups.length === 0) {
    return { shares: [], total: estate, distributed: 0, notes: [{ en: "Please select at least one heir.", ar: "الرجاء اختيار وارث واحد على الأقل." }], blocked, method: "empty" };
  }

  /* ----- توزيع الأنصبة على الأفراد ----- */
  const shares: HeirShare[] = [];
  for (const g of groups) {
    const per = g.share / g.count;
    for (let i = 0; i < g.count; i++) {
      const single = g.count === 1;
      shares.push({
        id: `${g.id}-${i}`,
        en: single ? g.en : `${g.en} (${ordEn(i)})`,
        ar: single ? g.ar : `${g.ar} ${ord(i, g.female)}`,
        fraction: g.label,
        reasonEn: g.reasonEn,
        reasonAr: g.reasonAr,
        percent: per * 100,
        amount: estate * per,
      });
    }
  }

  /* ----- تصحيح الكسور حتى يساوي المجموع التركة بالضبط ----- */
  const rounded = shares.map((s) => Math.round(s.amount * 100) / 100);
  const target = Math.round(estate * (remainder > 1e-9 ? 1 - remainder : 1) * 100) / 100;
  const diff = Math.round((target - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (rounded.length && Math.abs(diff) > 0) {
    let maxI = 0;
    rounded.forEach((v, i) => { if (v > rounded[maxI]) maxI = i; });
    rounded[maxI] = Math.round((rounded[maxI] + diff) * 100) / 100;
  }
  rounded.forEach((v, i) => { shares[i].amount = v; });

  const distributed = Math.round(rounded.reduce((a, b) => a + b, 0) * 100) / 100;

  return { shares, total: estate, distributed, notes, blocked, method };
}
