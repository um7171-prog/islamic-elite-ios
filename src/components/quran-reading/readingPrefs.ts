/**
 * Reading-mode presentation settings, kept in one place so the font can be swapped later (e.g. for
 * the official KFGQPC Uthmanic Hafs font, once that decision is made) without touching any screen.
 */

/**
 * The Quran text font. "Amiri Quran" is already loaded by src/index.css from Google Fonts (SIL Open
 * Font License) and supports the Quranic marks used by the text. No new font files are added here.
 */
export const QURAN_READING_FONT = {
  family: '"Amiri Quran", "Scheherazade New", "Amiri", serif',
  /** Always regular: a synthesised bold distorts Quranic letterforms. */
  weight: 400,
  /** Room above/below each line for the marks (tashkeel, waqf signs). */
  lineHeight: 2.3,
  /**
   * Explicit 0: `body` sets a 0.005em letter spacing (src/index.css), which Arabic text would inherit —
   * any non-zero value can make WebKit drop ligatures and open gaps in joined letters.
   */
  letterSpacing: 0,
} as const;

export const FONT_SIZE = { min: 18, max: 44, step: 2, default: 26 } as const;
export const FONT_SIZE_KEY = "quranReading:fontSize";

export const clampFontSize = (n: number) => Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(n)));

export function loadFontSize(): number {
  try {
    const v = Number(localStorage.getItem(FONT_SIZE_KEY));
    return Number.isFinite(v) && v > 0 ? clampFontSize(v) : FONT_SIZE.default;
  } catch {
    return FONT_SIZE.default;
  }
}

export function saveFontSize(n: number): void {
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(clampFontSize(n)));
  } catch {
    /* storage unavailable */
  }
}
