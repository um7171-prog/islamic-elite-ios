/**
 * UI languages of Islamic Elite.
 *
 * Arabic and English are the app's source languages: every UI string is written in both, inline,
 * as t("English", "العربية"). Any other language is a CATALOG that maps the English source string
 * to its translation (src/i18n/locales/<code>.json), loaded lazily so a language costs nothing
 * until it is chosen.
 *
 * A catalog language is offered to users only when it is COMPLETE (every source string translated
 * and reviewed) — no half-translated UI. UI strings only: religious content (Quran translations,
 * athkar meanings, tafsir) is never machine-translated here; it needs its own licensed source.
 */
export interface UiLanguage {
  code: string;
  /** The language's own name, as shown in the language picker. */
  native: string;
  english: string;
  dir: "rtl" | "ltr";
}

export const SOURCE_LANGUAGES = ["ar", "en"] as const;

/** Target languages, by priority for Muslim users worldwide. */
export const TARGET_LANGUAGES: UiLanguage[] = [
  { code: "ur", native: "اردو", english: "Urdu", dir: "rtl" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian", dir: "ltr" },
  { code: "tr", native: "Türkçe", english: "Turkish", dir: "ltr" },
  { code: "fa", native: "فارسی", english: "Persian", dir: "rtl" },
  { code: "fr", native: "Français", english: "French", dir: "ltr" },
  { code: "bn", native: "বাংলা", english: "Bengali", dir: "ltr" },
  { code: "ms", native: "Bahasa Melayu", english: "Malay", dir: "ltr" },
  { code: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "es", native: "Español", english: "Spanish", dir: "ltr" },
  { code: "de", native: "Deutsch", english: "German", dir: "ltr" },
  { code: "ru", native: "Русский", english: "Russian", dir: "ltr" },
  { code: "zh", native: "中文", english: "Chinese", dir: "ltr" },
  { code: "pt", native: "Português", english: "Portuguese", dir: "ltr" },
  { code: "ml", native: "മലയാളം", english: "Malayalam", dir: "ltr" },
  { code: "ta", native: "தமிழ்", english: "Tamil", dir: "ltr" },
  { code: "te", native: "తెలుగు", english: "Telugu", dir: "ltr" },
  { code: "so", native: "Soomaali", english: "Somali", dir: "ltr" },
  { code: "ha", native: "Hausa", english: "Hausa", dir: "ltr" },
  { code: "sw", native: "Kiswahili", english: "Swahili", dir: "ltr" },
  { code: "uz", native: "Oʻzbek", english: "Uzbek", dir: "ltr" },
  { code: "ps", native: "پښتو", english: "Pashto", dir: "rtl" },
  { code: "ku", native: "Kurdî", english: "Kurdish", dir: "ltr" },
];

export function languageDir(code: string): "rtl" | "ltr" {
  if (code === "ar") return "rtl";
  return TARGET_LANGUAGES.find((l) => l.code === code)?.dir ?? "ltr";
}
