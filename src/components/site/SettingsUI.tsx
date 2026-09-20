import type { ElementType, ReactNode } from "react";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";
import { IconBadge } from "@/components/site/IconBadge";

/**
 * Shared "grouped list" building blocks (iOS-style): a small section label above
 * ONE rounded surface whose rows are separated by hairlines. Used by Settings
 * and reusable by any other screen, so lists look the same everywhere instead
 * of being a stack of bordered cards inside cards.
 */

export function SettingsSection({
  title,
  footer,
  children,
  id,
}: {
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-4 space-y-2" aria-labelledby={id ? `${id}-title` : undefined} data-section={id}>
      <h2 id={id ? `${id}-title` : undefined} className="px-2 font-display text-body-sm font-bold text-foreground/60">
        {title}
      </h2>
      {children}
      {footer && <p className="px-2 text-caption leading-relaxed text-foreground/55">{footer}</p>}
    </section>
  );
}

/** The single rounded surface holding a set of rows. */
export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card shadow-sm divide-y divide-foreground/[0.07]",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface RowProps {
  label: string;
  description?: string;
  icon?: ElementType;
  /** Trailing control (switch, segmented control, value text…). */
  children?: ReactNode;
  /** Renders the row as a link with a chevron. */
  to?: string;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "danger";
  /** Put the trailing control on its own line under the label (wide controls). */
  stacked?: boolean;
  /** Current value shown before the chevron (picker rows). */
  value?: string;
  [dataAttr: `data-${string}`]: string | undefined;
}

export function SettingsRow({ label, description, icon: Icon, children, to, href, onClick, tone = "default", stacked, value, ...rest }: RowProps) {
  const dataProps = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("data-")));
  const { dir } = useLocale();
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;
  const interactive = !!(to || href || onClick);
  if (stacked) {
    return (
      <div className="space-y-3 px-4 py-3" {...dataProps}>
        <div className="flex items-center gap-3">
          {Icon && <IconBadge icon={Icon} size="sm" tone="soft" />}
          <span className="min-w-0 flex-1 text-start">
            <span className="block text-body font-medium leading-snug">{label}</span>
            {description && <span className="mt-0.5 block text-caption leading-snug text-foreground/60">{description}</span>}
          </span>
        </div>
        <div>{children}</div>
      </div>
    );
  }
  const inner = (
    <>
      {Icon && <IconBadge icon={Icon} size="sm" tone="soft" />}
      <span className="min-w-0 flex-1 text-start">
        <span className={cn("block text-body font-medium leading-snug", tone === "danger" && "text-destructive")}>{label}</span>
        {description && <span className="mt-0.5 block text-caption leading-snug text-foreground/60">{description}</span>}
      </span>
      {children !== undefined && <span className="flex shrink-0 items-center gap-2">{children}</span>}
      {value !== undefined && children === undefined && (
        <span className="max-w-[45%] shrink-0 truncate text-body-sm text-foreground/60" data-row-value>{value}</span>
      )}
      {interactive && children === undefined && <Chevron className="h-4 w-4 shrink-0 text-foreground/35" />}
    </>
  );
  const cls = cn(
    "flex min-h-[56px] w-full items-center gap-3 px-4 py-3",
    interactive && "transition active:bg-foreground/[0.04] hover:bg-foreground/[0.03]",
  );
  if (to) return <Link to={to} className={cls} {...dataProps}>{inner}</Link>;
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={cls} {...dataProps}>
        {inner}
      </a>
    );
  }
  if (onClick) return <button type="button" onClick={onClick} className={cls} {...dataProps}>{inner}</button>;
  return <div className={cls} {...dataProps}>{inner}</div>;
}

/** Segmented pill control — same look for language, theme, minutes, etc. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  fullWidth,
}: {
  value: T;
  options: { value: T; label: string; icon?: ElementType }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
  fullWidth?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("rounded-xl bg-foreground/[0.06] p-0.5", fullWidth ? "flex w-full" : "inline-flex")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-[10px] px-3 text-body-sm font-medium transition", fullWidth && "flex-1",
              active ? "bg-card text-foreground shadow-sm" : "text-foreground/65 hover:text-foreground",
            )}
          >
            {o.icon && <o.icon className="h-3.5 w-3.5" />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Wrapping chip picker for a single value (minutes, offsets…). */
export function ChipPicker<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-3.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-[40px] min-w-[64px] rounded-xl border px-3.5 text-body-sm transition",
              active
                ? "border-primary bg-primary/12 font-semibold text-primary"
                : "border-foreground/10 text-foreground/75 hover:bg-foreground/[0.04]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Bottom sheet with a single-choice list (language, appearance, madhab…). */
export function OptionSheet<T extends string>({
  open,
  onOpenChange,
  title,
  description,
  value,
  options,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  value: T;
  options: { value: T; label: string; description?: string; leading?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const { dir } = useLocale();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir={dir} className="max-h-[85dvh] overflow-y-auto rounded-t-[28px] border-0 bg-background px-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-foreground/15" />
        <SheetHeader className="px-5 pb-2 text-start">
          <SheetTitle className="font-display text-h3">{title}</SheetTitle>
          <SheetDescription className={description ? "text-body-sm" : "sr-only"}>{description ?? title}</SheetDescription>
        </SheetHeader>
        <div className="mx-4 overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card divide-y divide-foreground/[0.07]" role="radiogroup" aria-label={title}>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                data-option={o.value}
                onClick={() => {
                  onChange(o.value);
                  onOpenChange(false);
                }}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-start transition active:bg-foreground/[0.04]"
              >
                {o.leading}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-body font-medium", active && "text-primary")}>{o.label}</span>
                  {o.description && <span className="mt-0.5 block text-caption text-foreground/60">{o.description}</span>}
                </span>
                <span className="grid h-6 w-6 shrink-0 place-items-center" aria-hidden>
                  {active && <Check className="h-5 w-5 text-primary" />}
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
