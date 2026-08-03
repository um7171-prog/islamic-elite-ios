import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Heart, Compass, BookMarked, CloudSun, Bell, Radar, Languages, ScanLine, ScanText } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { AthkarDialog } from "./AthkarDialog";
import { QiblaDialog } from "./QiblaDialog";
import { QuranDialog } from "./QuranDialog";
import { WeatherDialog } from "./WeatherDialog";
import { NotificationsDialog } from "./NotificationsDialog";
import { TranslatorDialog } from "./TranslatorDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TasbeehWidget } from "./TasbeehWidget";
import { QRScannerDialog } from "./QRScannerDialog";
import { DocumentScannerDialog } from "./DocumentScannerDialog";
import type { AthanSettings } from "@/lib/athanSettings";

interface Service { key: string; en: string; ar: string; Icon: React.ElementType; gradient: string; }

const SERVICES: Service[] = [
  { key: "athkar",  en: "Athkar",  ar: "الأذكار", Icon: Heart,      gradient: "linear-gradient(135deg, hsl(158 70% 35%), hsl(168 75% 45%))" },
  { key: "tasbeeh", en: "Tasbeeh", ar: "السبحة",  Icon: BookMarked, gradient: "linear-gradient(135deg, hsl(42 85% 55%), hsl(38 90% 65%))" },
  { key: "qibla",   en: "Qibla",   ar: "القبلة",  Icon: Compass,    gradient: "linear-gradient(135deg, hsl(200 70% 45%), hsl(195 80% 60%))" },
  { key: "translate", en: "Translate", ar: "ترجمة", Icon: Languages, gradient: "linear-gradient(135deg, hsl(190 75% 40%), hsl(160 70% 50%))" },
  { key: "quran",   en: "Quran",   ar: "المصحف",  Icon: BookOpen,   gradient: "linear-gradient(135deg, hsl(280 50% 40%), hsl(260 60% 55%))" },
  { key: "weather", en: "Weather", ar: "الطقس",   Icon: CloudSun,   gradient: "linear-gradient(135deg, hsl(28 85% 55%), hsl(40 90% 65%))" },
  { key: "alerts",  en: "Alerts",  ar: "الإشعارات", Icon: Bell,    gradient: "linear-gradient(135deg, hsl(0 70% 50%), hsl(15 80% 60%))" },
  { key: "scanner", en: "QR", ar: "QR", Icon: ScanLine, gradient: "linear-gradient(135deg, hsl(220 70% 45%), hsl(260 70% 55%))" },
  { key: "docscan", en: "Docs", ar: "مستندات", Icon: ScanText, gradient: "linear-gradient(135deg, hsl(180 65% 40%), hsl(200 70% 55%))" },
];

interface Props {
  athanSettings: AthanSettings;
  onAthanChange: (s: AthanSettings) => void;
  scheduledCount: number;
  initialOpen?: string | null;
}

export function QuickServices({ athanSettings, onAthanChange, scheduledCount, initialOpen = null }: Props) {
  const { t, dir } = useLocale();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(initialOpen);

  useEffect(() => {
    if (initialOpen) setOpen(initialOpen);
  }, [initialOpen]);

  const onTap = (s: Service) => {
    if (s.key === "quran") { navigate("/mushaf"); return; }
    setOpen(s.key);
  };


  return (
    <>
      <div dir={dir} className="grid grid-cols-4 gap-3">
        {SERVICES.map((s) => (
          <button key={s.key} onClick={() => onTap(s)} className="flex flex-col items-center gap-1.5 group">
            <span className="relative h-14 w-14 rounded-full grid place-items-center text-accent-foreground shadow-lg transition-transform group-active:scale-95 group-hover:scale-105"
              style={{ background: s.gradient, boxShadow: "var(--shadow-glow-gold)" }}>
              <s.Icon className="h-6 w-6" />
              {s.key === "weather" && (
                <span className="absolute -top-1 -end-1 h-5 w-5 rounded-full grid place-items-center bg-emerald-500 text-white shadow-md ring-2 ring-background">
                  <Radar className="h-3 w-3" />
                  <span className="absolute inset-0 rounded-full bg-emerald-400/70 animate-ping" />
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium text-foreground/80">{t(s.en, s.ar)}</span>
          </button>
        ))}
      </div>
      <AthkarDialog open={open === "athkar"} onOpenChange={(v) => !v && setOpen(null)} />
      <QiblaDialog open={open === "qibla"} onOpenChange={(v) => !v && setOpen(null)} />
      <TranslatorDialog open={open === "translate"} onOpenChange={(v) => !v && setOpen(null)} hideTrigger />
      <QuranDialog open={open === "quran"} onOpenChange={(v) => !v && setOpen(null)} />
      <WeatherDialog open={open === "weather"} onOpenChange={(v) => !v && setOpen(null)} />
      <QRScannerDialog open={open === "scanner"} onOpenChange={(v) => !v && setOpen(null)} />
      <DocumentScannerDialog open={open === "docscan"} onOpenChange={(v) => !v && setOpen(null)} />
      <NotificationsDialog
        open={open === "alerts"}
        onOpenChange={(v) => !v && setOpen(null)}
        settings={athanSettings}
        onSettingsChange={onAthanChange}
        scheduledCount={scheduledCount}
      />
      <Dialog open={open === "tasbeeh"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md p-0 border-0 bg-transparent shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("Digital Tasbeeh", "السبحة الرقمية")}</DialogTitle>
          </DialogHeader>
          <TasbeehWidget />
        </DialogContent>
      </Dialog>
    </>
  );
}
