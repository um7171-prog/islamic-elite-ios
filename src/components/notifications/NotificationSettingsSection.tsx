import { useState } from "react";
import { AlertTriangle, Bell, BellOff, BellRing, Check, Play, Square, Timer } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp, openNativeAppSettings } from "@/lib/platform";
import { useNotifications } from "./NotificationsProvider";
import { requestPermission } from "@/lib/notifications/permission";
import { sendTestNotification, type TestNotificationResult } from "@/lib/notifications/test";
import { ATHAN_SOUNDS, previewSound, stopPreview, type AthanSoundId } from "@/lib/notifications/sounds";
import { NOTIFIABLE_PRAYERS } from "@/lib/notifications/settings";
import { ChipPicker, SettingsGroup, SettingsRow } from "@/components/site/SettingsUI";

/**
 * Notification settings blocks for the new notification system
 * (src/lib/notifications/). Each block is its own export so Settings can place
 * it in the right section (Prayer / Advanced) instead of one long blob.
 *
 * All of these are LOCAL (on-device) notifications. Remote "app announcements"
 * (APNs) are a separate switch in Settings' App section and never mix with these.
 */

const PRAYER_LABELS: Record<(typeof NOTIFIABLE_PRAYERS)[number], { ar: string; en: string }> = {
  fajr: { ar: "الفجر", en: "Fajr" },
  dhuhr: { ar: "الظهر", en: "Dhuhr" },
  asr: { ar: "العصر", en: "Asr" },
  maghrib: { ar: "المغرب", en: "Maghrib" },
  isha: { ar: "العشاء", en: "Isha" },
};

const PRE_REMINDER_OPTIONS: (5 | 10 | 15 | 20)[] = [5, 10, 15, 20];

/** Permission state. Native: the three real iOS states. Web: an honest note —
 * iOS permission does not exist in a browser, so nothing is faked. */
export function NotificationStatusCard() {
  const { t } = useLocale();
  const native = isIOSNativeApp();
  const { permission, refreshPermission, rebuildAll } = useNotifications();
  const [requesting, setRequesting] = useState(false);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      await requestPermission();
      await refreshPermission();
      await rebuildAll();
    } finally {
      setRequesting(false);
    }
  };

  if (!native) {
    return (
      <div data-testid="notif-status-web" className="flex items-start gap-3 rounded-2xl border border-foreground/[0.07] bg-card p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.07] text-foreground/60">
          <Bell className="h-[18px] w-[18px]" />
        </span>
        <p className="text-body-sm leading-relaxed text-foreground/70">
          {t(
            "Prayer, Athkar and appointment alerts are delivered by the installed iPhone app. In the browser you can set your preferences, but no alerts are sent.",
            "تنبيهات الصلاة والأذكار والمواعيد يرسلها تطبيق iPhone المثبَّت. في المتصفح يمكنك ضبط تفضيلاتك لكن لا تُرسل أي تنبيهات.",
          )}
        </p>
      </div>
    );
  }

  if (permission === "granted") {
    return (
      <div data-testid="notif-status-granted" className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <BellRing className="h-[18px] w-[18px]" />
        </span>
        <p className="text-body font-medium text-primary">{t("Notifications are enabled", "الإشعارات مفعّلة")}</p>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div data-testid="notif-status-denied" className="space-y-3 rounded-2xl border border-destructive/35 bg-destructive/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-body font-medium">{t("Notifications are turned off", "الإشعارات متوقفة")}</p>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {t(
                "iPhone Settings → Elite Islamic → Notifications → Allow Notifications.",
                "إعدادات iPhone ← النخبة الإسلامية ← الإشعارات ← السماح بالإشعارات.",
              )}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void openNativeAppSettings()}>
          {t("Open iPhone Settings", "فتح إعدادات iPhone")}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="notif-status-undetermined" className="space-y-3 rounded-2xl border border-elite-gold/35 bg-elite-gold/10 p-4">
      <div className="flex items-start gap-3">
        <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-elite-gold" />
        <div className="space-y-1">
          <p className="text-body font-medium">{t("Turn on notifications", "فعّل الإشعارات")}</p>
          <p className="text-body-sm leading-relaxed text-foreground/70">
            {t(
              "Needed to alert you at prayer time, for Athkar and for your appointments — even when the app is closed.",
              "مطلوبة لتنبيهك في وقت الصلاة وللأذكار ولمواعيدك — حتى والتطبيق مغلق.",
            )}
          </p>
        </div>
      </div>
      <Button size="sm" onClick={() => void handleEnable()} disabled={requesting}>
        {requesting ? t("Requesting…", "جارٍ الطلب…") : t("Enable notifications", "تفعيل الإشعارات")}
      </Button>
    </div>
  );
}

