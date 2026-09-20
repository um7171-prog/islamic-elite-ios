/**
 * Central theme catalogue. A THEME is the app's colour identity (Emerald,
 * Makkah, Madinah, Layl, Heritage); the APPEARANCE (light / dark / system) is a
 * separate setting handled by ThemeContext. Every theme defines a token set for
 * BOTH appearances, so any theme works in light and dark.
 *
 * The tokens are HSL triplets ("H S% L%") for the CSS variables the whole UI is
 * built on (index.css). "emerald" is the app's original identity and defines no
 * overrides — index.css already holds its values — so it is exactly what the app
 * looked like before themes existed.
 *
 * `isPremium` is metadata only for now: the app is not paid yet and every theme
 * is unlocked. It exists so a future subscription can gate themes without
 * restructuring anything.
 */

export type ThemeId = "emerald" | "makkah" | "madinah" | "layl" | "heritage";
export type Appearance = "light" | "night";

/** CSS custom properties (name → HSL triplet) a theme overrides. */
export type ThemeTokens = Partial<Record<
  | "--background" | "--foreground" | "--card" | "--card-foreground" | "--popover" | "--popover-foreground"
  | "--primary" | "--primary-foreground" | "--secondary" | "--secondary-foreground"
  | "--muted" | "--muted-foreground" | "--accent" | "--accent-foreground"
  | "--border" | "--input" | "--ring"
  | "--header-a" | "--header-b" | "--elite-gold-start" | "--elite-gold-end",
  string
>>;

export interface ThemeDef {
  id: ThemeId;
  /** Arabic name */
  name: string;
  englishName: string;
  isPremium: boolean;
  /** Mood, for the picker's subtitle */
  moodAr: string;
  moodEn: string;
  tokens: Record<Appearance, ThemeTokens>;
}

const EMERALD: ThemeDef = {
  id: "emerald",
  name: "الزمرد",
  englishName: "Emerald",
  isPremium: false,
  moodAr: "زمردي فاخر بلمسة ذهبية",
  moodEn: "Premium emerald with soft gold",
  tokens: { light: {}, night: {} },
};

const MAKKAH: ThemeDef = {
  id: "makkah",
  name: "مكة",
  englishName: "Makkah",
  isPremium: true,
  moodAr: "أخضر عميق وذهب دافئ ورمل",
  moodEn: "Deep green, warm gold and sand",
  tokens: {
    light: {
      "--background": "38 32% 91%", "--foreground": "150 32% 11%",
      "--card": "40 45% 98%", "--card-foreground": "150 32% 11%",
      "--popover": "40 45% 98%", "--popover-foreground": "150 32% 11%",
      "--primary": "152 58% 19%", "--primary-foreground": "42 40% 97%",
      "--secondary": "38 28% 88%", "--muted": "38 26% 88%", "--muted-foreground": "150 12% 38%",
      "--accent": "38 78% 44%", "--accent-foreground": "150 40% 8%",
      "--border": "38 22% 82%", "--input": "38 24% 86%", "--ring": "152 50% 28%",
      "--header-a": "150 62% 11%", "--header-b": "148 46% 19%",
      "--elite-gold-start": "38 72% 40%", "--elite-gold-end": "40 82% 62%",
    },
    night: {
      "--background": "150 30% 6%", "--foreground": "42 30% 94%",
      "--card": "150 22% 10%", "--card-foreground": "42 30% 94%",
      "--popover": "150 22% 10%", "--popover-foreground": "42 30% 94%",
      "--primary": "146 52% 40%", "--primary-foreground": "150 40% 6%",
      "--secondary": "150 16% 14%", "--muted": "150 14% 15%", "--muted-foreground": "42 10% 72%",
      "--accent": "150 16% 16%", "--accent-foreground": "42 30% 94%",
      "--border": "150 14% 20%", "--input": "150 16% 14%", "--ring": "146 40% 48%",
      "--header-a": "150 64% 9%", "--header-b": "148 48% 16%",
      "--elite-gold-start": "38 74% 52%", "--elite-gold-end": "40 84% 66%",
    },
  },
};

