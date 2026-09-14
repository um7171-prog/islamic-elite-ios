import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Clock,
  Compass,
  Minus,
  Plus,
  Play,
  Square,
  Sliders,
  Volume2,
  Check,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { PRAYER_METHODS } from "@/lib/prayerMethods";
import type { PrayerKey } from "@/lib/prayer";
import {
  AthanSettings,
  AthanSound,
  ATHAN_SOUNDS,
  athanSoundOption,
  PRE_REMINDER_VOICE_URL,
  PRE_REMINDER_NATIVE_SOUND,
  saveAthanSettings,
  soundUrl,
} from "@/lib/athanSettings";
import { ensureNativePermission, isNativeApp, openNativeAppSettings } from "@/lib/nativeAthan";
import {
  NOTIFICATION_PERMISSION_ANSWERED_EVENT,
  requestReopenNotificationPrompt,
} from "@/components/islamic/NotificationPermissionPrompt";
import { toast } from "@/hooks/use-toast";

interface Props {
  settings: AthanSettings;
  onChange: (s: AthanSettings) => void;
  scheduledCount?: number;
  onReschedule?: () => void | Promise<unknown>;
}

const PRAYER_ITEMS: { key: PrayerKey; en: string; ar: string }[] = [
  { key: "fajr", en: "Fajr", ar: "الفجر" },
  { key: "dhuhr", en: "Dhuhr", ar: "الظهر" },
  { key: "asr", en: "Asr", ar: "العصر" },
  { key: "maghrib", en: "Maghrib", ar: "المغرب" },
  { key: "isha", en: "Isha", ar: "العشاء" },
];

const PRE_OPTIONS: (0 | 5 | 10 | 15 | 20)[] = [0, 5, 10, 15, 20];

function Group({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className="h-4 w-4 text-elite-gold" />
        <h3 className="text-[13px] font-semibold text-elite-gold">{title}</h3>
      </div>
      <div className="rounded-2xl border border-foreground/10 bg-secondary/25 divide-y divide-foreground/10 overflow-hidden">
        {children}
      </div>
      {hint && <p className="px-1 text-[11px] leading-relaxed text-foreground/55">{hint}</p>}
    </section>
  );
}

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3 min-h-[48px]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-[11px] text-foreground/55 leading-snug">{sub}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

