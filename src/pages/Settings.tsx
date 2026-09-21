import { useEffect, useState } from "react";
import {
  Bell,
  BellRing,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Clock,
  FileText,
  HelpCircle,
  Info,
  Languages,
  Mail,
  MapPin,
  Moon,
  Music2,
  Palette,
  Tag,
  Share2,
  Shield,
  Sunrise,
  Sunset,
  Timer,
  Volume2,
  Calculator,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc, type MadhabId } from "@/contexts/PrayerCalcContext";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { PageShell } from "@/components/site/PageHeader";
import { IconBadge } from "@/components/site/IconBadge";
import { OptionSheet, SettingsGroup, SettingsRow, SettingsSection } from "@/components/site/SettingsUI";
import { ThemePicker } from "@/components/site/ThemePicker";
import { SocialRows } from "@/components/site/SocialRows";
import { shareApp } from "@/pages/MorePage";
import { SEO } from "@/components/SEO";
import { Switch } from "@/components/ui/switch";
import { PRAYER_METHODS, methodOption, type MethodId } from "@/lib/prayerMethods";
import { themeById } from "@/lib/themes";
import { getAppVersion, type AppVersionInfo } from "@/lib/appVersion";
import { loadAthkarSettings, saveAthkarSettings, type AthkarReminderSettings } from "@/lib/athkarReminders";
import { isCalendarNotificationsEnabled, setCalendarNotificationsEnabled } from "@/lib/events";
import { requestNotificationRebuild } from "@/lib/notifications/coordinator";

const CAL_MODE_KEY = "elite.calendar.mode.v1";

const MADHABS: { id: MadhabId; en: string; ar: string; note: { en: string; ar: string } }[] = [
  { id: "hanbali", en: "Hanbali", ar: "الحنبلي", note: { en: "Umm Al-Qura default", ar: "أم القرى (الافتراضي)" } },
  { id: "shafi", en: "Shafi'i", ar: "الشافعي", note: { en: "Standard Asr", ar: "العصر القياسي" } },
  { id: "maliki", en: "Maliki", ar: "المالكي", note: { en: "Standard Asr", ar: "العصر القياسي" } },
  { id: "hanafi", en: "Hanafi", ar: "الحنفي", note: { en: "Later Asr time", ar: "وقت العصر متأخر" } },
];

/**
 * Settings — a native-iOS-style list in the app's identity. Top level shows
 * each setting with its current value; pickers open as sheets, and larger areas
 * are their own screens (Location, Prayer settings, Notification settings).
 * Everything listed is a real, working setting — nothing decorative.
 */
