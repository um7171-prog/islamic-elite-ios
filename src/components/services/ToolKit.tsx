import { useMemo, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-label text-foreground/70">{label}</Label>
      {children}
    </div>
  );
}

export function NumberField({
  label, value, onChange, suffix, step = "any", min,
}: { label: string; value: string; onChange: (v: string) => void; suffix?: string; step?: string; min?: number }) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 bg-input/60 border-border/70 text-base font-semibold"
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-caption text-foreground/50">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export function ResultCard({
  title, rows, shareText, highlight,
}: {
  title: string;
  rows: { label: string; value: string; strong?: boolean }[];
  shareText?: string;
  highlight?: string;
}) {
  const { t } = useLocale();
  const text = useMemo(
    () => shareText ?? `${title}\n${rows.map((r) => `${r.label}: ${r.value}`).join("\n")}`,
    [shareText, title, rows],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("Copied", "تم النسخ") });
    } catch {
      toast({ title: t("Copy failed", "تعذر النسخ"), variant: "destructive" });
    }
  };
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, text }); return; } catch { /* cancelled */ }
    }
    copy();
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-label uppercase tracking-widest text-foreground/60">{title}</h4>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copy} aria-label={t("Copy", "نسخ")}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={share} aria-label={t("Share", "مشاركة")}>
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {highlight && (
        <div
          className="rounded-xl px-4 py-3 text-center text-2xl font-extrabold text-accent-foreground"
          style={{ background: "var(--gradient-gold)" }}
        >
          {highlight}
        </div>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-body">
            <span className="text-foreground/60">{r.label}</span>
            <span className={cn("font-semibold tabular-nums", r.strong && "text-primary text-h3")}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useMoneyFormat() {
  const { lang } = useLocale();
  return (n: number, currency = "SAR") =>
    new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
}

export function num(v: string) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function useLocalState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  });
  const set = (v: T) => {
    setState(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
  };
  return [state, set] as const;
}
