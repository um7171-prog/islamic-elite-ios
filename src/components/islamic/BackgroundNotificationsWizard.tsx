import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Loader2, ExternalLink, Bell, Cloud, Smartphone, ShieldCheck, RefreshCw } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { getAthanEnvironment, requestAthanPermission } from "@/lib/athan";
import {
  isPushSubscribed,
  pushAllowedHere,
  pushSupported,
  subscribeToPush,
} from "@/lib/pushNotifications";
import type { AthanSettings } from "@/lib/athanSettings";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings: AthanSettings;
  onActivated?: () => void;
}

type StepState = "pending" | "active" | "done" | "blocked";

interface Step {
  id: string;
  icon: React.ReactNode;
  title: { en: string; ar: string };
  desc: { en: string; ar: string };
  state: StepState;
  action?: { label: { en: string; ar: string }; onClick: () => void; busy?: boolean };
}

const PROD_URL = "https://www.techsnds.com";

const isDenied = () => typeof Notification !== "undefined" && Notification.permission === "denied";

export function BackgroundNotificationsWizard({ open, onOpenChange, settings, onActivated }: Props) {
  const { t, dir, lang } = useLocale();
  const { city } = useCity();
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);
  const env = getAthanEnvironment();

  const refresh = async () => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    try { setSubscribed(await isPushSubscribed()); } catch { setSubscribed(false); }
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    pollRef.current = window.setInterval(refresh, 1500);
    const onVis = () => refresh();
    let permissionStatus: PermissionStatus | null = null;
    let cancelled = false;

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          if (cancelled) return;
          permissionStatus = status;
          status.onchange = () => refresh();
        })
        .catch(() => {});
    }

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (permissionStatus) permissionStatus.onchange = null;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [open]);

  // Auto-advance: when permission granted but not yet subscribed, attempt subscription.
  const autoSubscribedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (perm === "granted" && !subscribed && pushAllowedHere() && !busy && !autoSubscribedRef.current) {
      autoSubscribedRef.current = true;
      void doSubscribe();
    }
    if (subscribed) {
      onActivated?.();
    }
  }, [perm, subscribed, open]);

  const openProd = () => {
    window.open(PROD_URL, "_blank", "noopener,noreferrer");
  };

  const requestPerm = async () => {
    setBusy(true);
    try {
      if (isDenied()) {
        toast({
          title: t("Notifications are blocked", "الإشعارات محظورة"),
          description: t("Enable them from the browser site settings, then return here.", "فعّلها من إعدادات الموقع في المتصفح، ثم عُد هنا."),
        });
        return;
      }
      const p = await requestAthanPermission();
      setPerm(p);
      if (p !== "granted") {
        toast({
          title: t("Permission not granted", "لم يتم منح الإذن"),
          description: t("Allow notifications from the browser's site settings.", "السماح بالإشعارات من إعدادات الموقع في المتصفح."),
        });
      }
    } finally { setBusy(false); }
  };

  const doSubscribe = async () => {
    setBusy(true);
    try {
      await refresh();
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        setPerm(typeof Notification !== "undefined" ? Notification.permission : "denied");
        throw new Error(
          t(
            "Notification permission is blocked. Allow notifications in browser site settings, then return and tap Re-check.",
            "إذن الإشعارات محظور. اسمح بالإشعارات من إعدادات الموقع في المتصفح، ثم عُد واضغط إعادة الفحص.",
          ),
        );
      }
      await subscribeToPush({ lat: city.lat, lng: city.lng }, settings, lang);
      setSubscribed(true);
      toast({
        title: t("Background notifications enabled", "تم تفعيل التنبيهات بالخلفية"),
        description: t("You'll receive Athan even if the app is closed.", "ستصلك تنبيهات الأذان حتى لو كان التطبيق مغلقاً."),
      });
      onActivated?.();
    } catch (e: any) {
      autoSubscribedRef.current = false;
      toast({
        title: t("Couldn't enable", "تعذّر التفعيل"),
        description: String(e?.message || e),
      });
    } finally { setBusy(false); }
  };

  // Build step states
  const stepDomain: StepState =
    pushAllowedHere() ? "done" : "active";
  const stepIOS: StepState | null = env.isIOS
    ? (env.isStandalone ? "done" : (stepDomain === "done" ? "active" : "pending"))
    : null;
  const prereq = stepDomain === "done" && (stepIOS === null || stepIOS === "done");
  const stepPerm: StepState =
    perm === "granted" ? "done" : (prereq ? "active" : "pending");
  const stepSub: StepState =
    subscribed ? "done" : (stepPerm === "done" ? "active" : "pending");
  const blockedInstructions = env.isIOS
    ? t(
        "Open Settings → Safari → Notifications, allow this site/app, then return here.",
        "افتح الإعدادات ← Safari ← الإشعارات، واسمح لهذا الموقع/التطبيق، ثم عُد هنا.",
      )
    : t(
        "Tap the lock/tune icon beside the address → Site settings → Notifications → Allow, then return here.",
        "اضغط رمز القفل/الإعدادات بجانب العنوان ← إعدادات الموقع ← الإشعارات ← السماح، ثم عُد هنا.",
      );

  const steps: Step[] = [
    {
      id: "domain",
      icon: <ShieldCheck className="h-4 w-4" />,
      title: { en: "Open on techsnds.com", ar: "افتح التطبيق على techsnds.com" },
      desc: {
        en: "Background notifications need a secure HTTPS domain. Lovable preview can't subscribe.",
        ar: "تنبيهات الخلفية تتطلب دومين HTTPS آمن. لا يمكن التفعيل من المعاينة.",
      },
      state: stepDomain,
      action: stepDomain === "done" ? undefined : {
        label: { en: "Open techsnds.com", ar: "افتح techsnds.com" },
        onClick: openProd,
      },
    },
    ...(stepIOS !== null ? [{
      id: "ios",
      icon: <Smartphone className="h-4 w-4" />,
      title: { en: "Add to Home Screen (iOS)", ar: "أضف إلى الشاشة الرئيسية (آيفون)" },
      desc: {
        en: "Tap the Share icon in Safari → Add to Home Screen, then open the installed app icon.",
        ar: "اضغط زر المشاركة في Safari ← إضافة إلى الشاشة الرئيسية، ثم افتح التطبيق من الأيقونة المثبّتة.",
      },
      state: stepIOS,
    } as Step] : []),
    {
      id: "perm",
      icon: <Bell className="h-4 w-4" />,
      title: { en: "Allow notification permission", ar: "السماح بإذن الإشعارات" },
      desc: {
        en: perm === "denied"
          ? "Permission is blocked. Open browser site settings → Notifications → Allow, then return. The wizard will retry automatically."
          : "We'll ask the browser for permission to show notifications.",
        ar: perm === "denied"
          ? "الإذن محظور. افتح إعدادات الموقع في المتصفح ← الإشعارات ← السماح، ثم عُد. سيعيد المعالج المحاولة تلقائياً."
          : "سنطلب من المتصفح الإذن بعرض الإشعارات.",
      },
      state: stepPerm,
      action: stepPerm === "active" && perm !== "denied" ? {
        label: { en: "Request permission", ar: "طلب الإذن" },
        onClick: requestPerm,
        busy,
      } : undefined,
    },
    {
      id: "sub",
      icon: <Cloud className="h-4 w-4" />,
      title: { en: "Activate background delivery", ar: "تفعيل التسليم في الخلفية" },
      desc: {
        en: "Register this device to receive Athan pushes from the server.",
        ar: "تسجيل هذا الجهاز لاستقبال تنبيهات الأذان من الخادم.",
      },
      state: stepSub,
      action: stepSub === "active" ? {
        label: { en: "Activate", ar: "تفعيل" },
        onClick: doSubscribe,
        busy,
      } : undefined,
    },
  ];

  const allDone = subscribed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-accent" />
            {t("Background notifications setup", "معالج تنبيهات الخلفية")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Follow the steps. The wizard auto-detects each completion and continues.",
              "اتبع الخطوات. سيكتشف المعالج كل خطوة تلقائياً ويتابع.",
            )}
          </DialogDescription>
        </DialogHeader>

        {perm === "denied" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-foreground">
            <div className="mb-1 font-medium text-destructive">
              {t("Notification permission denied", "إذن الإشعارات مرفوض")}
            </div>
            <p className="text-foreground/70">{blockedInstructions}</p>
          </div>
        )}

        {!pushSupported() && (
          <div className="rounded-xl bg-destructive/10 text-destructive p-3 text-xs">
            {t(
              "This browser doesn't support Web Push. Try Chrome, Edge, Firefox, or Safari 16.4+.",
              "هذا المتصفح لا يدعم Web Push. جرّب Chrome أو Edge أو Firefox أو Safari 16.4+.",
            )}
          </div>
        )}

        <ol className="space-y-3">
          {steps.map((s, i) => {
            const isDone = s.state === "done";
            const isActive = s.state === "active";
            return (
              <li
                key={s.id}
                className={`rounded-xl border p-3 transition-colors ${
                  isDone
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : isActive
                    ? "border-accent/40 bg-accent/5"
                    : "border-foreground/10 bg-foreground/[0.02] opacity-70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-7 w-7 shrink-0 rounded-lg grid place-items-center text-xs font-semibold ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                        ? "bg-accent text-accent-foreground"
                        : "bg-foreground/10 text-foreground/60"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="text-foreground/70">{s.icon}</span>
                      {t(s.title.en, s.title.ar)}
                    </div>
                    <p className="text-[11px] text-foreground/60 leading-relaxed">
                      {t(s.desc.en, s.desc.ar)}
                    </p>
                    {s.action && (
                      <div className="pt-2">
                        <Button
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          onClick={s.action.onClick}
                          disabled={s.action.busy}
                          className="gap-2"
                        >
                          {s.action.busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : s.id === "domain" ? (
                            <ExternalLink className="h-3.5 w-3.5" />
                          ) : null}
                          {t(s.action.label.en, s.action.label.ar)}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={refresh} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("Re-check", "إعادة الفحص")}
          </Button>
          {allDone ? (
            <Button size="sm" onClick={() => onOpenChange(false)} className="gap-2">
              <Check className="h-4 w-4" />
              {t("Done", "تم")}
            </Button>
          ) : (
            <span className="text-[11px] text-foreground/50">
              {t("Auto-detecting…", "كشف تلقائي…")}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
