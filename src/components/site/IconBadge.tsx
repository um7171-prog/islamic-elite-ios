import type { ElementType } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-10 w-10", icon: "h-[18px] w-[18px]" },
  md: { box: "h-12 w-12", icon: "h-5 w-5" },
  lg: { box: "h-14 w-14", icon: "h-6 w-6" },
} as const;

/**
 * The one icon container used across the app (Home shortcuts, Services, lists):
 * a deep-emerald disc with a thin gold ring and a gold glyph. `soft` is the
 * quiet variant for dense rows (pale surface, emerald glyph).
 */
export function IconBadge({
  icon: Icon,
  size = "md",
  tone = "emerald",
  className,
}: {
  icon: ElementType;
  size?: keyof typeof SIZES;
  tone?: "emerald" | "soft";
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        s.box,
        tone === "emerald"
          ? "bg-[hsl(var(--header-a))] text-[hsl(var(--elite-gold-end))] ring-[1.5px] ring-inset ring-[hsl(var(--elite-gold-start)/0.85)]"
          : "bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon className={s.icon} strokeWidth={1.9} />
    </span>
  );
}
