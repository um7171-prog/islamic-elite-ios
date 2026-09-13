import { Languages } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

export function LanguageToggle() {
  const { lang, setLang } = useLocale();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      className="glass shrink-0 rounded-full h-8 px-2.5 sm:px-3 flex items-center gap-1.5 text-[11px] sm:text-sm font-medium hover:scale-105 transition"
      aria-label="Toggle language"
    >
      <Languages className="h-4 w-4 text-accent shrink-0" />
      <span className="leading-none">{lang === "en" ? "ع" : "EN"}</span>
    </button>
  );
}
