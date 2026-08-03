import { Home, LayoutGrid, Download, Music2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

export type TabKey = "home" | "tools" | "media" | "tiktok";

interface Props {
  /** "other" keeps every tab inactive (used by pages outside the main tabs). */
  active: TabKey | "other";
  onChange: (t: TabKey) => void;
}

export function BottomNav({ active, onChange }: Props) {
  const { t, dir } = useLocale();
  const items: { key: TabKey; en: string; ar: string; Icon: React.ElementType }[] = [
    { key: "home", en: "Home", ar: "الرئيسية", Icon: Home },
    { key: "tools", en: "My Tools", ar: "أدواتي", Icon: LayoutGrid },
    { key: "media", en: "Media", ar: "الوسائط", Icon: Download },
    { key: "tiktok", en: "TikTok", ar: "تيك توك", Icon: Music2 },
  ];


  return (
    <nav
      dir={dir}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-foreground/10 bg-background/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-6xl items-stretch justify-around px-2 py-1.5">
        {items.map((it) => {
          const isActive = active === it.key;
          return (
            <li key={it.key} className="flex-1">
              <button
                onClick={() => onChange(it.key)}
                className={`flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 transition ${
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
