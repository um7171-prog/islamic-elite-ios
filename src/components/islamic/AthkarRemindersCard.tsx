import { useEffect, useMemo, useState } from "react";
import { Sunrise, Sunset, Play, Music2, Check } from "lucide-react";
import { ChipPicker, SettingsGroup, SettingsRow } from "@/components/site/SettingsUI";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getPrayerTimes } from "@/lib/prayer";
import {
  REMINDER_SOUNDS,
  previewSound,
  type ReminderSoundId,
} from "@/lib/notifications/NotificationSounds";
import {
  loadAthkarSettings,
  saveAthkarSettings,
  type AthkarDayTimes,
  type AthkarReminderSettings,
} from "@/lib/athkarReminders";
import { requestNotificationRebuild } from "@/lib/notifications/NotificationScheduler";

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
    requestNotificationRebuild();
  }, [settings, days, lang]);

  const update = (patch: Partial<AthkarReminderSettings>) =>
    setSettings((p) => ({ ...p, ...patch }));

  const today = days[0];
  const morningAt = today ? new Date(today.sunrise.getTime() + settings.morningAfterSunrise * 60_000) : null;
  const eveningAt = today ? new Date(today.maghrib.getTime() - settings.eveningBeforeMaghrib * 60_000) : null;

  const offsetOptions = OFFSETS.map((m) => ({ value: m, label: lang === "ar" ? `${m} د` : `${m} min` }));

  return (
    <div className="space-y-4">
      <SettingsGroup>
        <SettingsRow
          icon={Sunrise}
          label={t("Morning Athkar", "أذكار الصباح")}
          description={
            morningAt
              ? t(`After sunrise · today ${fmt(morningAt)}`, `بعد الشروق · اليوم ${fmt(morningAt)}`)
              : t("After sunrise", "بعد الشروق")
          }
        >
          <Switch
            aria-label={t("Morning Athkar", "أذكار الصباح")}
            checked={settings.morningEnabled}
            onCheckedChange={(v) => update({ morningEnabled: v })}
          />
        </SettingsRow>
        {settings.morningEnabled && (
          <div className="pt-3">
            <p className="px-4 pb-2 text-caption text-foreground/60">{t("Minutes after sunrise", "بعد الشروق بـ")}</p>
            <ChipPicker value={settings.morningAfterSunrise} options={offsetOptions} onChange={(v) => update({ morningAfterSunrise: v })} />
          </div>
        )}
        <SettingsRow
          icon={Sunset}
          label={t("Evening Athkar", "أذكار المساء")}
          description={
            eveningAt
              ? t(`Before Maghrib · today ${fmt(eveningAt)}`, `قبل المغرب · اليوم ${fmt(eveningAt)}`)
              : t("Before Maghrib", "قبل المغرب")
          }
        >
          <Switch
            aria-label={t("Evening Athkar", "أذكار المساء")}
            checked={settings.eveningEnabled}
            onCheckedChange={(v) => update({ eveningEnabled: v })}
          />
        </SettingsRow>
        {settings.eveningEnabled && (
          <div className="pt-3">
            <p className="px-4 pb-2 text-caption text-foreground/60">{t("Minutes before Maghrib", "قبل المغرب بـ")}</p>
            <ChipPicker value={settings.eveningBeforeMaghrib} options={offsetOptions} onChange={(v) => update({ eveningBeforeMaghrib: v })} />
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup>
        <div className="space-y-2 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-primary" />
            <div className="text-body font-medium">{t("Athkar reminder sound", "صوت تنبيه الأذكار")}</div>
          </div>
          <p className="text-caption text-foreground/60">
            {t("Short bell tone — never the adhan.", "نغمة جرس قصيرة — ليست أذاناً.")}
          </p>
        </div>
        {REMINDER_SOUNDS.filter((s) => s.id !== "notif_calm").map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-2">
            <button
              type="button"
              aria-pressed={settings.sound === s.id}
              onClick={() => update({ sound: s.id as ReminderSoundId })}
              className={cn(
                "flex min-h-[48px] min-w-0 flex-1 items-center gap-2 px-2 text-start text-body-sm",
                settings.sound === s.id ? "font-semibold text-primary" : "text-foreground/80",
              )}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center">
                {settings.sound === s.id && <Check className="h-4 w-4" />}
              </span>
              {lang === "ar" ? s.ar : s.en}
            </button>
            {s.previewUrl && (
              <button
                type="button"
                onClick={() => previewSound(s.previewUrl)}
                aria-label={t("Preview", "استماع")}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition active:scale-95"
              >
                <Play className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </SettingsGroup>
    </div>
  );
}
