import { useState } from "react";
import { AlertTriangle, Bell, BellOff, BellRing, Check, Mic2, Play, Square, Timer } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp, openNativeAppSettings } from "@/lib/platform";
import { useNotifications } from "./NotificationsProvider";
import { requestPermission } from "@/lib/notifications/NotificationPermissionService";
import { ATHAN_SOUNDS, previewSound, stopPreview, type AthanSoundId } from "@/lib/notifications/NotificationSounds";
import { NOTIFIABLE_PRAYERS } from "@/lib/notifications/NotificationSettings";
import { ChipPicker, CollapsibleRow, SettingsGroup, SettingsRow } from "@/components/site/SettingsUI";

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

/** Per-prayer alert switches (the five prayers only) — folded behind one row
 * showing how many are on, opened on tap. */
export function PrayerAlertsGroup({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { t, lang } = useLocale();
  const { prayerSettings, setPrayerSettings } = useNotifications();
  const enabled = NOTIFIABLE_PRAYERS.filter((k) => prayerSettings.perPrayerEnabled[k] !== false).length;
  return (
    <SettingsGroup>
      <CollapsibleRow
        icon={Bell}
        label={t("Prayer alerts", "تنبيهات الصلوات")}
        value={t(`${enabled} of 5 on`, `${enabled} من 5 مفعّلة`)}
        defaultOpen={defaultOpen}
        data-testid="prayer-alerts-toggle"
      >
        <div className="divide-y divide-foreground/[0.07] border-t border-foreground/[0.07]">
          {NOTIFIABLE_PRAYERS.map((key) => (
            <SettingsRow key={key} label={t(PRAYER_LABELS[key].en, PRAYER_LABELS[key].ar)}>
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
        </div>
      </CollapsibleRow>
    </SettingsGroup>
  );
}

/** Alert before the Athan — on/off, and (when on) how many minutes before, as a
 * row that opens its choices on tap. Its sound is the bundled "أستغفر الله"
 * (PRE_PRAYER_SOUND_FILE); scheduling itself lives in PrayerNotificationService. */
export function PreReminderGroup({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { t } = useLocale();
  const { prayerSettings, setPrayerSettings } = useNotifications();
  return (
    <SettingsGroup>
      <SettingsRow
        label={t("Alert before the Athan", "التنبيه قبل الأذان")}
        description={t("Sound: Astaghfirullah", "الصوت: أستغفر الله")}
        icon={Timer}
      >
        <Switch
          aria-label={t("Alert before the Athan", "التنبيه قبل الأذان")}
          checked={prayerSettings.preReminderEnabled}
          onCheckedChange={(v) => setPrayerSettings({ ...prayerSettings, preReminderEnabled: v })}
        />
      </SettingsRow>
      {prayerSettings.preReminderEnabled && (
        <CollapsibleRow
          label={t("How long before", "قبل الأذان بـ")}
          value={t(`${prayerSettings.preReminderMinutes} min`, `${prayerSettings.preReminderMinutes} دقائق`)}
          defaultOpen={defaultOpen}
          data-testid="pre-reminder-minutes-toggle"
        >
          <div className="pt-1">
            <ChipPicker
              value={prayerSettings.preReminderMinutes}
              onChange={(m) => setPrayerSettings({ ...prayerSettings, preReminderMinutes: m })}
              options={PRE_REMINDER_OPTIONS.map((m) => ({ value: m, label: t(`${m} min`, `${m} دقائق`) }))}
            />
          </div>
        </CollapsibleRow>
      )}
    </SettingsGroup>
  );
}

/** Muezzin (Athan voice) for Fajr and for the other prayers: each is one row
 * showing the current choice, whose list opens on tap, with preview. Preview
 * plays the bundled web audio sample; the real notification sound is the native
 * .caf and can only be confirmed on an iPhone. */
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
    { label: t("Fajr muezzin", "مؤذن الفجر"), value: prayerSettings.soundFajr, key: "soundFajr" as const },
    { label: t("Muezzin for other prayers", "مؤذن بقية الصلوات"), value: prayerSettings.soundOther, key: "soundOther" as const },
  ];

  return (
    <SettingsGroup>
      {rows.map((row) => {
        const current = ATHAN_SOUNDS.find((s) => s.id === row.value);
        return (
          <CollapsibleRow
            key={row.key}
            icon={Mic2}
            label={row.label}
            value={current ? t(current.en, current.ar) : ""}
            data-testid={`muezzin-${row.key}`}
          >
            <div className="divide-y divide-foreground/[0.07] border-t border-foreground/[0.07]" role="radiogroup" aria-label={row.label}>
              {ATHAN_SOUNDS.map((s) => {
                const active = s.id === row.value;
                const previewId = `${row.key}-${s.id}`;
                return (
                  <div key={s.id} className="flex items-center">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPrayerSettings({ ...prayerSettings, [row.key]: s.id as AthanSoundId })}
                      className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-start transition active:bg-foreground/[0.04]"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center" aria-hidden>
                        {active && <Check className="h-5 w-5 text-primary" />}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-body-sm ${active ? "font-semibold text-primary" : ""}`}>{t(s.en, s.ar)}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t("Preview", "استماع")}
                      disabled={!s.previewUrl}
                      onClick={() => preview(previewId, s.previewUrl)}
                      className="me-3 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-foreground/10 hover:bg-foreground/[0.04] disabled:opacity-30"
                    >
                      {playing === previewId ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </CollapsibleRow>
        );
      })}
    </SettingsGroup>
  );
}