const MADINAH: ThemeDef = {
  id: "madinah",
  name: "المدينة",
  englishName: "Madinah",
  isPremium: true,
  moodAr: "أخضر المدينة وتركواز هادئ",
  moodEn: "Madinah green with calm turquoise",
  tokens: {
    light: {
      "--background": "46 42% 96%", "--foreground": "172 34% 12%",
      "--card": "0 0% 100%", "--card-foreground": "172 34% 12%",
      "--popover": "0 0% 100%", "--popover-foreground": "172 34% 12%",
      "--primary": "168 62% 25%", "--primary-foreground": "46 40% 98%",
      "--secondary": "170 22% 92%", "--muted": "170 20% 92%", "--muted-foreground": "172 12% 38%",
      "--accent": "40 70% 46%", "--accent-foreground": "172 40% 8%",
      "--border": "170 16% 86%", "--input": "170 18% 90%", "--ring": "168 55% 32%",
      "--header-a": "172 62% 15%", "--header-b": "170 52% 26%",
      "--elite-gold-start": "40 66% 43%", "--elite-gold-end": "42 78% 60%",
    },
    night: {
      "--background": "175 30% 7%", "--foreground": "46 26% 94%",
      "--card": "175 22% 11%", "--card-foreground": "46 26% 94%",
      "--popover": "175 22% 11%", "--popover-foreground": "46 26% 94%",
      "--primary": "168 56% 42%", "--primary-foreground": "175 40% 6%",
      "--secondary": "175 16% 15%", "--muted": "175 14% 16%", "--muted-foreground": "170 10% 72%",
      "--accent": "175 16% 17%", "--accent-foreground": "46 26% 94%",
      "--border": "175 14% 21%", "--input": "175 16% 15%", "--ring": "168 45% 48%",
      "--header-a": "175 60% 11%", "--header-b": "172 52% 19%",
      "--elite-gold-start": "40 70% 52%", "--elite-gold-end": "42 80% 66%",
    },
  },
};

const LAYL: ThemeDef = {
  id: "layl",
  name: "الليل",
  englishName: "Layl",
  isPremium: true,
  moodAr: "كحلي عميق وزمرد وذهب",
  moodEn: "Deep navy with emerald and gold",
  tokens: {
    light: {
      "--background": "220 32% 96%", "--foreground": "222 42% 14%",
      "--card": "0 0% 100%", "--card-foreground": "222 42% 14%",
      "--popover": "0 0% 100%", "--popover-foreground": "222 42% 14%",
      "--primary": "160 56% 29%", "--primary-foreground": "42 40% 98%",
      "--secondary": "220 26% 92%", "--muted": "220 24% 92%", "--muted-foreground": "222 14% 40%",
      "--accent": "42 76% 47%", "--accent-foreground": "222 44% 10%",
      "--border": "220 18% 86%", "--input": "220 20% 90%", "--ring": "160 50% 34%",
      "--header-a": "222 56% 14%", "--header-b": "225 46% 25%",
      "--elite-gold-start": "42 72% 44%", "--elite-gold-end": "44 82% 62%",
    },
    night: {
      "--background": "224 42% 7%", "--foreground": "42 24% 94%",
      "--card": "224 32% 11%", "--card-foreground": "42 24% 94%",
      "--popover": "224 32% 11%", "--popover-foreground": "42 24% 94%",
      "--primary": "158 60% 44%", "--primary-foreground": "224 44% 6%",
      "--secondary": "224 26% 15%", "--muted": "224 24% 16%", "--muted-foreground": "220 14% 72%",
      "--accent": "224 26% 17%", "--accent-foreground": "42 24% 94%",
      "--border": "224 22% 21%", "--input": "224 26% 15%", "--ring": "158 50% 50%",
      "--header-a": "224 58% 10%", "--header-b": "226 46% 18%",
      "--elite-gold-start": "42 74% 54%", "--elite-gold-end": "44 84% 68%",
    },
  },
};

