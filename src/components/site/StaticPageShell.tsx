import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { SEO } from "@/components/SEO";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SideMenu } from "@/components/site/SideMenu";

interface Props {
  title: string;
  description: string;
  path: string;
  heading: string;
  intro?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  children: ReactNode;
}

export function StaticPageShell({ title, description, path, heading, intro, jsonLd, children }: Props) {
  const { t, dir, lang } = useLocale();
  const navigate = useNavigate();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div dir={dir} className="min-h-[100dvh] bg-background text-foreground overflow-x-hidden">
      <SEO
        title={title}
        description={description}
        path={path}
        lang={lang === "ar" ? "ar" : "en"}
        jsonLd={jsonLd}
      />
      <div
        className="mx-auto w-full max-w-3xl px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
        }}
      >
        <header className="flex items-center justify-between gap-2 mb-4">
          <button
            onClick={() => navigate(-1)}
            aria-label={t("Back", "رجوع")}
            className="h-11 px-3.5 rounded-xl glass shadow-sm flex items-center gap-1.5 text-xs font-semibold hover:scale-105 transition"
            style={{ touchAction: "manipulation" }}
          >
            <BackIcon className="h-4 w-4" />
            {t("Back", "رجوع")}
          </button>
          <SideMenu />
        </header>


        <section className="mb-6">
          <h1 className="font-display text-xl md:text-3xl font-bold leading-tight">{heading}</h1>
          {intro && (
            <p className="mt-2 text-[13px] md:text-sm leading-relaxed text-foreground/70 break-words">{intro}</p>
          )}
        </section>

        <main className="space-y-4">{children}</main>

        <SiteFooter />
      </div>
    </div>
  );
}

export function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon?: React.ElementType;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-foreground/10 bg-card/60 p-4 backdrop-blur">
      <h2 className="flex items-center gap-2 font-display text-base font-bold">
        {Icon && (
          <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-accent/15 text-accent">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 break-words">{title}</span>
      </h2>
      <div className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-foreground/75 break-words">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 ps-4 list-disc marker:text-accent">
      {items.map((i) => (
        <li key={i} className="break-words">{i}</li>
      ))}
    </ul>
  );
}
