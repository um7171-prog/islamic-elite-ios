import { Menu, Home, LayoutGrid, Download, Bot, BookOpen, Settings as SettingsIcon, Info, Shield, FileText, Mail, Cookie, AlertTriangle, HelpCircle, Map, Briefcase, Landmark, Repeat } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp } from "@/lib/platform";

export function SideMenu() {
  const { t, dir } = useLocale();
  const [open, setOpen] = useState(false);
  const iosNative = isIOSNativeApp();

  const groups: { title: string; items: { to: string; label: string; Icon: React.ElementType }[] }[] = [
    {
      title: t("Browse", "التصفح"),
      items: [
        { to: "/", label: t("Home", "الرئيسية"), Icon: Home },
        { to: "/convert", label: t("File Converter", "تحويل الملفات"), Icon: Repeat },
        { to: "/tools", label: t("My Tools", "أدواتي"), Icon: LayoutGrid },
        ...(!iosNative ? [
          { to: "/media", label: t("Media", "الوسائط"), Icon: Download },
        ] : []),
        { to: "/ai", label: t("AI Tools", "أدوات الذكاء"), Icon: Bot },
        { to: "/mushaf", label: t("Mushaf", "المصحف"), Icon: BookOpen },
        { to: "/saudi-jobs", label: t("Saudi Jobs", "وظائف السعودية"), Icon: Briefcase },
        { to: "/government-jobs", label: t("Government Jobs", "الوظائف الحكومية"), Icon: Landmark },
        { to: "/settings", label: t("Settings", "الإعدادات"), Icon: SettingsIcon },
      ],
    },
    {
      title: t("Information", "معلومات"),
      items: [
        { to: "/about", label: t("About Us", "من نحن"), Icon: Info },
        { to: "/privacy", label: t("Privacy Policy", "سياسة الخصوصية"), Icon: Shield },
        { to: "/terms", label: t("Terms of Use", "شروط الاستخدام"), Icon: FileText },
        { to: "/cookies", label: t("Cookie Policy", "سياسة ملفات تعريف الارتباط"), Icon: Cookie },
        { to: "/disclaimer", label: t("Disclaimer", "إخلاء المسؤولية"), Icon: AlertTriangle },
        { to: "/faq", label: t("FAQ", "الأسئلة الشائعة"), Icon: HelpCircle },
        { to: "/sitemap", label: t("Sitemap", "خريطة الموقع"), Icon: Map },
        { to: "/contact", label: t("Contact Us", "اتصل بنا"), Icon: Mail },
      ],
    },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label={t("Menu", "القائمة")}
          title={t("Menu", "القائمة")}
          className="h-11 w-11 rounded-xl glass shadow-sm grid place-items-center transition hover:scale-105"
          style={{ touchAction: "manipulation" }}
        >
          <Menu className="h-5 w-5 text-foreground/80" />
        </button>
      </SheetTrigger>
      <SheetContent side={dir === "rtl" ? "right" : "left"} className="w-[82vw] max-w-xs overflow-y-auto" dir={dir}>
        <SheetHeader className="text-start">
          <SheetTitle className="font-display">{t("Elite Islamic", "النخبة الإسلامية")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/50">{g.title}</h3>
              <ul className="space-y-1">
                {g.items.map((it) => (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-foreground/5 transition"
                    >
                      <it.Icon className="h-4 w-4 text-accent shrink-0" />
                      <span className="min-w-0 truncate">{it.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
