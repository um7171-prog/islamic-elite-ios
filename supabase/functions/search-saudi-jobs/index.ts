import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

/**
 * Saudi jobs search.
 *
 * SOURCE SWITCH — the only line to change when Jooble approves our servers:
 *   set ACTIVE_SOURCE to 'jooble'.
 * Nothing else (UI, DB, response shape) needs to change.
 *
 * Jooble is temporarily disabled because jooble.org fronts its API with a
 * Cloudflare challenge that rejects datacenter IPs (403 "Just a moment").
 * JOOBLE_API_KEY and the full Jooble client below are intentionally kept.
 */
const ACTIVE_SOURCE: 'mock' | 'jooble' | 'jsearch' | 'apijobs' = 'jsearch'

/** Unified job model returned to the client (stable across sources). */
interface UnifiedJob {
  id: string
  source: string
  sourceJobId: string
  title: string
  company: string
  city: string
  region: string
  country: string
  description: string
  employmentType: string
  workplaceType: string
  salary: string
  publishedAt: string
  expiresAt: string
  applyUrl: string
  sourceUrl: string
  logoUrl: string
}

interface SearchQuery {
  keyword: string
  city: string
  employmentType: string
  experienceLevel: string
  page: number
  remoteOnly: boolean
}

interface JoobleJob {
  id?: number | string
  title?: string
  location?: string
  snippet?: string
  salary?: string
  source?: string
  type?: string
  link?: string
  company?: string
  updated?: string
}

const CITY_EN: Record<string, string> = {
  'الرياض': 'Riyadh',
  'جدة': 'Jeddah',
  'مكة المكرمة': 'Makkah',
  'مكة': 'Makkah',
  'المدينة المنورة': 'Medina',
  'المدينة': 'Medina',
  'الدمام': 'Dammam',
  'الخبر': 'Al Khobar',
  'الظهران': 'Dhahran',
  'الأحساء': 'Al Ahsa',
  'الجبيل': 'Jubail',
  'القصيم': 'Al Qassim',
  'بريدة': 'Buraydah',
  'عنيزة': 'Unaizah',
  'الطائف': 'Taif',
  'أبها': 'Abha',
  'خميس مشيط': 'Khamis Mushait',
  'تبوك': 'Tabuk',
  'حائل': 'Hail',
  'جازان': 'Jazan',
  'نجران': 'Najran',
  'ينبع': 'Yanbu',
  'الباحة': 'Al Bahah',
  'العلا': 'AlUla',
}

const SAUDI_CITIES = Object.keys(CITY_EN)

const SAUDI_HINTS = [
  'saudi', 'ksa', 'السعودية', 'المملكة العربية السعودية',
  ...Object.values(CITY_EN).map((c) => c.toLowerCase()),
  ...SAUDI_CITIES,
]

/** 30-minute in-memory cache (per warm instance). */
const CACHE_TTL_MS = 30 * 60 * 1000
const cache = new Map<string, { at: number; payload: unknown }>()

/** Per-instance rate limiting + duplicate-request suppression. */
const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 40
const rateHits: number[] = []
const inflight = new Map<string, Promise<unknown>>()

function detectCity(location: string): string {
  for (const ar of SAUDI_CITIES) {
    if (location.includes(ar)) return ar
    const en = CITY_EN[ar]
    if (en && location.toLowerCase().includes(en.toLowerCase())) return ar
  }
  return location || 'السعودية'
}

