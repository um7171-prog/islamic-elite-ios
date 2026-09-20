import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
 * "فعّل إشعارات التطبيق" — explains what notifications are for BEFORE ever
 * touching the real iOS permission API. Apple's system dialog only ever
 * appears from the button below, or the equivalent button in Settings —
 * never automatically.
 */
export function NotificationOnboardingCard() {
  const { t } = useLocale();
  const { rebuildAll, refreshPermission } = useNotifications();
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!isIOSNativeApp() || readFlag()) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const status = await checkPermissionStatus();
      if (cancelled) return;
      if (status === "notDetermined") setOpen(true);
      else writeFlag("accepted");
    }, SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!isIOSNativeApp()) return;
    const onReopen = () => {
      void checkPermissionStatus().then((status) => {
        if (status === "notDetermined") setOpen(true);
      });
    };
    window.addEventListener(REOPEN_NOTIFICATION_ONBOARDING_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_NOTIFICATION_ONBOARDING_EVENT, onReopen);
  }, []);

  const handleEnable = async () => {
    setRequesting(true);
    try {
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

  if (!isIOSNativeApp()) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleLater(); }}>
      <DialogContent className="max-w-sm text-center" dir="rtl">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-2xl grid place-items-center bg-elite-gold/15 text-elite-gold">
            <Bell className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-h3">
            {t("Enable app notifications", "فعّل إشعارات التطبيق")}
          </DialogTitle>
        </DialogHeader>
        <ul className="text-start text-body text-foreground/80 space-y-1.5 pt-1 pb-1 list-disc ps-5">
          <li>{t("Prayer time alerts.", "تنبيهات مواقيت الصلاة.")}</li>
          <li>{t("Athkar reminders.", "تذكيرات الأذكار.")}</li>
          <li>{t("Appointment reminders.", "تذكيرات المواعيد.")}</li>
        </ul>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={() => void handleEnable()} disabled={requesting}>
            {requesting ? t("Requesting…", "جارٍ الطلب…") : t("Enable notifications", "تفعيل الإشعارات")}
          </Button>
          <Button variant="ghost" onClick={handleLater} disabled={requesting}>
            {t("Later", "لاحقًا")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
