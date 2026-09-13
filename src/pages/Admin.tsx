import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, LogOut, Users, Download, Globe, Smartphone, Megaphone, Trash2, Shield, Mail, Lock, Eye, EyeOff, RefreshCw, BarChart2, CheckCircle, AlertCircle, Bell } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { SEO } from "@/components/SEO";

type Visitor = {
  id: string;
  session_id: string;
  device_type: string;
  os: string | null;
  os_version: string | null;
  browser: string | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  app_version: string | null;
  language: string | null;
  created_at: string;
};

type DownloadEvent = {
  id: string;
  file_name: string;
  device_type: string;
  country_code: string | null;
  created_at: string;
};

type Announcement = {
  id: string;
  title_ar: string;
  body_ar: string;
  title_en: string;
  body_en: string;
  published: boolean;
  created_at: string;
};

function AuthGate({ onReady }: { onReady: (session: Session) => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const translateError = (msg: string): string => {
    const m = (msg || "").toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid_credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
    if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) return "يجب تأكيد البريد الإلكتروني أولاً. تحقّق من صندوق الوارد";
    if (m.includes("user already registered") || m.includes("already been registered") || m.includes("already registered") || m.includes("user_already_exists")) return "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من إنشاء حساب";
    if (m.includes("user not found") || m.includes("user_not_found")) return "لا يوجد حساب بهذا البريد الإلكتروني";
    if (m.includes("password should be at least") || m.includes("password is too short") || m.includes("password_too_short")) return "كلمة المرور قصيرة جداً (٦ أحرف على الأقل)";
    if (m.includes("weak password") || m.includes("password is too weak") || m.includes("weak_password")) return "كلمة المرور ضعيفة. استخدم أحرف وأرقام ورموز";
    if (m.includes("password") && m.includes("leaked")) return "كلمة المرور هذه مسرّبة في حوادث اختراق سابقة. اختر كلمة مرور أخرى";
    if (m.includes("signup requires a valid password") || m.includes("password is required")) return "كلمة المرور مطلوبة";
    if (m.includes("email rate limit") || m.includes("over_email_send_rate_limit")) return "تجاوزت الحد المسموح لإرسال البريد. انتظر دقائق ثم أعد المحاولة";
    if (m.includes("rate limit") || m.includes("too many requests") || m.includes("too many") || m.includes("over_request_rate_limit")) return "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة";
    if (m.includes("invalid email") || (m.includes("email") && m.includes("invalid")) || m.includes("email_address_invalid")) return "صيغة البريد الإلكتروني غير صحيحة";
    if (m.includes("signups not allowed") || m.includes("signup is disabled") || m.includes("signup_disabled")) return "إنشاء الحسابات معطّل حالياً";
    if (m.includes("anonymous") && m.includes("disabled")) return "الدخول المجهول غير مفعّل. استخدم بريدك الإلكتروني وكلمة المرور";
    if (m.includes("database error") || m.includes("unexpected_failure") || m.includes("saving new user")) return "تعذّر إنشاء الحساب الآن. أعد المحاولة بعد قليل";
    if (m.includes("captcha")) return "فشل التحقق. أعد المحاولة";
    if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch") || m.includes("networkerror")) return "تعذّر الاتصال بالخادم. تحقّق من الإنترنت";
    if (m.includes("expired") || m.includes("invalid token") || m.includes("otp_expired")) return "انتهت صلاحية الرابط. اطلب رابطاً جديداً";
    if (m.includes("jwt") || m.includes("session")) return "انتهت صلاحية الجلسة. سجّل الدخول مجدداً";
    return "حدث خطأ غير متوقع. أعد المحاولة";
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        if (data.session) onReady(data.session);
        else toast({ title: "تم إنشاء الحساب", description: "أول حساب يُنشأ يحصل على صلاحية المسؤول تلقائياً." });
      } else if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        });
        if (error) throw error;
        if (data.session) onReady(data.session);
      } else {
        // forgot password
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني. تحقّق من صندوق الوارد (أو الرسائل المهملة).");
      }
    } catch (e: any) {
      setError(translateError(e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = mode === "forgot" ? !!email : !!email && !!pass;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit && !loading) submit();
  };

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] grid place-items-center px-4 py-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 2rem)" }}
    >
      <SEO title="لوحة التحكم — النخبة الإسلامية" description="لوحة تحكم المسؤول." path="/admin" noindex />
      {/* Ambient gold glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at top, hsl(45 75% 55% / 0.08) 0%, transparent 55%), radial-gradient(ellipse at bottom, hsl(158 80% 50% / 0.05) 0%, transparent 60%)",
        }}
      />

      <Card className="glass-strong w-full max-w-sm p-7 space-y-5 border-white/10">
        {/* Brand mark */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="h-14 w-14 rounded-2xl grid place-items-center"
            style={{ background: "var(--gradient-elite-gold)", boxShadow: "var(--shadow-glow-gold)" }}
          >
            <Shield className="h-7 w-7 text-background" strokeWidth={2.4} />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-xl font-bold text-elite-gold">لوحة التحكم</h1>
            <p className="text-xs text-foreground/60">
              {mode === "signin" && "سجّل الدخول للوصول للإحصائيات والإعلانات"}
              {mode === "signup" && "أنشئ حساب المسؤول الأول"}
              {mode === "forgot" && "أدخل بريدك لإرسال رابط إعادة تعيين كلمة المرور"}
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); setInfo(null); }}
              onKeyDown={onKey}
              dir="ltr"
              className="pr-10 h-11"
            />
          </div>

          {mode !== "forgot" && (
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
              <Input
                type={showPass ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="كلمة المرور"
                value={pass}
                onChange={(e) => { setPass(e.target.value); setError(null); setInfo(null); }}
                onKeyDown={onKey}
                dir="ltr"
                className="pr-10 pl-10 h-11"
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute start-2 top-1/2 -translate-y-1/2 h-11 w-11 grid place-items-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition"
                aria-label={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {mode === "signin" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}
                className="text-xs text-foreground/60 hover:text-elite-gold transition"
              >
                نسيت كلمة المرور؟
              </button>
            </div>
          )}
        </div>

        {/* Error / Info */}
        {error && (
          <div role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-center">
            {error}
          </div>
        )}
        {info && (
          <div role="status" className="text-xs text-primary bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-center">
            {info}
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={submit}
          disabled={loading || !canSubmit}
          className="w-full h-11 font-bold"
          style={{ background: "var(--gradient-elite-gold)", color: "hsl(var(--background))" }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === "signin" ? (
            "دخول"
          ) : mode === "signup" ? (
            "إنشاء الحساب"
          ) : (
            "إرسال رابط الاستعادة"
          )}
        </Button>

        {/* Mode switch */}
        <div className="text-center space-y-1.5">
          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
              className="text-xs text-foreground/60 hover:text-foreground transition"
            >
              ← العودة لتسجيل الدخول
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
              className="text-xs text-foreground/60 hover:text-foreground transition"
            >
              {mode === "signin" ? "ليس لديك حساب؟ أنشئ حساب المسؤول" : "لديك حساب؟ سجّل الدخول"}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center gap-2 text-foreground/60 text-xs">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-elite-gold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-foreground/50">{sub}</div>}
    </Card>
  );
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [downloads, setDownloads] = useState<DownloadEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // announcement form
  const [titleAr, setTitleAr] = useState("");
  const [bodyAr, setBodyAr] = useState("");

  // push notification form
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushRoute, setPushRoute] = useState("/");
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState("");
  const [deviceCount, setDeviceCount] = useState<number | null>(null);

  // password reset email form
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [resetMsg, setResetMsg] = useState("");


  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [session.user.id]);

  const refresh = async () => {
    setLoading(true);
    const [v, d, a, t] = await Promise.all([
      supabase.from("visitors").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("download_events").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }),
      supabase.from("device_tokens").select("id", { count: "exact", head: true }).eq("enabled", true),
    ]);
    setVisitors((v.data as Visitor[]) || []);
    setDownloads((d.data as DownloadEvent[]) || []);
    setAnnouncements((a.data as Announcement[]) || []);
    setDeviceCount(t.count ?? 0);
    setLoading(false);

  };

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  const stats = useMemo(() => {
    const uniqueSessions = new Set(visitors.map((v) => v.session_id)).size;
    const byDevice: Record<string, number> = {};
    const byCountry: Record<string, { name: string; code: string; count: number }> = {};
    const byVersion: Record<string, number> = {};
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    let recent = 0;
    for (const v of visitors) {
      byDevice[v.device_type] = (byDevice[v.device_type] || 0) + 1;
      const code = v.country_code || "??";
      const name = v.country || "غير معروف";
      if (!byCountry[code]) byCountry[code] = { name, code, count: 0 };
      byCountry[code].count++;
      const ver = v.app_version || "—";
      byVersion[ver] = (byVersion[ver] || 0) + 1;
      if (new Date(v.created_at).getTime() > last24h) recent++;
    }
    return {
      uniqueSessions,
      total: visitors.length,
      recent,
      byDevice: Object.entries(byDevice).sort((a, b) => b[1] - a[1]),
      byCountry: Object.values(byCountry).sort((a, b) => b.count - a.count),
      byVersion: Object.entries(byVersion).sort((a, b) => b[1] - a[1]),
    };
  }, [visitors]);

  const downloadStats = useMemo(() => {
    const byFile: Record<string, number> = {};
    for (const d of downloads) byFile[d.file_name] = (byFile[d.file_name] || 0) + 1;
    return {
      total: downloads.length,
      byFile: Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 50),
    };
  }, [downloads]);

  // Tool usage derived from download events (name/source based classification)
  const toolStats = useMemo(() => {
    let tiktok = 0, youtube = 0, other = 0;
    for (const d of downloads) {
      const s = `${d.file_name || ""}`.toLowerCase();
      if (s.includes("tiktok") || s.includes("tt_")) tiktok++;
      else if (s.includes("youtube") || s.includes("yt_")) youtube++;
      else other++;
    }
    return { tiktok, youtube, other };
  }, [downloads]);


  const translateDbError = (msg: string): string => {
    const m = (msg || "").toLowerCase();
    if (m.includes("row-level security") || m.includes("rls") || m.includes("permission denied") || m.includes("not authorized")) return "ليست لديك صلاحية لتنفيذ هذه العملية";
    if (m.includes("duplicate key") || m.includes("already exists") || m.includes("unique constraint")) return "هذا العنصر موجود مسبقاً";
    if (m.includes("violates not-null") || m.includes("null value")) return "بعض الحقول المطلوبة فارغة";
    if (m.includes("foreign key")) return "تعذّر التنفيذ بسبب ارتباط ببيانات أخرى";
    if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) return "تعذّر الاتصال بالخادم. تحقّق من الإنترنت";
    if (m.includes("jwt") || m.includes("expired") || m.includes("invalid token")) return "انتهت صلاحية الجلسة. سجّل الدخول مجدداً";
    if (m.includes("rate limit") || m.includes("too many")) return "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة";
    return "حدث خطأ غير متوقع. أعد المحاولة";
  };

  const publishAnnouncement = async () => {
    if (!titleAr.trim() || !bodyAr.trim()) return;
    const { error } = await supabase.from("announcements").insert({
      title_ar: titleAr.trim(),
      body_ar: bodyAr.trim(),
      published: true,
    });
    if (error) return toast({ title: "فشل النشر", description: translateDbError(error.message), variant: "destructive" });
    setTitleAr(""); setBodyAr("");
    toast({ title: "تم نشر الإعلان" });
    refresh();
  };

  const deleteAnnouncement = async (id: string) => {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast({ title: "فشل الحذف", description: translateDbError(error.message), variant: "destructive" });
    refresh();
  };

  const sendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) return;
    setPushSending(true);
    setPushResult("");
    const { data, error } = await supabase.functions.invoke("send-announcement-push", {
      body: { title: pushTitle.trim(), body: pushBody.trim(), route: pushRoute || "/" },
    });
    setPushSending(false);
    if (error) {
      setPushResult("تعذّر الإرسال. تحقّق من إعدادات APNs ثم أعد المحاولة");
      return toast({ title: "فشل الإرسال", description: translateDbError(error.message), variant: "destructive" });
    }
    if (data?.error === "apns_not_configured") {
      setPushResult("لم يتم ضبط مفاتيح APNs بعد (APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY)");
      return;
    }
    setPushResult(`تم الإرسال إلى ${data?.sent ?? 0} جهاز من أصل ${data?.total ?? 0}` + ((data?.failed ?? 0) > 0 ? ` — فشل ${data.failed}` : ""));
    setPushTitle(""); setPushBody("");
    toast({ title: "تم إرسال الإشعار" });
  };

  const sendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = resetEmail.trim();
    if (!mail) return;
    setResetStatus("sending");
    setResetMsg("");
    const { error } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setResetStatus("error");
      setResetMsg(translateDbError(error.message));
      return;
    }
    setResetStatus("success");
    setResetEmail("");
    setResetMsg("تم إرسال رابط الاستعادة بنجاح. تحقّق من صندوق الوارد (وقد يصل للرسائل المهملة).");
  };



  if (isAdmin === null) {
    return <div className="min-h-[100dvh] grid place-items-center"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }
  if (!isAdmin) {
    return (
      <div dir="rtl" className="min-h-[100dvh] grid place-items-center px-4">
        <Card className="p-6 max-w-sm text-center space-y-3">
          <h2 className="font-bold text-elite-gold">غير مصرح</h2>
          <p className="text-sm text-foreground/70">حسابك ليس لديه صلاحية المسؤول.</p>
          <Button variant="outline" onClick={onLogout}>تسجيل خروج</Button>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh] px-4 py-6 max-w-6xl mx-auto" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}>
      <header className="flex items-center justify-between mb-4 gap-2">
        <h1 className="font-display text-lg font-bold text-elite-gold">لوحة التحكم</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={onLogout} className="gap-2">
            <LogOut className="h-3.5 w-3.5" /> خروج
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="visitors">الزوار</TabsTrigger>
          <TabsTrigger value="downloads">التنزيلات</TabsTrigger>
          <TabsTrigger value="announcements">الإعلانات</TabsTrigger>
          <TabsTrigger value="push">الإشعارات</TabsTrigger>
        </TabsList>

        {loading && <div className="py-8 text-center"><Loader2 className="animate-spin h-5 w-5 mx-auto" /></div>}

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Users} label="مستخدمين فريدين" value={stats.uniqueSessions} />
            <StatCard icon={Users} label="إجمالي الزيارات" value={stats.total} />
            <StatCard icon={Users} label="آخر 24 ساعة" value={stats.recent} />
            <StatCard icon={Download} label="إجمالي التنزيلات" value={downloadStats.total} />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-foreground/50">
              بيانات تاريخية — أداتا تيك توك ويوتيوب أُزيلتا من التطبيق، والأرقام أدناه لا تزداد بعد الآن
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard icon={Download} label="تحميلات تيك توك (تاريخي)" value={toolStats.tiktok} />
              <StatCard icon={Download} label="تحميلات يوتيوب (تاريخي)" value={toolStats.youtube} />
              <StatCard icon={BarChart2} label="تنزيلات عامة أخرى" value={toolStats.other} />
            </div>
          </div>

          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Mail className="h-4 w-4" /> إرسال رابط استعادة كلمة المرور
            </h3>
            <p className="text-xs text-foreground/60">
              يُرسل الرابط من نطاق البريد الرسمي للتطبيق إلى بريد المستخدم، وينتهي إلى صفحة إعادة التعيين داخل الموقع.
            </p>
            <form onSubmit={sendResetLink} className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                dir="ltr"
                value={resetEmail}
                onChange={(e) => { setResetEmail(e.target.value); setResetStatus("idle"); }}
                placeholder="أدخل البريد الإلكتروني للمستخدم…"
                className="flex-1 h-11"
                required
              />
              <Button type="submit" disabled={resetStatus === "sending" || !resetEmail.trim()} className="h-11 font-bold sm:w-56">
                {resetStatus === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال رابط الاستعادة"}
              </Button>
            </form>
            {resetStatus === "success" && (
              <div role="status" className="text-xs text-primary bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0" /> {resetMsg}
              </div>
            )}
            {resetStatus === "error" && (
              <div role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {resetMsg}
              </div>
            )}
          </Card>


          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Smartphone className="h-4 w-4" /> الأجهزة</h3>
            <div className="space-y-2">
              {stats.byDevice.map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span>{k}</span>
                  <span className="tabular-nums text-elite-gold">{v}</span>
                </div>
              ))}
              {stats.byDevice.length === 0 && <p className="text-xs text-foreground/50">لا توجد بيانات</p>}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Globe className="h-4 w-4" /> الدول</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {stats.byCountry.map((c) => (
                <div key={c.code} className="flex justify-between text-sm">
                  <span>{c.name} <span className="text-foreground/40 text-xs">({c.code})</span></span>
                  <span className="tabular-nums text-elite-gold">{c.count}</span>
                </div>
              ))}
              {stats.byCountry.length === 0 && <p className="text-xs text-foreground/50">لا توجد بيانات</p>}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">نسخ التطبيق</h3>
            <div className="space-y-2">
              {stats.byVersion.map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="font-mono">{k}</span>
                  <span className="tabular-nums text-elite-gold">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="visitors" className="pt-4">
          <Card className="p-3 max-h-[70vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="text-foreground/60">
                  <th className="text-right p-2">التاريخ</th>
                  <th className="text-right p-2">الجهاز</th>
                  <th className="text-right p-2">النظام</th>
                  <th className="text-right p-2">الدولة</th>
                  <th className="text-right p-2">اللغة</th>
                </tr>
              </thead>
              <tbody>
                {visitors.slice(0, 200).map((v) => (
                  <tr key={v.id} className="border-t border-foreground/5">
                    <td className="p-2 tabular-nums">{new Date(v.created_at).toLocaleString("ar")}</td>
                    <td className="p-2">{v.device_type}</td>
                    <td className="p-2">{v.os} {v.os_version}</td>
                    <td className="p-2">{v.country || "—"}</td>
                    <td className="p-2">{v.language}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="downloads" className="space-y-3 pt-4">
          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">أكثر الملفات تنزيلاً</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {downloadStats.byFile.map(([name, count]) => (
                <div key={name} className="flex justify-between text-sm gap-3">
                  <span className="truncate flex-1">{name}</span>
                  <span className="tabular-nums text-elite-gold shrink-0">{count}</span>
                </div>
              ))}
              {downloadStats.byFile.length === 0 && <p className="text-xs text-foreground/50">لا توجد تنزيلات بعد</p>}
            </div>
          </Card>

          <Card className="p-3 max-h-[50vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="text-foreground/60">
                  <th className="text-right p-2">التاريخ</th>
                  <th className="text-right p-2">الملف</th>
                  <th className="text-right p-2">الجهاز</th>
                  <th className="text-right p-2">الدولة</th>
                </tr>
              </thead>
              <tbody>
                {downloads.slice(0, 200).map((d) => (
                  <tr key={d.id} className="border-t border-foreground/5">
                    <td className="p-2 tabular-nums">{new Date(d.created_at).toLocaleString("ar")}</td>
                    <td className="p-2 max-w-[160px] truncate">{d.file_name}</td>
                    <td className="p-2">{d.device_type}</td>
                    <td className="p-2">{d.country_code || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-3 pt-4">
          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Megaphone className="h-4 w-4" /> نشر إعلان جديد</h3>
            <Input placeholder="العنوان" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
            <textarea
              placeholder="نص الإعلان"
              value={bodyAr}
              onChange={(e) => setBodyAr(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button onClick={publishAnnouncement} disabled={!titleAr.trim() || !bodyAr.trim()} className="w-full">
              نشر
            </Button>
          </Card>

          <div className="space-y-2">
            {announcements.map((a) => (
              <Card key={a.id} className="p-3 flex justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{a.title_ar}</div>
                  <div className="text-xs text-foreground/70 mt-1 line-clamp-2">{a.body_ar}</div>
                  <div className="text-[10px] text-foreground/50 mt-1">{new Date(a.created_at).toLocaleString("ar")}</div>
                </div>
                <Button variant="ghost" size="icon" aria-label="حذف الإعلان" title="حذف الإعلان" className="min-h-11 min-w-11" onClick={() => deleteAnnouncement(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </Card>
            ))}
            {announcements.length === 0 && <p className="text-xs text-foreground/50 text-center py-4">لا توجد إعلانات</p>}
          </div>
        </TabsContent>

        <TabsContent value="push" className="space-y-3 pt-4">
          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Bell className="h-4 w-4" /> إرسال إشعار فوري لأجهزة iPhone
            </h3>
            <p className="text-xs text-foreground/60">
              يصل الإشعار لجميع الأجهزة التي فعّلت الإشعارات. تنبيهات الأذان محلية ولا تتأثر بهذا القسم.
            </p>
            <Input placeholder="عنوان الإشعار" maxLength={120} value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
            <textarea
              placeholder="نص الإشعار"
              value={pushBody}
              maxLength={500}
              onChange={(e) => setPushBody(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Input placeholder="الصفحة عند الفتح (مثال: /)" value={pushRoute} onChange={(e) => setPushRoute(e.target.value)} />
            <Button onClick={sendPush} disabled={pushSending || !pushTitle.trim() || !pushBody.trim()} className="w-full gap-2">
              {pushSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              إرسال الآن
            </Button>
            {pushResult && (
              <p className="text-xs text-center text-foreground/70 border-t border-foreground/10 pt-2">{pushResult}</p>
            )}
          </Card>
          {deviceCount !== null && (
            <Card className="p-3 text-xs text-foreground/70 flex items-center justify-between">
              <span>الأجهزة المسجّلة</span>
              <span className="font-bold text-foreground">{deviceCount}</span>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="min-h-[100dvh] grid place-items-center"><Loader2 className="animate-spin h-6 w-6" /></div>;
  if (!session) return <AuthGate onReady={setSession} />;
  return <Dashboard session={session} onLogout={() => supabase.auth.signOut()} />;
}
