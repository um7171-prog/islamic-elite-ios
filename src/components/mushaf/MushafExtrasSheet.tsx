import { useEffect, useState } from "react";
import { X, Star } from "lucide-react";
import { toArabicDigits, type PageInfo } from "@/lib/mushaf";
import { RECITERS, getFavorites, toggleFavorite, sortByFavorites } from "@/lib/reciters";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

export type ExtrasMode = "translation" | "tafsir" | "settings" | null;

interface Props {
  mode: ExtrasMode;
  onClose: () => void;
  info: PageInfo;
  reciterId: string;
  onReciterChange: (id: string) => void;
}

interface Line { num: number; surah: number; text: string }

const EDITIONS: Record<"translation" | "tafsir", string> = {
  translation: "en.sahih",
  tafsir: "ar.muyassar",
};

export function MushafExtrasSheet({ mode, onClose, info, reciterId, onReciterChange }: Props) {
  const { mode: themeMode, setMode } = useTheme();
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const [favs, setFavs] = useState<string[]>(() => getFavorites());

  useEffect(() => {
    if (mode !== "translation" && mode !== "tafsir") return;
    let alive = true;
    setLoading(true); setLines([]);
    fetch(`https://api.alquran.cloud/v1/page/${info.page}/${EDITIONS[mode]}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setLines((j?.data?.ayahs || []).map((a: { numberInSurah: number; text: string; surah: { number: number } }) => ({
          num: a.numberInSurah, surah: a.surah.number, text: a.text,
        })));
      })
      .catch(() => { /* offline */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mode, info.page]);

  if (!mode) return null;
  const title = mode === "translation" ? "الترجمة" : mode === "tafsir" ? "التفسير الميسّر" : "الإعدادات";

  return (
    <div dir="rtl" className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-h-[78vh] rounded-t-3xl bg-background/95 backdrop-blur-xl border-t border-border/40 flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h2 className="text-sm font-bold text-foreground">{title} · صفحة {toArabicDigits(info.page)}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="h-8 w-8 grid place-items-center rounded-full bg-foreground/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 py-3" style={{ WebkitOverflowScrolling: "touch" }}>
          {mode === "settings" ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-foreground/60 mb-2">وضع العرض</p>
                <div className="grid grid-cols-3 gap-2">
                  {([["system", "تلقائي"], ["light", "نهاري"], ["night", "ليلي"]] as const).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setMode(k)}
                      className={cn("rounded-xl py-2 text-xs font-semibold transition",
                        themeMode === k ? "bg-accent text-accent-foreground" : "bg-foreground/8 text-foreground/80")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground/60 mb-2">القارئ</p>
                <ul className="space-y-1">
                  {sortByFavorites(RECITERS, favs).map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <button
                        onClick={() => onReciterChange(r.id)}
                        className={cn("flex-1 text-right rounded-xl px-3 py-2 text-sm transition",
                          reciterId === r.id ? "bg-accent/20 text-accent font-bold" : "bg-foreground/6 text-foreground/85")}
                      >
                        <span className="font-arabic">{r.name}</span>
                      </button>
                      <button onClick={() => setFavs(toggleFavorite(r.id))} aria-label="مفضل" className="p-2">
                        <Star className={cn("h-4 w-4", favs.includes(r.id) ? "fill-amber-400 text-amber-400" : "text-foreground/30")} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : loading ? (
            <p className="py-10 text-center text-sm text-foreground/50">جارٍ التحميل…</p>
          ) : lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-foreground/50">تعذّر تحميل المحتوى</p>
          ) : (
            <ul className="space-y-3 pb-6">
              {lines.map((l, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-foreground/85" dir={mode === "translation" ? "ltr" : "rtl"}>
                  <span className="inline-grid place-items-center h-5 min-w-5 px-1 rounded-md bg-accent/15 text-accent text-[10px] font-bold align-middle mx-1">
                    {toArabicDigits(l.num)}
                  </span>
                  {l.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
