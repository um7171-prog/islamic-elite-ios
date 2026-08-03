/**
 * Desert Mode — Al-Qassim regional intelligence.
 *
 * In a native iOS build this would call WeatherKit + on-device CoreML for
 * dust-storm and visibility prediction. For the web blueprint we model the
 * Al-Qassim climate calendar with deterministic seasonal data so the UI is
 * fully populated without external keys. Swap `getDesertConditions` for a
 * live WeatherKit/Open-Meteo call when wiring real data.
 */

export type Season = "winter" | "spring" | "summer" | "autumn";

export interface DesertConditions {
  season: Season;
  seasonAr: string;
  seasonEn: string;
  tempC: number;
  feelsLikeC: number;
  humidity: number;       // %
  windKph: number;
  windDir: string;
  visibilityKm: number;
  dustRisk: "low" | "moderate" | "high" | "severe";
  uvIndex: number;
  sunriseAdvice: { en: string; ar: string };
  campingScore: number;   // 0..100 — outdoor / desert trip suitability
  recommendation: { en: string; ar: string };
  astro: {
    moonPhaseEn: string;
    moonPhaseAr: string;
    illumination: number; // 0..1
  };
}

function seasonOf(date: Date): Season {
  const m = date.getMonth() + 1;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

// Approximate Al-Qassim climatology (Buraydah). Values are realistic monthly means.
const CLIMATE: Record<number, { t: number; h: number; w: number; dust: number; uv: number }> = {
  1:  { t: 13, h: 50, w: 12, dust: 1, uv: 4 },
  2:  { t: 16, h: 42, w: 14, dust: 2, uv: 6 },
  3:  { t: 21, h: 35, w: 18, dust: 3, uv: 8 },   // dust season begins
  4:  { t: 27, h: 28, w: 22, dust: 4, uv: 9 },   // peak haboob risk
  5:  { t: 33, h: 20, w: 20, dust: 3, uv: 11 },
  6:  { t: 37, h: 14, w: 18, dust: 2, uv: 12 },
  7:  { t: 39, h: 12, w: 16, dust: 2, uv: 12 },
  8:  { t: 38, h: 14, w: 15, dust: 2, uv: 11 },
  9:  { t: 34, h: 18, w: 14, dust: 2, uv: 9 },
  10: { t: 28, h: 28, w: 12, dust: 1, uv: 7 },
  11: { t: 21, h: 40, w: 11, dust: 1, uv: 5 },
  12: { t: 15, h: 50, w: 12, dust: 1, uv: 4 },
};

function moonPhase(date: Date) {
  // Conway/Meeus simplified — accurate to ~1 day, fine for UI.
  const lp = 2551443; // synodic period in seconds
  const ref = Date.UTC(1970, 0, 7, 20, 35, 0) / 1000; // known new moon
  const now = date.getTime() / 1000;
  const phase = ((now - ref) % lp) / lp; // 0..1
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;

  const phases = [
    { en: "New Moon",        ar: "محاق" },
    { en: "Waxing Crescent", ar: "هلال متزايد" },
    { en: "First Quarter",   ar: "تربيع أول" },
    { en: "Waxing Gibbous",  ar: "أحدب متزايد" },
    { en: "Full Moon",       ar: "بدر" },
    { en: "Waning Gibbous",  ar: "أحدب متناقص" },
    { en: "Last Quarter",    ar: "تربيع آخر" },
    { en: "Waning Crescent", ar: "هلال متناقص" },
  ];
  const idx = Math.round(phase * 8) % 8;
  return { ...phases[idx], illumination };
}

function dustLabel(score: number): DesertConditions["dustRisk"] {
  if (score >= 4) return "severe";
  if (score >= 3) return "high";
  if (score >= 2) return "moderate";
  return "low";
}

export function getDesertConditions(date: Date = new Date()): DesertConditions {
  const season = seasonOf(date);
  const c = CLIMATE[date.getMonth() + 1];

  // Day-of-month wobble so the UI feels alive across days
  const wobble = ((date.getDate() % 7) - 3) * 0.6;
  const tempC = +(c.t + wobble).toFixed(1);
  const humidity = Math.max(5, Math.min(80, c.h - wobble * 1.5));
  const windKph = Math.max(4, c.w + wobble);
  const dustScore = c.dust + (windKph > 20 ? 1 : 0);

  const visibilityKm =
    dustScore >= 4 ? 1.5 :
    dustScore >= 3 ? 4   :
    dustScore >= 2 ? 8   : 15;

  const feelsLikeC = +(tempC + (humidity > 40 ? 2 : tempC > 35 ? 3 : 0)).toFixed(1);

  const seasonNames = {
    winter: { en: "Winter — Camping Season", ar: "الشتاء — موسم الكشتات" },
    spring: { en: "Spring — Wildflowers",    ar: "الربيع — موسم الزهور" },
    summer: { en: "Summer — Extreme Heat",    ar: "الصيف — حرارة شديدة" },
    autumn: { en: "Autumn — Mild Evenings",  ar: "الخريف — أمسيات معتدلة" },
  };

  // Camping suitability score
  let camping = 100;
  if (tempC > 35) camping -= 40;
  else if (tempC > 28) camping -= 15;
  if (tempC < 5) camping -= 20;
  camping -= dustScore * 12;
  if (windKph > 25) camping -= 10;
  camping = Math.max(0, Math.min(100, camping));

  const recommendation =
    season === "winter"
      ? { en: "Ideal for desert camping near Al-Bukayriyah dunes. Pack warm layers for Fajr.",
          ar: "وقت مثالي للكشتة قرب كثبان البكيرية. خذ ملابس دافئة لصلاة الفجر." }
      : season === "summer"
      ? { en: "Avoid midday outings. Plan trips between Maghrib and Fajr.",
          ar: "تجنّب الخروج وقت الظهيرة. اجعل رحلاتك بين المغرب والفجر." }
      : dustScore >= 3
      ? { en: "Active dust risk — secure tents and limit driving on open roads.",
          ar: "خطر غبار مرتفع — ثبّت الخيام وقلّل القيادة في الطرق المكشوفة." }
      : { en: "Pleasant conditions for evening picnics in Al-Asyah valleys.",
          ar: "أجواء لطيفة لرحلات المساء في أودية الأسياح." };

  return {
    season,
    seasonEn: seasonNames[season].en,
    seasonAr: seasonNames[season].ar,
    tempC,
    feelsLikeC,
    humidity: Math.round(humidity),
    windKph: Math.round(windKph),
    windDir: ["N","NE","E","SE","S","SW","W","NW"][date.getDate() % 8],
    visibilityKm,
    dustRisk: dustLabel(dustScore),
    uvIndex: c.uv,
    sunriseAdvice:
      tempC > 35
        ? { en: "Hydrate before Fajr. Sunrise heat builds quickly.",
            ar: "اشرب الماء قبل الفجر. الحرارة ترتفع بسرعة بعد الشروق." }
        : { en: "Crisp morning — perfect for a post-Fajr walk.",
            ar: "صباح منعش — وقت رائع للمشي بعد الفجر." },
    campingScore: camping,
    recommendation,
    astro: (() => {
      const m = moonPhase(date);
      return { moonPhaseEn: m.en, moonPhaseAr: m.ar, illumination: m.illumination };
    })(),
  };
}