export function AthanSettingsCard({ settings, onChange, onReschedule }: Props) {
  const { t, lang } = useLocale();
  const native = isNativeApp();
  const { method, setMethod, adjustments, setAdjustment, resetAdjustments, prefs, setPref } =
    usePrayerCalc();
  // "granted" | "denied" | "prompt" | "unknown" (unknown = not checked yet / web).
  // Read-only check on mount — opening Settings must never pop Apple's system
  // dialog on its own; only the explicit "Enable now" button below may do that.
  const [permStatus, setPermStatus] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!native) return;
    let alive = true;
    void (async () => {
      const p = await ensureNativePermission(false);
      if (!alive) return;
      setPermStatus(p.denied ? "denied" : p.granted ? "granted" : "prompt");
      if (p.granted) await onReschedule?.();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  // Refresh the banner once the shared first-launch dialog has been answered
  // (enabled or deferred) — without this, accepting there wouldn't update
  // this card's banner until the next time Settings is opened.
  useEffect(() => {
    if (!native) return;
    const onAnswered = () => {
      void ensureNativePermission(false).then((p) =>
        setPermStatus(p.denied ? "denied" : p.granted ? "granted" : "prompt"),
      );
    };
    window.addEventListener(NOTIFICATION_PERMISSION_ANSWERED_EVENT, onAnswered);
    return () => window.removeEventListener(NOTIFICATION_PERMISSION_ANSWERED_EVENT, onAnswered);
  }, [native]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const stopPreview = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      try { a.currentTime = 0; } catch { /* ignore */ }
      audioRef.current = null;
    }
    setPlaying(null);
  };

  const preview = (id: string, url: string) => {
    const was = playing === id;
    stopPreview();
    if (was || !url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    setPlaying(id);
    void audio.play().catch(() => {
      setPlaying(null);
      toast({ title: t("Could not play the audio", "تعذّر تشغيل الصوت") });
    });
  };

  const update = (patch: Partial<AthanSettings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    saveAthanSettings(next);
    void onReschedule?.();
  };

  const togglePrayer = (key: PrayerKey, on: boolean) => {
    // Update + persist immediately so the switch always reflects the tap on iOS.
    update({ perPrayerEnabled: { ...settings.perPrayerEnabled, [key]: on } });
    if (on && native) {
      // Read-only refresh of the banner state — never pops the system dialog
      // on its own; the user taps "Enable now" for that.
      void ensureNativePermission(false)
        .then((p) => setPermStatus(p.denied ? "denied" : p.granted ? "granted" : "prompt"))
        .catch(() => {});
    }
  };


  const SoundRow = ({
    label,
    value,
    onPick,
  }: { label: string; value: AthanSound; onPick: (v: AthanSound) => void }) => (
    <div className="px-3.5 py-3 space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {ATHAN_SOUNDS.map((s) => {
          const active = s.value === value;
          const id = `${label}-${s.value}`;
          return (
            <div key={s.value} className="flex items-center">
              <button
                type="button"
                onClick={() => onPick(s.value)}
                className={`rounded-s-lg border px-2.5 py-1.5 text-[11px] transition ${
                  active
                    ? "border-elite-gold bg-elite-gold/15 text-elite-gold font-semibold"
                    : "border-foreground/10 hover:bg-foreground/5"
                }`}
              >
                {active && <Check className="inline h-3 w-3 me-1" />}
                {t(s.en, s.ar)}
              </button>
              <button
                type="button"
                aria-label={t("Preview", "استماع")}
                disabled={!soundUrl(s.value)}
                onClick={() => preview(id, soundUrl(s.value))}
                className="rounded-e-lg border border-s-0 border-foreground/10 px-2 py-1.5 disabled:opacity-30 hover:bg-foreground/5"
              >
                {playing === id ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {native && permStatus === "denied" && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <p className="text-sm">إشعارات التطبيق مقفلة من إعدادات iPhone.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void openNativeAppSettings()}>
            فتح إعدادات iPhone
          </Button>
        </div>
      )}

      {native && permStatus === "prompt" && (
        <div className="rounded-2xl border border-elite-gold/40 bg-elite-gold/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Bell className="h-4 w-4 text-elite-gold mt-0.5" />
            <p className="text-sm">لم يتم تفعيل الإشعارات بعد — فعّلها لتصلك تنبيهات مواقيت الصلاة في وقتها.</p>
          </div>
          <Button size="sm" onClick={() => requestReopenNotificationPrompt()}>
            {t("Enable notifications now", "تفعيل الإشعارات الآن")}
          </Button>
        </div>
      )}

      {/* 1 — Prayer notifications */}
      <Group
        icon={Bell}
        title={t("Prayer notifications", "إشعارات الصلوات")}
        hint={t(
          "A separate switch for each prayer.",
          "مفتاح مستقل لكل صلاة، يعمل حتى والتطبيق مغلق.",
        )}
      >
        {PRAYER_ITEMS.map((p) => (
          <Row key={p.key} label={t(p.en, p.ar)}>
            <Switch
              checked={settings.perPrayerEnabled[p.key] !== false}
              onCheckedChange={(v) => void togglePrayer(p.key, v)}
            />
          </Row>
        ))}
      </Group>

      {/* 2 — Pre-prayer reminder */}
      <Group
        icon={Clock}
        title={t("Reminder before prayer", "تنبيه قبل الصلاة")}
        hint={`«استغفر الله وأتوب إليه» — ${PRE_REMINDER_NATIVE_SOUND}`}
      >
        <div className="px-3.5 py-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PRE_OPTIONS.map((m) => {
              const active = settings.preReminderMinutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => update({ preReminderMinutes: m })}
                  className={`min-w-[64px] rounded-lg border px-3 py-2 text-xs transition ${
                    active
                      ? "border-elite-gold bg-elite-gold/15 text-elite-gold font-semibold"
                      : "border-foreground/10 hover:bg-foreground/5"
                  }`}
                >
                  {m === 0 ? t("Off", "إيقاف") : t(`${m} min`, `${m} دقائق`)}
                </button>
              );
            })}
          </div>
        </div>
        <Row label={t("Reminder voice", "صوت التنبيه")} sub="استغفر الله وأتوب إليه">
          <button
            type="button"
            onClick={() => preview("pre", PRE_REMINDER_VOICE_URL)}
            className="rounded-lg border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/5"
          >
            {playing === "pre" ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
        </Row>
      </Group>

      {/* 3 — Calculation method */}
      <Group icon={Compass} title={t("Calculation method", "طريقة حساب مواقيت الصلاة")}>
        <div className="px-3.5 py-3 grid grid-cols-2 gap-1.5">
          {PRAYER_METHODS.map((m) => {
            const active = method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMethod(m.id); void onReschedule?.(); }}
                className={`text-start rounded-lg border px-2.5 py-2 text-[12px] transition ${
                  active
                    ? "border-elite-gold bg-elite-gold/15 text-elite-gold font-semibold"
                    : "border-foreground/10 hover:bg-foreground/5"
                }`}
              >
                {active && <Check className="inline h-3 w-3 me-1" />}
                {t(m.en, m.ar)}
              </button>
            );
          })}
        </div>
      </Group>

      {/* 4 — Manual time adjustment */}
      <Group
        icon={Sliders}
        title={t("Adjust prayer times", "تعديل أوقات الصلاة")}
        hint={t("Fine tune each prayer by minutes.", "اضبط كل صلاة بالدقائق لتطابق مسجدك.")}
      >
        {PRAYER_ITEMS.map((p) => {
          const v = adjustments[p.key] || 0;
          return (
            <Row
              key={p.key}
              label={t(p.en, p.ar)}
              sub={v === 0 ? undefined : `${v > 0 ? "+" : ""}${v} ${t("min", "دقيقة")}`}
            >
              <button
                type="button"
                aria-label="-1"
                onClick={() => { setAdjustment(p.key, v - 1); void onReschedule?.(); }}
                className="h-9 w-9 grid place-items-center rounded-lg border border-foreground/10 hover:bg-foreground/5"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm font-semibold tabular-nums" dir="ltr">
                {v > 0 ? `+${v}` : v}
              </span>
              <button
                type="button"
                aria-label="+1"
                onClick={() => { setAdjustment(p.key, v + 1); void onReschedule?.(); }}
                className="h-9 w-9 grid place-items-center rounded-lg border border-foreground/10 hover:bg-foreground/5"
              >
                <Plus className="h-4 w-4" />
              </button>
            </Row>
          );
        })}
        <div className="px-3.5 py-2.5">
          <Button
            size="sm"
            variant="ghost"
            className="gap-2 text-xs"
            onClick={() => { resetAdjustments(); void onReschedule?.(); }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("Reset adjustments", "إعادة ضبط التعديلات")}
          </Button>
        </div>
      </Group>

      {/* Athan voices */}
      <Group icon={Volume2} title={t("Athan voice", "صوت الأذان")}>
        <SoundRow
          label={t("Fajr athan", "أذان الفجر")}
          value={settings.soundFajr}
          onPick={(v) => update({ soundFajr: v })}
        />
        <SoundRow
          label={t("Other prayers", "بقية الصلوات")}
          value={settings.soundOther}
          onPick={(v) => update({ soundOther: v })}
        />
      </Group>

      {/* 5 — Extra options */}
      <Group icon={Sliders} title={t("Additional options", "خيارات إضافية")}>
        <Row label={t("Update city automatically", "تحديث المدينة تلقائيًا")}>
          <Switch checked={prefs.autoCity} onCheckedChange={(v) => setPref("autoCity", v)} />
        </Row>
        <Row label={t("City names in Arabic", "أسماء المدن باللغة العربية")}>
          <Switch
            checked={prefs.arabicCityNames}
            onCheckedChange={(v) => setPref("arabicCityNames", v)}
          />
        </Row>
        <Row label={t("Show sunrise time", "عرض وقت الشروق")}>
          <Switch checked={prefs.showSunrise} onCheckedChange={(v) => setPref("showSunrise", v)} />
        </Row>
        <Row label={t("First takbir only", "التكبيرة الأولى للأذان فقط")}>
          <Switch
            checked={prefs.firstTakbirOnly}
            onCheckedChange={(v) => setPref("firstTakbirOnly", v)}
          />
        </Row>
        <Row
          label={t("Delay Isha by 30 minutes", "تأخير صلاة العشاء نصف ساعة")}
          sub={t("Applies to times and notifications", "يُطبّق على المواقيت والإشعارات")}
        >
          <Switch
            checked={prefs.ishaDelay30}
            onCheckedChange={(v) => { setPref("ishaDelay30", v); void onReschedule?.(); }}
          />
        </Row>
      </Group>
    </div>
  );
}
