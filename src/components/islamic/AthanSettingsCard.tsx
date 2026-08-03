import { useEffect, useState } from "react";
import { Bell, BellOff, Volume2, Info, Cloud, CloudOff, Wand2, BellRing } from "lucide-react";
import { BackgroundNotificationsWizard } from "./BackgroundNotificationsWizard";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import {
  AthanSettings,
  AthanSound,
  loadAthanSettings,
  saveAthanSettings,
  todayISO,
} from "@/lib/athanSettings";
import { getAthanEnvironment, requestAthanPermission, testAthanNotification } from "@/lib/athan";
import {
  pushAllowedHere,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushNotifications";
import { toast } from "@/hooks/use-toast";

interface Props {
  settings: AthanSettings;
  onChange: (s: AthanSettings) => void;
  scheduledCount: number;
}

const SOUND_OPTIONS: { value: AthanSound; en: string; ar: string }[] = [
  { value: "makkah",  en: "Makkah",  ar: "مكة" },
  { value: "madinah", en: "Madinah", ar: "المدينة" },
  { value: "fajr",    en: "Fajr",    ar: "الفجر" },
  { value: "ibnMajid",en: "Ibn Majid", ar: "ابن ماجد" },
  { value: "default", en: "Silent",  ar: "صامت" },
];

export function AthanSettingsCard({ settings, onChange, scheduledCount }: Props) {
  const { t, dir, lang } = useLocale();
  const { city } = useCity();
  const env = getAthanEnvironment();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [bgEnabled, setBgEnabled] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const bgAllowed = pushAllowedHere();

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, [settings.enabled]);

  useEffect(() => {
    isPushSubscribed().then(setBgEnabled).catch(() => setBgEnabled(false));
  }, []);

  const toggleBackground = async (on: boolean) => {
    if (on && (!bgAllowed || permission !== "granted")) {
      // Open the wizard to guide through prerequisites + permission + subscription.
      setWizardOpen(true);
      return;
    }
    setBgBusy(true);
    try {
      if (on) {
        await subscribeToPush({ lat: city.lat, lng: city.lng }, settings, lang);
        setBgEnabled(true);
        toast({
          title: t("Background alerts enabled", "تم تفعيل التنبيهات بالخلفية"),
          description: t("Notifications will arrive even if the app is closed.", "ستصلك التنبيهات حتى لو كان التطبيق مغلقاً."),
        });
      } else {
        await unsubscribeFromPush();
        setBgEnabled(false);
        toast({ title: t("Background alerts disabled", "تم إيقاف التنبيهات بالخلفية") });
      }
    } catch (e: any) {
      // If subscribe failed for any reason, fall back to wizard.
      if (on) setWizardOpen(true);
      toast({
        title: t("Couldn't enable background alerts", "تعذر تفعيل التنبيهات بالخلفية"),
        description: String(e?.message || e),
      });
    } finally {
      setBgBusy(false);
    }
  };

  // Re-sync subscription when settings or city change while enabled.
  useEffect(() => {
    if (!bgEnabled) return;
    subscribeToPush({ lat: city.lat, lng: city.lng }, settings, lang).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    city.id,
    settings.preReminderMinutes,
    settings.dhikrReminderMinutes,
    settings.nightAlertsEnabled,
    lang,
  ]);

  const update = (patch: Partial<AthanSettings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    saveAthanSettings(next);
  };

  const enableAthan = async (on: boolean) => {
    if (on) {
      if (!env.supported || !env.isSecure) {
        toast({
          title: t("Notifications unavailable", "الإشعارات غير متاحة"),
          description: t("Open the app on HTTPS: techsnds.com or install it from Safari.", "افتح التطبيق عبر HTTPS: techsnds.com أو ثبّته من Safari."),
        });
        return;
      }
      const p = await requestAthanPermission();
      setPermission(p);
      if (p !== "granted") {
        toast({
          title: t("Notifications blocked", "الإشعارات معطّلة"),
          description: t("Allow notifications in your browser to receive Athan.", "السماح بالإشعارات لتلقي الأذان."),
        });
        return;
      }
    }
    update({ enabled: on });
  };

  const muteToday = () => {
    const iso = todayISO();
    if (settings.mutedDates.includes(iso)) {
      update({ mutedDates: settings.mutedDates.filter((d) => d !== iso) });
      toast({ title: t("Athan unmuted for today", "تم إلغاء كتم الأذان لليوم") });
    } else {
      update({ mutedDates: [...settings.mutedDates, iso] });
      toast({ title: t("Athan muted for today", "تم كتم الأذان لليوم") });
    }
  };

  const isMutedToday = settings.mutedDates.includes(todayISO());

  return (
    <div dir={dir} className="glass rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-accent/15 text-accent">
            {settings.enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
          <div>
            <div className="font-display text-base font-semibold text-elite-gold">
              {t("Athan Notifications", "إشعارات الأذان")}
            </div>
            <div className="text-[11px] text-foreground/60">
              {settings.enabled
                ? t(`${scheduledCount} scheduled today`, `${scheduledCount} مجدولة اليوم`)
                : t("Local Athan reminders", "تذكيرات الأذان محلياً")}
            </div>
          </div>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={enableAthan} />
      </div>

      {permission !== "granted" && (() => {
        if (!env.isSecure) {
          return (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 text-destructive-foreground p-3 text-xs">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {t(
                  "Notifications require a secure HTTPS domain. Publish on techsnds.com, then retry.",
                  "الإشعارات تتطلب دومين HTTPS آمن. انشر على techsnds.com ثم أعد المحاولة.",
                )}
              </span>
            </div>
          );
        }

        if (env.isIOS && !env.isStandalone) {
          return (
            <div className="flex items-start gap-2 rounded-xl bg-accent/10 text-foreground p-3 text-xs">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
              <span>
                {t(
                  "On iPhone: tap Share → Add to Home Screen, then open the installed app to enable Athan notifications.",
                  "على الآيفون: اضغط مشاركة → إضافة إلى الشاشة الرئيسية، ثم افتح التطبيق المثبت لتفعيل إشعارات الأذان.",
                )}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 text-destructive-foreground p-3 text-xs">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {t(
                "Browser notification permission is required.",
                "الإذن بالإشعارات من المتصفح مطلوب.",
              )}
            </span>
          </div>
        );
      })()}

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-foreground/60">
          {t("Pre-reminder", "تذكير مسبق")}
        </Label>
        <RadioGroup
          value={String(settings.preReminderMinutes)}
          onValueChange={(v) => update({ preReminderMinutes: Number(v) as AthanSettings["preReminderMinutes"] })}
          className="grid grid-cols-5 gap-2"
        >
          {[0, 5, 10, 15, 20].map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-lg border border-foreground/10 p-2 text-center text-xs transition-colors ${
                settings.preReminderMinutes === m ? "bg-accent text-accent-foreground border-accent" : "hover:bg-foreground/5"
              }`}
            >
              <RadioGroupItem value={String(m)} className="sr-only" />
              {m === 0 ? t("Off", "إيقاف") : `${m}m`}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-foreground/60">
            {t("Fajr sound", "صوت الفجر")}
          </Label>
          <Select value={settings.soundFajr} onValueChange={(v) => update({ soundFajr: v as AthanSound })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOUND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(o.en, o.ar)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-foreground/60">
            {t("Other prayers", "بقية الصلوات")}
          </Label>
          <Select value={settings.soundOther} onValueChange={(v) => update({ soundOther: v as AthanSound })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOUND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(o.en, o.ar)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-foreground/60">
          {t("\"Remember Allah\" pre-athan", "تنبيه «اذكر الله» قبل الأذان")}
        </Label>
        <RadioGroup
          value={String(settings.dhikrReminderMinutes)}
          onValueChange={(v) => update({ dhikrReminderMinutes: Number(v) as AthanSettings["dhikrReminderMinutes"] })}
          className="grid grid-cols-3 gap-2"
        >
          {[0, 5, 10].map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-lg border border-foreground/10 p-2 text-center text-xs transition-colors ${
                settings.dhikrReminderMinutes === m ? "bg-accent text-accent-foreground border-accent" : "hover:bg-foreground/5"
              }`}
            >
              <RadioGroupItem value={String(m)} className="sr-only" />
              {m === 0 ? t("Off", "إيقاف") : t(`${m} min before`, `قبل ${m} دقائق`)}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-foreground/10 p-3">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">
            {t("Night alerts (Midnight & Last third)", "تنبيهات الليل (منتصف الليل والثلث الأخير)")}
          </div>
          <div className="text-[11px] text-foreground/60">
            {t("Soft chime + reminder for Qiyam & Witr", "نغمة هادئة وتذكير بالقيام والوتر")}
          </div>
        </div>
        <Switch
          checked={settings.nightAlertsEnabled}
          onCheckedChange={(v) => update({ nightAlertsEnabled: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 p-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-lg grid place-items-center bg-accent/15 text-accent">
            {bgEnabled ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="text-sm font-medium">
              {t("Background notifications", "تنبيهات بالخلفية")}
            </div>
            <div className="text-[11px] text-foreground/60 leading-relaxed">
              {bgAllowed
                ? t("Works when the app is closed (techsnds.com)", "تعمل حتى لو كان التطبيق مغلقاً (techsnds.com)")
                : t("Open techsnds.com to enable.", "افتح techsnds.com للتفعيل.")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 gap-1 text-[11px]"
            onClick={() => setWizardOpen(true)}
            aria-label={t("Open setup wizard", "فتح المعالج")}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {t("Setup", "معالج")}
          </Button>
          <Switch
            checked={bgEnabled}
            disabled={bgBusy}
            onCheckedChange={toggleBackground}
          />
        </div>
      </div>

      <BackgroundNotificationsWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        settings={settings}
        onActivated={() => setBgEnabled(true)}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={muteToday} className="gap-2">
          <Volume2 className="h-4 w-4" />
          {isMutedToday ? t("Unmute today", "إلغاء الكتم") : t("Mute today", "كتم اليوم")}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={async () => {
            const res = await testAthanNotification(lang, settings.soundOther);
            if (res.ok) {
              toast({
                title: t("Test sent", "تم إرسال التجربة"),
                description: t("Check your notifications.", "تحقق من شريط الإشعارات."),
              });
            } else if (res.reason === "denied") {
              toast({
                title: t("Notifications blocked", "الإشعارات معطّلة"),
                description: t("Allow notifications in your browser.", "السماح بالإشعارات في المتصفح."),
              });
            } else {
              toast({
                title: t("Notifications unavailable", "الإشعارات غير متاحة"),
                description: t("This device does not support notifications.", "هذا الجهاز لا يدعم الإشعارات."),
              });
            }
          }}
        >
          <BellRing className="h-4 w-4" />
          {t("Test alert", "اختبار التنبيه")}
        </Button>
        <div className="w-full text-[10px] text-foreground/50 leading-relaxed">
          {t(
            "Background uses Web Push (Android/Desktop). iOS requires Add to Home Screen.",
            "الوضع الخلفي يستخدم Web Push (أندرويد/كمبيوتر). iOS يتطلب إضافة للشاشة الرئيسية.",
          )}
        </div>
      </div>
    </div>
  );
}
