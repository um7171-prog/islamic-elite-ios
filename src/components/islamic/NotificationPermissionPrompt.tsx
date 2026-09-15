import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { checkOrRequestNotificationPermission } from "@/lib/nativeAthan";
import { isIOSNativeApp } from "@/lib/platform";
import { useNativeAthanScheduler } from "@/components/NativeAthanScheduler";

// Every line here is prefixed so it can be found instantly in Xcode's
// console / Console.app while diagnosing "the dialog never appeared on a
// real iPhone" reports — a plain component-existence test cannot prove
// this flow ran on device, only real device logs can.
const flog = (...args: unknown[]) => console.info("[notif-prompt]", ...args);

// Shown at most once per install — separate from the older, unused
// firstLaunchPermissions.ts/OnboardingPermissions flow (which also touches
// location and was never mounted). This dialog owns notifications only.
// Plain localStorage + try/catch matches the project's existing pattern for
// simple flags (see athanSettings.ts, nativeAthan.ts's readScheduledIds) —
// there is no separate storage abstraction in this codebase to reuse instead.
const FLAG_KEY = "athan.notif.onboarding.v1";
// Give the first paint/hydration time to settle before ever touching a
// native permission API — never prompt before the UI is actually ready.
const SHOW_DELAY_MS = 1200;

/** Dispatched by the Settings page to reopen this same dialog on demand. */
export const REOPEN_NOTIFICATION_PROMPT_EVENT = "athan:reopen-notification-prompt";
export function requestReopenNotificationPrompt() {
  window.dispatchEvent(new CustomEvent(REOPEN_NOTIFICATION_PROMPT_EVENT));
}

/** Dispatched once the dialog has actually been answered (enabled or later),
 * so other UI showing the permission state (e.g. the Settings banner) can
 * refresh — distinct from the "please reopen" event above. */
export const NOTIFICATION_PERMISSION_ANSWERED_EVENT = "athan:notification-permission-answered";

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
    /* storage unavailable — worst case the dialog may reappear next launch */
  }
}

/**
 * First-launch-only Arabic dialog asking the user to enable prayer/Athan
 * notifications. Renders nothing on the web or on Android — native iOS only.
 * Shown automatically once; after that (accepted or deferred) it only
 * reappears when explicitly reopened from Settings via
 * requestReopenNotificationPrompt(). Requesting the real Apple permission
 * happens ONLY from the two buttons here — no automatic path in the app is
 * allowed to pop the system dialog on its own.
 */
export function NotificationPermissionPrompt() {
  const { t } = useLocale();
  const { reschedule } = useNativeAthanScheduler();
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const startedRef = useRef(false);

  // Automatic first-launch trigger — runs once, only if never answered.
  useEffect(() => {
    flog("mount — startedRef.current =", startedRef.current);
    if (startedRef.current) return;
    startedRef.current = true;
    const ios = isIOSNativeApp();
    const flag = readFlag();
    flog("first-launch check — isIOSNativeApp =", ios, "storedFlag =", flag);
    if (!ios || flag) {
      flog(!ios ? "skip: not native iOS" : `skip: already answered (${flag})`);
      return;
    }

    let cancelled = false;
    flog(`scheduling auto-show in ${SHOW_DELAY_MS}ms`);
    const timer = window.setTimeout(async () => {
      // Read-only — only decides whether to SHOW the dialog, never prompts.
      const { status } = await checkOrRequestNotificationPermission(false);
      flog("read-only permission check →", status);
      if (cancelled) return;
      if (status === "prompt") {
        flog("showing first-launch dialog");
        setOpen(true);
      } else {
        // Already decided by some other historical path (e.g. an existing
        // install updating to this version) — nothing to ask, don't show it.
        flog("permission already decided — not showing dialog, marking flag accepted");
        writeFlag("accepted");
      }
    }, SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Explicit reopen from Settings — bypasses the "once only" flag since this
  // is a direct user action, not an automatic prompt. Only makes sense while
  // the permission is still undecided; a truly denied permission is handled
  // by the separate "Open iPhone Settings" banner, not this dialog.
  useEffect(() => {
    if (!isIOSNativeApp()) return;
    const onReopen = () => {
      void checkOrRequestNotificationPermission(false).then(({ status }) => {
        if (status === "prompt") setOpen(true);
      });
    };
    window.addEventListener(REOPEN_NOTIFICATION_PROMPT_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_NOTIFICATION_PROMPT_EVENT, onReopen);
  }, []);

  const handleEnable = async () => {
    flog("user tapped 'Enable notifications' — requesting real Apple permission");
    setRequesting(true);
    try {
      const { granted, status } = await checkOrRequestNotificationPermission(true);
      flog("Apple permission result →", status, "granted =", granted);
      writeFlag("accepted");
      setOpen(false);
      window.dispatchEvent(new CustomEvent(NOTIFICATION_PERMISSION_ANSWERED_EVENT));
      if (granted) {
        flog("scheduling prayer notifications now that permission is granted");
        const count = await reschedule();
        flog("reschedule() finished — scheduled count =", count);
        toast.success(
          t(
            "Notifications enabled — you'll get prayer time alerts.",
            "تم تفعيل الإشعارات، ستصلك تنبيهات مواقيت الصلاة في وقتها.",
          ),
        );
      } else {
        flog("permission not granted (status =", status, ") — nothing scheduled");
      }
      // status === "denied": the user dismissed Apple's own dialog with
      // "Don't Allow". The AthanSettingsCard banner already guides them to
      // iOS Settings in that case — no separate handling needed here, and
      // requestPermissions() is never called again automatically afterwards.
      void status;
    } finally {
      setRequesting(false);
    }
  };

  const handleLater = () => {
    flog("user tapped 'Later' — deferring, no Apple prompt shown");
    writeFlag("deferred");
    setOpen(false);
    window.dispatchEvent(new CustomEvent(NOTIFICATION_PERMISSION_ANSWERED_EVENT));
  };

  if (!isIOSNativeApp()) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleLater(); }}>
      <DialogContent className="max-w-sm text-center" dir="rtl">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-2xl grid place-items-center bg-elite-gold/15 text-elite-gold">
            <Bell className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-base">
            {t("Enable Islamic Elite notifications", "فعّل إشعارات النخبة الإسلامية")}
          </DialogTitle>
        </DialogHeader>
        <ul className="text-start text-sm text-foreground/80 space-y-1.5 pt-1 pb-1 list-disc ps-5">
          <li>{t("Prayer time notifications.", "إشعارات أوقات الصلوات.")}</li>
          <li>{t("Athan alert.", "تنبيه الأذان.")}</li>
          <li>{t("Reminder before prayer.", "التذكير قبل الصلاة.")}</li>
          <li>{t("Important in-app alerts.", "التنبيهات المهمة داخل التطبيق.")}</li>
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
