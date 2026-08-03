import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Music2, Search, BadgeCheck, Users, UserPlus, Heart,
  Video, UserCheck, Globe, MapPin, Languages, Hash, CalendarDays, Clock,
  Copy, Share2, RotateCcw, AlertTriangle, Lock, UserX, History, X, Gift, Download, PlayCircle,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { BottomNav, type TabKey } from "@/components/islamic/BottomNav";
import { SEO } from "@/components/SEO";
import { AdSlot } from "@/components/ads/AdSlot";
import { InterstitialAd } from "@/components/ads/InterstitialAd";
import { shouldShowInterstitial } from "@/lib/adFrequency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  getHistory, addHistory, removeHistory, getCached, setCached,
} from "@/lib/tiktokHistory";

interface RegionInfo { code: string; name: string }
interface Profile {
  avatar: string; nickname: string; username: string; signature: string;
  verified: boolean; privateAccount: boolean; id: string; secUid: string;
  region: string; registeredRegion?: RegionInfo; currentRegion?: RegionInfo;
  language: string; createTime: number | null;
  uniqueIdModifyTime: number | null; nickNameModifyTime: number | null; bioLink: string;
  giftLevel?: number | null; hasStories?: boolean | null;
}
interface Stats {
  followers: number | null; following: number | null; likes: number | null;
  videos: number | null; friends: number | null;
}
interface Result {
  profile: Profile;
  stats: Stats;
  rawTimes?: Record<string, unknown>;
  rawResponse?: unknown;
  matchedFields?: Record<string, unknown>;
  usernameChangeField?: string | null;
  usernameChangeValue?: unknown;
}

const REGION_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl ? Intl : null;
const BIO_LIMIT = 140;

