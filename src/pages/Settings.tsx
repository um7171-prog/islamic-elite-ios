import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Globe,
  Moon,
  Sun,
  Monitor,
  MapPin,
  BookOpen,
  Bell,
  BellRing,
  Check,
  ChevronDown,
  MessageCircle,
  Phone,
  Mail,
  Send,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLocale } from "@/contexts/LocaleContext";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc, type MadhabId } from "@/contexts/PrayerCalcContext";
import { CitySelector } from "@/components/islamic/CitySelector";
import { NotificationSettingsSection } from "@/components/notifications/NotificationSettingsSection";
import { SEO } from "@/components/SEO";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { isIOSNativeApp } from "@/lib/platform";
import { getAnnouncementPushEnabled, setAnnouncementPushEnabled } from "@/lib/pushDevice";
import { getAppVersion, type AppVersionInfo } from "@/lib/appVersion";

const MADHABS: { id: MadhabId; en: string; ar: string; note: { en: string; ar: string } }[] = [
  { id: "hanbali", en: "Hanbali", ar: "الحنبلي", note: { en: "Umm Al-Qura default", ar: "أم القرى (الافتراضي)" } },
  { id: "shafi",   en: "Shafi'i", ar: "الشافعي", note: { en: "Standard Asr", ar: "العصر القياسي" } },
  { id: "maliki",  en: "Maliki",  ar: "المالكي", note: { en: "Standard Asr", ar: "العصر القياسي" } },
  { id: "hanafi",  en: "Hanafi",  ar: "الحنفي",  note: { en: "Later Asr time", ar: "وقت العصر متأخر" } },
];


