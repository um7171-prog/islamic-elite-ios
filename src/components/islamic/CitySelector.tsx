import { useEffect, useState } from "react";
import { MapPin, Check, Search, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCity } from "@/contexts/CityContext";
import { useLocale } from "@/contexts/LocaleContext";
import { searchGlobalLocations, searchLocalLocations, type CityLocation } from "@/lib/locations";

export function CitySelector({ compact = false }: { compact?: boolean }) {
  const { city, setCity } = useCity();
  const { t, lang } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityLocation[]>(() => searchLocalLocations("", 40));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(query.trim().length >= 2);
    const id = window.setTimeout(async () => {
      const next = await searchGlobalLocations(query);
      if (!cancelled) {
        setResults(next);
        setLoading(false);
      }
    }, query.trim().length >= 2 ? 350 : 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs hover:bg-foreground/10 transition ${
            compact ? "" : "font-medium"
          }`}
        >
          <MapPin className="h-3.5 w-3.5 text-accent" />
          <span>{lang === "ar" ? city.ar : city.en}</span>
          <span className="text-foreground/50">▾</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Search any city", "ابحث عن أي مدينة")}</DialogTitle>
        </DialogHeader>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("City, governorate, or country", "مدينة أو محافظة أو دولة")}
            className="pl-9"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent" />}
        </div>
        <div className="max-h-[60vh] overflow-y-auto -mx-2 mt-2">
          {results.map((c) => {
            const active = c.id === city.id;
            return (
              <button
                key={c.id}
                onClick={() => { setCity(c); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition ${
                  active ? "bg-accent/15 text-accent-foreground" : "hover:bg-foreground/5"
                }`}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-accent/80" />
                  <span className="text-start">
                    <span className="block">{lang === "ar" ? c.ar : c.en}</span>
                    <span className="block text-[10px] text-foreground/45">
                      {lang === "ar" ? c.countryAr : c.countryEn}
                    </span>
                  </span>
                </span>
                {active && <Check className="h-4 w-4 text-accent" />}
              </button>
            );
          })}
          {!loading && results.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-foreground/55">
              {t("No city found. Try a broader name.", "لم يتم العثور على مدينة. جرّب اسماً أوسع.")}
            </div>
          )}
        </div>
        <p className="text-[10px] text-foreground/50 text-center mt-2">
          {t("Saudi cities are built in; global results use live coordinate search.", "مدن السعودية مدمجة؛ والنتائج العالمية تستخدم بحث الإحداثيات المباشر.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
