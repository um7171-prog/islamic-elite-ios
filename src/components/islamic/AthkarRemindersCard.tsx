import { useEffect, useMemo, useState } from "react";
import { Sunrise, Sunset, Play, Music2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getPrayerTimes } from "@/lib/prayer";
import {
  REMINDER_SOUNDS,
  previewReminderSound,
  type ReminderSoundId,
} from "@/lib/reminderSounds";
import {
  loadAthkarSettings,
  saveAthkarSettings,
  type AthkarDayTimes,
  type AthkarReminderSettings,
} from "@/lib/athkarReminders";
import { requestNativeNotificationRebuild } from "@/lib/nativeNotificationCoordinator";

const OFFSETS = [15, 30, 45, 60, 90, 120];

function fmt(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function AthkarRemindersCard() {
  const { t, lang } = useLocale();
  const { city } = useCity();
  const { madhab, method, adjustments, prefs, calcSignature } = usePrayerCalc();
  const [settings, setSettings] = useState<AthkarReminderSettings>(() => loadAthkarSettings());

  const calc = useMemo(
    () => ({ method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 }),
    [method, adjustments, prefs.ishaDelay30],
  );

  const days: AthkarDayTimes[] = useMemo(() => {
    const out: AthkarDayTimes[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const { times } = getPrayerTimes(d, city.lat, city.lng, madhab, calc);
      out.push({ sunrise: times.sunrise, maghrib: times.maghrib });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.lat, city.lng, madhab, calcSignature]);

  useEffect(() => {
    saveAthkarSettings(settings);
    requestNativeNotificationRebuild();
  }, [settings, days, lang]);

  const update = (patch: Partial<AthkarReminderSettings>) =>
    setSettings((p) => ({ ...p, ...patch }));

  const today = days[0];
  const morningAt = today ? new Date(today.sunrise.getTime() + settings.morningAfterSunrise * 60_000) : null;
  const eveningAt = today ? new Date(today.maghrib.getTime() - settings.eveningBeforeMaghrib * 60_000) : null;

  const Chips = ({
    value,
    onSelect,
  }: {
    value: number;
    onSelect: (v: number) => void;
  }) => (
    <div className="flex flex-wrap gap-1.5">
      {OFFSETS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelect(m)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-caption transition",
            value === m
              ? "border-primary bg-primary/15 text-primary"
              : "border-foreground/15 text-foreground/70 hover:border-foreground/30",
          )}
        >
          {lang === "ar" ? `${m} د` : `${m} min`}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Morning */}
      <div className="rounded-xl border border-foreground/10 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sunrise className="h-4 w-4 text-accent shrink-0" />
            <div className="min-w-0">
              <div className="text-body font-medium">{t("Morning Athkar", "أذكار الصباح")}</div>
              <div className="text-caption text-foreground/60">
                {morningAt
                  ? t(`After sunrise · today ${fmt(morningAt)}`, `بعد الشروق · اليوم ${fmt(morningAt)}`)
                  : t("After sunrise", "بعد الشروق")}
              </div>
            </div>
          </div>
          <Switch
            checked={settings.morningEnabled}
            onCheckedChange={(v) => update({ morningEnabled: v })}
          />
        </div>
        {settings.morningEnabled && (
          <Chips value={settings.morningAfterSunrise} onSelect={(v) => update({ morningAfterSunrise: v })} />
        )}
      </div>

      {/* Evening */}
      <div className="rounded-xl border border-foreground/10 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sunset className="h-4 w-4 text-accent shrink-0" />
            <div className="min-w-0">
              <div className="text-body font-medium">{t("Evening Athkar", "أذكار المساء")}</div>
              <div className="text-caption text-foreground/60">
                {eveningAt
                  ? t(`Before Maghrib · today ${fmt(eveningAt)}`, `قبل المغرب · اليوم ${fmt(eveningAt)}`)
                  : t("Before Maghrib", "قبل المغرب")}
              </div>
            </div>
          </div>
          <Switch
            checked={settings.eveningEnabled}
            onCheckedChange={(v) => update({ eveningEnabled: v })}
          />
        </div>
        {settings.eveningEnabled && (
          <Chips value={settings.eveningBeforeMaghrib} onSelect={(v) => update({ eveningBeforeMaghrib: v })} />
        )}
      </div>

      {/* Sound */}
      <div className="rounded-xl border border-foreground/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-accent" />
          <div className="text-body font-medium">{t("Athkar reminder sound", "صوت تنبيه الأذكار")}</div>
        </div>
        <p className="text-caption text-foreground/60">
          {t("Short bell tone — never the adhan.", "نغمة جرس قصيرة — ليست أذاناً.")}
        </p>
        <div className="space-y-1.5">
          {REMINDER_SOUNDS.filter((s) => s.id !== "notif_calm").map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition",
                settings.sound === s.id
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:bg-foreground/5",
              )}
            >
              <button
                type="button"
                onClick={() => update({ sound: s.id as ReminderSoundId })}
                className="min-w-0 flex-1 text-start text-caption font-medium"
              >
                {lang === "ar" ? s.ar : s.en}
              </button>
              {s.preview && (
                <button
                  type="button"
                  onClick={() => previewReminderSound(s.id)}
                  aria-label={t("Preview", "استماع")}
                  className="h-7 w-7 shrink-0 rounded-full grid place-items-center bg-accent/15 text-accent transition active:scale-95"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
