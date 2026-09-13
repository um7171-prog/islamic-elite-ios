import { useRef, useState } from "react";
import { Search, X, Briefcase, Landmark, ChevronLeft, ChevronRight, RotateCw, BellPlus, History } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StaticPageShell } from "@/components/site/StaticPageShell";
import { JobCard } from "@/components/jobs/JobCard";
import {
  DEFAULT_FILTERS,
  EXPERIENCE_LEVELS,
  JOB_CATEGORIES,
  JOB_CITIES,
  JOB_TYPES,
  clearSearchHistory,
  createJobAlert,
  getSavedJobs,
  getSearchHistory,
  loadFilters,
  pushSearchHistory,
  saveFilters,
  searchJobs,
  toggleSavedJob,
  type Job,
  type SavedFilters,
} from "@/lib/jobs";

const PAGE_SIZE = 20;

export default function SaudiJobs() {
  // draft = what the user is editing, applied = what the last search used
  const [draft, setDraft] = useState<SavedFilters>(() => loadFilters());
  const [applied, setApplied] = useState<SavedFilters | null>(null);
  const [page, setPage] = useState(1);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>(() => getSavedJobs());
  const [history, setHistory] = useState<string[]>(() => getSearchHistory());
  const [alerting, setAlerting] = useState(false);
  const inFlight = useRef(false);

  const setField = (patch: Partial<SavedFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const isEmpty = (f: SavedFilters) =>
    !f.keyword.trim() &&
    f.city === DEFAULT_FILTERS.city &&
    f.employmentType === DEFAULT_FILTERS.employmentType &&
    f.experienceLevel === DEFAULT_FILTERS.experienceLevel &&
    f.category === DEFAULT_FILTERS.category;

  /** Single place that talks to the API. Never called from an effect. */
  const fetchPage = async (f: SavedFilters, targetPage: number, force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setErrorMsg(null);
    const preset = JOB_CATEGORIES.find((c) => c.id === f.category);
    const res = await searchJobs(
      {
        keyword: [f.keyword, preset?.keyword].filter(Boolean).join(" ").trim(),
        city: f.city,
        employmentType: preset?.employmentType ?? f.employmentType,
        experienceLevel: preset?.experienceLevel ?? f.experienceLevel,
        page: targetPage,
      },
      { force },
    );
    if (res.error) {
      setErrorMsg(res.message ?? "تعذر جلب الوظائف حالياً.");
      setJobs([]);
      setTotal(0);
    } else {
      setJobs(res.jobs);
      setTotal(res.totalCount);
    }
    setLoading(false);
    inFlight.current = false;
  };

  const runSearch = () => {
    if (isEmpty(draft)) {
      setErrorMsg(null);
      setSearched(false);
      setJobs([]);
      setTotal(0);
      toast.error("اكتب مسمى وظيفي أو اختر فلتراً واحداً على الأقل.");
      return;
    }
    const f = { ...draft };
    setApplied(f);
    setPage(1);
    setJobs([]);
    setTotal(0);
    setSearched(true);
    saveFilters(f);
    if (f.keyword.trim()) setHistory(pushSearchHistory(f.keyword));
    void fetchPage(f, 1);
  };

  const goToPage = (p: number) => {
    if (!applied) return;
    setPage(p);
    void fetchPage(applied, p);
  };

  const searchTerm = (term: string) => {
    const f = { ...draft, keyword: term };
    setDraft(f);
    setApplied(f);
    setPage(1);
    setJobs([]);
    setTotal(0);
    setSearched(true);
    saveFilters(f);
    if (term.trim()) setHistory(pushSearchHistory(term));
    void fetchPage(f, 1);
  };

  const notifyMe = async () => {
    setAlerting(true);
    const ok = await createJobAlert(draft);
    setAlerting(false);
    toast[ok ? "success" : "error"](
      ok ? "سنُنبّهك عند توفر وظائف مطابقة" : "تعذر حفظ التنبيه، حاول لاحقاً",
    );
  };

  const reset = () => {
    setDraft(DEFAULT_FILTERS);
    setApplied(null);
    setPage(1);
    setJobs([]);
    setTotal(0);
    setSearched(false);
    setErrorMsg(null);
    saveFilters(DEFAULT_FILTERS);
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "وظائف السعودية",
    itemListElement: jobs.slice(0, 20).map((j, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: j.title,
      url: `https://www.techsnds.com/saudi-jobs/${encodeURIComponent(j.id)}`,
    })),
  };

  const selectCls =
    "h-11 w-full rounded-xl bg-background/60 border border-border/60 px-3 text-sm text-foreground outline-none focus:border-accent";
  const totalPages = Math.max(1, Math.min(20, Math.ceil((total || jobs.length) / PAGE_SIZE)));

  return (
    <StaticPageShell
      title="وظائف السعودية — أحدث الوظائف الحكومية والخاصة"
      description="ابحث عن آلاف الوظائف داخل المملكة: وظائف حكومية، القطاع الخاص، عن بعد، بدون خبرة، وحديثي التخرج في جميع المدن."
      path="/saudi-jobs"
      heading="وظائف السعودية"
      intro="ابحث عن آلاف الوظائف داخل المملكة."
      jsonLd={jsonLd}
    >
      <section className="glass rounded-2xl p-4 border border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold">بحث وتصفية</h2>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-foreground/50" />
          <input
            value={draft.keyword}
            onChange={(e) => setField({ keyword: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder="ابحث عن مسمى وظيفي أو شركة"
            aria-label="البحث عن وظيفة"
            className="h-11 w-full rounded-xl bg-background/60 border border-border/60 ps-9 pe-3 text-sm outline-none focus:border-accent"
          />
        </label>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select aria-label="المدينة" className={selectCls} value={draft.city} onChange={(e) => setField({ city: e.target.value })}>
            {JOB_CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select aria-label="نوع الوظيفة" className={selectCls} value={draft.employmentType} onChange={(e) => setField({ employmentType: e.target.value })}>
            {JOB_TYPES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <select aria-label="مستوى الخبرة" className={selectCls} value={draft.experienceLevel} onChange={(e) => setField({ experienceLevel: e.target.value })}>
            {EXPERIENCE_LEVELS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={runSearch}
            disabled={loading}
            className="h-11 flex-1 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? "جاري البحث…" : "بحث"}
          </button>
          <button
            onClick={notifyMe}
            disabled={alerting}
            className="h-11 px-4 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-sm font-medium flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <BellPlus className="h-4 w-4" /> نبّهني
          </button>
          <button
            onClick={reset}
            className="h-11 px-4 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-sm font-medium flex items-center gap-1.5 transition"
          >
            <X className="h-4 w-4" /> مسح الفلاتر
          </button>
        </div>

        {history.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground/55">
              <History className="h-3.5 w-3.5" /> عمليات بحث سابقة
            </span>
            {history.map((h) => (
              <button
                key={h}
                onClick={() => searchTerm(h)}
                className="rounded-full px-2.5 py-1 text-[11px] bg-foreground/5 hover:bg-foreground/10 text-foreground/75 transition"
              >
                {h}
              </button>
            ))}
            <button
              onClick={() => setHistory(clearSearchHistory())}
              className="text-[11px] text-foreground/50 hover:text-foreground/80"
            >
              مسح السجل
            </button>
          </div>
        )}
      </section>

      <nav aria-label="تصنيفات الوظائف" className="mt-4 -mx-1 overflow-x-auto">
        <ul className="flex gap-2 px-1 pb-1">
          {JOB_CATEGORIES.map((c) =>
            c.route ? (
              <li key={c.id}>
                <Link
                  to={c.route}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs border border-border/50 bg-foreground/5 text-foreground/75 hover:bg-foreground/10 transition inline-flex items-center gap-1.5"
                >
                  <Landmark className="h-3.5 w-3.5" /> {c.label}
                </Link>
              </li>
            ) : (
              <li key={c.id}>
                <button
                  onClick={() => setField({ category: c.id })}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition border ${
                    draft.category === c.id
                      ? "bg-accent text-accent-foreground border-transparent font-semibold"
                      : "bg-foreground/5 text-foreground/75 border-border/50 hover:bg-foreground/10"
                  }`}
                >
                  {c.label}
                </button>
              </li>
            ),
          )}
        </ul>
      </nav>

      {loading ? (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="جاري تحميل الوظائف">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-4 border border-border/40 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-foreground/10" />
              <div className="mt-2 h-3 w-1/3 rounded bg-foreground/10" />
              <div className="mt-4 flex gap-3">
                <div className="h-3 w-24 rounded bg-foreground/10" />
                <div className="h-3 w-20 rounded bg-foreground/10" />
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-9 w-20 rounded-xl bg-foreground/10" />
                <div className="h-9 w-20 rounded-xl bg-foreground/10" />
              </div>
            </div>
          ))}
        </div>
      ) : !searched ? (
        <div className="mt-4 glass rounded-2xl p-6 text-center border border-border/40">
          <Briefcase className="mx-auto h-6 w-6 text-accent/70" />
          <p className="mt-2 text-sm text-foreground/80">اختر الفلاتر ثم اضغط بحث لعرض الوظائف.</p>
          <p className="mt-1 text-xs text-foreground/55">اكتب مسمى وظيفي أو اختر فلتراً واحداً على الأقل.</p>
        </div>
      ) : errorMsg ? (
        <div className="mt-4 glass rounded-2xl p-6 text-center border border-border/40">
          <p className="text-sm text-foreground/80">{errorMsg}</p>
          <button
            onClick={() => applied && void fetchPage(applied, page, true)}
            className="mt-3 h-10 px-4 rounded-xl bg-accent text-accent-foreground text-sm font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-foreground/60">{`عدد النتائج في هذه الصفحة: ${jobs.length}`}</p>
          <div className="mt-3 space-y-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                saved={saved.includes(job.id)}
                onToggleSave={(id) => setSaved(toggleSavedJob(id))}
              />
            ))}
            {jobs.length === 0 && (
              <div className="glass rounded-2xl p-6 text-center border border-border/40">
                <Briefcase className="mx-auto h-6 w-6 text-accent/70" />
                <p className="mt-2 text-sm text-foreground/75">لا توجد وظائف مطابقة للبحث.</p>
                <p className="mt-1 text-xs text-foreground/55">جرّب تغيير المدينة أو نوع الوظيفة أو مسح الفلاتر.</p>
                <div className="mt-3 flex justify-center gap-2">
                  <button onClick={reset} className="h-10 px-4 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-sm">
                    مسح الفلاتر
                  </button>
                  <button
                    onClick={() => applied && void fetchPage(applied, page, true)}
                    className="h-10 px-4 rounded-xl bg-accent text-accent-foreground text-sm font-semibold inline-flex items-center gap-1.5"
                  >
                    <RotateCw className="h-4 w-4" /> تحديث
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => goToPage(Math.max(1, page - 1))}
              className="h-10 px-3 rounded-xl bg-foreground/5 text-sm disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <span className="text-xs text-foreground/60" dir="ltr">{`${page} / ${totalPages}`}</span>
            <button
              disabled={jobs.length === 0 || page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
              className="h-10 px-3 rounded-xl bg-foreground/5 text-sm disabled:opacity-40 flex items-center gap-1"
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      <div className="mt-6">
        <Link to="/government-jobs" className="text-xs text-accent hover:underline">
          الوظائف الحكومية عبر منصة جدارات ←
        </Link>
      </div>
    </StaticPageShell>
  );
}
