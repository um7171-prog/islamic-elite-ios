import { Link } from "react-router-dom";
import { Mail, MessageCircle, Send, Phone } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp } from "@/lib/platform";

export const SITE_EMAIL = "support@techsnds.com";
export const SITE_PHONE = "966568729799";

export function SiteFooter() {
  const { t, dir } = useLocale();
  const year = new Date().getFullYear();
  const iosNative = isIOSNativeApp();

  const legal = [
    { to: "/about", label: t("About Us", "من نحن") },
    { to: "/privacy", label: t("Privacy Policy", "سياسة الخصوصية") },
    { to: "/terms", label: t("Terms of Use", "شروط الاستخدام") },
    { to: "/cookies", label: t("Cookie Policy", "سياسة ملفات تعريف الارتباط") },
    { to: "/disclaimer", label: t("Disclaimer", "إخلاء المسؤولية") },
    { to: "/faq", label: t("FAQ", "الأسئلة الشائعة") },
    { to: "/sitemap", label: t("Sitemap", "خريطة الموقع") },
    { to: "/contact", label: t("Contact Us", "اتصل بنا") },
  ];

  const sections = [
    { to: "/", label: t("Home", "الرئيسية") },
    { to: "/tools", label: t("My Tools", "أدواتي") },
    ...(!iosNative ? [{ to: "/media", label: t("Media", "الوسائط") }] : []),
    { to: "/ai", label: t("AI Tools", "أدوات الذكاء") },
    { to: "/mushaf", label: t("Mushaf", "المصحف") },
  ];

  return (
    <footer dir={dir} className="mt-8 border-t border-foreground/10 pt-6 pb-24 text-foreground/70">
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="min-w-0">
          <div className="font-display text-sm font-bold text-foreground">
            {t("Elite Islamic — TechSNDS", "النخبة الإسلامية — TechSNDS")}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed break-words">
            {t(
              "A free Arabic platform for smart digital, AI and Islamic tools.",
              "منصة عربية مجانية للأدوات الرقمية الذكية والذكاء الاصطناعي والأدوات الإسلامية.",
            )}
          </p>
        </div>

        <nav aria-label={t("Sections", "الأقسام")} className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/50">
            {t("Sections", "الأقسام")}
          </h2>
          <ul className="mt-2 space-y-1.5 text-[12px]">
            {sections.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-accent transition">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("Legal", "روابط مهمة")} className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/50">
            {t("Legal", "روابط مهمة")}
          </h2>
          <ul className="mt-2 space-y-1.5 text-[12px]">
            {legal.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-accent transition">{l.label}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <a
              href={`mailto:${SITE_EMAIL}`}
              aria-label={t("Email", "البريد الإلكتروني")}
              className="h-11 w-11 grid place-items-center rounded-xl glass hover:text-accent transition"
            >
              <Mail className="h-4 w-4" />
            </a>
            <a
              href={`https://wa.me/${SITE_PHONE}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("WhatsApp", "واتساب")}
              className="h-11 w-11 grid place-items-center rounded-xl glass hover:text-accent transition"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <a
              href={`sms:+${SITE_PHONE}`}
              aria-label={t("SMS", "رسالة نصية")}
              className="h-11 w-11 grid place-items-center rounded-xl glass hover:text-accent transition"
            >
              <Send className="h-4 w-4" />
            </a>
            <a
              href={`tel:+${SITE_PHONE}`}
              aria-label={t("Call", "اتصال")}
              className="h-11 w-11 grid place-items-center rounded-xl glass hover:text-accent transition"
            >
              <Phone className="h-4 w-4" />
            </a>
          </div>
        </nav>
      </div>

      <div className="mt-6 border-t border-foreground/10 pt-3 text-center text-[11px] text-foreground/50">
        © {year} TechSNDS. {t("All rights reserved.", "جميع الحقوق محفوظة.")}
      </div>
    </footer>
  );
}
