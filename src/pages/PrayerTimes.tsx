import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Compass, BellRing, BellOff, Bell, Settings as SettingsIcon } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { usePrayerCalc, type MadhabId } from "@/contexts/PrayerCalcContext";
import { methodOption } from "@/lib/prayerMethods";
import type { PrayerKey } from "@/lib/prayer";
import { isIOSNativeApp } from "@/lib/platform";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import { DateHeader } from "@/components/islamic/DateHeader";
import { NextPrayerBar } from "@/components/islamic/HeroPrayerCard";
import { CitySelector } from "@/components/islamic/CitySelector";
import { IconBadge } from "@/components/site/IconBadge";
import { PrayerStrip } from "@/components/islamic/PrayerStrip";
import { SEO } from "@/components/SEO";
import { HeaderIconButton, PageShell } from "@/components/site/PageHeader";

// Same labels as Settings.tsx's MADHABS list — kept as a small local copy
// here since this page only needs the name, not the full picker UI.
const MADHAB_LABELS: Record<MadhabId, { en: string; ar: string }> = {
  hanbali: { en: "Hanbali", ar: "الحنبلي" },
  shafi: { en: "Shafi'i", ar: "الشافعي" },
  maliki: { en: "Maliki", ar: "المالكي" },
  hanafi: { en: "Hanafi", ar: "الحنفي" },
};

/**
 * Dedicated Prayer Times page, opened from Services ("مواقيت الصلاة").
 * Reuses the existing Home widgets (HeroPrayerCard/PrayerStrip/DateHeader) and
 * calculation context rather than a parallel prayer-time implementation.
 */
export default function PrayerTimes() {
  const { t, lang } = useLocale();
  const navigate = useNavigate();
  const { madhab, method } = usePrayerCalc();
  const nativeApp = isIOSNativeApp();
  const madhabLabel = MADHAB_LABELS[madhab];
  const methodLabel = methodOption(method);
  // Tapping a prayer points the countdown (and its time-of-day colours) at that prayer;
  // tapping it again returns to the automatic "next prayer".
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerKey | null>(null);

  return (
    <PageShell
      titleAr="أوقات الصلاة"
      titleEn="Prayer Times"
      fallback="/tools"
      action={
        <HeaderIconButton label={t("Prayer settings", "إعدادات الصلاة")} onClick={() => navigate("/prayer-settings")}>
          <SettingsIcon className="h-5 w-5" />
        </HeaderIconButton>
      }
      extra={
        <div className="flex justify-center">
          <CitySelector />
        </div>
      }
    >
      <SEO
        title={t("Prayer Times — Elite Islamic", "مواقيت الصلاة — النخبة الإسلامية")}
        description={t(
          "Today's five prayer times, next prayer countdown, and Sunnah times for your city.",
          "مواقيت الصلوات الخمس اليوم، والعد التنازلي للصلاة القادمة، وأوقات السنن لمدينتك.",
        )}
        path="/prayer-times"
        lang={lang === "ar" ? "ar" : "en"}
      />

      <div className="space-y-4">
        <DateHeader />
        <NextPrayerBar selectedKey={selectedPrayer} atmosphere />
        <PrayerStrip variant="list" selectedKey={selectedPrayer} onSelect={setSelectedPrayer} />

        {/* Calculation info — madhab & method, with a link to change them */}
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconBadge icon={Compass} size="sm" tone="soft" />
            <div className="min-w-0 leading-tight">
              <div className="text-body-sm text-foreground/60">{t("Calculation", "طريقة الحساب")}</div>
              <div className="truncate text-body font-medium text-foreground">
                {t(methodLabel.en, methodLabel.ar)} · {t(madhabLabel.en, madhabLabel.ar)}
              </div>
            </div>
          </div>
          <Link to="/prayer-settings" className="shrink-0 whitespace-nowrap text-body-sm font-semibold text-primary hover:underline">
            {t("Change", "تغيير")}
          </Link>
        </div>

        {/* Notification / Athan status — reads the new notification system's
            live state, never a hardcoded "enabled" claim. */}
        <NotificationStatusRow nativeApp={nativeApp} />
      </div>
    </PageShell>
  );
}

function NotificationStatusRow({ nativeApp }: { nativeApp: boolean }) {
  const { t } = useLocale();

  if (!nativeApp) {
    return (
      <div className="glass rounded-2xl p-4 flex items-center gap-3 border border-foreground/10">
        <span className="h-9 w-9 rounded-xl grid place-items-center bg-foreground/10 text-foreground/50 shrink-0">
          <Bell className="h-4 w-4" />
        </span>
        <p className="text-body-sm text-foreground/60">
          {t(
            "Athan notifications work only inside the iPhone app.",
            "إشعارات الأذان تعمل فقط داخل تطبيق iPhone.",
          )}
        </p>
      </div>
    );
  }

  return <NativeNotificationStatusRow />;
}

// Split out so `useNotifications()` (which requires NotificationsProvider,
// mounted app-wide) is only called on native, matching the same guard used
// throughout NotificationSettingsSection.tsx.
function NativeNotificationStatusRow() {
  const { t } = useLocale();
  const { permission, scheduledPrayerCount } = useNotifications();

  const status =
    permission === "granted"
      ? {
          Icon: BellRing,
          className: "bg-primary/15 text-primary",
          text: t("Notifications are enabled", "الإشعارات مفعّلة"),
          detail:
            scheduledPrayerCount > 0
              ? t(
                  `${scheduledPrayerCount} prayer notifications scheduled`,
                  `تم جدولة ${scheduledPrayerCount} إشعارًا للصلاة`,
                )
              : t("No prayer notifications are enabled yet", "لا توجد إشعارات صلاة مفعّلة بعد"),
        }
      : permission === "denied"
        ? {
            Icon: BellOff,
            className: "bg-destructive/15 text-destructive",
            text: t("Notifications are off — enable them in iPhone Settings", "الإشعارات متوقفة — فعّلها من إعدادات iPhone"),
            detail: null,
          }
        : {
            Icon: Bell,
            className: "bg-foreground/10 text-foreground/60",
            text: t("Notification permission not requested yet", "لم يتم طلب إذن الإشعارات بعد"),
            detail: null,
          };

  return (
    <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3 border border-foreground/10">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${status.className}`}>
          <status.Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="text-body-sm font-medium text-foreground">{status.text}</div>
          {status.detail && <div className="text-caption text-foreground/60">{status.detail}</div>}
        </div>
      </div>
      <Link
        to="/settings"
        className="shrink-0 text-caption text-accent hover:underline whitespace-nowrap"
      >
        {t("Manage", "إدارة")}
      </Link>
    </div>
  );
}
