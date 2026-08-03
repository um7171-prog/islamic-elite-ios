import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, AD_SLOTS, type AdSlotKey } from "@/lib/adsConfig";

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
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!slotId || pushed.current || !insRef.current) return;
    pushed.current = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      /* ad blocker or script not loaded — ignore */
    }
  }, [slotId]);

  if (!slotId) return null;

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
