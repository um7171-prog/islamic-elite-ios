import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AdSlot } from "@/components/ads/AdSlot";
import type { AdSlotKey } from "@/lib/adsConfig";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp } from "@/lib/platform";

interface Props {
  open: boolean;
  slot: AdSlotKey;
  /** Called when the user closes it, or immediately if it can't be shown. */
  onClose: () => void;
  /** Seconds before the close button becomes active. */
  delay?: number;
}

/**
 * Lightweight interstitial: a full-screen overlay hosting one AdSense unit.
 * It always ends: the close button unlocks after `delay` seconds no matter what
 * the ad network does, so no tool can ever be blocked.
 */
export function InterstitialAd({ open, slot, onClose, delay = 3 }: Props) {
  const { t, dir } = useLocale();
  const iosNative = isIOSNativeApp();
  const [left, setLeft] = useState(delay);

  useEffect(() => {
    if (!open || iosNative) return;
    setLeft(delay);
    const id = window.setInterval(() => {
      setLeft((v) => (v <= 1 ? (window.clearInterval(id), 0) : v - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, delay, iosNative]);

  useEffect(() => {
    if (open && iosNative) onClose();
  }, [open, iosNative, onClose]);

  if (!open || iosNative) return null;

  return (
    <div dir={dir} className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col animate-fade-in">
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
        <span className="text-[11px] font-semibold text-foreground/50">{t("Advertisement", "إعلان")}</span>
        <button
          type="button"
          onClick={onClose}
          disabled={left > 0}
          className="h-9 min-w-9 px-3 rounded-xl glass text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          {left > 0 ? `${left}` : t("Close", "إغلاق")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <AdSlot slot={slot} />
      </div>
    </div>
  );
}
