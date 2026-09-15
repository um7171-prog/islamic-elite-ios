import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { useLocale } from "@/contexts/LocaleContext";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc, type MadhabId } from "@/contexts/PrayerCalcContext";
import { CitySelector } from "@/components/islamic/CitySelector";
import { AthanSettingsCard } from "@/components/islamic/AthanSettingsCard";
import { AthkarRemindersCard } from "@/components/islamic/AthkarRemindersCard";
import { useNativeAthanScheduler } from "@/components/NativeAthanScheduler";
import { SEO } from "@/components/SEO";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { isNativeApp, runNotificationDeliveryTest } from "@/lib/nativeNotify";
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
          <h2 className="font-display text-base font-semibold text-elite-gold">{title}</h2>
          {subtitle && <p className="text-[11px] text-foreground/60">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
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
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-[11px] text-foreground/60 leading-relaxed">{description}</div>}
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
  const { settings: athan, setSettings: updateAthan, scheduledCount, reschedule } = useNativeAthanScheduler();
  const [notificationTest, setNotificationTest] = useState<"idle" | "running" | "scheduled" | "failed">("idle");
  const [notificationTestMessage, setNotificationTestMessage] = useState("");
  const [announcementPush, setAnnouncementPush] = useState(() => getAnnouncementPushEnabled());
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const nativeApp = isNativeApp();

  useEffect(() => {
    void getAppVersion().then(setVersionInfo);
  }, []);

  const runNotificationTest = async () => {
    setNotificationTest("running");
    setNotificationTestMessage("");
    try {
      const result = await runNotificationDeliveryTest(lang === "ar" ? "ar" : "en", 12);
      if (!result.granted) {
        setNotificationTest("failed");
        setNotificationTestMessage(t("Notification permission is disabled.", "صلاحية الإشعارات غير مفعلة."));
        return;
      }
      if (!result.scheduled) {
        setNotificationTest("failed");
        setNotificationTestMessage(
          result.errors.length
            ? result.errors.join(" · ")
            : t("iPhone did not accept the test notification.", "لم يقبل iPhone جدولة إشعار الاختبار."),
        );
        return;
      }
      setNotificationTest("scheduled");
      setNotificationTestMessage(
        t(
          "Scheduled. Lock the iPhone now and wait about 12 seconds.",
          "تمت الجدولة. اقفل شاشة الآيفون الآن وانتظر حوالي 12 ثانية.",
        ),
      );
    } catch (error) {
      setNotificationTest("failed");
      setNotificationTestMessage(String((error as Error)?.message || error));
    }
  };

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
          <h1 className="font-display text-lg font-bold">{t("Settings", "الإعدادات")}</h1>
          <p className="text-[11px] text-foreground/60">
            {t("Changes save automatically", "يتم الحفظ تلقائياً")}
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {nativeApp && (
          <Section
            icon={BellRing}
            title={t("App Announcements", "إعلانات التطبيق")}
            subtitle={t("Optional updates from the app administrator", "تحديثات اختيارية من إدارة التطبيق")}
          >
            <Row
              label={t("App announcements", "إعلانات وتنبيهات التطبيق")}
              description={t(
                "Optional remote announcements from the app administrator. You can turn them off anytime.",
                "إشعارات اختيارية من إدارة التطبيق، ويمكنك إيقافها في أي وقت.",
              )}
            >
              <button
                type="button"
                role="switch"
                aria-checked={announcementPush}
                onClick={async () => {
                  const next = !announcementPush;
                  setAnnouncementPush(next);
                  await setAnnouncementPushEnabled(next);
                }}
                className={`relative h-7 w-12 rounded-full transition ${announcementPush ? "bg-accent" : "bg-foreground/15"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-background shadow transition ${announcementPush ? "start-6" : "start-1"}`} />
              </button>
            </Row>
          </Section>
        )}
        {/* Account & App */}
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
                  className={`px-3 py-1.5 text-xs font-medium transition ${
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
                  className={`px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1 transition ${
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

        {/* Prayer & Times */}
        <Section
          icon={MapPin}
          title={t("Prayer & Times", "مواقيت الصلاة")}
          subtitle={t("Location and calculation method", "الموقع وطريقة الحساب")}
        >
          <Row label={t("Location", "الموقع")} description={lang === "ar" ? city.ar : city.en}>
            <CitySelector compact />
          </Row>

          <div className="rounded-xl border border-foreground/10 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-accent" />
              <div className="text-sm font-medium">{t("Madhab (Asr method)", "المذهب (وقت العصر)")}</div>
            </div>
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
                      <span className="text-sm font-medium">{t(m.en, m.ar)}</span>
                      {active && <Check className="h-4 w-4 text-accent" />}
                    </div>
                    <div className="text-[10px] text-foreground/60 mt-0.5">{t(m.note.en, m.note.ar)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* Athan notifications & pre-prayer reminders — AthanSettingsCard already
            covers both (per-prayer toggles, sounds, and the pre-prayer reminder
            offset) internally; it gets its own Section here instead of being
            folded into "Prayer & Times" so the notification settings the user
            asked to see labeled distinctly are clearly separate from location/madhab. */}
        <Section
          icon={Bell}
          title={t("Athan Notifications", "إشعارات الأذان")}
          subtitle={t("Per-prayer alerts, sounds, and reminders before prayer", "تنبيهات كل صلاة، الأصوات، والتذكير قبل الصلاة")}
        >
          <AthanSettingsCard
            settings={athan}
            onChange={updateAthan}
            scheduledCount={scheduledCount}
            onReschedule={reschedule}
          />
        </Section>

        {/* Athkar reminders */}
        <Section
          icon={Bell}
          title={t("Athkar Reminders", "تذكير الأذكار")}
          subtitle={t("Morning & evening Athkar notifications", "تنبيهات أذكار الصباح والمساء")}
        >
          <AthkarRemindersCard />
        </Section>

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
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-[11px] text-foreground/60 truncate" dir="ltr">
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
                <h2 className="font-display text-base font-semibold text-foreground/80">{t("Advanced Settings", "إعدادات متقدمة")}</h2>
                <p className="text-[11px] text-foreground/60">{t("Technical diagnostics — not needed for everyday use", "تشخيص تقني — غير مطلوب للاستخدام اليومي")}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-foreground/50 transition-transform shrink-0" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-4">
              {/* Lets a real-device tester verify the installed IPA actually came
                  from the expected commit/branch, instead of guessing whether a
                  Codemagic build predates the latest push. */}
              {versionInfo && (
                <div className="rounded-xl border border-foreground/10 p-3 text-[11px] leading-relaxed font-mono" dir="ltr">
                  <div>version {versionInfo.version} · build {versionInfo.build}</div>
                  <div>commit {versionInfo.commit} · branch {versionInfo.branch}</div>
                </div>
              )}
              {nativeApp && (
                <>
                  <button
                    type="button"
                    onClick={runNotificationTest}
                    disabled={notificationTest === "running"}
                    className="flex w-full items-center justify-between rounded-xl border border-foreground/10 p-3 transition hover:bg-foreground/5 active:scale-[0.99] disabled:opacity-60"
                  >
                    <div className="text-start">
                      <div className="text-sm font-medium">
                        {notificationTest === "running"
                          ? t("Scheduling…", "جارٍ الجدولة…")
                          : t("Test after 12 seconds", "اختبار بعد 12 ثانية")}
                      </div>
                      <div className="text-[11px] text-foreground/60">
                        {t("Schedules one isolated test without touching prayer reminders", "يجدول إشعار اختبار مستقل بدون لمس تنبيهات الصلاة")}
                      </div>
                    </div>
                    <Bell className="h-5 w-5 text-accent" />
                  </button>
                  {notificationTestMessage && (
                    <div
                      className={`rounded-xl border p-3 text-xs leading-relaxed ${
                        notificationTest === "scheduled"
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-destructive/30 bg-destructive/10"
                      }`}
                    >
                      {notificationTestMessage}
                    </div>
                  )}
                  <Link
                    to="/notification-diagnostics"
                    className="flex items-center justify-between rounded-xl border border-foreground/10 p-3 text-sm hover:bg-foreground/5 transition"
                  >
                    <span>{t("Notification Diagnostics", "تشخيص الإشعارات")}</span>
                    <ArrowLeft className={`h-4 w-4 text-foreground/40 ${dir === "rtl" ? "" : "rotate-180"}`} />
                  </Link>
                </>
              )}
            </CollapsibleContent>
          </Collapsible>
      </div>
    </div>
  );
}