const HERITAGE: ThemeDef = {
  id: "heritage",
  name: "التراث",
  englishName: "Heritage",
  isPremium: true,
  moodAr: "بني دافئ ورمل وذهب هادئ وأخضر عميق",
  moodEn: "Warm brown, sand, muted gold and deep green",
  tokens: {
    light: {
      "--background": "36 36% 92%", "--foreground": "25 42% 13%",
      "--card": "38 50% 98%", "--card-foreground": "25 42% 13%",
      "--popover": "38 50% 98%", "--popover-foreground": "25 42% 13%",
      "--primary": "155 46% 23%", "--primary-foreground": "38 40% 97%",
      "--secondary": "34 28% 88%", "--muted": "34 26% 88%", "--muted-foreground": "25 14% 38%",
      "--accent": "40 62% 45%", "--accent-foreground": "25 44% 9%",
      "--border": "34 22% 82%", "--input": "34 24% 87%", "--ring": "155 40% 30%",
      "--header-a": "24 46% 17%", "--header-b": "26 38% 27%",
      "--elite-gold-start": "40 58% 41%", "--elite-gold-end": "42 70% 60%",
    },
    night: {
      "--background": "25 26% 8%", "--foreground": "36 30% 92%",
      "--card": "25 20% 12%", "--card-foreground": "36 30% 92%",
      "--popover": "25 20% 12%", "--popover-foreground": "36 30% 92%",
      "--primary": "152 42% 40%", "--primary-foreground": "25 30% 7%",
      "--secondary": "25 16% 16%", "--muted": "25 14% 17%", "--muted-foreground": "34 12% 72%",
      "--accent": "25 16% 18%", "--accent-foreground": "36 30% 92%",
      "--border": "25 14% 22%", "--input": "25 16% 16%", "--ring": "152 38% 48%",
      "--header-a": "24 44% 11%", "--header-b": "26 36% 20%",
      "--elite-gold-start": "40 60% 52%", "--elite-gold-end": "42 72% 66%",
    },
  },
};

export const THEMES: ThemeDef[] = [EMERALD, MAKKAH, MADINAH, LAYL, HERITAGE];
export const DEFAULT_THEME_ID: ThemeId = "emerald";
export const THEME_STORAGE_KEY = "elite.theme.id.v1";

export function themeById(id: string | null | undefined): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? EMERALD;
}

/** Every CSS variable any theme may set (so switching themes can clear the old ones). */
export const ALL_THEME_VARS: string[] = Array.from(
  new Set(THEMES.flatMap((t) => [...Object.keys(t.tokens.light), ...Object.keys(t.tokens.night)])),
);

/** Colours the picker uses to draw a theme's preview (always derived from the tokens). */
export function themePreview(def: ThemeDef, appearance: Appearance) {
  const tk = def.tokens[appearance];
  // Emerald has no overrides: mirror index.css so the preview is still truthful.
  const fallback =
    appearance === "light"
      ? { a: "162 55% 15%", b: "160 45% 24%", bg: "42 38% 95%", card: "0 0% 100%", primary: "160 62% 24%", gold: "40 66% 44%" }
      : { a: "162 55% 15%", b: "160 45% 24%", bg: "165 24% 7%", card: "165 18% 11%", primary: "158 64% 42%", gold: "45 67% 48%" };
  return {
    headerA: tk["--header-a"] ?? fallback.a,
    headerB: tk["--header-b"] ?? fallback.b,
    background: tk["--background"] ?? fallback.bg,
    card: tk["--card"] ?? fallback.card,
    primary: tk["--primary"] ?? fallback.primary,
    gold: tk["--elite-gold-start"] ?? fallback.gold,
  };
}