export default function Settings() {
  const { t, lang, setLang } = useLocale();
  const { mode, setMode, themeId } = useTheme();
  const { city, auto } = useCity();
  const { madhab, setMadhab, method, setMethod } = usePrayerCalc();
  const { prayerSettings } = useNotifications();
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const [athkar, setAthkar] = useState<AthkarReminderSettings>(() => loadAthkarSettings());
  const [calendarOn, setCalendarOn] = useState(() => isCalendarNotificationsEnabled());
  const [calMode, setCalMode] = useState<"gregorian" | "hijri">(() => {
    try {
      return localStorage.getItem(CAL_MODE_KEY) === "hijri" ? "hijri" : "gregorian";
    } catch {
      return "gregorian";
    }
  });
  const [sheet, setSheet] = useState<null | "lang" | "appearance" | "theme" | "madhab" | "method" | "calendar">(null);

  useEffect(() => {
    void getAppVersion().then(setVersionInfo);
  }, []);

  const updateAthkar = (patch: Partial<AthkarReminderSettings>) => {
    const next = { ...athkar, ...patch };
    setAthkar(next);
    saveAthkarSettings(next);
    requestNotificationRebuild();
  };

  const setCalendarView = (v: "gregorian" | "hijri") => {
    setCalMode(v);
    try {
      localStorage.setItem(CAL_MODE_KEY, v);
    } catch {
      /* private mode */
    }
  };

  const appearanceLabel: Record<ThemeMode, string> = {
    system: t("Automatic", "تلقائي"),
    light: t("Light", "فاتح"),
    night: t("Dark", "داكن"),
  };
  const theme = themeById(themeId);
  const madhabDef = MADHABS.find((m) => m.id === madhab) ?? MADHABS[0];
  const methodDef = methodOption(method);
  const enabledPrayers = Object.values(prayerSettings.perPrayerEnabled).filter(Boolean).length;
  const cityName = lang === "ar" ? city.ar : city.en;

  return (
    <PageShell titleAr="الإعدادات" titleEn="Settings" hideBack>
      <SEO
        title={t("Settings — Elite Islamic", "الإعدادات — النخبة الإسلامية")}
        description={t(
          "App settings: language, appearance, theme, location, prayer calculation, Athan and notifications.",
          "إعدادات التطبيق: اللغة، المظهر، الثيم، الموقع، طريقة الحساب، الأذان، والإشعارات.",
        )}
        path="/settings"
        lang={lang === "ar" ? "ar" : "en"}
      />

      <div className="space-y-6">
        {/* ============ General ============ */}
        <SettingsSection id="general" title={t("General", "عام")}>
          <SettingsGroup>
            <SettingsRow
              icon={Languages}
              label={t("Language", "اللغة")}
              value={lang === "ar" ? "العربية" : "English"}
              onClick={() => setSheet("lang")}
            />
            <SettingsRow icon={Moon} label={t("Appearance", "المظهر")} value={appearanceLabel[mode]} onClick={() => setSheet("appearance")} />
            <SettingsRow icon={Palette} label={t("Theme", "الثيم")} value={lang === "ar" ? theme.name : theme.englishName} onClick={() => setSheet("theme")} />
          </SettingsGroup>
        </SettingsSection>

        {/* ============ Location ============ */}
        <SettingsSection id="location" title={t("Location", "الموقع")}>
          <SettingsGroup>
            <SettingsRow
              icon={MapPin}
              to="/location"
              label={t("Location", "الموقع")}
              description={auto ? t("Automatic", "تلقائي") : t("Manual city", "مدينة يدوية")}
              value={cityName}
            />
          </SettingsGroup>
        </SettingsSection>

        {/* ============ Prayer ============ */}
        <SettingsSection id="prayer" title={t("Prayer", "الصلاة")}>
          <SettingsGroup>
            <SettingsRow icon={Clock} to="/prayer-settings" label={t("Prayer Settings", "إعدادات الصلاة")} />
            <SettingsRow icon={BookOpen} label={t("Madhhab", "المذهب")} value={t(madhabDef.en, madhabDef.ar)} onClick={() => setSheet("madhab")} />
            <SettingsRow icon={Calculator} label={t("Calculation Method", "طريقة الحساب")} value={t(methodDef.en, methodDef.ar)} onClick={() => setSheet("method")} />
            <SettingsRow
              icon={Bell}
              to="/notification-settings#n-prayer"
              label={t("Prayer Notifications", "إشعارات الصلاة")}
              value={t(`${enabledPrayers} of 5 on`, `${enabledPrayers} من 5 مفعّلة`)}
            />
            <SettingsRow icon={Volume2} to="/notification-settings#n-athan" label={t("Athan", "الأذان")} />
            <SettingsRow
              icon={Timer}
              to="/notification-settings#n-reminder"
              label={t("Pre-Prayer Reminder", "التذكير قبل الصلاة")}
              value={prayerSettings.preReminderEnabled ? t(`${prayerSettings.preReminderMinutes} min`, `${prayerSettings.preReminderMinutes} دقائق`) : t("Off", "متوقف")}
            />
          </SettingsGroup>
        </SettingsSection>

        {/* ============ Athkar ============ */}
        <SettingsSection id="athkar" title={t("Athkar", "الأذكار")}>
          <SettingsGroup>
            <SettingsRow icon={Sunrise} label={t("Morning Athkar", "أذكار الصباح")}>
              <Switch aria-label={t("Morning Athkar", "أذكار الصباح")} checked={athkar.morningEnabled} onCheckedChange={(v) => updateAthkar({ morningEnabled: v })} />
            </SettingsRow>
            <SettingsRow icon={Sunset} label={t("Evening Athkar", "أذكار المساء")}>
              <Switch aria-label={t("Evening Athkar", "أذكار المساء")} checked={athkar.eveningEnabled} onCheckedChange={(v) => updateAthkar({ eveningEnabled: v })} />
            </SettingsRow>
            <SettingsRow icon={BellRing} to="/notification-settings#n-athkar" label={t("Athkar Reminders", "تذكيرات الأذكار")} />
          </SettingsGroup>
        </SettingsSection>

        {/* ============ Calendar & appointments ============ */}
        <SettingsSection id="calendar" title={t("Calendar & Appointments", "التقويم والمواعيد")}>
          <SettingsGroup>
            <SettingsRow
              icon={CalendarDays}
              label={t("Calendar", "التقويم")}
              value={calMode === "hijri" ? t("Hijri", "هجري") : t("Gregorian", "ميلادي")}
              onClick={() => setSheet("calendar")}
            />
            <SettingsRow icon={CalendarClock} label={t("Appointment Reminders", "تذكيرات المواعيد")}>
              <Switch
                aria-label={t("Appointment Reminders", "تذكيرات المواعيد")}
                checked={calendarOn}
                onCheckedChange={(v) => {
                  setCalendarOn(v);
                  setCalendarNotificationsEnabled(v);
                  requestNotificationRebuild();
                }}
              />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>

        {/* ============ App ============ */}
        <SettingsSection id="app" title={t("App", "التطبيق")}>
          <SettingsGroup>
            <SettingsRow icon={Bell} to="/notification-settings#n-general" label={t("General Notifications", "الإشعارات العامة")} />
            <SettingsRow icon={Music2} to="/notification-settings#n-sounds" label={t("Sounds", "الأصوات")} />
          </SettingsGroup>
        </SettingsSection>

        {/* ============ Social media ============ */}
        <SettingsSection id="social" title={t("Social Media", "مواقع التواصل")}>
          <SocialRows />
        </SettingsSection>

        {/* ============ Support & About ============ */}
        <SettingsSection id="support" title={t("Support & About", "الدعم والمعلومات")}>
          <SettingsGroup>
            <SettingsRow icon={HelpCircle} to="/faq" label={t("Help", "المساعدة")} />
            <SettingsRow icon={Mail} to="/contact" label={t("Contact Us", "تواصل معنا")} />
            <SettingsRow icon={Shield} to="/privacy" label={t("Privacy", "الخصوصية")} />
            <SettingsRow icon={FileText} to="/terms" label={t("Terms", "الشروط")} />
            <SettingsRow icon={Info} to="/about" label={t("About the App", "عن التطبيق")} />
            <SettingsRow icon={Share2} onClick={() => void shareApp(t)} label={t("Share the App", "مشاركة التطبيق")} />
            <SettingsRow icon={Tag} label={t("Version", "الإصدار")} value={versionInfo ? versionInfo.version : "…"} />
          </SettingsGroup>
        </SettingsSection>
      </div>

      {/* ---- pickers ---- */}
      <OptionSheet
        open={sheet === "lang"}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t("Language", "اللغة")}
        value={lang}
        onChange={(l) => setLang(l)}
        options={[
          { value: "ar", label: "العربية" },
          { value: "en", label: "English" },
        ]}
      />
      <OptionSheet
        open={sheet === "appearance"}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t("Appearance", "المظهر")}
        description={t("Light or dark, independent of the theme.", "فاتح أو داكن، بشكل مستقل عن الثيم.")}
        value={mode}
        onChange={(m) => setMode(m)}
        options={[
          { value: "system", label: appearanceLabel.system, description: t("Follows your device", "يتبع إعداد جهازك") },
          { value: "light", label: appearanceLabel.light },
          { value: "night", label: appearanceLabel.night },
        ]}
      />
      <ThemePicker open={sheet === "theme"} onOpenChange={(o) => !o && setSheet(null)} />
      <OptionSheet
        open={sheet === "madhab"}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t("Madhhab", "المذهب")}
        description={t("Sets the Asr time. Prayer times update immediately.", "يحدد وقت العصر، وتتحدث المواقيت فوراً.")}
        value={madhab}
        onChange={(m) => setMadhab(m as MadhabId)}
        options={MADHABS.map((m) => ({ value: m.id, label: t(m.en, m.ar), description: t(m.note.en, m.note.ar) }))}
      />
      <OptionSheet
        open={sheet === "method"}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t("Calculation Method", "طريقة الحساب")}
        value={method}
        onChange={(m) => setMethod(m as MethodId)}
        options={PRAYER_METHODS.map((m) => ({ value: m.id, label: t(m.en, m.ar) }))}
      />
      <OptionSheet
        open={sheet === "calendar"}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t("Calendar", "التقويم")}
        description={t("Which date leads in the calendar.", "أي تاريخ يظهر أولاً في التقويم.")}
        value={calMode}
        onChange={(v) => setCalendarView(v)}
        options={[
          { value: "gregorian", label: t("Gregorian", "ميلادي") },
          { value: "hijri", label: t("Hijri", "هجري") },
        ]}
      />
    </PageShell>
  );
}
