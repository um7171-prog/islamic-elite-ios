import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { startArabize, stopArabize } from "@/lib/arabize";

type Lang = "en" | "ar";
interface Ctx { lang: Lang; setLang: (l: Lang) => void; dir: "ltr" | "rtl"; t: (en: string, ar: string) => string; }
const LocaleCtx = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
    if (stored === "ar" || stored === "en") return stored;
    return typeof navigator !== "undefined" && navigator.language.startsWith("ar") ? "ar" : "en";
  });

  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    localStorage.setItem("lang", lang);
    stopArabize();
  }, [lang]);

  const value = useMemo<Ctx>(() => ({
    lang,
    setLang,
    dir: lang === "ar" ? "rtl" : "ltr",
    t: (en, ar) => (lang === "ar" ? ar : en),
  }), [lang]);

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleCtx);
  if (!ctx) throw new Error("useLocale must be inside LocaleProvider");
  return ctx;
}
