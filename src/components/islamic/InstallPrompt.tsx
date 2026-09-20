import { useEffect, useState } from "react";
import { X, Share, PlusSquare, ArrowUpFromLine } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp } from "@/lib/platform";

export function InstallPrompt() {
  const { t, dir } = useLocale();
  const iosNative = isIOSNativeApp();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  // The tip sits at z-[60], above Radix dialogs (z-50): while a dialog is open
  // (e.g. the Document Scanner) it would cover and intercept taps on the
  // dialog's bottom controls such as the shutter button.
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const check = () => setModalOpen(!!document.querySelector('[role="dialog"][data-state="open"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (iosNative) return;
    const wasDismissed = localStorage.getItem("install-prompt-dismissed");
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
                         (window.navigator as any).standalone === true;
    if (isStandalone) {
      setDismissed(true);
      return;
    }

    // delay slightly so it feels like a welcome tip
    const timer = setTimeout(() => {
      setDismissed(false);
      setShow(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [iosNative]);

  const handleClose = () => {
    setShow(false);
    localStorage.setItem("install-prompt-dismissed", "1");
    setTimeout(() => setDismissed(true), 300);
  };

  if (iosNative || dismissed || modalOpen) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div
      dir={dir}
      className={`fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 transition-transform duration-300 ${show ? "translate-y-0" : "translate-y-full"}`}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="mx-auto max-w-sm rounded-2xl border border-elite-gold/20 bg-background/95 backdrop-blur-md p-4 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-display text-sm font-bold text-elite-gold">
              {t("Add to Home Screen", "أضف للشاشة الرئيسية")}
            </h3>
            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">
              {t(
                "Install this app for quick access without opening the browser every time.",
                "ثبّت التطبيق للوصول السريع دون فتح المتصفح في كل مرة."
              )}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 p-1 rounded-full hover:bg-foreground/10 transition-colors"
            aria-label={t("Close", "إغلاق")}
          >
            <X className="h-4 w-4 text-foreground/60" />
          </button>
        </div>

        {isIOS ? (
          <div className="flex items-center gap-3 text-xs text-foreground/80 bg-muted/50 rounded-xl p-3">
            <span className="shrink-0 flex items-center gap-1">
              <Share className="h-4 w-4 text-primary" />
            </span>
            <span className="leading-relaxed">
              {t(
                "Tap the Share button in Safari, then choose 'Add to Home Screen'.",
                "اضغط زر المشاركة في Safari، ثم اختر 'إضافة إلى الشاشة الرئيسية'."
              )}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-foreground/80 bg-muted/50 rounded-xl p-3">
            <span className="shrink-0 flex items-center gap-1">
              <PlusSquare className="h-4 w-4 text-primary" />
            </span>
            <span className="leading-relaxed">
              {t(
                "Tap the menu (⋮) in Chrome and choose 'Add to Home Screen'.",
                "اضغط القائمة (⋮) في Chrome، ثم اختر 'إضافة إلى الشاشة الرئيسية'."
              )}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-1 text-xs text-foreground/40">
          <ArrowUpFromLine className="h-3 w-3" />
          <span>
            {t("You can also tap 'Add to Home Screen' in your browser menu.",
               "يمكنك أيضاً اختيار 'إضافة للشاشة الرئيسية' من قائمة المتصفح.")}
          </span>
        </div>
      </div>
    </div>
  );
}
