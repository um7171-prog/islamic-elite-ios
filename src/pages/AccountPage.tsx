import { useEffect, useState, type FormEvent } from "react";
import { Loader2, LogOut, Mail } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/site/SettingsUI";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { accountAuth, type AuthFailure } from "@/lib/account/accountAuth";
import { useAccountSession } from "@/hooks/useAccountSession";

type T = (en: string, ar: string) => string;

/** Seconds before another code may be requested (Supabase refuses faster resends anyway). */
const RESEND_SECONDS = 60;

/**
 * Account: sign in with a 6-digit email code, see the signed-in email, sign out.
 * Sign-up stays closed (accountAuth never creates an account). No sync here.
 */
export default function AccountPage() {
  const { t, lang } = useLocale();
  const { state, refresh, signOut } = useAccountSession();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const r = await signOut();
    setSigningOut(false);
    if (r.status === "signed-out") toast.success(t("Signed out", "تم تسجيل الخروج"));
    else toast.error(t("Couldn't sign out. Please try again.", "تعذّر تسجيل الخروج. حاول مرة أخرى."));
  };

  return (
    <PageShell titleAr="الحساب" titleEn="Account" fallback="/more">
      <SEO
        title={t("Account — Elite Islamic", "الحساب — النخبة الإسلامية")}
        description={t("Sign in to your Islamic Elite account.", "تسجيل الدخول إلى حسابك في النخبة الإسلامية.")}
        path="/account"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-6" data-account-state={state.status}>
        {state.status === "loading" && (
          <div className="flex justify-center py-10" aria-busy="true">
            <Loader2 className="h-6 w-6 animate-spin text-foreground/50" />
          </div>
        )}

        {state.status === "not-configured" && (
          <SettingsSection id="account-unavailable" title={t("Account", "الحساب")}>
            <SettingsGroup className="p-4">
              <p className="text-body-sm text-foreground/70">{t("Accounts are not available right now.", "الحساب غير متاح حاليًا.")}</p>
            </SettingsGroup>
          </SettingsSection>
        )}

        {state.status === "signed-in" && (
          <SettingsSection id="account-signed-in" title={t("Your account", "حسابك")}>
            <SettingsGroup>
              <SettingsRow icon={Mail} label={state.email ?? t("Signed in", "مسجّل الدخول")} description={t("Signed in", "مسجّل الدخول")} data-account="email" />
              <SettingsRow
                icon={signingOut ? Loader2 : LogOut}
                tone="danger"
                onClick={() => void onSignOut()}
                label={t("Sign out", "تسجيل الخروج")}
                data-account="sign-out"
              />
            </SettingsGroup>
          </SettingsSection>
        )}

        {state.status === "signed-out" && <SignInForm t={t} onSignedIn={refresh} />}
      </div>
    </PageShell>
  );
}

function sendError(e: AuthFailure, t: T): string | null {
  switch (e) {
    case "invalid-email": return t("Please enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا.");
    case "rate-limited": return t("Too many attempts. Please wait a moment and try again.", "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.");
    case "network": return t("Couldn't reach the server. Check your connection.", "تعذّر الاتصال بالخادم. تحقّق من الإنترنت.");
    case "not-configured": return t("Accounts are not available right now.", "الحساب غير متاح حاليًا.");
    // "rejected" (e.g. an email with no account) is NOT an error on screen: the answer is the same
    // as for a registered email, so the screen never tells whether an account exists.
    default: return null;
  }
}

function verifyError(e: AuthFailure, t: T): string {
  switch (e) {
    case "rate-limited": return t("Too many attempts. Please wait a moment and try again.", "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.");
    case "network": return t("Couldn't reach the server. Check your connection.", "تعذّر الاتصال بالخادم. تحقّق من الإنترنت.");
    case "not-configured": return t("Accounts are not available right now.", "الحساب غير متاح حاليًا.");
    default: return t("The code is incorrect or has expired.", "الرمز غير صحيح أو انتهت صلاحيته.");
  }
}

function SignInForm({ t, onSignedIn }: { t: T; onSignedIn: () => Promise<void> }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const send = async () => {
    setBusy(true);
    setError(null);
    const r = await accountAuth.sendEmailOtp(email);
    setBusy(false);
    const message = r.ok ? null : sendError((r as { error: AuthFailure }).error, t);
    if (message) { setError(message); return; }
    setCode("");
    setStep("code");
    setWait(RESEND_SECONDS);
  };

  const onSend = (e: FormEvent) => { e.preventDefault(); if (!busy) void send(); };

  const onVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await accountAuth.verifyEmailOtp(email, code);
    if (!r.ok) {
      setBusy(false);
      setError(verifyError((r as { error: AuthFailure }).error, t));
      return;
    }
    toast.success(t("Signed in", "تم تسجيل الدخول"));
    await onSignedIn();
  };

  const errorBox = error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p>;

  if (step === "email") {
    return (
      <SettingsSection
        id="account-sign-in"
        title={t("Sign in", "تسجيل الدخول")}
        footer={t("We'll email you a 6-digit code. No password needed.", "سنرسل إلى بريدك رمزًا من 6 أرقام، دون كلمة مرور.")}
      >
        <SettingsGroup className="p-4">
          <form onSubmit={onSend} className="space-y-3" data-account-step="email">
            <div>
              <label htmlFor="account-email" className="mb-1 block text-[12px] font-semibold">{t("Email", "البريد الإلكتروني")}</label>
              <Input
                id="account-email"
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="email"
                value={email}
                maxLength={255}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {errorBox}
            <Button type="submit" disabled={busy || !email.trim()} className="h-12 w-full text-base font-bold">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : t("Send code", "أرسل الرمز")}
            </Button>
          </form>
        </SettingsGroup>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection id="account-verify" title={t("Enter the code", "أدخل الرمز")}>
      <SettingsGroup className="p-4">
        <form onSubmit={onVerify} className="space-y-3" data-account-step="code">
          <p className="text-body-sm text-foreground/70" data-account="code-sent">
            {t("If this email is linked to an account, a 6-digit code is on its way to", "إذا كان هذا البريد مرتبطًا بحساب، فسيصلك رمز من 6 أرقام على")}{" "}
            <span dir="ltr" className="font-semibold text-foreground">{email.trim()}</span>
          </p>
          <div>
            <label htmlFor="account-code" className="mb-1 block text-[12px] font-semibold">{t("Code", "الرمز")}</label>
            <Input
              id="account-code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center font-display text-lg tracking-[0.4em]"
            />
          </div>
          {errorBox}
          <Button type="submit" disabled={busy || code.length !== 6} className="h-12 w-full text-base font-bold">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : t("Verify", "تحقّق")}
          </Button>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={busy || wait > 0} onClick={() => void send()} data-account="resend">
              {wait > 0 ? t(`Resend code (${wait})`, `إعادة إرسال الرمز (${wait})`) : t("Resend code", "إعادة إرسال الرمز")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setStep("email"); setError(null); setCode(""); }} data-account="change-email">
              {t("Change email", "تغيير البريد")}
            </Button>
          </div>
        </form>
      </SettingsGroup>
    </SettingsSection>
  );
}
