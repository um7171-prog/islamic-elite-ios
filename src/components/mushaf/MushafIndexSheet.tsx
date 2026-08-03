import { useMemo, useState } from "react";
import { Search, X, Bookmark, Trash2 } from "lucide-react";
import { SURAHS, JUZ_PAGES, HIZB_PAGES, toArabicDigits, clampPage, findVersePage, type MushafBookmark } from "@/lib/mushaf";
import { cn } from "@/lib/utils";

type TabKey = "surah" | "juz" | "hizb" | "page" | "bookmarks";

interface Props {
  open: boolean;
  onClose: () => void;
  currentPage: number;
  bookmarks: MushafBookmark[];
  onGoTo: (page: number) => void;
  onRemoveBookmark: (page: number) => void;
  initialTab?: TabKey;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "surah", label: "السور" },
  { key: "juz", label: "الأجزاء" },
  { key: "hizb", label: "الأحزاب" },
  { key: "page", label: "بحث" },
  { key: "bookmarks", label: "المفضلة" },
];

export function MushafIndexSheet({ open, onClose, currentPage, bookmarks, onGoTo, onRemoveBookmark, initialTab = "surah" }: Props) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [q, setQ] = useState("");
  const [verse, setVerse] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SURAHS;
    return SURAHS.filter((x) => x.ar.includes(s) || x.en.toLowerCase().includes(s) || String(x.n) === s);
  }, [q]);

  const go = (page: number) => { onGoTo(clampPage(page)); onClose(); };

  const searchFree = async () => {
    const raw = q.trim();
    if (!raw) return;
    // "2:255" or "البقرة 255" style verse lookup
    const m = raw.match(/^(\d{1,3})\s*[:\-\/]\s*(\d{1,3})$/);
    if (m) {
      setBusy(true);
      const page = await findVersePage(+m[1], +m[2]);
      setBusy(false);
      if (page) return go(page);
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 604) return go(n);
  };

  if (!open) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-h-[80vh] rounded-t-3xl bg-background/95 backdrop-blur-xl border-t border-border/40 flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-foreground/20" />
          <button onClick={onClose} aria-label="إغلاق" className="absolute left-3 top-3 h-8 w-8 grid place-items-center rounded-full bg-foreground/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1.5 px-3 py-3 overflow-x-auto">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition",
                tab === tb.key ? "bg-accent text-accent-foreground" : "bg-foreground/8 text-foreground/80",
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {(tab === "surah" || tab === "page") && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 rounded-xl bg-foreground/8 px-3 py-2">
              <Search className="h-4 w-4 text-foreground/60" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (tab === "page" ? searchFree() : filtered[0] && go(filtered[0].page))}
                placeholder={tab === "page" ? "رقم الصفحة أو آية مثل 2:255" : "ابحث عن سورة"}
                inputMode={tab === "page" ? "numeric" : "text"}
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-foreground/40"
              />
              {tab === "page" && (
                <button onClick={searchFree} disabled={busy} className="text-xs font-bold text-accent">
                  {busy ? "..." : "انتقال"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-y-auto overscroll-contain px-3 pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {tab === "surah" && (
            <ul className="divide-y divide-border/30">
              {filtered.map((s) => (
                <li key={s.n}>
                  <button onClick={() => go(s.page)} className="w-full flex items-center gap-3 py-2.5 text-right">
                    <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-accent/15 text-accent text-[11px] font-bold">
                      {toArabicDigits(s.n)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-arabic text-[15px] text-foreground truncate">{s.ar}</span>
                      <span className="block text-[10px] text-foreground/50">
                        {s.type === "makki" ? "مكية" : "مدنية"} · {toArabicDigits(s.ayahs)} آية
                      </span>
                    </span>
                    <span className="text-[11px] text-foreground/50">ص {toArabicDigits(s.page)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === "juz" && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {JUZ_PAGES.map((p, i) => (
                <button key={i} onClick={() => go(p)} className="rounded-xl bg-foreground/8 py-3 text-center active:scale-95 transition">
                  <span className="block text-sm font-bold text-foreground">الجزء {toArabicDigits(i + 1)}</span>
                  <span className="block text-[10px] text-foreground/50">ص {toArabicDigits(p)}</span>
                </button>
              ))}
            </div>
          )}

          {tab === "hizb" && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {HIZB_PAGES.map((p, i) => (
                <button key={i} onClick={() => go(p)} className="rounded-xl bg-foreground/8 py-3 text-center active:scale-95 transition">
                  <span className="block text-sm font-bold text-foreground">الحزب {toArabicDigits(i + 1)}</span>
                  <span className="block text-[10px] text-foreground/50">ص {toArabicDigits(p)}</span>
                </button>
              ))}
            </div>
          )}

          {tab === "page" && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-6 gap-1.5">
                {[1, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 604].map((p) => (
                  <button key={p} onClick={() => go(p)} className="rounded-lg bg-foreground/8 py-2 text-[11px] font-semibold">
                    {toArabicDigits(p)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-foreground/8 px-3 py-2">
                <input
                  value={verse}
                  onChange={(e) => setVerse(e.target.value)}
                  placeholder="سورة:آية — مثال 18:10"
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-foreground/40"
                />
                <button
                  className="text-xs font-bold text-accent"
                  onClick={async () => {
                    const m = verse.trim().match(/^(\d{1,3})\s*[:\-\/]\s*(\d{1,3})$/);
                    if (!m) return;
                    setBusy(true);
                    const page = await findVersePage(+m[1], +m[2]);
                    setBusy(false);
                    if (page) go(page);
                  }}
                >
                  {busy ? "..." : "بحث"}
                </button>
              </div>
            </div>
          )}

          {tab === "bookmarks" && (
            bookmarks.length === 0 ? (
              <p className="py-10 text-center text-sm text-foreground/50">لا توجد صفحات مفضلة بعد</p>
            ) : (
              <ul className="divide-y divide-border/30">
                {bookmarks.map((b) => (
                  <li key={b.page} className="flex items-center gap-2">
                    <button onClick={() => go(b.page)} className="flex-1 flex items-center gap-3 py-3 text-right">
                      <Bookmark className={cn("h-4 w-4", b.page === currentPage ? "text-accent" : "text-foreground/40")} />
                      <span className="flex-1 font-arabic text-[15px] text-foreground">{b.label}</span>
                      <span className="text-[11px] text-foreground/50">ص {toArabicDigits(b.page)}</span>
                    </button>
                    <button onClick={() => onRemoveBookmark(b.page)} aria-label="حذف" className="p-2 text-foreground/40">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </div>
  );
}
