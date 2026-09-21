import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BellRing, CalendarClock, Music2, Sunrise } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/site/SettingsUI";
import { SEO } from "@/components/SEO";
import { Switch } from "@/components/ui/switch";
import {
  AthanSoundGroup,
  NotificationStatusCard,
  PrayerAlertsGroup,
  PreReminderGroup,
} from "@/components/notifications/NotificationSettingsSection";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { AthkarRemindersCard } from "@/components/islamic/AthkarRemindersCard";
import { isCalendarNotificationsEnabled, setCalendarNotificationsEnabled } from "@/lib/events";
import { requestNotificationRebuild } from "@/lib/notifications/NotificationScheduler";
import { athanSoundOption, reminderSoundOption } from "@/lib/notifications/NotificationSounds";
import { loadAthkarSettings } from "@/lib/athkarReminders";
import { getAnnouncementPushEnabled, setAnnouncementPushEnabled } from "@/lib/pushDevice";
import { isIOSNativeApp } from "@/lib/platform";

/**
 * Notification SETTINGS (Settings → Notifications). Controls the four local
 * groups — prayer, reminder, Athan, Athkar, appointments — plus the separate
 * opt-in remote announcements. Deep-linkable by section id (#n-prayer,
 * #n-reminder, #n-athan, #n-athkar, #n-calendar, #n-general, #n-sounds).
 * Received notifications are the Notification Center (bottom-nav tab), not this.
 *
 * Vibration / "smart" switches are intentionally absent: the app has no such
 * feature, and a switch that does nothing would be misleading.
 */
export default function NotificationSettingsPage() {
  const { t, lang } = useLocale();
  const { hash } = useLocation();
  const nativeApp = isIOSNativeApp();
  const { prayerSettings } = useNotifications();
  const [calendarOn, setCalendarOn] = useState(() => isCalendarNotificationsEnabled());
  const [announcementPush, setAnnouncementPush] = useState(() => getAnnouncementPushEnabled());

  // Scroll to the requested section once it has rendered.
  useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    return () => window.clearTimeout(id);
  }, [hash]);

  const name = (id: Parameters<typeof athanSoundOption>[0]) => {
    const o = athanSoundOption(id);
    return o ? (lang === "ar" ? o.ar : o.en) : "";
  };
  const athkarSound = reminderSoundOption(loadAthkarSettings().sound);

  return (
    <PageShell titleAr="إعدادات الإشعارات" titleEn="Notification Settings" fallback="/settings">
      <SEO
        title={t("Notification Settings — Elite Islamic", "إعدادات الإشعارات — النخبة الإسلامية")}
        description={t("Prayer, Athkar and appointment alerts.", "تنبيهات الصلاة والأذكار والمواعيد.")}
        path="/notification-settings"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-6">
        <NotificationStatusCard />

        <SettingsSection
          id="n-prayer"
          title={t("Prayer Notifications", "إشعارات الصلاة")}
          footer={t(
            "Local alerts scheduled on your device from prayer times — they work without internet.",
            "تنبيهات محلية على جهازك حسب مواقيت الصلاة — تعمل بلا إنترنت.",
          )}
        >
          <PrayerAlertsGroup />
        </SettingsSection>

        <SettingsSection id="n-reminder" title={t("Pre-Prayer Reminder", "التذكير قبل الصلاة")}>
          <PreReminderGroup />
        </SettingsSection>

        <SettingsSection
          id="n-athan"
          title={t("Athan", "الأذان")}
          footer={t(
            "Previews play a sample here; the notification itself uses the bundled iPhone sound.",
            "الاستماع هنا عيّنة تجريبية؛ أما الإشعار نفسه فيستخدم الصوت المدمج في تطبيق iPhone.",
          )}
        >
          <AthanSoundGroup />
        </SettingsSection>

        <SettingsSection id="n-athkar" title={t("Athkar Reminders", "تذكيرات الأذكار")}>
          <AthkarRemindersCard />
        </SettingsSection>

        <SettingsSection
          id="n-calendar"
          title={t("Appointment Reminders", "تذكيرات المواعيد")}
          footer={t(
            "Each appointment picks its own reminder time and sound when you add or edit it.",
            "لكل موعد وقت تذكيره وصوته، يُحدَّدان عند إضافته أو تعديله.",
          )}
        >
          <SettingsGroup>
            <SettingsRow icon={CalendarClock} label={t("Appointment reminders", "تذكيرات المواعيد")}>
              <Switch
                aria-label={t("Appointment reminders", "تذكيرات المواعيد")}
                checked={calendarOn}
                onCheckedChange={(v) => {
                  setCalendarOn(v);
                  setCalendarNotificationsEnabled(v);
                  requestNotificationRebuild();
                }}
              />
            </SettingsRow>
            <SettingsRow icon={CalendarClock} to="/calendar" label={t("Open the calendar", "فتح التقويم")} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          id="n-general"
          title={t("General Notifications", "الإشعارات العامة")}
          footer={t("Announcements from the app administrator. Separate from prayer alerts.", "إعلانات من إدارة التطبيق. منفصلة عن تنبيهات الصلاة.")}
        >
          <SettingsGroup>
            {nativeApp ? (
              <SettingsRow icon={BellRing} label={t("App announcements", "إعلانات التطبيق")}>
                <Switch
                  aria-label={t("App announcements", "إعلانات التطبيق")}
                  checked={announcementPush}
                  onCheckedChange={async (next) => {
                    setAnnouncementPush(next);
                    await setAnnouncementPushEnabled(next);
                  }}
                />
              </SettingsRow>
            ) : (
              <SettingsRow
                icon={BellRing}
                label={t("App announcements", "إعلانات التطبيق")}
                description={t(
                  "Available in the iPhone app. Received announcements are in the Notifications tab.",
                  "متاحة في تطبيق iPhone. والإعلانات الواردة تجدها في تبويب الإشعارات.",
                )}
              />
            )}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="n-sounds" title={t("Sounds", "الأصوات")}>
          <SettingsGroup>
            <SettingsRow icon={Sunrise} to="#n-athan" label={t("Athan — Fajr", "الأذان — الفجر")} value={name(prayerSettings.soundFajr)} />
            <SettingsRow icon={Sunrise} to="#n-athan" label={t("Athan — other prayers", "الأذان — بقية الصلوات")} value={name(prayerSettings.soundOther)} />
            <SettingsRow icon={Music2} to="#n-athkar" label={t("Athkar reminder sound", "صوت تذكير الأذكار")} value={athkarSound ? (lang === "ar" ? athkarSound.ar : athkarSound.en) : ""} />
            <SettingsRow icon={Music2} to="/calendar" label={t("Appointment sound", "صوت المواعيد")} description={t("Chosen per appointment", "يُختار لكل موعد")} />
          </SettingsGroup>
        </SettingsSection>
      </div>
    </PageShell>
  );
}
