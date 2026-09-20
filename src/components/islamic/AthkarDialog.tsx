import { useEffect, useState } from "react";
import { Check, Search, Sunrise, Sunset, BedDouble, CheckCircle2, X } from "lucide-react";
import { FullScreenDialog } from "@/components/site/FullScreenDialog";
import { EVENING, MORNING, POST_PRAYER, SLEEP, type Athkar } from "@/lib/athkarData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";


/** Diacritics-insensitive matching for the search box. */
const normalize = (x: string) =>
  x.normalize("NFD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "").replace(/[\u0671\u0622\u0623\u0625]/g, "\u0627").toLowerCase().trim();

// The app advertises "progress saved" for Athkar, but tallies were only ever
// in-memory React state — closing the dialog (a Radix Dialog, unmounted on
// close) silently lost all progress. Persist per list, keyed by today's date
// so tomorrow's Athkar start fresh rather than carrying over yesterday's tally.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function List({ items, storageKey, query }: { items: Athkar[]; storageKey: string; query: string }) {
  const fullKey = `athkar.counts.${storageKey}.${todayKey()}`;
  const [counts, setCounts] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr) && arr.length === items.length && arr.every((n) => typeof n === "number")) {
        return arr;
      }
    } catch {
      /* ignore malformed/unavailable storage */
    }
    return items.map(() => 0);
  });

  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(counts));
    } catch {
      /* storage unavailable */
    }
  }, [counts, fullKey]);

  const { lang, t } = useLocale();
  const tap = (i: number) => setCounts(c => c.map((v, idx) => idx === i ? Math.min(v + 1, items[i].count) : v));
  const nq = normalize(query);
  const doneCount = items.filter((it, i) => counts[i] >= it.count).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-foreground/[0.07]" data-testid="athkar-progress">
        <span className="text-body font-semibold text-foreground/70">{t("Completed", "المنجز")}</span>
        <span dir="ltr" className="font-display text-[26px] font-bold tabular-nums text-primary">{doneCount} <span className="text-[16px] font-semibold text-foreground/50">/ {items.length}</span></span>
      </div>
      {items.map((it, i) => {
        if (nq && !normalize(it.ar).includes(nq) && !it.en.toLowerCase().includes(nq)) return null;
        const done = counts[i] >= it.count;
        const pct = Math.min(100, Math.round((counts[i] / it.count) * 100));
        return (
          <button
            key={i}
            data-thikr={i}
            data-done={done ? "1" : "0"}
            onClick={() => tap(i)}
            className={cn(
              "w-full overflow-hidden rounded-3xl text-start shadow-sm ring-1 transition active:scale-[0.99]",
              done ? "bg-primary/10 ring-primary/30" : "bg-card ring-foreground/[0.07]",
            )}
          >
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full text-body-sm font-bold transition-colors",
                  done ? "bg-primary text-primary-foreground" : "bg-[hsl(var(--header-a))] text-[hsl(var(--elite-gold-end))]",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[hsl(var(--elite-gold-start)/0.5)] to-transparent" />
              <span className="text-body-sm font-semibold text-foreground/50">{t("Tap to count", "اضغط للعدّ")}</span>
            </div>
            {/* The dhikr itself: large, high-contrast, generous line height */}
            <p
              data-testid="thikr-text"
              dir="rtl"
              className="px-5 pb-2 pt-4 text-center font-arabic text-[26px] font-bold leading-[2.35] text-foreground"
            >
              {it.ar}
            </p>
            {lang === "en" && <p className="px-5 pb-1 text-center text-body text-foreground/65">{it.en}</p>}
            <div className="flex items-center gap-4 px-5 pb-5 pt-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span
                data-testid="thikr-count"
                dir="ltr"
                className={cn(
                  "grid min-w-[84px] place-items-center rounded-2xl px-4 py-2 font-display text-[28px] font-bold leading-none tabular-nums",
                  done ? "bg-primary text-primary-foreground" : "bg-accent/15 text-[hsl(var(--elite-gold-start))]",
                )}
              >
                {counts[i]}<span className="text-[16px] font-semibold opacity-70"> / {it.count}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const tabTrigger =
  "min-w-0 flex-col h-auto gap-1 rounded-full py-2 px-1 whitespace-normal text-center leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm";

export function AthkarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  return (
    <FullScreenDialog
      open={open}
      onOpenChange={onOpenChange}
      titleAr="الأذكار"
      titleEn="Athkar"
      extra={
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-foreground/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="athkar-search"
            placeholder={t("Search Athkar…", "ابحث في الأذكار…")}
            className="h-12 w-full rounded-2xl bg-card ps-11 pe-11 text-body text-foreground outline-none placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label={t("Clear", "مسح")} className="absolute inset-y-0 end-2 my-auto grid h-9 w-9 place-items-center text-foreground/45">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      }
    >
      <Tabs defaultValue="morning" className="min-w-0">
        <TabsList className="grid h-auto w-full min-w-0 grid-cols-4 gap-1 rounded-full bg-foreground/[0.06] p-1">
          <TabsTrigger value="morning" className={tabTrigger}>
            <Sunrise className="h-4 w-4" />
            <span className="w-full truncate text-body-sm font-semibold">{t("Morning", "الصباح")}</span>
          </TabsTrigger>
          <TabsTrigger value="evening" className={tabTrigger}>
            <Sunset className="h-4 w-4" />
            <span className="w-full truncate text-body-sm font-semibold">{t("Evening", "المساء")}</span>
          </TabsTrigger>
          <TabsTrigger value="sleep" className={tabTrigger}>
            <BedDouble className="h-4 w-4" />
            <span className="w-full truncate text-body-sm font-semibold">{t("Sleep", "النوم")}</span>
          </TabsTrigger>
          <TabsTrigger value="post-prayer" className={tabTrigger}>
            <CheckCircle2 className="h-4 w-4" />
            <span className="w-full truncate text-body-sm font-semibold">{t("Post-Prayer", "بعد الصلاة")}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="morning" className="pt-4"><List items={MORNING} storageKey="morning" query={query} /></TabsContent>
        <TabsContent value="evening" className="pt-4"><List items={EVENING} storageKey="evening" query={query} /></TabsContent>
        <TabsContent value="sleep" className="pt-4"><List items={SLEEP} storageKey="sleep" query={query} /></TabsContent>
        <TabsContent value="post-prayer" className="pt-4"><List items={POST_PRAYER} storageKey="post-prayer" query={query} /></TabsContent>
      </Tabs>
    </FullScreenDialog>
  );
}