function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-accent/15 text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-h3 text-elite-gold">{title}</h2>
          {subtitle && <p className="text-caption text-foreground/60">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Small uppercase group label, matching the same style already used for
 * "Quick Access" / "Services" on the Home page — purely a visual grouping
 * aid for the sections below it, no behavior change. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-label uppercase tracking-[0.2em] text-foreground/50 px-1 pt-1">
      {children}
    </h2>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 p-3">
      <div className="min-w-0">
        <div className="text-body font-medium">{label}</div>
        {description && <div className="text-caption text-foreground/60 leading-relaxed">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { t, dir, lang, setLang } = useLocale();
  const { mode, setMode, theme } = useTheme();
  const { city } = useCity();
  const { madhab, setMadhab } = usePrayerCalc();
  const [announcementPush, setAnnouncementPush] = useState(() => getAnnouncementPushEnabled());
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const nativeApp = isIOSNativeApp();

  useEffect(() => {
    void getAppVersion().then(setVersionInfo);
  }, []);

  const themeModes: { id: ThemeMode; label: string; Icon: React.ElementType }[] = [
    { id: "system", label: t("System", "تلقائي"), Icon: Monitor },
    { id: "light",  label: t("Day", "نهاري"),    Icon: Sun },
    { id: "night",  label: t("Night", "ليلي"),   Icon: Moon },
  ];

  return (
    <div
      dir={dir}
      className="w-full max-w-3xl min-w-0 overflow-x-hidden px-4 pb-10 md:px-8 mx-auto"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)" }}
    >
      <SEO
        title="الإعدادات — النخبة الإسلامية"
        description="إعدادات التطبيق: اللغة، المظهر، المدينة، طريقة الحساب، الأذان، والإشعارات."
        path="/settings"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <header className="flex items-center gap-3 mb-5">
        <Link
          to="/"
          aria-label={t("Back", "رجوع")}
          className="h-9 w-9 rounded-xl glass grid place-items-center hover:scale-105 transition"
        >
          <ArrowLeft className={`h-4 w-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
        </Link>
        <div>
          <h1 className="font-display text-h2">{t("Settings", "الإعدادات")}</h1>
          <p className="text-caption text-foreground/60">
            {t("Changes save automatically", "يتم الحفظ تلقائياً")}
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {/* ===== 1. General — language, appearance, location ===== */}
        <GroupLabel>{t("General", "عام")}</GroupLabel>
        <Section
          icon={Globe}
          title={t("Account & App", "الحساب والتطبيق")}
          subtitle={t("Language and appearance", "اللغة والمظهر")}
        >
          <Row label={t("Language", "اللغة")} description={t("Interface language", "لغة الواجهة")}>
            <div className="inline-flex rounded-lg border border-foreground/10 overflow-hidden">
              {(["ar", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1.5 text-body-sm font-medium transition ${
                    lang === l ? "bg-accent text-accent-foreground" : "text-foreground/70 hover:bg-foreground/5"
                  }`}
                >
                  {l === "ar" ? "العربية" : "English"}
                </button>
              ))}
            </div>
          </Row>

          <Row
            label={t("Theme", "المظهر")}
            description={t("Follow system, or pin Day/Night", "اتبع النظام أو ثبّت يومي/ليلي")}
          >
            <div className="inline-flex rounded-lg border border-foreground/10 overflow-hidden">
              {themeModes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`px-2.5 py-1.5 text-body-sm font-medium inline-flex items-center gap-1 transition ${
                    mode === m.id ? "bg-accent text-accent-foreground" : "text-foreground/70 hover:bg-foreground/5"
                  }`}
                  aria-label={m.label}
                >
                  <m.Icon className="h-3.5 w-3.5" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section
          icon={MapPin}
          title={t("Location", "الموقع")}
          subtitle={t("Used to calculate prayer times and the Qibla direction", "يُستخدم لحساب مواقيت الصلاة واتجاه القبلة")}
        >
          <Row label={t("City", "المدينة")} description={lang === "ar" ? city.ar : city.en}>
            <CitySelector compact />
          </Row>
        </Section>

        {/* ===== 2. Prayer — calculation method + Athan notifications ===== */}
        <GroupLabel>{t("Prayer", "الصلاة")}</GroupLabel>
        <Section
          icon={BookOpen}
          title={t("Calculation Method", "طريقة الحساب")}
          subtitle={t("Madhab used for Asr timing", "المذهب المعتمد لوقت العصر")}
        >
          <div className="grid grid-cols-2 gap-2">
            {MADHABS.map((m) => {
              const active = madhab === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMadhab(m.id)}
                  className={`text-start rounded-lg border p-2.5 transition ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-foreground/10 hover:bg-foreground/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-body font-medium">{t(m.en, m.ar)}</span>
                    {active && <Check className="h-4 w-4 text-accent" />}
                  </div>
                  <div className="text-caption text-foreground/60 mt-0.5">{t(m.note.en, m.note.ar)}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Built fresh for the new notification system (src/lib/notifications/)
            — status, per-prayer toggles, pre-prayer reminder, Athan sound,
            Athkar (Morning/Evening), calendar reminders note, and a real
            test button, all in one place per the current design. */}
        <Section
          icon={Bell}
          title={t("Notifications", "الإشعارات")}
          subtitle={t("Prayer, Athkar and appointment alerts — all local, on-device", "تنبيهات الصلاة والأذكار والمواعيد — جميعها محلية من الجهاز")}
        >
          <NotificationSettingsSection />
        </Section>

        {/* ===== 3. App — real app-behavior settings only (native-only today) ===== */}
        {nativeApp && (
          <>
            <GroupLabel>{t("App", "التطبيق")}</GroupLabel>
            <Section
              icon={BellRing}
              title={t("App Announcements", "إعلانات التطبيق")}
              subtitle={t("Remote push from the app administrator — separate from Athan alerts", "إشعارات عن بُعد من إدارة التطبيق — منفصلة عن تنبيهات الأذان")}
            >
              <Row
                label={t("App announcements", "إعلانات وتنبيهات التطبيق")}
                description={t(
                  "Optional remote announcements from the app administrator (requires internet). Unrelated to prayer-time alerts. You can turn them off anytime.",
                  "إشعارات إدارية اختيارية عن بُعد (تحتاج إنترنت)، ولا علاقة لها بتنبيهات مواقيت الصلاة. يمكنك إيقافها في أي وقت.",
                )}
              >
                <Switch
                  checked={announcementPush}
                  onCheckedChange={async (next) => {
                    setAnnouncementPush(next);
                    await setAnnouncementPushEnabled(next);
                  }}
                />
              </Row>
            </Section>
          </>
        )}

        {/* ===== 4. Support & info ===== */}
        <GroupLabel>{t("Support & Info", "الدعم والمعلومات")}</GroupLabel>
        {/* Contact Us */}
        <Section
          icon={MessageCircle}
          title={t("Contact Us", "تواصل معنا")}
          subtitle={t("Direct channels for support & feedback", "قنوات مباشرة للدعم والملاحظات")}
        >
          {(() => {
            const phone = "966568729799";
            const waMsg = encodeURIComponent(
              t("Hello, I need help with the app.", "السلام عليكم، أحتاج مساعدة بخصوص التطبيق."),
            );
            const channels = [
              {
                key: "whatsapp",
                label: t("WhatsApp", "واتساب"),
                value: "+966 56 872 9799",
                href: `https://wa.me/${phone}?text=${waMsg}`,
                Icon: MessageCircle,
                color: "hsl(142 70% 45%)",
              },
              {
                key: "call",
                label: t("Call", "اتصال مباشر"),
                value: "+966 56 872 9799",
                href: `tel:+${phone}`,
                Icon: Phone,
                color: "hsl(200 80% 50%)",
              },
              {
                key: "sms",
                label: t("SMS", "رسالة نصية"),
                value: "+966 56 872 9799",
                href: `sms:+${phone}`,
                Icon: Send,
                color: "hsl(280 60% 55%)",
              },
              {
                key: "email",
                label: t("Email", "البريد"),
                value: "support@techsnds.com",
                href: "mailto:support@techsnds.com",
                Icon: Mail,
                color: "hsl(28 85% 55%)",
              },
            ];
            return (
              <div className="grid grid-cols-1 gap-2">
                {channels.map((c) => (
                  <a
                    key={c.key}
                    href={c.href}
                    target={c.key === "whatsapp" ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-foreground/10 p-3 hover:bg-foreground/5 active:scale-[0.98] transition"
                  >
                    <span
                      className="h-10 w-10 rounded-xl grid place-items-center text-white shrink-0"
                      style={{ background: c.color }}
                    >
                      <c.Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-medium">{c.label}</div>
                      <div className="text-caption text-foreground/60 truncate" dir="ltr">
                        {c.value}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            );
          })()}
        </Section>

        {/* Advanced / technical settings — diagnostics for developers, not
            meant for everyday use. Collapsed by default and placed last so
            it doesn't compete with the settings a regular user actually
            needs; its logic (runNotificationTest) is unchanged, just moved
            out of the main "App Announcements" section it used to share. */}
        <Collapsible className="glass rounded-2xl p-5">
            <CollapsibleTrigger className="flex w-full items-center gap-3 text-start [&[data-state=open]>svg]:rotate-180">
              <div className="h-10 w-10 rounded-xl grid place-items-center bg-foreground/10 text-foreground/60 shrink-0">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-h3 text-foreground/80">{t("Advanced Settings", "إعدادات متقدمة")}</h2>
                <p className="text-caption text-foreground/60">{t("Technical diagnostics — not needed for everyday use", "تشخيص تقني — غير مطلوب للاستخدام اليومي")}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-foreground/50 transition-transform shrink-0" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-4">
              {/* Lets a real-device tester verify the installed IPA actually came
                  from the expected commit/branch, instead of guessing whether a
                  Codemagic build predates the latest push. */}
              {versionInfo && (
                <div className="rounded-xl border border-foreground/10 p-3 text-caption leading-relaxed font-mono" dir="ltr">
                  <div>version {versionInfo.version} · build {versionInfo.build}</div>
                  <div>commit {versionInfo.commit} · branch {versionInfo.branch}</div>
                </div>
              )}
              {/* The real notification test button now lives in the
                  "Notifications" section above (new system) — not duplicated
                  here. */}
            </CollapsibleContent>
          </Collapsible>
      </div>
    </div>
  );
}
