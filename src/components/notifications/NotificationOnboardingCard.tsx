import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp } from "@/lib/platform";
import { checkPermissionStatus, requestPermission } from "@/lib/notifications/permission";
import { useNotifications } from "./NotificationsProvider";

/** Shown at most once per install, native iOS only — separate flag from the
 * old system's key so a device upgrading from the previous notification
 * system sees this new, honest explanation once rather than being silently
 * treated as "already answered". */
const FLAG_KEY = "elite.notifications.onboarding.v1";
const SHOW_DELAY_MS = 1200;

export const REOPEN_NOTIFICATION_ONBOARDING_EVENT = "elite-notifications:reopen-onboarding";
export function requestReopenNotificationOnboarding() {
  window.dispatchEvent(new CustomEvent(REOPEN_NOTIFICATION_ONBOARDING_EVENT));
}

function readFlag(): "accepted" | "deferred" | null {
  try {
    const v = localStorage.getItem(FLAG_KEY);
    return v === "accepted" || v === "deferred" ? v : null;
  } catch {
    return null;
  }
}
function writeFlag(v: "accepted" | "deferred") {
  try {
    localStorage.setItem(FLAG_KEY, v);
  } catch {
    /* worst case the card may reappear next launch */
  }
}

/**
 * First-run notification permission.
 *
 * iOS app: on first launch (status still "notDetermined") this asks iOS
 * directly, so the user sees Apple's own "Would Like to Send You Notifications"
 * dialog. No in-app card stands in for it. After the user answers, iOS never
 * shows the dialog again, so we only ever ask once (checked via the real status,
 * not just a flag); later changes happen in iOS Settings.
 *
 * Browser: there is no OS permission, so the card just records the preference.
 */
export function NotificationOnboardingCard() {
  const { t, dir } = useLocale();
  const { rebuildAll, refreshPermission } = useNotifications();
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const startedRef = useRef(false);

  /** Ask iOS for real (Apple's system dialog) and react to the answer. */
  const askIOS = async () => {
    const status = await requestPermission();
    writeFlag("accepted");
    await refreshPermission();
    if (status === "granted") await rebuildAll();
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (readFlag()) return; // answered/deferred before: never nag on later launches

    let cancelled = false;
    const decide = async () => {
      if (cancelled) return;
      if (!isIOSNativeApp()) { setOpen(true); return; }
      const status = await checkPermissionStatus();
      if (cancelled) return;
      if (status === "notDetermined") void askIOS();
      else writeFlag("accepted");
    };
    // The native iOS launch screen is already gone by the time React runs; the short delay
    // only lets Home paint before the system permission dialog appears.
    const timer = window.setTimeout(() => void decide(), SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onReopen = () => {
      if (!isIOSNativeApp()) return;
      void checkPermissionStatus().then((status) => {
        if (status === "notDetermined") void askIOS();
      });
    };
    window.addEventListener(REOPEN_NOTIFICATION_ONBOARDING_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_NOTIFICATION_ONBOARDING_EVENT, onReopen);
  }, []);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      if (!isIOSNativeApp()) {
        // Browser: there is no iOS notification permission to request. Record the
        // answer honestly; alerts are delivered by the installed iPhone app.
        writeFlag("accepted");
        setOpen(false);
        toast.info(t("Alerts are delivered by the iPhone app. Your preferences are saved.", "التنبيهات يرسلها تطبيق iPhone. تم حفظ تفضيلاتك."));
        return;
      }
      const status = await requestPermission();
      writeFlag("accepted");
      setOpen(false);
      await refreshPermission();
      if (status === "granted") {
        await rebuildAll();
        toast.success(t("Notifications enabled — you'll get prayer time alerts.", "تم تفعيل الإشعارات، ستصلك تنبيهات مواقيت الصلاة في وقتها."));
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleLater = () => {
    writeFlag("deferred");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleLater(); }}>
      <DialogContent dir={dir} data-testid="notif-onboarding" className="max-w-sm overflow-hidden rounded-[28px] border-0 p-0 [&>button]:hidden">
        <div className="bg-header relative px-6 pb-8 pt-9 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/10 text-[hsl(var(--elite-gold-end))] ring-2 ring-inset ring-[hsl(var(--elite-gold-start)/0.8)]">
            <Bell className="h-9 w-9" />
          </div>
          <DialogHeader className="mt-5 space-y-2">
            <DialogTitle className="text-center font-display text-h2 font-bold text-white">
              {t("Enable Notifications", "فعّل الإشعارات")}
            </DialogTitle>
            <DialogDescription className="text-center text-body leading-relaxed text-white/80">
              {t("Receive prayer, appointment and Athkar reminders on time.", "استقبل تنبيهات الصلاة والمواعيد والأذكار في وقتها.")}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-3 bg-background px-6 pb-6 pt-5">
          {!isIOSNativeApp() && (
            <p data-testid="notif-onboarding-web-note" className="rounded-2xl bg-foreground/[0.06] p-3 text-body-sm leading-relaxed text-foreground/70">
              {t(
                "In the browser no alerts are sent — they are delivered by the installed iPhone app.",
                "في المتصفح لا تُرسل التنبيهات — يرسلها تطبيق iPhone المثبَّت.",
              )}
            </p>
          )}
          <Button size="lg" className="h-12 w-full text-body font-bold text-primary-foreground" data-testid="notif-enable" onClick={() => void handleEnable()} disabled={requesting}>
            {requesting ? t("Requesting…", "جارٍ الطلب…") : t("Enable", "تفعيل الإشعارات")}
          </Button>
          <Button variant="ghost" className="h-11 w-full text-body text-foreground" data-testid="notif-not-now" onClick={handleLater} disabled={requesting}>
            {t("Not Now", "ليس الآن")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
