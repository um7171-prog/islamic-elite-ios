import { EVENING, MORNING, POST_PRAYER, SLEEP, type Athkar } from "@/lib/athkarData";

/**
 * "Dhikr of the day" for Home. The content is ONLY what already exists in the
 * app's Athkar lists (no invented hadith): short entries, each labelled with the
 * Athkar collection it comes from. The pick is deterministic per calendar day and
 * changes only when the user taps "Next".
 */
export interface DailyItem {
  ar: string;
  en: string;
  source: "morning" | "evening" | "sleep" | "post-prayer";
}

const SOURCES: { key: DailyItem["source"]; list: Athkar[] }[] = [
  { key: "morning", list: MORNING },
  { key: "evening", list: EVENING },
  { key: "sleep", list: SLEEP },
  { key: "post-prayer", list: POST_PRAYER },
];

/** Short enough to read at a glance (Ayat al-Kursi and other long texts stay in Athkar). */
const MAX_LEN = 170;

export const DAILY_ITEMS: DailyItem[] = (() => {
  const seen = new Set<string>();
  const out: DailyItem[] = [];
  for (const { key, list } of SOURCES) {
    for (const it of list) {
      if (it.ar.length > MAX_LEN || seen.has(it.ar)) continue;
      seen.add(it.ar);
      out.push({ ar: it.ar, en: it.en, source: key });
    }
  }
  return out;
})();

export function dayOfYear(d = new Date()): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
}

export function dailyItem(offset = 0, d = new Date()): DailyItem {
  const n = DAILY_ITEMS.length;
  return DAILY_ITEMS[(((dayOfYear(d) + offset) % n) + n) % n];
}

export const SOURCE_LABEL: Record<DailyItem["source"], { ar: string; en: string }> = {
  morning: { ar: "من أذكار الصباح", en: "From the Morning Athkar" },
  evening: { ar: "من أذكار المساء", en: "From the Evening Athkar" },
  sleep: { ar: "من أذكار النوم", en: "From the Sleep Athkar" },
  "post-prayer": { ar: "من أذكار بعد الصلاة", en: "From the Post-Prayer Athkar" },
};
