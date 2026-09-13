import { Home, LayoutGrid, Download } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { resetAppScroll } from "@/components/ScrollToTop";
import { isIOSNativeApp } from "@/lib/platform";

export type TabKey = "home" | "tools" | "media";

interface Props {
  /** "other" keeps every tab inactive (used by pages outside the main tabs). */
  active: TabKey | "other";
  onChange: (t: TabKey) => void;
}

export function BottomNav({ active, onChange }: Props) {
  const { t, dir } = useLocale();
  const iosNative = isIOSNativeApp();
  const items: { key: TabKey; en: string; ar: string; Icon: React.ElementType }[] = [
    { key: "home", en: "Home", ar: "الرئيسية", Icon: Home },
    { key: "tools", en: "My Tools", ar: "أدواتي", Icon: LayoutGrid },
    ...(!iosNative ? [
      { key: "media" as TabKey, en: "Media", ar: "الوسائط", Icon: Download },
    ] : []),
  ];


  return (
    <nav
      dir={dir}
      className="bottom-navigation border-t border-foreground/10 bg-background/95 backdrop-blur-xl"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backgroundColor: "hsl(var(--background) / 0.95)",
      }}
    >
      <ul className="mx-auto flex max-w-6xl items-stretch justify-around px-2 pb-0.5 pt-1">
        {items.map((it) => {
          const isActive = active === it.key;
          return (
            <li key={it.key} className="flex-1">
              <button
                type="button"
                onClick={() => { resetAppScroll(); onChange(it.key); }}
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                className={`flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition ${
                  isActive ? "text-accent" : "text-foreground/60 hover:text-foreground/90"
                }`}
                aria-current={isActive ? "page" : undefined}
              >

                <span
                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                    isActive ? "bg-accent/15 shadow-sm" : "bg-transparent"
                  }`}
                >
                  <it.Icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-semibold leading-none">{t(it.en, it.ar)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
