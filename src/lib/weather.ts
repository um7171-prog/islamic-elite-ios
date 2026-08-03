/**
 * Live global weather via Open-Meteo (no API key required).
 * Returns accurate current conditions + derived alerts.
 */

export interface LiveWeather {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  windGustKph: number;
  windDir: string;
  windDeg: number;
  visibilityKm: number;
  uvIndex: number;
  pressureHpa: number;
  precipitationMm: number;
  weatherCode: number;
  conditionEn: string;
  conditionAr: string;
  isDay: boolean;
  source: "live" | "fallback";
  fetchedAt: number;
}

const compass = (deg: number) => {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((deg % 360) / 45) % 8];
};

// WMO weather interpretation codes → human label
function wmoLabel(code: number, isDay: boolean): { en: string; ar: string } {
  const map: Record<number, { en: string; ar: string }> = {
    0: { en: isDay ? "Clear sky" : "Clear night", ar: isDay ? "صحو" : "ليلة صافية" },
    1: { en: "Mainly clear", ar: "صحو غالباً" },
    2: { en: "Partly cloudy", ar: "غائم جزئياً" },
    3: { en: "Overcast", ar: "غائم" },
    45: { en: "Fog", ar: "ضباب" },
    48: { en: "Rime fog", ar: "ضباب متجمد" },
    51: { en: "Light drizzle", ar: "رذاذ خفيف" },
    53: { en: "Drizzle", ar: "رذاذ" },
    55: { en: "Heavy drizzle", ar: "رذاذ كثيف" },
    61: { en: "Light rain", ar: "مطر خفيف" },
    63: { en: "Rain", ar: "مطر" },
    65: { en: "Heavy rain", ar: "مطر غزير" },
    71: { en: "Light snow", ar: "ثلج خفيف" },
    73: { en: "Snow", ar: "ثلج" },
    75: { en: "Heavy snow", ar: "ثلج كثيف" },
    80: { en: "Rain showers", ar: "زخات مطر" },
    81: { en: "Heavy showers", ar: "زخات غزيرة" },
    82: { en: "Violent showers", ar: "زخات عنيفة" },
    95: { en: "Thunderstorm", ar: "عاصفة رعدية" },
    96: { en: "Thunderstorm w/ hail", ar: "عاصفة وبَرَد" },
    99: { en: "Severe thunderstorm", ar: "عاصفة شديدة" },
  };
  return map[code] ?? { en: "—", ar: "—" };
}

// Tiny in-memory cache to avoid re-querying on every mount (5 min)
const CACHE = new Map<string, LiveWeather>();
const TTL_MS = 5 * 60 * 1000;

