import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { IconBadge } from "@/components/site/IconBadge";
import { SEO } from "@/components/SEO";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SERVICE_TOOLS } from "@/components/services/ServicesHub";

// Order shown in the list (only tools that really exist in Services).
const ORDER = ["age", "inheritance", "zakat", "commission", "loan", "currency", "units", "retirement"];

/**
 * Calculators list (Home "Tools" / Services): one row per calculator, opening
 * the same calculator components the Services grid uses — no logic changes.
 * The Hijri/Gregorian converter has its own screen.
 */
export default function CalculatorsPage() {
  const { t, lang, dir } = useLocale();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  const tools = ORDER.map((id) => SERVICE_TOOLS.find((x) => x.id === id && x.action.kind === "inline")).filter(
    (x): x is NonNullable<typeof x> => !!x,
  );
  const active = tools.find((x) => x.id === openId) ?? null;
  const render = active && active.action.kind === "inline" ? active.action.render : null;

  const rowCls = "flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-start transition active:bg-foreground/[0.04]";

  return (
    <PageShell titleAr="الحاسبات" titleEn="Calculators" fallback="/tools">
      <SEO
        title={t("Calculators — Elite Islamic", "الحاسبات — النخبة الإسلامية")}
        description={t("Age, inheritance, zakat, loans, currency, units and more.", "حاسبة العمر والمواريث والزكاة والتمويل والعملات والوحدات وأكثر.")}
        path="/calculators"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <ul className="glass overflow-hidden rounded-2xl divide-y divide-foreground/[0.07]" data-testid="calc-list">
        {tools.map((tool) => (
          <li key={tool.id}>
            <button type="button" className={rowCls} data-calc-id={tool.id} onClick={() => setOpenId(tool.id)}>
              <IconBadge icon={tool.Icon} size="md" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-body font-semibold">{t(tool.en, tool.ar)}</span>
                {lang === "ar" && (
                  <span className="block text-[12px] text-foreground/55" dir="ltr">
                    {tool.en}
                  </span>
                )}
              </span>
              <Chevron className="h-5 w-5 shrink-0 text-foreground/35" />
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={rowCls} data-calc-id="date-converter" onClick={() => navigate("/date-converter")}>
            <IconBadge icon={SERVICE_TOOLS.find((x) => x.id === "hijri")?.Icon ?? LayoutGrid} size="md" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-body font-semibold">{t("Date converter", "تحويل التاريخ")}</span>
              {lang === "ar" && (
                <span className="block text-[12px] text-foreground/55" dir="ltr">
                  Date converter
                </span>
              )}
            </span>
            <Chevron className="h-5 w-5 shrink-0 text-foreground/35" />
          </button>
        </li>
        <li>
          <button type="button" className={rowCls} data-calc-id="more" onClick={() => navigate("/tools")}>
            <IconBadge icon={LayoutGrid} size="md" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-body font-semibold">{t("More tools", "المزيد من الأدوات")}</span>
              {lang === "ar" && (
                <span className="block text-[12px] text-foreground/55" dir="ltr">
                  More tools
                </span>
              )}
            </span>
            <Chevron className="h-5 w-5 shrink-0 text-foreground/35" />
          </button>
        </li>
      </ul>

      <Dialog open={!!active} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent dir={dir} className="w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-5 pb-3 pt-5">
            <DialogTitle className="flex items-center gap-2.5 text-h3">
              {active && <IconBadge icon={active.Icon} size="sm" />}
              <span>{active ? t(active.en, active.ar) : ""}</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[72vh]">
            <div className="p-5">{render?.()}</div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
