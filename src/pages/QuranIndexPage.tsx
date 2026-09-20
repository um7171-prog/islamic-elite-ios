import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Bookmark, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { JUZ_PAGES, SURAHS, loadBookmarks, loadPosition, savePosition, toArabicDigits } from "@/lib/mushaf";

type Tab = "surahs" | "juz" | "saved";

/** Strip Arabic diacritics / normalise alef + ta marbuta so "الرحمن" finds "ٱلرَّحۡمَٰن". */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[ٱآأإ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();

/**
 * Quran home: surah list / juz list / saved pages, with search. Tapping an
 * entry stores it as the reading position and opens the Mushaf reader (the
 * reader itself — 604 pages, search, bookmarks, zoom, audio — is unchanged).
 */
export default function QuranIndexPage() {
  const { t, lang, dir } = useLocale();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("surahs");
  const [q, setQ] = useState("");
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;
  const position = useMemo(() => loadPosition(), []);
  const bookmarks = useMemo(() => loadBookmarks(), []);

  const open = (page: number) => {
    savePosition(page);
    navigate("/mushaf");
  };

  const nq = norm(q);
  const surahs = SURAHS.filter((s) => !nq || norm(s.ar).includes(nq) || s.en.toLowerCase().includes(nq) || s.tr.toLowerCase().includes(nq) || String(s.n) === nq);
  const juz = JUZ_PAGES.map((page, i) => ({ n: i + 1, page })).filter((j) => !nq || String(j.n) === nq);
  const saved = bookmarks.filter((b) => !nq || norm(b.label).includes(nq) || String(b.page) === nq);
  const resumeSurah = SURAHS.find((s) => s.n === position.surah) ?? SURAHS[0];

  const tabs: { key: Tab; label: string }[] = [
    { key: "surahs", label: t("Surahs", "السور") },
    { key: "juz", label: t("Juz", "الأجزاء") },
    { key: "saved", label: t("Saved", "المحفوظات") },
  ];

  const numBadge = (n: number | string) => (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[hsl(var(--header-a))] text-body-sm font-bold text-[hsl(var(--elite-gold-end))] ring-[1.5px] ring-inset ring-[hsl(var(--elite-gold-start)/0.7)]">
      {lang === "ar" ? toArabicDigits(n) : n}
    </span>
  );

  return (
    <PageShell titleAr="القرآن الكريم" titleEn="Quran" fallback="/">
      <SEO
        title={t("The Holy Quran — Elite Islamic", "القرآن الكريم — النخبة الإسلامية")}
        description={t("Browse the 114 surahs and 30 juz and open the Mushaf.", "تصفّح السور الـ114 والأجزاء الـ30 وافتح المصحف.")}
        path="/quran"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-4">
        {/* Continue reading */}
        <button
          type="button"
          data-testid="quran-resume"
          onClick={() => open(position.page)}
          className="bg-header flex w-full items-center gap-3 rounded-2xl p-4 text-start shadow-sm transition active:scale-[0.99]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[hsl(var(--elite-gold-end))]">
            <BookOpen className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-body-sm text-white/70">{t("Continue reading", "متابعة القراءة")}</span>
            <span className="block truncate font-display text-body-lg font-bold text-white">
              {lang === "ar" ? resumeSurah.ar : resumeSurah.en} · {t(`page ${position.page}`, `صفحة ${toArabicDigits(position.page)}`)}
            </span>
          </span>
          <Chevron className="h-5 w-5 shrink-0 text-white/60" />
        </button>

        <div role="tablist" className="flex rounded-full bg-foreground/[0.06] p-1">
          {tabs.map((x) => (
            <button
              key={x.key}
              role="tab"
              type="button"
              aria-selected={tab === x.key}
              data-tab={x.key}
              onClick={() => setTab(x.key)}
              className={cn(
                "min-h-[40px] flex-1 rounded-full px-3 text-body-sm font-bold transition",
                tab === x.key ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/65",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-foreground/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="quran-search"
            placeholder={tab === "surahs" ? t("Search surahs…", "ابحث عن سورة…") : t("Search…", "بحث…")}
            className="h-12 w-full rounded-2xl bg-card ps-11 pe-11 text-body shadow-sm outline-none ring-1 ring-foreground/[0.07] placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={t("Clear", "مسح")} className="absolute inset-y-0 end-2 my-auto grid h-9 w-9 place-items-center text-foreground/45">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <ul className="glass overflow-hidden rounded-2xl divide-y divide-foreground/[0.07]" data-testid="quran-list">
          {tab === "surahs" &&
            surahs.map((s) => (
              <li key={s.n}>
                <button type="button" data-surah={s.n} onClick={() => open(s.page)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-start transition active:bg-foreground/[0.04]">
                  {numBadge(s.n)}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-arabic text-body-lg font-bold">{lang === "ar" ? s.ar : s.en}</span>
                    {lang === "ar" && (
                      <span className="block truncate text-[12px] text-foreground/55" dir="ltr">
                        {s.en} · {s.tr}
                      </span>
                    )}
                    {lang === "en" && <span className="block truncate text-[12px] text-foreground/55">{s.tr}</span>}
                  </span>
                  <span className="shrink-0 text-body-sm text-foreground/60">
                    {lang === "ar" ? `${toArabicDigits(s.ayahs)} آية` : `${s.ayahs} ayahs`}
                  </span>
                </button>
              </li>
            ))}
          {tab === "juz" &&
            juz.map((j) => (
              <li key={j.n}>
                <button type="button" data-juz={j.n} onClick={() => open(j.page)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-start transition active:bg-foreground/[0.04]">
                  {numBadge(j.n)}
                  <span className="min-w-0 flex-1 font-display text-body-lg font-bold">{t(`Juz ${j.n}`, `الجزء ${toArabicDigits(j.n)}`)}</span>
                  <span className="shrink-0 text-body-sm text-foreground/60">{t(`page ${j.page}`, `صفحة ${toArabicDigits(j.page)}`)}</span>
                </button>
              </li>
            ))}
          {tab === "saved" &&
            (saved.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-6 py-12 text-center text-body-sm text-foreground/55">
                <Bookmark className="h-8 w-8 opacity-40" />
                {t("No saved pages yet. Save a page from the reader.", "لا توجد صفحات محفوظة بعد. احفظ صفحة من القارئ.")}
              </li>
            ) : (
              saved.map((b) => (
                <li key={b.page}>
                  <button type="button" data-saved={b.page} onClick={() => open(b.page)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-start transition active:bg-foreground/[0.04]">
                    {numBadge(b.page)}
                    <span className="min-w-0 flex-1 truncate font-arabic text-body-lg font-bold">{b.label}</span>
                    <span className="shrink-0 text-body-sm text-foreground/60">{t(`page ${b.page}`, `صفحة ${toArabicDigits(b.page)}`)}</span>
                  </button>
                </li>
              ))
            ))}
          {((tab === "surahs" && surahs.length === 0) || (tab === "juz" && juz.length === 0)) && (
            <li className="px-6 py-10 text-center text-body-sm text-foreground/55">{t("No results", "لا توجد نتائج")}</li>
          )}
        </ul>
      </div>
    </PageShell>
  );
}
