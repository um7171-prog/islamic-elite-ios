import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

interface Props {
  title: string;
  subtitle?: string;
  Icon: React.ElementType;
  gradient: string;
  children: React.ReactNode;
}

/** Dedicated full-screen shell for every AI tool page. */
export function AiToolPage({ title, subtitle, Icon, gradient, children }: Props) {
  const { dir, t } = useLocale();
  const navigate = useNavigate();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div dir={dir} className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header
        className="sticky top-0 z-30 border-b border-foreground/10 bg-background/85 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/ai")}
            aria-label={t("Back", "رجوع")}
            className="h-11 w-11 shrink-0 rounded-2xl glass grid place-items-center transition active:scale-95"
          >
            <BackIcon className="h-5 w-5 text-accent" />
          </button>
          <span
            className="h-11 w-11 shrink-0 rounded-2xl grid place-items-center text-accent-foreground shadow-md"
            style={{ background: gradient }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[15px] font-bold leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-foreground/60 leading-tight truncate">{subtitle}</p>}
          </div>
        </div>
      </header>

      <main
        className="flex-1 mx-auto w-full max-w-4xl px-4 pt-4 animate-fade-in"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2rem)" }}
      >
        {children}
      </main>
    </div>
  );
}
