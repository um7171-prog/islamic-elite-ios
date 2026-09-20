import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { ALL_THEME_VARS, DEFAULT_THEME_ID, THEME_STORAGE_KEY, themeById, type ThemeId } from "@/lib/themes";

export type ThemeMode = "system" | "night" | "light";
type ResolvedTheme = "night" | "light";

interface ThemeCtx {
  /** Resolved theme actually applied (after resolving "system"). */
  theme: ResolvedTheme;
  /** User preference — may be "system". */
  mode: ThemeMode;
  /** Set explicit mode (system / night / light). */
  setMode: (m: ThemeMode) => void;
  /** Back-compat: set resolved theme (forces manual override). */
  setTheme: (t: ResolvedTheme) => void;
  isNight: boolean;
  /** Colour identity (Emerald, Makkah…) — independent of light/dark. */
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

const ThemeCtx = createContext<ThemeCtx | null>(null);

const KEY = "theme-mode";
const LEGACY_KEY = "theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "night";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "light";
}

function loadMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(KEY);
  if (stored === "system" || stored === "night" || stored === "light") return stored;
  // migrate legacy "theme" key (was always manual)
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === "light" || legacy === "night") return legacy;
  return "system";
}

function loadThemeId(): ThemeId {
  try {
    return themeById(localStorage.getItem(THEME_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => loadMode());
  const [themeId, setThemeIdState] = useState<ThemeId>(() => loadThemeId());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  // Listen to system theme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "night" : "light");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const resolved: ResolvedTheme = mode === "system" ? systemTheme : mode;

  useEffect(() => {
    localStorage.setItem(KEY, mode);
    const root = document.documentElement;
    if (resolved === "light") {
      root.classList.add("light");
      root.style.colorScheme = "light";
    } else {
      root.classList.remove("light");
      root.style.colorScheme = "dark";
    }
  }, [mode, resolved]);

  // Apply the colour theme: clear every variable a theme may set, then set the
  // active theme's tokens for the resolved appearance. (Emerald sets none — its
  // values live in index.css.) Runs whenever the theme OR the appearance changes,
  // so any theme works in both light and dark.
  useEffect(() => {
    const root = document.documentElement;
    ALL_THEME_VARS.forEach((v) => root.style.removeProperty(v));
    const tokens = themeById(themeId).tokens[resolved];
    Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v as string));
    root.dataset.theme = themeId;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      /* private mode */
    }
  }, [themeId, resolved]);

  const setThemeId = useCallback((id: ThemeId) => setThemeIdState(themeById(id).id), []);
  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const setTheme = useCallback((t: ResolvedTheme) => setModeState(t), []);

  const value: ThemeCtx = { theme: resolved, mode, setMode, setTheme, isNight: resolved === "night", themeId, setThemeId };
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
