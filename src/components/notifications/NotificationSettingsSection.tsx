import { useState } from "react";
import { AlertTriangle, Bell, BellOff, Calendar, Check, Clock, Play, Square, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { isIOSNativeApp, openNativeAppSettings } from "@/lib/platform";
import { useNotifications } from "./NotificationsProvider";
import { requestPermission } from "@/lib/notifications/permission";
import { sendTestNotification, type TestNotificationResult } from "@/lib/notifications/test";
import { ATHAN_SOUNDS, previewSound, stopPreview, type AthanSoundId } from "@/lib/notifications/sounds";
import { NOTIFIABLE_PRAYERS } from "@/lib/notifications/settings";
import { AthkarRemindersCard } from "@/components/islamic/AthkarRemindersCard";

const PRAYER_LABELS: Record<(typeof NOTIFIABLE_PRAYERS)[number], { ar: string; en: string }> = {
  fajr: { ar: "الفجر", en: "Fajr" },
  dhuhr: { ar: "الظهر", en: "Dhuhr" },
  asr: { ar: "العصر", en: "Asr" },
  maghrib: { ar: "المغرب", en: "Maghrib" },
  isha: { ar: "العشاء", en: "Isha" },
};

const PRE_REMINDER_OPTIONS: (5 | 10 | 15 | 20)[] = [5, 10, 15, 20];

function GroupTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <Icon className="h-4 w-4 text-elite-gold" />
      <h3 className="text-body-sm font-semibold text-elite-gold">{children}</h3>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3 min-h-[48px]">
      <div className="min-w-0">
        <div className="text-body font-medium">{label}</div>
        {sub && <div className="text-caption text-foreground/55 leading-snug">{sub}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Full "Notifications" settings — status, per-prayer toggles, pre-prayer
 * reminder, Athkar, calendar reminders, and a real test button. Built fresh
 * for the new notification system (see src/lib/notifications/).
 */
export function NotificationSettingsSection() {
  const { t, lang } = useLocale();
  const native = isIOSNativeApp();
  const { permission, refreshPermission, prayerSettings, setPrayerSettings, rebuildAll } = useNotifications();
  const [requesting, setRequesting] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);

  const update = (patch: Partial<typeof prayerSettings>) => setPrayerSettings({ ...prayerSettings, ...patch });

  const preview = (id: string, url: string) => {
    const was = playing === id;
    stopPreview();
    setPlaying(null);
    if (was || !url) return;
    previewSound(url);
    setPlaying(id);
  };

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
    const reasonText =
      failure.reason === "not-native"
        ? t("This only works inside the installed iPhone app.", "هذا يعمل فقط داخل تطبيق iPhone المثبَّت.")
        : failure.reason === "permission-denied"
          ? t("Notifications aren't enabled yet.", "الإشعارات غير مفعّلة بعد.")
          : (failure.detail || t("iOS did not accept the test notification.", "لم يقبل iOS إشعار الاختبار."));
    setTestMessage(reasonText);
  };

  return (
    <div className="space-y-5">
      {/* ---- الحالة ---- */}
      {native && permission === "denied" && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-body-sm">{t("Notifications are off — enable them in iPhone Settings.", "الإشعارات متوقفة — فعّلها من إعدادات iPhone.")}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void openNativeAppSettings()}>
            {t("Open iPhone Settings", "فتح إعدادات iPhone")}
          </Button>
        </div>
      )}
      {native && permission === "notDetermined" && (
        <div className="rounded-2xl border border-elite-gold/40 bg-elite-gold/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <BellOff className="h-4 w-4 text-elite-gold mt-0.5 shrink-0" />
            <p className="text-body-sm">{t("Notification permission hasn't been requested yet.", "لم يتم طلب صلاحية الإشعارات بعد.")}</p>
          </div>
          <Button size="sm" onClick={() => void handleEnable()} disabled={requesting}>
            {requesting ? t("Requesting…", "جارٍ الطلب…") : t("Enable notifications", "تفعيل الإشعارات")}
          </Button>
        </div>
      )}
      {native && permission === "granted" && (
        <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
          <Check className="h-4 w-4 text-primary shrink-0" />
          <p className="text-body-sm text-primary font-medium">{t("Notifications are enabled", "الإشعارات مفعّلة")}</p>
        </div>
      )}
      {!native && (
        <p className="rounded-2xl border border-foreground/10 bg-secondary/25 p-4 text-body-sm text-foreground/60">
          {t("Notification permission only applies inside the installed iPhone app.", "صلاحية الإشعارات تنطبق فقط داخل تطبيق iPhone المثبَّت.")}
        </p>
      )}

      {/* ---- الصلاة ---- */}
      <section className="space-y-2">
        <GroupTitle icon={Bell}>{t("Prayer", "الصلاة")}</GroupTitle>
        <div className="rounded-2xl border border-foreground/10 bg-secondary/25 divide-y divide-foreground/10 overflow-hidden">
          {NOTIFIABLE_PRAYERS.map((key) => (
            <Row key={key} label={t(PRAYER_LABELS[key].en, PRAYER_LABELS[key].ar)}>
              <Switch
                checked={prayerSettings.perPrayerEnabled[key] !== false}
                onCheckedChange={(v) => update({ perPrayerEnabled: { ...prayerSettings.perPrayerEnabled, [key]: v } })}
              />
            </Row>
          ))}
        </div>
        <p className="px-1 text-caption leading-relaxed text-foreground/55">
          {t(
            "Local, on-device alerts scheduled from prayer times — not a remote/admin push, so they work even without internet.",
            "تنبيهات محلية من الجهاز نفسه حسب مواقيت الصلاة — وليست إشعارات إدارية عن بُعد — لذلك تعمل حتى بلا إنترنت.",
          )}
        </p>
      </section>

      {/* ---- التذكير قبل الصلاة ---- */}
      <section className="space-y-2">
        <GroupTitle icon={Clock}>{t("Reminder before prayer", "التذكير قبل الصلاة")}</GroupTitle>
        <div className="rounded-2xl border border-foreground/10 bg-secondary/25 divide-y divide-foreground/10 overflow-hidden">
          <Row label={t("Enable reminder", "تشغيل التذكير")}>
            <Switch checked={prayerSettings.preReminderEnabled} onCheckedChange={(v) => update({ preReminderEnabled: v })} />
          </Row>
          {prayerSettings.preReminderEnabled && (
            <div className="px-3.5 py-3">
              <div className="flex flex-wrap gap-1.5">
                {PRE_REMINDER_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update({ preReminderMinutes: m })}
                    className={`min-w-[64px] rounded-lg border px-3 py-2 text-caption transition ${
                      prayerSettings.preReminderMinutes === m
                        ? "border-elite-gold bg-elite-gold/15 text-elite-gold font-semibold"
                        : "border-foreground/10 hover:bg-foreground/5"
                    }`}
                  >
                    {t(`${m} min`, `${m} دقائق`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---- الصوت ---- */}
      <section className="space-y-2">
        <GroupTitle icon={Volume2}>{t("Athan sound", "صوت الأذان")}</GroupTitle>
        <div className="rounded-2xl border border-foreground/10 bg-secondary/25 divide-y divide-foreground/10 overflow-hidden">
          {([
            { label: t("Fajr athan", "أذان الفجر"), value: prayerSettings.soundFajr, key: "soundFajr" as const },
            { label: t("Other prayers", "بقية الصلوات"), value: prayerSettings.soundOther, key: "soundOther" as const },
          ]).map((row) => (
            <div key={row.key} className="px-3.5 py-3 space-y-2">
              <div className="text-body font-medium">{row.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {ATHAN_SOUNDS.map((s) => {
                  const active = s.id === row.value;
                  const previewId = `${row.key}-${s.id}`;
                  return (
                    <div key={s.id} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => update({ [row.key]: s.id as AthanSoundId } as Partial<typeof prayerSettings>)}
                        className={`rounded-s-lg border px-2.5 py-1.5 text-caption transition ${
                          active ? "border-elite-gold bg-elite-gold/15 text-elite-gold font-semibold" : "border-foreground/10 hover:bg-foreground/5"
                        }`}
                      >
                        {active && <Check className="inline h-3 w-3 me-1" />}
                        {t(s.en, s.ar)}
                      </button>
                      <button
                        type="button"
                        aria-label={t("Preview", "استماع")}
                        disabled={!s.previewUrl}
                        onClick={() => preview(previewId, s.previewUrl)}
                        className="rounded-e-lg border border-s-0 border-foreground/10 px-2 py-1.5 disabled:opacity-30 hover:bg-foreground/5"
                      >
                        {playing === previewId ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- الأذكار ---- */}
      <section className="space-y-2">
        <GroupTitle icon={Bell}>{t("Athkar", "الأذكار")}</GroupTitle>
        <AthkarRemindersCard />
      </section>

      {/* ---- المواعيد ---- */}
      <section className="space-y-2">
        <GroupTitle icon={Calendar}>{t("Appointments", "المواعيد")}</GroupTitle>
        <p className="rounded-2xl border border-foreground/10 bg-secondary/25 p-3.5 text-body-sm text-foreground/70 leading-relaxed">
          {t(
            "Each appointment has its own reminder, set when you add or edit it in Calendar.",
            "لكل موعد تذكيره الخاص، يُحدَّد عند إضافته أو تعديله من التقويم.",
          )}
        </p>
      </section>

      {/* ---- اختبار ---- */}
      <section className="space-y-2">
        <GroupTitle icon={Bell}>{t("Test", "اختبار")}</GroupTitle>
        <div className="rounded-2xl border border-foreground/10 bg-secondary/25 p-3.5 space-y-3">
          <Button size="sm" onClick={() => void handleTest()} disabled={testState === "sending"} className="w-full">
            {testState === "sending" ? t("Scheduling…", "جارٍ الجدولة…") : t("Send a real test notification", "إرسال إشعار اختبار حقيقي")}
          </Button>
          {testMessage && (
            <p className={`text-body-sm leading-relaxed ${testState === "sent" ? "text-primary" : "text-destructive"}`}>{testMessage}</p>
          )}
          <p className="text-caption text-foreground/55">
            {t("This schedules one real notification a few seconds out, in its own id range — it never touches prayer/athkar/calendar alerts.", "يجدول إشعارًا حقيقيًا واحدًا خلال ثوانٍ قليلة، في نطاق مستقل — لا يمسّ تنبيهات الصلاة أو الأذكار أو المواعيد.")}
          </p>
        </div>
      </section>
    </div>
  );
}