function mapEmploymentType(raw: string, title: string): string {
  const s = `${raw} ${title}`.toLowerCase()
  if (s.includes('part')) return 'part'
  if (s.includes('intern') || s.includes('trainee') || s.includes('تدريب')) return 'training'
  if (s.includes('temporary') || s.includes('contract')) return 'contract'
  return 'full'
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchesExperience(level: string, text: string): boolean {
  if (!level || level === 'all') return true
  const s = text.toLowerCase()
  if (level === 'none') return /no experience|entry level|بدون خبرة|حديث/.test(s)
  if (level === 'fresh') return /graduate|fresh|junior|حديث|خريج/.test(s)
  if (level === 'senior') return /senior|manager|lead|expert|خبرة|أول/.test(s)
  return true
}

/* ------------------------------------------------------------------
 * SOURCE 1 (ACTIVE): mock dataset — same shape as the live source.
 * ------------------------------------------------------------------ */

const MOCK_SEEDS: {
  title: string
  company: string
  city: string
  employmentType: string
  workplaceType: string
  salary: string
  experience: string
  description: string
}[] = [
  { title: 'مهندس برمجيات', company: 'شركة علم', city: 'الرياض', employmentType: 'full', workplaceType: 'onsite', salary: '12,000 - 18,000 SAR/شهر', experience: 'senior', description: 'تطوير وصيانة أنظمة ويب باستخدام React وNode.js ضمن فريق هندسي. خبرة لا تقل عن ثلاث سنوات.' },
  { title: 'محاسب عام', company: 'مجموعة الفيصلية', city: 'جدة', employmentType: 'full', workplaceType: 'onsite', salary: '7,000 - 9,500 SAR/شهر', experience: 'fresh', description: 'إعداد القيود المحاسبية والتقارير الشهرية ومتابعة الفواتير. يفضل حديثي التخرج في المحاسبة.' },
  { title: 'أخصائي تسويق رقمي', company: 'نون', city: 'الرياض', employmentType: 'remote', workplaceType: 'remote', salary: '8,000 - 12,000 SAR/شهر', experience: 'fresh', description: 'إدارة الحملات الإعلانية على منصات التواصل وتحليل الأداء. عمل عن بعد بدوام كامل.' },
  { title: 'ممرض/ممرضة', company: 'مستشفى الملك فهد', city: 'الدمام', employmentType: 'full', workplaceType: 'onsite', salary: '9,000 - 13,000 SAR/شهر', experience: 'senior', description: 'رعاية تمريضية في أقسام العناية المركزة مع تصنيف ساري من الهيئة السعودية للتخصصات الصحية.' },
  { title: 'مندوب مبيعات', company: 'المراعي', city: 'مكة المكرمة', employmentType: 'full', workplaceType: 'onsite', salary: '5,000 - 7,000 SAR/شهر', experience: 'none', description: 'زيارة العملاء وتحقيق المستهدفات البيعية. لا تشترط خبرة سابقة، يوجد تدريب.' },
  { title: 'مصمم جرافيك', company: 'وكالة إبداع', city: 'الخبر', employmentType: 'part', workplaceType: 'remote', salary: '4,000 - 6,000 SAR/شهر', experience: 'fresh', description: 'تصميم هويات بصرية ومحتوى للسوشيال ميديا بدوام جزئي عن بعد.' },
  { title: 'متدرب تقنية معلومات', company: 'أرامكو السعودية', city: 'الظهران', employmentType: 'training', workplaceType: 'onsite', salary: '3,000 SAR/شهر', experience: 'none', description: 'برنامج تدريب منتهي بالتوظيف لخريجي الحاسب الآلي بدون خبرة.' },
  { title: 'أخصائي موارد بشرية', company: 'stc', city: 'الرياض', employmentType: 'full', workplaceType: 'onsite', salary: '10,000 - 14,000 SAR/شهر', experience: 'senior', description: 'إدارة دورة التوظيف وعلاقات الموظفين والالتزام بأنظمة العمل السعودية.' },
  { title: 'معلمة لغة إنجليزية', company: 'مدارس المنارات', city: 'المدينة المنورة', employmentType: 'full', workplaceType: 'onsite', salary: '6,500 - 8,000 SAR/شهر', experience: 'fresh', description: 'وظيفة نسائية لتدريس اللغة الإنجليزية للمرحلة المتوسطة.' },
  { title: 'مهندس مدني', company: 'شركة بن لادن', city: 'جازان', employmentType: 'contract', workplaceType: 'onsite', salary: '11,000 - 15,000 SAR/شهر', experience: 'senior', description: 'الإشراف على مشاريع البنية التحتية بعقد مؤقت لمدة سنتين.' },
  { title: 'خدمة عملاء', company: 'البنك الأهلي', city: 'الرياض', employmentType: 'full', workplaceType: 'onsite', salary: '6,000 - 8,000 SAR/شهر', experience: 'none', description: 'استقبال العملاء والرد على الاستفسارات في الفروع. بدون خبرة مع تدريب مدفوع.' },
  { title: 'محلل بيانات', company: 'سابك', city: 'الجبيل', employmentType: 'full', workplaceType: 'onsite', salary: '13,000 - 17,000 SAR/شهر', experience: 'senior', description: 'تحليل بيانات التشغيل وبناء لوحات المؤشرات باستخدام Power BI وSQL.' },
  { title: 'سائق توصيل', company: 'هنقرستيشن', city: 'الطائف', employmentType: 'part', workplaceType: 'onsite', salary: '4,500 SAR/شهر', experience: 'none', description: 'توصيل الطلبات داخل المدينة بدوام جزئي مرن.' },
  { title: 'أخصائي أمن سيبراني', company: 'الهيئة الوطنية للأمن السيبراني', city: 'الرياض', employmentType: 'full', workplaceType: 'onsite', salary: '16,000 - 22,000 SAR/شهر', experience: 'senior', description: 'مراقبة التهديدات والاستجابة للحوادث الأمنية. خبرة في SIEM مطلوبة.' },
  { title: 'صيدلي', company: 'صيدليات النهدي', city: 'أبها', employmentType: 'full', workplaceType: 'onsite', salary: '9,000 - 11,000 SAR/شهر', experience: 'fresh', description: 'صرف الوصفات وتقديم الاستشارة الدوائية للعملاء.' },
  { title: 'مطور تطبيقات iOS', company: 'تك ساندز', city: 'جدة', employmentType: 'remote', workplaceType: 'remote', salary: '14,000 - 19,000 SAR/شهر', experience: 'senior', description: 'بناء تطبيقات iOS باستخدام Swift وCapacitor، عمل عن بعد بالكامل.' },
  { title: 'محاسب تكاليف', company: 'شركة الزامل', city: 'الدمام', employmentType: 'full', workplaceType: 'onsite', salary: '8,500 - 11,000 SAR/شهر', experience: 'senior', description: 'إعداد تقارير التكاليف الصناعية ومراجعة المخزون.' },
  { title: 'أخصائي مشتريات', company: 'أمانة منطقة القصيم', city: 'بريدة', employmentType: 'full', workplaceType: 'onsite', salary: '7,500 - 10,000 SAR/شهر', experience: 'fresh', description: 'تنفيذ إجراءات المنافسات والمشتريات الحكومية عبر منصة اعتماد.' },
  { title: 'فني كهرباء', company: 'الشركة السعودية للكهرباء', city: 'تبوك', employmentType: 'full', workplaceType: 'onsite', salary: '6,000 - 8,500 SAR/شهر', experience: 'none', description: 'صيانة الشبكات الكهربائية بدون اشتراط خبرة سابقة.' },
  { title: 'مدير مشروع', company: 'نيوم', city: 'العلا', employmentType: 'contract', workplaceType: 'onsite', salary: '25,000 - 32,000 SAR/شهر', experience: 'senior', description: 'قيادة مشاريع التطوير العمراني مع خبرة إدارية لا تقل عن ثمان سنوات.' },
]

const PAGE_SIZE = 20

function buildMockJobs(q: SearchQuery): { jobs: UnifiedJob[]; totalCount: number } {
  const kw = q.keyword.trim().toLowerCase()
  const isAllCities = !q.city || q.city === 'جميع المدن' || q.city === 'عن بعد'

  const pool = MOCK_SEEDS.filter((s) => {
    if (kw && !`${s.title} ${s.company} ${s.description}`.toLowerCase().includes(kw)) return false
    if (!isAllCities && s.city !== q.city) return false
    if (q.remoteOnly && s.workplaceType !== 'remote') return false
    if (q.employmentType && q.employmentType !== 'all' && q.employmentType !== 'remote' && s.employmentType !== q.employmentType) return false
    if (q.experienceLevel && q.experienceLevel !== 'all' && s.experience !== q.experienceLevel) return false
    return true
  })

  const start = (q.page - 1) * PAGE_SIZE
  const slice = pool.slice(start, start + PAGE_SIZE)

  const jobs: UnifiedJob[] = slice.map((s, i) => {
    const posted = new Date(Date.now() - (i + q.page) * 36 * 60 * 60 * 1000)
    const expires = new Date(posted.getTime() + 30 * 86400000)
    const slug = `${s.title}-${s.company}-${s.city}`.replace(/\s+/g, '-')
    const applyUrl = `https://www.taqat.sa/web/guest/jobs?q=${encodeURIComponent(`${s.title} ${s.city}`)}`
    return {
      id: `mock-${encodeURIComponent(slug)}`,
      source: 'بيانات تجريبية',
      sourceJobId: slug,
      title: s.title,
      company: s.company,
      city: s.workplaceType === 'remote' && q.remoteOnly ? 'عن بعد' : s.city,
      region: s.city,
      country: 'السعودية',
      description: s.description,
      employmentType: s.employmentType === 'remote' ? 'full' : s.employmentType,
      workplaceType: s.workplaceType,
      salary: s.salary,
      publishedAt: posted.toISOString(),
      expiresAt: expires.toISOString(),
      applyUrl,
      sourceUrl: applyUrl,
      logoUrl: '',
    }
  })

  return { jobs, totalCount: pool.length }
}

/* ------------------------------------------------------------------
 * SOURCE 2 (TEMPORARILY DISABLED): Jooble REST API.
 * Kept intact — re-enable by setting ACTIVE_SOURCE = 'jooble'.
 * ------------------------------------------------------------------ */

function isSaudi(location: string, remote: boolean): boolean {
  if (remote) return true
  const l = location.toLowerCase()
  return SAUDI_HINTS.some((h) => l.includes(h.toLowerCase()))
}

async function fetchJoobleJobs(q: SearchQuery): Promise<{ jobs: UnifiedJob[]; totalCount: number } | { error: string }> {
  const apiKey = Deno.env.get('JOOBLE_API_KEY')
  if (!apiKey) return { error: 'missing_api_key' }

  const isAllCities = !q.city || q.city === 'جميع المدن' || q.city === 'عن بعد'
  const location = isAllCities ? 'Saudi Arabia' : `${CITY_EN[q.city] ?? q.city}, Saudi Arabia`
  const keywords = [q.keyword, q.remoteOnly ? 'remote' : ''].filter(Boolean).join(' ') || 'jobs'

  const hosts = [
    'https://jooble.org',
    'https://us.jooble.org',
    'https://uk.jooble.org',
    'https://de.jooble.org',
    'https://in.jooble.org',
    'https://pl.jooble.org',
    'https://ae.jooble.org',
  ]
  let res: Response | null = null
  for (const host of hosts) {
    res = await fetch(`${host}/api/${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ keywords, location, page: String(q.page) }),
    })
    if (res.ok) break
    console.error('jooble host failed', host, res.status)
  }
  if (!res || !res.ok) return { error: 'upstream_error' }

  const data = (await res.json()) as { jobs?: JoobleJob[]; totalCount?: number }
  const raw = Array.isArray(data.jobs) ? data.jobs : []

  const jobs: UnifiedJob[] = raw
    .filter((j) => isSaudi(String(j.location ?? ''), q.remoteOnly && /remote/i.test(`${j.title} ${j.snippet}`)))
    .map((j) => {
      const loc = String(j.location ?? '')
      const desc = stripHtml(String(j.snippet ?? ''))
      const remote = /remote|عن بعد|work from home/i.test(`${j.title} ${desc} ${loc}`)
      const link = String(j.link ?? '')
      return {
        id: String(j.id ?? link ?? crypto.randomUUID()),
        source: String(j.source ?? 'Jooble'),
        sourceJobId: String(j.id ?? ''),
        title: String(j.title ?? '').trim(),
        company: String(j.company ?? j.source ?? '').trim() || 'غير محدد',
        city: remote && !loc ? 'عن بعد' : detectCity(loc),
        region: loc,
        country: 'السعودية',
        description: desc,
        employmentType: mapEmploymentType(String(j.type ?? ''), String(j.title ?? '')),
        workplaceType: remote ? 'remote' : 'onsite',
        salary: String(j.salary ?? '').trim(),
        publishedAt: j.updated ? String(j.updated) : '',
        expiresAt: '',
        applyUrl: link,
        sourceUrl: link,
        logoUrl: '',
      }
    })
    .filter((j) => j.title && j.applyUrl)
    .filter((j) => (q.employmentType === 'all' || !q.employmentType ? true
      : q.employmentType === 'remote' ? j.workplaceType === 'remote'
      : j.employmentType === q.employmentType))
    .filter((j) => matchesExperience(q.experienceLevel, `${j.title} ${j.description}`))
    .filter((j) => (q.remoteOnly ? j.workplaceType === 'remote' : true))

  return { jobs, totalCount: data.totalCount ?? jobs.length }
}

/* ------------------------------------------------------------------
 * SOURCE 3 (ACTIVE): JSearch via RapidAPI.
 * ------------------------------------------------------------------ */

interface JSearchJob {
  job_id?: string
  job_title?: string
  employer_name?: string
  employer_logo?: string
  job_city?: string
  job_state?: string
  job_country?: string
  job_description?: string
  job_employment_type?: string
  job_is_remote?: boolean
  job_posted_at_datetime_utc?: string
  job_offer_expiration_datetime_utc?: string
  job_apply_link?: string
  job_publisher?: string
  job_min_salary?: number
  job_max_salary?: number
  job_salary_currency?: string
  job_salary_period?: string
}

function jsearchSalary(j: JSearchJob): string {
  if (!j.job_min_salary && !j.job_max_salary) return ''
  const cur = j.job_salary_currency ?? 'SAR'
  const per = j.job_salary_period === 'MONTH' ? '/شهر' : j.job_salary_period === 'YEAR' ? '/سنة' : ''
  const min = j.job_min_salary ? Math.round(j.job_min_salary).toLocaleString('en-US') : ''
  const max = j.job_max_salary ? Math.round(j.job_max_salary).toLocaleString('en-US') : ''
  const range = min && max ? `${min} - ${max}` : min || max
  return `${range} ${cur}${per}`.trim()
}

async function fetchJSearchJobs(q: SearchQuery): Promise<{ jobs: UnifiedJob[]; totalCount: number } | { error: string }> {
  const apiKey = Deno.env.get('OPENWEBNINJA_API_KEY')
  if (!apiKey) return { error: 'missing_api_key' }

  const isAllCities = !q.city || q.city === 'جميع المدن' || q.city === 'عن بعد'
  const place = isAllCities ? 'Saudi Arabia' : `${CITY_EN[q.city] ?? q.city}, Saudi Arabia`
  const keyword = q.keyword.trim() || 'وظائف'
  const params = new URLSearchParams({
    query: `${keyword} in ${place}`,
    page: String(q.page),
    num_pages: '1',
    country: 'sa',
    language: 'ar',
  })
  if (q.remoteOnly) params.set('work_from_home', 'true')

  const url = `https://api.openwebninja.com/jsearch/search-v2?${params.toString()}`
  console.info('[jsearch] URL:', url)

  let res: Response
  try {
    res = await fetch(url, { headers: { 'x-api-key': apiKey } })
  } catch (e) {
    console.error('[jsearch] fetch failed', e)
    return { error: 'upstream_error' }
  }
  console.info('[jsearch] status:', res.status)
  if (!res.ok) {
    console.error('[jsearch] body:', (await res.text()).slice(0, 500))
    return { error: 'upstream_error' }
  }

  const payload = await res.json() as Record<string, unknown>
  console.info('[jsearch] raw:', JSON.stringify(payload).slice(0, 800))
  const container = (payload.data ?? payload.results ?? payload.jobs) as unknown
  const raw: JSearchJob[] = Array.isArray(container)
    ? container as JSearchJob[]
    : Array.isArray((container as { jobs?: JSearchJob[] })?.jobs)
      ? (container as { jobs: JSearchJob[] }).jobs
      : []
  console.info('[jsearch] count:', raw.length)
  console.info('[jsearch] first:', JSON.stringify(raw[0] ?? null).slice(0, 500))
  console.info('[jsearch] cursor:', (payload.cursor ?? (container as { cursor?: string })?.cursor) ?? null)



  const jobs: UnifiedJob[] = raw
    .filter((j) => {
      const country = String(j.job_country ?? '').toLowerCase()
      // country=sa is already enforced upstream; keep rows that omit the field.
      return !country || j.job_is_remote || country === 'sa' || country.includes('saudi')
    })

    .map((j) => {
      const desc = stripHtml(String(j.job_description ?? '')).slice(0, 4000)
      const loc = [j.job_city, j.job_state].filter(Boolean).join(', ')
      const remote = Boolean(j.job_is_remote)
      const link = String(j.job_apply_link ?? '')
      return {
        id: String(j.job_id ?? link ?? crypto.randomUUID()),
        source: String(j.job_publisher ?? 'JSearch'),
        sourceJobId: String(j.job_id ?? ''),
        title: String(j.job_title ?? '').trim(),
        company: String(j.employer_name ?? '').trim() || 'غير محدد',
        city: remote && !loc ? 'عن بعد' : detectCity(loc),
        region: loc,
        country: 'السعودية',
        description: desc,
        employmentType: mapEmploymentType(String(j.job_employment_type ?? ''), String(j.job_title ?? '')),
        workplaceType: remote ? 'remote' : 'onsite',
        salary: jsearchSalary(j),
        publishedAt: String(j.job_posted_at_datetime_utc ?? ''),
        expiresAt: String(j.job_offer_expiration_datetime_utc ?? ''),
        applyUrl: link,
        sourceUrl: link,
        logoUrl: String(j.employer_logo ?? ''),
      }
    })
    .filter((j) => j.title && j.applyUrl)
    .filter((j) => (q.employmentType === 'all' || !q.employmentType ? true
      : q.employmentType === 'remote' ? j.workplaceType === 'remote'
      : j.employmentType === q.employmentType))
    .filter((j) => matchesExperience(q.experienceLevel, `${j.title} ${j.description}`))
    .filter((j) => (q.remoteOnly ? j.workplaceType === 'remote' : true))

  return { jobs, totalCount: jobs.length }
}

/* ------------------------------------------------------------------
 * SOURCE 4 (ACTIVE): APIJobs.dev — POST /v1/job/search
 * ------------------------------------------------------------------ */

interface ApiJobsHit {
  id?: string
  title?: string
  description?: string
  hiring_organization_name?: string
  hiring_organization_logo?: string
  city?: string
  region?: string
  country?: string
  employment_type?: string
  published_at?: string
  expires_at?: string
  url?: string
  website_url?: string
  base_salary_min_value?: number
  base_salary_max_value?: number
  base_salary_currency?: string
  base_salary_unit?: string
  workplace_type?: string
}

function apiJobsSalary(j: ApiJobsHit): string {
  if (!j.base_salary_min_value && !j.base_salary_max_value) return ''
  const cur = j.base_salary_currency ?? 'SAR'
  const per = /month/i.test(j.base_salary_unit ?? '') ? '/شهر' : /year/i.test(j.base_salary_unit ?? '') ? '/سنة' : ''
  const min = j.base_salary_min_value ? Math.round(j.base_salary_min_value).toLocaleString('en-US') : ''
  const max = j.base_salary_max_value ? Math.round(j.base_salary_max_value).toLocaleString('en-US') : ''
  const range = min && max ? `${min} - ${max}` : min || max
  return `${range} ${cur}${per}`.trim()
}

async function fetchApiJobs(q: SearchQuery): Promise<{ jobs: UnifiedJob[]; totalCount: number } | { error: string }> {
  const apiKey = Deno.env.get('APIJOBS_API_KEY')
  if (!apiKey) return { error: 'missing_api_key' }

  const isAllCities = !q.city || q.city === 'جميع المدن' || q.city === 'عن بعد'
  const body: Record<string, unknown> = {
    q: q.keyword.trim() || 'jobs',
    country: 'Saudi Arabia',
    size: PAGE_SIZE,
    from: (q.page - 1) * PAGE_SIZE,
  }
  if (!isAllCities) body.city = CITY_EN[q.city] ?? q.city

  let res: Response
  try {
    res = await fetch('https://api.apijobs.dev/v1/job/search', {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.error('apijobs fetch failed', e)
    return { error: 'upstream_error' }
  }
  if (!res.ok) {
    console.error('apijobs status', res.status, await res.text())
    return { error: 'upstream_error' }
  }

  const data = (await res.json()) as { hits?: ApiJobsHit[]; total?: number }
  const raw = Array.isArray(data.hits) ? data.hits : []

  const jobs: UnifiedJob[] = raw
    .map((j) => {
      const desc = stripHtml(String(j.description ?? '')).slice(0, 4000)
      const loc = [j.city, j.region].filter(Boolean).join(', ')
      const remote = /remote/i.test(`${j.workplace_type ?? ''} ${j.title ?? ''} ${desc.slice(0, 400)}`)
      const link = String(j.url ?? j.website_url ?? '')
      return {
        id: String(j.id ?? link ?? crypto.randomUUID()),
        source: 'APIJobs',
        sourceJobId: String(j.id ?? ''),
        title: String(j.title ?? '').trim(),
        company: String(j.hiring_organization_name ?? '').trim() || 'غير محدد',
        city: remote && !loc ? 'عن بعد' : detectCity(loc),
        region: loc,
        country: 'السعودية',
        description: desc,
        employmentType: mapEmploymentType(String(j.employment_type ?? ''), String(j.title ?? '')),
        workplaceType: remote ? 'remote' : 'onsite',
        salary: apiJobsSalary(j),
        publishedAt: String(j.published_at ?? ''),
        expiresAt: String(j.expires_at ?? ''),
        applyUrl: link,
        sourceUrl: link,
        logoUrl: String(j.hiring_organization_logo ?? ''),
      }
    })
    .filter((j) => j.title && j.applyUrl)
    .filter((j) => (q.employmentType === 'all' || !q.employmentType ? true
      : q.employmentType === 'remote' ? j.workplaceType === 'remote'
      : j.employmentType === q.employmentType))
    .filter((j) => matchesExperience(q.experienceLevel, `${j.title} ${j.description}`))
    .filter((j) => (q.remoteOnly ? j.workplaceType === 'remote' : true))

  return { jobs, totalCount: data.total ?? jobs.length }
}

/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  try {
    const now = Date.now()
    while (rateHits.length && now - rateHits[0] > RATE_WINDOW_MS) rateHits.shift()
    if (rateHits.length >= RATE_MAX) {
      return json({ error: 'rate_limited', message: 'تم تجاوز عدد عمليات البحث المسموح بها، حاول بعد قليل.', jobs: [], totalCount: 0 })
    }
    rateHits.push(now)

    let body: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try { body = await req.json() } catch { body = {} }
    }

    const city = String(body.city ?? '').slice(0, 60).trim()
    const employmentType = String(body.employmentType ?? 'all').slice(0, 30)
    const query: SearchQuery = {
      keyword: String(body.keyword ?? '').slice(0, 120).trim(),
      city,
      employmentType,
      experienceLevel: String(body.experienceLevel ?? 'all').slice(0, 30),
      page: Math.min(Math.max(parseInt(String(body.page ?? '1'), 10) || 1, 1), 20),
      remoteOnly: city === 'عن بعد' || employmentType === 'remote',
    }

    const cacheKey = JSON.stringify({ ...query, src: ACTIVE_SOURCE })
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return json({ ...(hit.payload as Record<string, unknown>), cached: true })
    }
    const running = inflight.get(cacheKey)
    if (running) return json({ ...((await running) as Record<string, unknown>), cached: true })

    const task = (async () => {
      let source: string = ACTIVE_SOURCE
      let result = ACTIVE_SOURCE === 'jooble'
        ? await fetchJoobleJobs(query)
        : ACTIVE_SOURCE === 'jsearch'
          ? await fetchJSearchJobs(query)
          : ACTIVE_SOURCE === 'apijobs'
            ? await fetchApiJobs(query)
            : buildMockJobs(query)
      // Never leave the UI empty: fall back to the local dataset if upstream fails.
      if ('error' in result) {
        console.error('upstream failed, falling back to mock', result.error)
        result = buildMockJobs(query)
        source = 'mock'
      }
      return {
        jobs: result.jobs,
        totalCount: result.totalCount,
        page: query.page,
        pageSize: PAGE_SIZE,
        cached: false,
        source,
      }
    })()

    inflight.set(cacheKey, task)
    try {
      const payload = await task
      if (!(payload as { error?: string }).error) cache.set(cacheKey, { at: Date.now(), payload })
      return json(payload)
    } finally {
      inflight.delete(cacheKey)
    }
  } catch (e) {
    console.error('search-saudi-jobs failed', e)
    return json({ error: 'unexpected', message: 'تعذر جلب الوظائف حالياً، حاول مرة أخرى.', jobs: [], totalCount: 0 })
  }
})
