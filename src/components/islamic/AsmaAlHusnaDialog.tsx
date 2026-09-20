import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { ASMA_AL_HUSNA, stripTashkeel } from "@/lib/asmaAlHusna";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** أسماء الله الحسنى — the 99 Names of Allah, with transliteration and meaning. */
export function AsmaAlHusnaDialog({ open, onOpenChange }: Props) {
  const { t, dir, lang } = useLocale();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ASMA_AL_HUSNA;
    const qAr = stripTashkeel(query.trim());
    return ASMA_AL_HUSNA.filter(
      (n) =>
        stripTashkeel(n.ar).includes(qAr) ||
        n.transliteration.toLowerCase().includes(q) ||
        n.en.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-lg p-0 overflow-hidden bg-background">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-elite-gold">
            <Sparkles className="h-5 w-5" />
            {t("The 99 Names of Allah", "أسماء الله الحسنى")}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search a name or meaning", "ابحث عن اسم أو معنى")}
              className="ps-9"
            />
          </div>
        </div>

        <div className="px-5 pb-5 max-h-[65vh] overflow-y-auto pe-1 space-y-2">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-foreground/60 py-8">
              {t("No matching name found.", "لم يتم العثور على اسم مطابق.")}
            </p>
          )}
          {filtered.map((n) => (
            <div
              key={n.number}
              className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-card/60 p-3 hover:bg-foreground/5 transition"
            >
              <span className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-[12px] font-bold text-accent-foreground"
                style={{ background: "var(--gradient-elite-gold)" }}>
                {n.number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-arabic text-lg leading-tight text-foreground">{n.ar}</div>
                <div className="text-xs text-foreground/60 truncate">
                  {n.transliteration}
                  {lang === "en" ? ` — ${n.en}` : ""}
                </div>
              </div>
              {lang === "ar" && (
                <div className="shrink-0 max-w-[38%] text-end text-xs text-foreground/60 leading-snug">
                  {n.en}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
