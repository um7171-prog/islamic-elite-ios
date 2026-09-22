import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, AD_SLOTS, type AdSlotKey } from "@/lib/adsConfig";
import { isIOSNativeApp } from "@/lib/platform";
import { isAdsEnabled } from "@/lib/adsConfig";

interface Props {
  slot: AdSlotKey;
  className?: string;
  /** AdSense format; responsive by default. */
  format?: string;
}

/**
 * Plain, static responsive AdSense banner.
 * It never blocks, gates or delays any tool: it simply requests an ad once on
 * mount. If nothing fills, the container stays empty and harmless.
 */
export function AdSlot({ slot, className = "", format = "auto" }: Props) {
  const slotId = AD_SLOTS[slot];
  const iosNative = isIOSNativeApp();
  const enabled = isAdsEnabled();
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (iosNative || !enabled || !slotId || pushed.current || !insRef.current) return;

    const pushAd = () => {
      if (pushed.current) return;
      pushed.current = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch {
        /* ad blocker or script not loaded — ignore */
      }
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-elite-adsense="1"]');
    if (existing) {
      if (existing.dataset.loaded === "1") pushAd();
      else existing.addEventListener("load", pushAd, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.crossOrigin = "anonymous";
    script.dataset.eliteAdsense = "1";
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      pushAd();
    }, { once: true });
    document.head.appendChild(script);
  }, [iosNative, enabled, slotId]);

  if (iosNative || !enabled || !slotId) return null;

  return (
    <div className={`w-full my-3 ${className}`}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
