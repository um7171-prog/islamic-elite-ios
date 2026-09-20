import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";

/**
 * Full-screen sheet with the same emerald header as every inner page (Back at
 * the start, bilingual title). Used for tools that open over the Services grid
 * (Athkar…) so they look like the rest of the app instead of a small popup.
 */
export function FullScreenDialog({
  open,
  onOpenChange,
  titleAr,
  titleEn,
  action,
  extra,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleAr: string;
  titleEn: string;
  action?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const { t, dir, lang } = useLocale();
  const Chevron = dir === "rtl" ? ChevronRight : ChevronLeft;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        aria-describedby={undefined}
        className="!left-0 !top-0 !flex h-[100dvh] !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:!rounded-none [&>button]:hidden"
      >
        <DialogDescription className="sr-only">{lang === "ar" ? titleAr : titleEn}</DialogDescription>
        <div className="bg-header shrink-0 rounded-b-[28px] px-4 pb-5" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
          <div className="mx-auto grid max-w-2xl grid-cols-[44px_1fr_44px] items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("Back", "رجوع")}
              data-testid="dialog-back"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white outline-none transition focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-0 active:scale-95"
            >
              <Chevron className="h-6 w-6" />
            </button>
            <div className="min-w-0 text-center">
              <DialogTitle className="truncate text-center font-display text-h2 font-bold leading-tight text-white">
                {lang === "ar" ? titleAr : titleEn}
              </DialogTitle>
              {lang === "ar" && (
                <p className="truncate text-body-sm leading-tight text-white/70" dir="ltr">
                  {titleEn}
                </p>
              )}
            </div>
            <div className="flex justify-end">{action}</div>
          </div>
          {extra && <div className="mx-auto mt-4 max-w-2xl">{extra}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 pb-24 pt-5">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
