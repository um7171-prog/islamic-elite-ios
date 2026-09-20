import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

interface HeaderProps {
  /** Arabic title (shown large in Arabic UI). */
  titleAr: string;
  /** English title (large in English UI; small subtitle under the Arabic title). */
  titleEn: string;
  /** Where "back" goes when the page was opened directly (no history). */
  fallback?: string;
  /** Optional trailing control (icon button, "Save"…). */
  action?: ReactNode;
  /** Optional block under the title row (city, date…) — same green surface. */
  extra?: ReactNode;
  /** Hide the back button (top-level tabs). */
  hideBack?: boolean;
  className?: string;
}

/** Back that returns to where the user came from; a direct visit (no history)
 * falls back to `fallback`. Shared by every inner page. */
export function useGoBack(fallback = "/") {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}

/**
 * The single page header used by every inner screen: deep-emerald surface with a
 * faint Islamic pattern, Back at the start, a centred bilingual title and an
 * optional action at the end. Arabic UI: Arabic title + English subtitle.
 * English UI: English title only (no Arabic text inside the English UI).
 */
export function PageHeader({ titleAr, titleEn, fallback = "/", action, extra, hideBack, className }: HeaderProps) {
  const { t, dir, lang } = useLocale();
  const goBack = useGoBack(fallback);
  const Chevron = dir === "rtl" ? ChevronRight : ChevronLeft;
  return (
    <header
      className={cn("bg-header rounded-b-[28px] px-4 pb-5 shadow-sm md:px-8", className)}
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
    >
      <div className="mx-auto grid max-w-2xl grid-cols-[44px_1fr_44px] items-center gap-2">
        <div className="flex justify-start">
          {!hideBack && (
            <button
              type="button"
              onClick={goBack}
              aria-label={t("Back", "رجوع")}
              data-testid="page-back"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition active:scale-95"
              style={{ touchAction: "manipulation" }}
            >
              <Chevron className="h-6 w-6" />
            </button>
          )}
        </div>
        <div className="min-w-0 text-center">
          <h1 className="truncate font-display text-h2 font-bold leading-tight text-white">
            {lang === "ar" ? titleAr : titleEn}
          </h1>
          {lang === "ar" && <p className="truncate text-body-sm leading-tight text-white/70" dir="ltr">{titleEn}</p>}
        </div>
        <div className="flex justify-end">{action}</div>
      </div>
      {extra && <div className="mx-auto mt-4 max-w-2xl">{extra}</div>}
    </header>
  );
}

/** Round icon button for the header's `action` slot. */
export function HeaderIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition active:scale-95"
      style={{ touchAction: "manipulation" }}
    >
      {children}
    </button>
  );
}

/** Full inner-page layout: green header + padded content column. */
export function PageShell({
  children,
  contentClassName,
  ...header
}: HeaderProps & { children: ReactNode; contentClassName?: string }) {
  const { dir } = useLocale();
  return (
    <div dir={dir} className="w-full min-w-0 overflow-x-hidden">
      <PageHeader {...header} />
      <div className={cn("mx-auto w-full max-w-2xl min-w-0 px-4 pb-8 pt-5 md:px-8", contentClassName)}>{children}</div>
    </div>
  );
}
