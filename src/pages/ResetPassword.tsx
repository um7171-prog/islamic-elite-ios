import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2 } from "lucide-react";
import { SEO } from "@/components/SEO";

function translateError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("password should be at least") || m.includes("password is too short")) return "كلمة المرور قصيرة جداً (٦ أحرف على الأقل)";
  if (m.includes("weak password") || m.includes("password is too weak")) return "كلمة المرور ضعيفة. استخدم أحرف وأرقام ورموز";
  if (m.includes("leaked")) return "كلمة المرور هذه مسرّبة في حوادث اختراق سابقة. اختر كلمة مرور أخرى";
  if (m.includes("same password") || m.includes("different from the old password")) return "كلمة المرور الجديدة يجب أن تختلف عن السابقة";
  if (m.includes("expired") || m.includes("invalid token") || m.includes("invalid_grant")) return "انتهت صلاحية رابط الاستعادة. اطلب رابطاً جديداً";
  if (m.includes("rate limit") || m.includes("too many")) return "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة";
  if (m.includes("network") || m.includes("fetch") || m.includes("load failed")) return "تعذّر الاتصال بالخادم. تحقّق من الإنترنت ثم أعد المحاولة";
  return msg || "حدث خطأ غير متوقع";
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase emits PASSWORD_RECOVERY when the recovery link is opened.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setHasRecovery(true);
    });
    // Also detect existing recovery session on first load.
    supabase.auth.getSession().then(({ data }) => {
      const hashHasRecovery = window.location.hash.includes("type=recovery");
      if (data.session || hashHasRecovery) setHasRecovery(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    setError(null);
    if (pass.length < 6) { setError("كلمة المرور قصيرة جداً (٦ أحرف على الأقل)"); return; }
    if (pass !== confirm) { setError("كلمتا المرور غير متطابقتين"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
      setDone(true);
      // Sign out so the user re-authenticates with the new password.
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/admin", { replace: true });
      }, 1800);
    } catch (e: any) {
      setError(translateError(e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen grid place-items-center px-4 py-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 2rem)" }}
    >
      <SEO title="إعادة تعيين كلمة المرور — النخبة الإسلامية" description="أنشئ كلمة مرور جديدة لحسابك." path="/reset-password" noindex />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at top, hsl(45 75% 55% / 0.08) 0%, transparent 55%), radial-gradient(ellipse at bottom, hsl(158 80% 50% / 0.05) 0%, transparent 60%)",
        }}
      />

      <Card className="glass-strong w-full max-w-sm p-7 space-y-5 border-white/10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="h-14 w-14 rounded-2xl grid place-items-center"
            style={{ background: "var(--gradient-elite-gold)", boxShadow: "var(--shadow-glow-gold)" }}
          >
            <ShieldCheck className="h-7 w-7 text-background" strokeWidth={2.4} />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-xl font-bold text-elite-gold">تعيين كلمة مرور جديدة</h1>
            <p className="text-xs text-foreground/60">اختر كلمة مرور قوية لحسابك</p>
          </div>
        </div>

        {done ? (
          <div className="text-center space-y-3 py-2">
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            <p className="text-sm font-semibold">تم تحديث كلمة المرور بنجاح</p>
            <p className="text-xs text-foreground/60">سيتم تحويلك لتسجيل الدخول…</p>
          </div>
        ) : !hasRecovery ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-foreground/80">رابط الاستعادة غير صالح أو منتهي الصلاحية.</p>
            <Button
              onClick={() => navigate("/admin")}
              className="w-full h-11 font-bold"
              style={{ background: "var(--gradient-elite-gold)", color: "hsl(var(--background))" }}
            >
              العودة لتسجيل الدخول
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="كلمة المرور الجديدة"
                  value={pass}
                  onChange={(e) => { setPass(e.target.value); setError(null); }}
                  dir="ltr"
                  className="pr-10 pl-10 h-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition"
                  aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="تأكيد كلمة المرور"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !loading) submit(); }}
                  dir="ltr"
                  className="pr-10 h-11"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-center">
                {error}
              </div>
            )}

            <Button
              onClick={submit}
              disabled={loading || !pass || !confirm}
              className="w-full h-11 font-bold"
              style={{ background: "var(--gradient-elite-gold)", color: "hsl(var(--background))" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحديث كلمة المرور"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