export default function TikTokAnalyzer() {
  const { t, dir, lang } = useLocale();
  const navigate = useNavigate();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioOpen, setBioOpen] = useState(false);
  const [history, setHistory] = useState<string[]>(() => getHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const pendingRef = useRef<string>("");
  const pendingResultRef = useRef<Result | null>(null);
  const [interstitial, setInterstitial] = useState(false);

  const handleTabChange = (next: TabKey) => {
    if (next === "tiktok") return;
    navigate(next === "home" ? "/" : `/${next}`);
  };

  const na = t("Not available", "غير متوفر");
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US");
  const fmtNum = (n: number | null) => (n == null ? na : nf.format(n));
  // Always Gregorian, DD/MM/YYYY HH:mm (Latin digits for unambiguous reading).
  const fmtDate = (ts: number | null | undefined) => {
    if (ts == null || !Number.isFinite(ts) || ts <= 0) return na;
    const d = new Date(ts * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  /**
   * Never assume "not changed". Only an explicit API flag (e.g. never_changed / has_changed=false)
   * may render "لم يتم التغيير"; anything missing/empty/unknown (including 0) → "غير متوفر".
   */
  const explicitNeverChanged = (fields: Record<string, unknown> | undefined, kind: "username" | "nickname") => {
    if (!fields) return false;
    const key = kind === "username" ? /(unique|user_?name|handle)/i : /(nick|display)/i;
    for (const [k, v] of Object.entries(fields)) {
      const leaf = (k.split(".").pop() ?? k);
      if (!key.test(leaf)) continue;
      if (/never|not_?changed|is_?changed|has_?changed|changed$/i.test(leaf)) {
        if (v === false || v === 0 || v === "false" || v === "0") return /never|not_?changed/i.test(leaf) ? v !== false : true;
        if (v === true || v === "true") return /never|not_?changed/i.test(leaf);
      }
    }
    return false;
  };
  const fmtModify = (ts: number | null | undefined, never = false) => {
    if (ts != null && Number.isFinite(ts) && (ts as number) > 0) return fmtDate(ts);
    if (never) return t("Never changed", "لم يتم التغيير");
    return na;
  };

  /** Convert any raw value (unix seconds, unix ms, ISO/date string) to unix seconds, or null. */
  const toUnixSeconds = (v: unknown): number | null => {
    if (v == null || v === "" || typeof v === "boolean") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) {
      if (n > 1e12) return Math.floor(n / 1000); // ms
      if (n > 1e9) return Math.floor(n); // seconds
      return null; // too small to be a real date
    }
    if (typeof v === "string") {
      const p = Date.parse(v);
      if (Number.isFinite(p) && p > 0) return Math.floor(p / 1000);
    }
    return null;
  };

  /** Auto-scan the entire raw JSON for any key containing username/modify/change/update/time. */
  const KEY_HINT = /username|modify|change|update|time/i;
  const scanDateCandidates = (root: unknown) => {
    const out: { path: string; key: string; raw: unknown; ts: number }[] = [];
    const walk = (node: unknown, path: string, depth = 0) => {
      if (depth > 8 || node == null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (KEY_HINT.test(k) && (typeof v !== "object" || v === null)) {
          const ts = toUnixSeconds(v);
          if (ts != null) out.push({ path: p, key: k, raw: v, ts });
        }
        walk(v, p, depth + 1);
      }
    };
    walk(root, "");
    return out;
  };

  /** Best username-change timestamp found anywhere in the payload. */
  const usernameChangeTs = (res: Result | null): number | null => {
    if (!res) return null;
    const direct = toUnixSeconds(res.usernameChangeValue);
    if (direct != null) return direct;
    const candidates = scanDateCandidates(res.rawResponse ?? res);
    const named = candidates.filter((c) => /(unique|user_?name|handle)/i.test(c.key));
    if (named.length) return named[0].ts;
    const fallback = toUnixSeconds(res.profile?.uniqueIdModifyTime);
    if (fallback != null) return fallback;
    const anyChange = candidates.filter((c) => /(modify|change|update)/i.test(c.key) && !/create|register/i.test(c.key));
    return anyChange.length ? anyChange[0].ts : null;
  };

  /** Auto-scan the raw JSON for any support/gift level key and extract its number. */
  const LEVEL_HINT = /level|support|gift|lvl/i;
  const scanLevelCandidates = (root: unknown) => {
    const out: { path: string; key: string; raw: unknown; level: number; score: number }[] = [];
    const toLevel = (v: unknown): number | null => {
      if (typeof v === "boolean") return null;
      if (typeof v === "number" && Number.isFinite(v)) return v > 0 && v <= 10000 ? Math.round(v) : null;
      if (typeof v === "string") {
        const m = v.match(/(\d{1,5})/);
        if (m) {
          const n = Number(m[1]);
          if (n > 0 && n <= 10000) return n;
        }
      }
      return null;
    };
    const scoreOf = (key: string, path: string) => {
      const s = `${path}.${key}`;
      if (/(gift|support).*(level|lvl)|(level|lvl).*(gift|support)/i.test(s)) return 4;
      if (/^(level|lvl)$/i.test(key)) return 3;
      if (/level|lvl/i.test(key)) return 2;
      return 1; // generic gift/support key
    };
    const walk = (node: unknown, path: string, depth = 0) => {
      if (depth > 8 || node == null || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1)); return; }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        const scalar = typeof v !== "object" || v === null;
        // Direct match: key itself hints at a level.
        if (LEVEL_HINT.test(k) && scalar) {
          const level = toLevel(v);
          if (level != null) out.push({ path: p, key: k, raw: v, level, score: scoreOf(k, path) });
        }
        // Nested match: e.g. { giftInfo: { level: 33 } } or { supportLevel: { value: 33 } }
        if (LEVEL_HINT.test(k) && v && typeof v === "object" && !Array.isArray(v)) {
          for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
            if (!/level|lvl|value|num|count|grade/i.test(k2)) continue;
            const level = toLevel(v2);
            if (level != null) out.push({ path: `${p}.${k2}`, key: k2, raw: v2, level, score: scoreOf(`${k}${k2}`, path) });
          }
        }
        walk(v, p, depth + 1);
      }
    };
    walk(root, "");
    out.sort((a, b) => b.score - a.score);
    return out;
  };

  /** Explicit gift/support level field names requested by the product spec. */
  const LEVEL_FIELDS = [
    "giftLevel", "gift_level", "giftLevelInfo",
    "supportLevel", "support_level",
    "creatorLevel", "creator_level",
    "hostLevel", "host_level",
    "liveLevel", "live_level",
  ];
  const scanNamedLevelFields = (root: unknown) => {
    const found: Record<string, unknown> = {};
    const walk = (node: unknown, path: string, depth = 0) => {
      if (depth > 8 || node == null || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1)); return; }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (LEVEL_FIELDS.some((f) => f.toLowerCase() === k.toLowerCase())) found[p] = v;
        walk(v, p, depth + 1);
      }
    };
    walk(root, "");
    return found;
  };

  const levelFromValue = (v: unknown): number | null => {
    if (v == null || typeof v === "boolean") return null;
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
    if (typeof v === "string") {
      const m = v.match(/(\d{1,5})/);
      return m && Number(m[1]) > 0 ? Number(m[1]) : null;
    }
    if (typeof v === "object") {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (/level|lvl|value|num|grade/i.test(k2)) {
          const n = levelFromValue(v2);
          if (n != null) return n;
        }
      }
    }
    return null;
  };

  const giftLevelOf = (res: Result | null): number | null => {
    if (!res) return null;
    const root = res.rawResponse ?? res;
    const named = scanNamedLevelFields(root);
    for (const v of Object.values(named)) {
      const n = levelFromValue(v);
      if (n != null) return n;
    }
    const fromApi = res.profile?.giftLevel;
    const candidates = scanLevelCandidates(root);
    if (candidates.length && candidates[0].score > 1) return candidates[0].level;
    if (typeof fromApi === "number" && fromApi > 0) return fromApi;
    return candidates.length ? candidates[0].level : null;
  };





  const fmtRegion = (code: string) => {
    if (!code) return na;
    try {
      return REGION_NAMES
        ? new Intl.DisplayNames([lang === "ar" ? "ar" : "en"], { type: "region" }).of(code) || code
        : code;
    } catch { return code; }
  };
  const fmtLang = (code: string) => {
    if (!code) return na;
    try {
      return new Intl.DisplayNames([lang === "ar" ? "ar" : "en"], { type: "language" }).of(code) || code;
    } catch { return code; }
  };
  const fmtText = (v: string) => (v && v.trim() ? v : na);

  /**
   * Show the results. An interstitial may appear first (capped: at most once
   * every 3 analyses and never more than once per 3 minutes). It never blocks:
   * the results are revealed as soon as the overlay closes.
   */
  const revealResult = (res: Result) => {
    if (shouldShowInterstitial("tiktok-analyze")) {
      pendingResultRef.current = res;
      setInterstitial(true);
      return;
    }
    setResult(res);
  };

  /** Fetch (or read from cache) and render the profile. */
  const runFetch = async (rawName?: string) => {
    const clean = (rawName ?? pendingRef.current).trim().replace(/^@/, "");
    
    setError(null);
    setBioOpen(false);

    const cached = getCached<Result>(clean);
    if (cached) {
      revealResult(cached);
      setHistory(addHistory(clean));
      return;
    }


    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("tiktok-profile", {
        body: { username: clean },
      });
      const code = (data as { error?: string } | null)?.error;
      if (fnError || code) {
        if (code === "NOT_FOUND") setError("NOT_FOUND");
        else if (code === "INVALID_USERNAME") setError("INVALID");
        else if (code === "RATE_LIMIT") setError("RATE_LIMIT");
        else setError("GENERIC");
        setResult(null);
      } else {
        const res = data as Result;
        // 1) Full, unprocessed JSON from Omar-Thing API
        console.log("[Omar-Thing FULL RAW JSON]", clean);
        console.log(JSON.stringify(res?.rawResponse ?? res, null, 2));
        // 2) Auto-detected fields of interest
        console.log("[Omar-Thing matched fields]", res?.matchedFields ?? {});
        console.table?.(
          Object.entries(res?.matchedFields ?? {}).map(([field, value]) => ({ field, value: String(value) })),
        );
        console.log("[Omar-Thing username-change field]", res?.usernameChangeField ?? "(none -> fallback uniqueIdModifyTime)", res?.usernameChangeValue);
        console.log("[Omar-Thing raw time fields]", {
          rawTimes: res?.rawTimes ?? null,
          uniqueIdModifyTime: res?.profile?.uniqueIdModifyTime,
          nickNameModifyTime: res?.profile?.nickNameModifyTime,
          createTime: res?.profile?.createTime,
        });
        // 3) Explicitly requested raw keys, straight from the untouched API payload
        const WANTED = [
          "last_username_change",
          "last_unique_id_modify_time",
          "username_modify_time",
          "unique_id_modify_time",
          "display_name_modify_time",
          "nickname_modify_time",
        ];
        const wantedValues: Record<string, unknown> = {};
        const scan = (node: unknown, depth = 0) => {
          if (depth > 8 || node == null || typeof node !== "object") return;
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (WANTED.includes(k)) wantedValues[k] = v;
            scan(v, depth + 1);
          }
        };
        scan(res?.rawResponse ?? res);
        console.log(
          "[Omar-Thing requested raw fields]",
          Object.fromEntries(WANTED.map((k) => [k, k in wantedValues ? wantedValues[k] : "(absent)"])),
        );
        // 4) Auto-scan: every key containing username/modify/change/update/time that holds a real date
        const candidates = scanDateCandidates(res?.rawResponse ?? res);
        console.log("[Omar-Thing date candidates]", candidates);
        console.table?.(
          candidates.map((c) => ({ path: c.path, raw: String(c.raw), date: fmtDate(c.ts) })),
        );
        console.log("[Omar-Thing resolved username change]", fmtDate(usernameChangeTs(res) ?? 0));
        console.log("[Omar-Thing level candidates]", scanLevelCandidates(res?.rawResponse ?? res));
        console.log("[Omar-Thing named level fields]", scanNamedLevelFields(res?.rawResponse ?? res));


        revealResult(res);
        setCached(clean, data);
        setHistory(addHistory(clean));
      }
    } catch {
      setError("GENERIC");
    } finally {
      setLoading(false);
    }
  };

  const startAnalysis = (name?: string) => {
    const clean = (name ?? username).trim().replace(/^@/, "");
    if (!clean) {
      toast({ title: t("Enter a username first.", "أدخل اسم المستخدم أولاً."), variant: "destructive" });
      return;
    }
    if (name) setUsername(clean);
    pendingRef.current = clean;
    setHistoryOpen(false);
    setResult(null);
    setError(null);

    // Ads never gate the tool — analysis starts immediately.
    void runFetch(clean);
  };

  const infoText = () => {
    if (!result) return "";
    const p = result.profile, s = result.stats;
    return [
      `${t("Name", "الاسم")}: ${fmtText(p.nickname)}`,
      `${t("Username", "اسم المستخدم")}: @${p.username}`,
      `${t("Bio", "الوصف")}: ${fmtText(p.signature)}`,
      `${t("Followers", "المتابعون")}: ${fmtNum(s.followers)}`,
      `${t("Following", "يتابع")}: ${fmtNum(s.following)}`,
      `${t("Likes", "الإعجابات")}: ${fmtNum(s.likes)}`,
      `${t("Videos", "الفيديوهات")}: ${fmtNum(s.videos)}`,
      `${t("Country", "الدولة")}: ${fmtRegionInfo(p.registeredRegion, p.region)}`,
      `${t("Current region", "المنطقة الحالية")}: ${fmtRegionInfo(p.currentRegion)}`,
      `${t("Account ID", "معرف الحساب")}: ${fmtText(p.id)}`,
      `${t("Created", "تاريخ الإنشاء")}: ${fmtDate(p.createTime)}`,
      `https://www.tiktok.com/@${p.username}`,
    ].join("\n");
  };

  const copyInfo = async () => {
    try {
      await navigator.clipboard.writeText(infoText());
      toast({ title: t("Copied", "تم النسخ") });
    } catch {
      toast({ title: t("Copy failed", "تعذّر النسخ"), variant: "destructive" });
    }
  };

  const shareInfo = async () => {
    const text = infoText();
    try {
      if (navigator.share) await navigator.share({ title: `@${result?.profile.username}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ title: t("Copied", "تم النسخ") });
      }
    } catch { /* user cancelled */ }
  };

  const reset = () => { setResult(null); setError(null); setUsername(""); setBioOpen(false); };

  const statCards = result ? [
    { Icon: Users, label: t("Followers", "المتابعون"), value: fmtNum(result.stats.followers) },
    { Icon: UserPlus, label: t("Following", "يتابع"), value: fmtNum(result.stats.following) },
    { Icon: Heart, label: t("Likes", "الإعجابات"), value: fmtNum(result.stats.likes) },
    { Icon: Video, label: t("Videos", "الفيديوهات"), value: fmtNum(result.stats.videos) },
    ...(result.stats.friends ? [{ Icon: UserCheck, label: t("Friends", "الأصدقاء"), value: fmtNum(result.stats.friends) }] : []),
  ] : [];

  const fmtRegionInfo = (info?: RegionInfo, fallback = "") => {
    const code = info?.code || fallback;
    if (!code) return info?.name ? info.name : na;
    const localized = fmtRegion(code);
    return localized !== na ? localized : info?.name || code;
  };

  const detailRows = result ? [
    { Icon: Globe, label: t("Country", "الدولة"), value: fmtRegionInfo(result.profile.registeredRegion, result.profile.region) },
    { Icon: MapPin, label: t("Current region", "المنطقة الحالية"), value: fmtRegionInfo(result.profile.currentRegion) },
    { Icon: Lock, label: t("Account type", "حالة الحساب"), value: result.profile.privateAccount ? t("Private", "خاص") : t("Public", "عام") },
    { Icon: Gift, label: t("Support & gift level", "مستوى الدعم والهدايا"), value: (() => {
      const lvl = giftLevelOf(result);
      if (lvl != null) return t(`Level ${lvl}`, `المستوى ${lvl}`);
      return t("The API does not provide this info for this account.", "الـ API لا يوفر هذه المعلومة لهذا الحساب.");
    })() },
    { Icon: Languages, label: t("Account language", "لغة الحساب"), value: fmtLang(result.profile.language) },
    { Icon: Hash, label: t("Account ID", "معرف الحساب"), value: fmtText(result.profile.id) },
    { Icon: CalendarDays, label: t("Created on", "تاريخ إنشاء الحساب"), value: fmtDate(result.profile.createTime) },
    { Icon: Clock, label: t("Username last changed", "آخر تعديل لاسم المستخدم"), value: (() => {
      const ts = usernameChangeTs(result);
      if (ts != null) return fmtDate(ts);
      return fmtModify(null, explicitNeverChanged(result.matchedFields, "username"));
    })() },


    { Icon: Clock, label: t("Nickname last changed", "آخر تعديل للاسم الظاهر"), value: fmtModify(result.profile.nickNameModifyTime, explicitNeverChanged(result.matchedFields, "nickname")) },

  ] : [];

  const downloadAvatar = async () => {
    const url = result?.profile.avatar;
    if (!url) return;
    try {
      const res = await fetch(url, { referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${result?.profile.username || "tiktok"}-avatar.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 15000);
      toast({ title: t("Download started", "بدأ التنزيل") });
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };

  const openStories = () => {
    const u = result?.profile.username;
    if (!u) return;
    if (result?.profile.hasStories === false) {
      toast({ title: t("No stories available", "لا توجد قصص متاحة لهذا الحساب") });
      return;
    }
    window.open(`https://www.tiktok.com/@${u}`, "_blank", "noopener");
  };



  const notFound = error === "NOT_FOUND";
  const errorText = () => {
    if (notFound) return t("This account could not be found.", "تعذر العثور على هذا الحساب.");
    if (error === "INVALID") return t("Please enter a valid TikTok username.", "الرجاء إدخال اسم مستخدم TikTok صحيح.");
    if (error === "RATE_LIMIT") return t("Too many requests. Try again in a moment.", "طلبات كثيرة، حاول مرة أخرى بعد قليل.");
    return t("An error occurred while fetching data, please try again later.", "حدث خطأ أثناء جلب البيانات، حاول مرة أخرى لاحقاً.");
  };

  const bio = result?.profile.signature ?? "";
  const bioLong = bio.length > BIO_LIMIT;

  return (
    <div
      dir={dir}
      className="min-h-screen w-full px-4 md:px-8 max-w-3xl mx-auto"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
      }}
    >
      <SEO
        title="تحليل حساب TikTok — معلومات وإحصائيات الحساب"
        description="أداة تحليل حسابات تيك توك: أدخل اسم المستخدم للحصول على المتابعين والإعجابات والفيديوهات وتاريخ إنشاء الحساب ومعلوماته العامة."
        path="/tiktok"
        lang={lang === "ar" ? "ar" : "en"}
      />

      <header className="flex items-center gap-2 mb-5">
        <button
          onClick={() => navigate("/")}
          aria-label={t("Back", "رجوع")}
          className="h-9 w-9 rounded-xl glass grid place-items-center transition hover:scale-105"
        >
          <BackIcon className="h-4 w-4 text-accent" />
        </button>
        <div
          className="h-9 w-9 rounded-xl grid place-items-center text-accent-foreground"
          style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
        >
          <Music2 className="h-5 w-5" />
        </div>
        <span className="font-display text-sm font-bold leading-none">{t("Elite Islamic", "النخبة الإسلامية")}</span>
      </header>

      <section className="mb-5 animate-fade-in">
        <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
          {t("TikTok Account Analyzer", "تحليل حساب TikTok")}
        </h1>
        <p className="mt-2 text-[13px] text-foreground/70 leading-relaxed">
          {t(
            "Enter a TikTok username to get the account's public information.",
            "أدخل اسم مستخدم TikTok للحصول على معلومات الحساب العامة.",
          )}
        </p>
      </section>

      <section className="glass rounded-3xl border border-foreground/10 p-4 mb-6 shadow-sm">
        <label htmlFor="tiktok-username" className="text-[11px] font-bold text-foreground/60">
          {t("Username", "اسم المستخدم")}
        </label>
        <div className="mt-2 relative">
          <span className="pointer-events-none absolute inset-y-0 start-4 grid place-items-center text-foreground/40 text-sm font-bold">@</span>
          <input
            id="tiktok-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onFocus={() => setHistoryOpen(true)}
            onBlur={() => window.setTimeout(() => setHistoryOpen(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && startAnalysis()}
            placeholder="username"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-13 py-3.5 ps-9 pe-4 rounded-2xl bg-foreground/5 border border-foreground/10 text-sm text-foreground placeholder:text-foreground/35 outline-none focus:border-accent/60 transition"
          />

          {historyOpen && history.length > 0 && (
            <ul className="absolute z-20 mt-2 w-full rounded-2xl glass border border-foreground/10 p-1.5 shadow-lg animate-fade-in">
              <li className="px-2.5 py-1 text-[10px] font-bold text-foreground/50 flex items-center gap-1.5">
                <History className="h-3 w-3" /> {t("Recent searches", "عمليات البحث الأخيرة")}
              </li>
              {history.map((h) => (
                <li key={h} className="flex items-center gap-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => startAnalysis(h)}
                    className="flex-1 text-start px-2.5 py-2 rounded-xl text-[12px] font-semibold hover:bg-foreground/5 transition truncate"
                    dir="ltr"
                  >
                    @{h}
                  </button>
                  <button
                    type="button"
                    aria-label={t("Remove", "حذف")}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setHistory(removeHistory(h))}
                    className="h-7 w-7 grid place-items-center rounded-lg hover:bg-foreground/10 transition"
                  >
                    <X className="h-3.5 w-3.5 text-foreground/50" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={() => startAnalysis()}
          disabled={loading}
          className="mt-3 w-full h-13 py-4 rounded-2xl text-sm font-bold text-accent-foreground transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
        >
          <Search className="h-4 w-4" />
          {t("Start analysis", "ابدأ التحليل")}
        </button>

        {/* Banner directly below the analysis button */}
        <AdSlot slot="tiktokAnalyzerCta" />
      </section>

      <InterstitialAd
        open={interstitial}
        slot="tiktokAnalyzerInterstitial"
        onClose={() => {
          setInterstitial(false);
          if (pendingResultRef.current) {
            setResult(pendingResultRef.current);
            pendingResultRef.current = null;
          }
        }}
      />


      {loading && (
        <section className="space-y-4 animate-fade-in" aria-live="polite">
          <p className="text-center text-[13px] font-semibold text-foreground/70">
            {t("Analyzing the account…", "جاري تحليل الحساب…")}
          </p>
          <div className="glass rounded-3xl border border-foreground/10 p-5 flex items-center gap-4">
            <div className="h-24 w-24 rounded-full bg-foreground/10 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-2/5 rounded bg-foreground/10 animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-foreground/10 animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-foreground/10 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl border border-foreground/10 p-4 h-24 animate-pulse" />
            ))}
          </div>
          <div className="glass rounded-3xl border border-foreground/10 p-4 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3.5 w-full rounded bg-foreground/10 animate-pulse" />
            ))}
          </div>
        </section>
      )}

      {!loading && error && (
        <section className="glass rounded-3xl border border-destructive/30 p-7 text-center animate-scale-in">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10">
            {notFound
              ? <UserX className="h-7 w-7 text-destructive" />
              : <AlertTriangle className="h-7 w-7 text-destructive" />}
          </span>
          <p className="text-sm font-bold text-foreground leading-relaxed">{errorText()}</p>
          <button
            onClick={reset}
            className="mt-4 h-11 px-5 rounded-2xl glass text-xs font-bold transition active:scale-95"
          >
            {t("Try another account", "تحليل حساب آخر")}
          </button>
        </section>
      )}

      {!loading && result && (
        <section className="space-y-4 animate-fade-in">
          <article className="glass rounded-3xl border border-foreground/10 p-5 shadow-sm animate-scale-in">
            <div className="flex items-start gap-4">
              {result.profile.avatar ? (
                <img
                  src={result.profile.avatar}
                  alt={`${result.profile.nickname} — ${t("TikTok profile picture", "الصورة الشخصية على تيك توك")}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-24 w-24 rounded-full object-cover border-2 border-accent/30 shrink-0 shadow-md"
                />
              ) : (
                <span className="h-24 w-24 rounded-full bg-foreground/10 grid place-items-center shrink-0">
                  <Music2 className="h-8 w-8 text-foreground/40" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-bold leading-snug flex items-center gap-1.5">
                  <span className="truncate">{result.profile.nickname || result.profile.username}</span>
                  {result.profile.verified && <BadgeCheck className="h-5 w-5 text-accent shrink-0" />}
                </h2>
                <p dir="ltr" className="text-[12px] text-foreground/60 text-start">@{result.profile.username}</p>
                {result.profile.privateAccount && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold">
                    <Lock className="h-3 w-3" /> {t("Private account", "حساب خاص")}
                  </span>
                )}
              </div>
            </div>

            {bio && (
              <div className="mt-4 rounded-2xl bg-foreground/5 p-3">
                <p className="text-[12.5px] text-foreground/80 leading-relaxed whitespace-pre-line">
                  {bioLong && !bioOpen ? `${bio.slice(0, BIO_LIMIT).trimEnd()}…` : bio}
                </p>
                {bioLong && (
                  <button
                    onClick={() => setBioOpen((v) => !v)}
                    className="mt-1.5 text-[11px] font-bold text-accent transition hover:opacity-80"
                  >
                    {bioOpen ? t("Show less", "عرض أقل") : t("Show more", "عرض المزيد")}
                  </button>
                )}
              </div>
            )}
          </article>

          <AdSlot slot="tiktokAnalyzerResults" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statCards.map((s) => (
              <div key={s.label} className="glass rounded-2xl border border-foreground/10 p-3 h-24 flex flex-col items-center justify-center text-center transition duration-300 hover:-translate-y-0.5">
                <s.Icon className="h-4 w-4 text-accent" />
                <p className="mt-1.5 font-display text-base font-bold leading-none truncate max-w-full">{s.value}</p>
                <p className="mt-1 text-[10px] text-foreground/60">{s.label}</p>
              </div>
            ))}
          </div>

          <article className="glass rounded-3xl border border-foreground/10 p-4">
            <h3 className="font-display text-sm font-bold mb-3">{t("Account details", "تفاصيل الحساب")}</h3>
            <ul className="space-y-3">
              {detailRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="flex items-center gap-2 text-foreground/60">
                    <r.Icon className="h-3.5 w-3.5 text-accent shrink-0" />
                    {r.label}
                  </span>
                  <span className="font-semibold text-foreground truncate max-w-[55%] text-end">{r.value}</span>
                </li>
              ))}
            </ul>
          </article>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={downloadAvatar} disabled={!result.profile.avatar} className="h-12 rounded-2xl glass text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50">
              <Download className="h-4 w-4 text-accent" /> {t("Download avatar", "تنزيل الصورة الرمزية")}
            </button>
            <button onClick={openStories} className="h-12 rounded-2xl glass text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95">
              <PlayCircle className="h-4 w-4 text-accent" /> {t("View stories", "عرض القصص")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            <button onClick={copyInfo} className="h-12 rounded-2xl glass text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95">
              <Copy className="h-4 w-4 text-accent" /> {t("Copy info", "نسخ معلومات الحساب")}
            </button>
            <button onClick={shareInfo} className="h-12 rounded-2xl glass text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95">
              <Share2 className="h-4 w-4 text-accent" /> {t("Share results", "مشاركة النتائج")}
            </button>
            <button
              onClick={reset}
              className="h-12 rounded-2xl text-xs font-bold text-accent-foreground flex items-center justify-center gap-2 transition active:scale-95"
              style={{ background: "var(--gradient-gold)" }}
            >
              <RotateCcw className="h-4 w-4" /> {t("Analyze another", "تحليل حساب آخر")}
            </button>
          </div>

          <AdSlot slot="tiktokAnalyzerFooter" />
        </section>
      )}

      <BottomNav active="tiktok" onChange={handleTabChange} />
    </div>
  );
}
