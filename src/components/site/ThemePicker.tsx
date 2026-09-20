import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLocale } from "@/contexts/LocaleContext";
import { useTheme } from "@/contexts/ThemeContext";
import { THEMES, themePreview, type ThemeDef } from "@/lib/themes";
import { cn } from "@/lib/utils";

/** Mini rendering of a theme (header, card, accent) for the picker — drawn from
 * the theme's own tokens, in the appearance currently in use. */
export function ThemeSwatch({ def, className }: { def: ThemeDef; className?: string }) {
  const { theme } = useTheme();
  const p = themePreview(def, theme);
  return (
    <span
      aria-hidden
      className={cn("relative block h-14 w-14 shrink-0 overflow-hidden rounded-2xl ring-1 ring-foreground/10", className)}
      style={{ background: `hsl(${p.background})` }}
    >
      <span className="absolute inset-x-0 top-0 h-6" style={{ background: `linear-gradient(135deg, hsl(${p.headerA}), hsl(${p.headerB}))` }} />
      <span className="absolute inset-x-1.5 top-4 h-5 rounded-md shadow-sm" style={{ background: `hsl(${p.card})` }} />
      <span className="absolute bottom-1.5 start-1.5 h-2.5 w-6 rounded-full" style={{ background: `hsl(${p.primary})` }} />
      <span className="absolute bottom-1.5 end-1.5 h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${p.gold})` }} />
    </span>
  );
}

/** Theme picker: the five colour identities, applied instantly. Independent of
 * Appearance (light / dark / system). */
export function ThemePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, lang, dir } = useLocale();
  const { themeId, setThemeId } = useTheme();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir={dir} className="max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-0 bg-background px-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-foreground/15" />
        <SheetHeader className="px-5 pb-2 text-start">
          <SheetTitle className="font-display text-h3">{t("Theme", "الثيم")}</SheetTitle>
          <SheetDescription className="text-body-sm">
            {t("Colours and style. Works in light and dark.", "الألوان والطابع. يعمل في الفاتح والداكن.")}
          </SheetDescription>
        </SheetHeader>
        <ul className="mx-4 overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card divide-y divide-foreground/[0.07]" role="radiogroup" aria-label={t("Theme", "الثيم")} data-testid="theme-list">
          {THEMES.map((def) => {
            const active = def.id === themeId;
            return (
              <li key={def.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-theme-option={def.id}
                  onClick={() => setThemeId(def.id)}
                  className="flex min-h-[80px] w-full items-center gap-4 px-4 py-3 text-start transition active:bg-foreground/[0.04]"
                >
                  <ThemeSwatch def={def} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={cn("block font-display text-body-lg font-bold", active && "text-primary")}>
                      {lang === "ar" ? def.name : def.englishName}
                    </span>
                    {lang === "ar" && <span className="block text-body-sm text-foreground/60" dir="ltr">{def.englishName}</span>}
                    <span className="mt-0.5 block text-caption text-foreground/55">{lang === "ar" ? def.moodAr : def.moodEn}</span>
                  </span>
                  <span className="grid h-7 w-7 shrink-0 place-items-center" aria-hidden>
                    {active && <Check className="h-6 w-6 text-primary" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
