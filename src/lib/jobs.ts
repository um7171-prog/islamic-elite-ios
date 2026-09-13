/**
 * Saudi Jobs — client model, filters and a 30-minute cache in front of the
 * `search-saudi-jobs` edge function.
 *
 * The edge function currently serves mock data with the exact same shape as
 * the live Jooble response, so switching the source back on later requires no
 * change here.
 */
import { supabase } from "@/integrations/supabase/client";

export interface Job {
  id: string;
  source?: string;
  sourceJobId?: string;
  title: string;
  company: string;
  city: string;
  region?: string;
  country: string;
  salary: string;
  description: string;
  employmentType: string;
  workplaceType: string;
  publishedAt: string;
  expiresAt?: string;
  applyUrl: string;
  sourceUrl: string;
  logoUrl?: string;
}


export const JOB_CITIES = [
  "جميع المدن",
  "الرياض",
  "جدة",
  "مكة المكرمة",
  "المدينة المنورة",

  "الدمام",
  "الخبر",
  "الظهران",
  "الأحساء",
  "الجبيل",
  "القصيم",
  "بريدة",
  "عنيزة",
  "الطائف",
  "أبها",
  "خميس مشيط",
  "تبوك",
  "حائل",
  "جازان",
  "نجران",
  "ينبع",
  "الباحة",
  "العلا",
  "عن بعد",
] as const;

/** Category chips → search presets applied on top of the user filters. */
export const JOB_CATEGORIES: {
  id: string;
  label: string;
  keyword?: string;
  employmentType?: string;
  experienceLevel?: string;
  route?: string;
}[] = [
  { id: "latest", label: "أحدث الوظائف" },
  { id: "government", label: "وظائف حكومية", route: "/government-jobs" },
  { id: "private", label: "القطاع الخاص", keyword: "شركة" },
  { id: "remote", label: "عن بعد", employmentType: "remote" },
  { id: "no-exp", label: "بدون خبرة", experienceLevel: "none" },
  { id: "fresh", label: "حديثو التخرج", experienceLevel: "fresh" },
  { id: "women", label: "وظائف نسائية", keyword: "نسائية" },
  { id: "full", label: "دوام كامل", employmentType: "full" },
  { id: "part", label: "دوام جزئي", employmentType: "part" },
  { id: "training", label: "تدريب", employmentType: "training" },
  { id: "coop", label: "تدريب منتهي بالتوظيف", keyword: "تدريب منتهي بالتوظيف" },
];

export const JOB_TYPES: { id: string; label: string }[] = [
  { id: "all", label: "كل الأنواع" },
  { id: "full", label: "دوام كامل" },
  { id: "part", label: "دوام جزئي" },
  { id: "remote", label: "عن بعد" },
  { id: "training", label: "تدريب" },
  { id: "contract", label: "عقد مؤقت" },
];

export const EXPERIENCE_LEVELS: { id: string; label: string }[] = [
  { id: "all", label: "كل المستويات" },
  { id: "none", label: "بدون خبرة" },
  { id: "fresh", label: "حديث التخرج" },
  { id: "senior", label: "خبرة عالية" },
];

export function jobTypeLabel(id: string): string {
  return JOB_TYPES.find((x) => x.id === id)?.label ?? "دوام كامل";
}

export function workplaceLabel(id: string): string {
  return id === "remote" ? "عن بعد" : "من المقر";
}

export function experienceLabel(id: string): string {
  return EXPERIENCE_LEVELS.find((x) => x.id === id)?.label ?? "غير محدد";
}

export function formatPostedAt(value: string): string {
  if (!value) return "غير محدد";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return "اليوم";
  if (diff === 1) return "أمس";
  if (diff < 30) return `قبل ${diff} يوم`;
  return d.toLocaleDateString("en-GB");
}

/* ---------- search + 30 min cache ---------- */

export interface JobSearchParams {
  keyword: string;
  city: string;
  employmentType: string;
  experienceLevel: string;
  page: number;
}

export interface JobSearchResult {
  jobs: Job[];
  totalCount: number;
  page: number;
  error?: string;
  message?: string;
}

const TTL = 30 * 60 * 1000;
const memoryCache = new Map<string, { at: number; result: JobSearchResult }>();
const JOB_STORE_KEY = "saudi_jobs_seen_v1";

function keyOf(p: JobSearchParams) {
  return JSON.stringify(p);
}

/** Keep fetched jobs so the details page can render without a new request. */
function remember(jobs: Job[]) {
  try {
    const raw = sessionStorage.getItem(JOB_STORE_KEY);
    const map: Record<string, Job> = raw ? JSON.parse(raw) : {};
    for (const j of jobs) map[j.id] = j;
    sessionStorage.setItem(JOB_STORE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getJob(id: string): Job | undefined {
  try {
    const raw = sessionStorage.getItem(JOB_STORE_KEY);
    if (!raw) return undefined;
    return (JSON.parse(raw) as Record<string, Job>)[id];
  } catch {
    return undefined;
  }
}

export async function searchJobs(params: JobSearchParams, opts?: { force?: boolean }): Promise<JobSearchResult> {
  const key = keyOf(params);
  const hit = memoryCache.get(key);
  // Do not re-request while a cached result is still fresh (Retry bypasses it).
  if (!opts?.force && hit && Date.now() - hit.at < TTL) return hit.result;
  if (opts?.force) memoryCache.delete(key);

  const { data, error } = await supabase.functions.invoke("search-saudi-jobs", { body: params });


  if (error || !data) {
    return { jobs: [], totalCount: 0, page: params.page, error: "request_failed", message: "تعذر جلب الوظائف حالياً." };
  }

  const result: JobSearchResult = {
    jobs: Array.isArray(data.jobs) ? (data.jobs as Job[]) : [],
    totalCount: Number(data.totalCount ?? 0),
    page: Number(data.page ?? params.page),
    error: data.error,
    message: data.message,
  };

  if (!result.error) {
    memoryCache.set(key, { at: Date.now(), result });
    remember(result.jobs);
  }
  return result;
}

/* ---------- saved jobs (localStorage) ---------- */
const SAVED_KEY = "saudi_jobs_saved_v1";

export function getSavedJobs(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function toggleSavedJob(id: string): string[] {
  const list = getSavedJobs();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/* ---------- search history (localStorage) ---------- */
const HISTORY_KEY = "saudi_jobs_history_v1";
const HISTORY_MAX = 8;

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function pushSearchHistory(term: string): string[] {
  const t = term.trim();
  if (!t) return getSearchHistory();
  const next = [t, ...getSearchHistory().filter((x) => x !== t)].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearSearchHistory(): string[] {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
  return [];
}

/* ---------- persisted filters (localStorage) ---------- */
const FILTERS_KEY = "saudi_jobs_filters_v1";

export interface SavedFilters {
  keyword: string;
  city: string;
  employmentType: string;
  experienceLevel: string;
  category: string;
}

export const DEFAULT_FILTERS: SavedFilters = {
  keyword: "",
  city: "جميع المدن",
  employmentType: "all",
  experienceLevel: "all",
  category: "latest",
};

export function loadFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<SavedFilters>) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function saveFilters(f: SavedFilters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

/* ---------- job alerts ("نبّهني") ---------- */
export async function createJobAlert(f: SavedFilters, contact?: string): Promise<boolean> {
  const { error } = await supabase.from("job_alerts").insert({
    keyword: f.keyword,
    city: f.city,
    employment_type: f.employmentType,
    experience_level: f.experienceLevel,
    contact: contact ?? null,
  });
  return !error;
}
