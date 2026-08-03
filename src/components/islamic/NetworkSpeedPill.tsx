import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { toArabicDigits } from "@/lib/arabize";

function formatSpeed(bytesPerSec: number, lang: string) {
  let value: number;
  let unit: string;
  if (bytesPerSec >= 1_000_000) {
    value = bytesPerSec / 1_000_000;
    unit = "MB/s";
  } else if (bytesPerSec >= 1000) {
    value = bytesPerSec / 1000;
    unit = "KB/s";
  } else {
    value = bytesPerSec;
    unit = "B/s";
  }
  const num = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  const display = lang === "ar" ? toArabicDigits(num) : num;
  return `${display} ${unit}`;
}

export function NetworkSpeedPill() {
  const { lang } = useLocale();
  const [bps, setBps] = useState<number | null>(null);

  useEffect(() => {
    const conn: any = (navigator as any).connection;
    const update = () => {
      if (conn?.downlink) {
        // downlink is Mbps -> bytes/sec
        setBps(conn.downlink * 125_000);
      }
    };
    update();
    conn?.addEventListener?.("change", update);
    return () => conn?.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const measure = async () => {
      try {
        const url = `/placeholder.svg?cb=${Date.now()}`;
        const t0 = performance.now();
        const res = await fetch(url, { cache: "no-store" });
        const blob = await res.blob();
        const dt = (performance.now() - t0) / 1000;
        if (!cancelled && dt > 0 && blob.size > 0) {
          setBps(blob.size / dt);
        }
      } catch {
        /* ignore */
      }
    };
    measure();
    const id = setInterval(measure, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (bps == null) return null;

  return (
    <div
      dir="ltr"
      className="inline-flex items-center gap-1 rounded-full glass px-3 py-1 text-xs font-semibold text-emerald-400 tabular-nums"
      style={{ unicodeBidi: "isolate" }}
    >
      <span>{formatSpeed(bps, lang)}</span>
      <ArrowDown className="h-3 w-3" />
    </div>
  );
}