export async function fetchLiveWeather(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<LiveWeather> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,` +
    `precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index` +
    `&hourly=visibility&forecast_days=1&wind_speed_unit=kmh&timezone=auto`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const cur = data.current ?? {};

  // visibility is hourly (meters) — match on "YYYY-MM-DDTHH" of the current local time
  let visibilityKm = 15;
  try {
    const times: string[] = data.hourly?.time ?? [];
    const vis: number[] = data.hourly?.visibility ?? [];
    const hourKey = String(cur.time ?? "").slice(0, 13); // e.g. 2026-05-27T23
    let idx = times.findIndex((t) => t.startsWith(hourKey));
    if (idx < 0) idx = 0;
    const m = vis[idx];
    if (typeof m === "number") visibilityKm = +(m / 1000).toFixed(1);
  } catch {}

  const code = Number(cur.weather_code ?? 0);
  const isDay = Number(cur.is_day ?? 1) === 1;
  const label = wmoLabel(code, isDay);

  const out: LiveWeather = {
    tempC: +Number(cur.temperature_2m ?? 0).toFixed(1),
    feelsLikeC: +Number(cur.apparent_temperature ?? cur.temperature_2m ?? 0).toFixed(1),
    humidity: Math.round(Number(cur.relative_humidity_2m ?? 0)),
    windKph: Math.round(Number(cur.wind_speed_10m ?? 0)),
    windGustKph: Math.round(Number(cur.wind_gusts_10m ?? 0)),
    windDir: compass(Number(cur.wind_direction_10m ?? 0)),
    windDeg: Math.round(Number(cur.wind_direction_10m ?? 0)),
    visibilityKm,
    uvIndex: +Number(cur.uv_index ?? 0).toFixed(1),
    pressureHpa: Math.round(Number(cur.pressure_msl ?? 0)),
    precipitationMm: +Number(cur.precipitation ?? 0).toFixed(1),
    weatherCode: code,
    conditionEn: label.en,
    conditionAr: label.ar,
    isDay,
    source: "live",
    fetchedAt: Date.now(),
  };

  CACHE.set(key, out);
  return out;
}

/** Derive simple alerts from live conditions. */
export interface WeatherAlert {
  kind: "dust" | "wind" | "rain" | "heat" | "cold" | "uv";
  severity: "info" | "warning" | "severe";
  en: string;
  ar: string;
}

export function deriveWeatherAlerts(w: LiveWeather): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];

  // Dust risk: low visibility + dry + wind
  if (w.visibilityKm < 4 && w.humidity < 35 && w.windKph > 18) {
    alerts.push({
      kind: "dust",
      severity: w.visibilityKm < 2 ? "severe" : "warning",
      en: `Dust storm risk — visibility ${w.visibilityKm} km`,
      ar: `خطر عاصفة غبار — الرؤية ${w.visibilityKm} كم`,
    });
  }

  // Strong wind / gusts
  if (w.windGustKph >= 50 || w.windKph >= 40) {
    alerts.push({
      kind: "wind",
      severity: w.windGustKph >= 70 ? "severe" : "warning",
      en: `Strong winds ${w.windKph} kph (gusts ${w.windGustKph})`,
      ar: `رياح قوية ${w.windKph} كم/س (هبّات ${w.windGustKph})`,
    });
  }

  // Rain / storms
  if (w.weatherCode >= 95) {
    alerts.push({
      kind: "rain",
      severity: "severe",
      en: "Thunderstorm in your area",
      ar: "عاصفة رعدية في منطقتك",
    });
  } else if (w.precipitationMm >= 5 || (w.weatherCode >= 80 && w.weatherCode <= 82)) {
    alerts.push({
      kind: "rain",
      severity: "warning",
      en: `Heavy rain — ${w.precipitationMm} mm/h`,
      ar: `أمطار غزيرة — ${w.precipitationMm} ملم/س`,
    });
  }

  // Extreme heat
  if (w.feelsLikeC >= 45) {
    alerts.push({
      kind: "heat",
      severity: "severe",
      en: `Extreme heat ${w.feelsLikeC}°C — stay hydrated`,
      ar: `حرارة شديدة ${w.feelsLikeC}°م — اشرب الماء`,
    });
  } else if (w.feelsLikeC >= 40) {
    alerts.push({
      kind: "heat",
      severity: "warning",
      en: `High heat ${w.feelsLikeC}°C`,
      ar: `حرارة مرتفعة ${w.feelsLikeC}°م`,
    });
  }

  // Cold
  if (w.feelsLikeC <= 2) {
    alerts.push({
      kind: "cold",
      severity: "warning",
      en: `Cold ${w.feelsLikeC}°C — dress warmly`,
      ar: `برد ${w.feelsLikeC}°م — البس ثياباً دافئة`,
    });
  }

  // UV
  if (w.uvIndex >= 8 && w.isDay) {
    alerts.push({
      kind: "uv",
      severity: w.uvIndex >= 11 ? "severe" : "warning",
      en: `Very high UV ${w.uvIndex} — use sunscreen`,
      ar: `أشعة فوق بنفسجية مرتفعة ${w.uvIndex} — استخدم واقي شمس`,
    });
  }

  return alerts;
}