/** Per-prayer alert switches (the five prayers only). */
export function PrayerAlertsGroup() {
  const { t, lang } = useLocale();
  const { prayerSettings, setPrayerSettings } = useNotifications();
  return (
    <SettingsGroup>
      {NOTIFIABLE_PRAYERS.map((key) => (
        <SettingsRow key={key} label={t(PRAYER_LABELS[key].en, PRAYER_LABELS[key].ar)} icon={Bell}>
          <Switch
            aria-label={lang === "ar" ? `تنبيه ${PRAYER_LABELS[key].ar}` : `${PRAYER_LABELS[key].en} alert`}
            checked={prayerSettings.perPrayerEnabled[key] !== false}
            onCheckedChange={(v) =>
              setPrayerSettings({
                ...prayerSettings,
                perPrayerEnabled: { ...prayerSettings.perPrayerEnabled, [key]: v },
              })
            }
          />
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}

/** Reminder before prayer — on/off + minutes. */
export function PreReminderGroup() {
  const { t } = useLocale();
  const { prayerSettings, setPrayerSettings } = useNotifications();
  return (
    <SettingsGroup>
      <SettingsRow label={t("Remind me before prayer", "تذكير قبل الصلاة")} icon={Timer}>
        <Switch
          aria-label={t("Reminder before prayer", "تذكير قبل الصلاة")}
          checked={prayerSettings.preReminderEnabled}
          onCheckedChange={(v) => setPrayerSettings({ ...prayerSettings, preReminderEnabled: v })}
        />
      </SettingsRow>
      {prayerSettings.preReminderEnabled && (
        <div className="pt-3">
          <p className="px-4 pb-2 text-caption text-foreground/60">{t("How long before", "قبل الصلاة بـ")}</p>
          <ChipPicker
            value={prayerSettings.preReminderMinutes}
            onChange={(m) => setPrayerSettings({ ...prayerSettings, preReminderMinutes: m })}
            options={PRE_REMINDER_OPTIONS.map((m) => ({ value: m, label: t(`${m} min`, `${m} دقائق`) }))}
          />
        </div>
      )}
    </SettingsGroup>
  );
}

/** Athan sound for Fajr and for the other prayers, with preview. Preview plays
 * the bundled web audio sample; the real notification sound is the native .caf
 * and can only be confirmed on an iPhone. */
export function AthanSoundGroup() {
  const { t } = useLocale();
  const { prayerSettings, setPrayerSettings } = useNotifications();
  const [playing, setPlaying] = useState<string | null>(null);

  const preview = (id: string, url: string) => {
    const was = playing === id;
    stopPreview();
    setPlaying(null);
    if (was || !url) return;
    previewSound(url);
    setPlaying(id);
  };

  const rows = [
    { label: t("Fajr athan", "أذان الفجر"), value: prayerSettings.soundFajr, key: "soundFajr" as const },
    { label: t("Other prayers", "بقية الصلوات"), value: prayerSettings.soundOther, key: "soundOther" as const },
  ];

  return (
    <SettingsGroup>
      {rows.map((row) => (
        <div key={row.key} className="space-y-2.5 px-4 py-3.5">
          <div className="text-body font-medium">{row.label}</div>
          <div className="flex flex-wrap gap-2">
            {ATHAN_SOUNDS.map((s) => {
              const active = s.id === row.value;
              const previewId = `${row.key}-${s.id}`;
              return (
                <div key={s.id} className="flex items-stretch">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPrayerSettings({ ...prayerSettings, [row.key]: s.id as AthanSoundId })}
                    className={`min-h-[40px] rounded-s-xl border px-3 text-body-sm transition ${
                      active ? "border-primary bg-primary/12 font-semibold text-primary" : "border-foreground/10 hover:bg-foreground/[0.04]"
                    }`}
                  >
                    {active && <Check className="me-1 inline h-3.5 w-3.5" />}
                    {t(s.en, s.ar)}
                  </button>
                  <button
                    type="button"
                    aria-label={t("Preview", "استماع")}
                    disabled={!s.previewUrl}
                    onClick={() => preview(previewId, s.previewUrl)}
                    className="grid min-w-[40px] place-items-center rounded-e-xl border border-s-0 border-foreground/10 hover:bg-foreground/[0.04] disabled:opacity-30"
                  >
                    {playing === previewId ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </SettingsGroup>
  );
}

/** Real test notification — schedules one native notification a few seconds out
 * in its own id range. Only meaningful inside the iPhone app. */
export function NotificationTestGroup() {
  const { t, lang } = useLocale();
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [testMessage, setTestMessage] = useState("");

  const handleTest = async () => {
    setTestState("sending");
    setTestMessage("");
    const result: TestNotificationResult = await sendTestNotification(lang === "ar" ? "ar" : "en");
    if (result.ok === true) {
      setTestState("sent");
      setTestMessage(
        t(
          `A real notification was scheduled for ${result.scheduledFor.toLocaleTimeString()}. Lock the phone and wait.`,
          `تمت جدولة إشعار حقيقي في ${result.scheduledFor.toLocaleTimeString("ar")}. اقفل الشاشة وانتظر.`,
        ),
      );
      return;
    }
    setTestState("failed");
    const failure: Extract<TestNotificationResult, { ok: false }> = result;
    setTestMessage(
      failure.reason === "not-native"
        ? t("This only works inside the installed iPhone app.", "هذا يعمل فقط داخل تطبيق iPhone المثبَّت.")
        : failure.reason === "permission-denied"
          ? t("Notifications aren't enabled yet.", "الإشعارات غير مفعّلة بعد.")
          : failure.detail || t("iOS did not accept the test notification.", "لم يقبل iOS إشعار الاختبار."),
    );
  };

  return (
    <SettingsGroup>
      <div className="space-y-3 p-4">
        <Button size="sm" onClick={() => void handleTest()} disabled={testState === "sending"} className="w-full">
          {testState === "sending" ? t("Scheduling…", "جارٍ الجدولة…") : t("Send a real test notification", "إرسال إشعار اختبار حقيقي")}
        </Button>
        {testMessage && (
          <p className={`text-body-sm leading-relaxed ${testState === "sent" ? "text-primary" : "text-destructive"}`}>{testMessage}</p>
        )}
        <p className="text-caption leading-relaxed text-foreground/55">
          {t(
            "Uses its own id range — it never touches prayer, Athkar or calendar alerts.",
            "يستخدم نطاق معرّفات مستقلاً — لا يمسّ تنبيهات الصلاة أو الأذكار أو المواعيد.",
          )}
        </p>
      </div>
    </SettingsGroup>
  );
}
