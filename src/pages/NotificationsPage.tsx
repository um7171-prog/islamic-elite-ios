import { useNavigate } from "react-router-dom";
import { BellOff, BellRing, Megaphone, Settings as SettingsIcon } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell, HeaderIconButton } from "@/components/site/PageHeader";
import { IconBadge } from "@/components/site/IconBadge";
import { SEO } from "@/components/SEO";
import { useNotificationCenter } from "@/lib/notificationCenter";
import { relativeAgo } from "@/lib/notificationInbox";

/**
 * Notification Center (Home bell): the notifications the app has received in the
 * last 30 minutes, each with its real relative time. It shows nothing about scheduling — controlling
 * prayer / Athkar / appointment alerts is "Notification Settings" (Settings →
 * Notifications), a different screen reached from the gear at the top.
 */
export default function NotificationCenterPage() {
  const { t, lang } = useLocale();
  const navigate = useNavigate();
  const { entries, now, loaded } = useNotificationCenter();

  return (
    <PageShell
      titleAr="الإشعارات"
      titleEn="Notifications"
      fallback="/"
      action={
        <HeaderIconButton label={t("Notification Settings", "إعدادات الإشعارات")} onClick={() => navigate("/notification-settings")}>
          <SettingsIcon className="h-5 w-5" />
        </HeaderIconButton>
      }
    >
      <SEO
        title={t("Notifications — Elite Islamic", "الإشعارات — النخبة الإسلامية")}
        description={t("Notifications you received in the last 30 minutes.", "الإشعارات التي وصلتك خلال آخر 30 دقيقة.")}
        path="/notifications"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-3" data-testid="notification-center">
        {entries.length === 0 ? (
          <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center" data-testid="nc-empty">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <BellOff className="h-7 w-7" />
            </span>
            <p className="font-display text-body-lg font-bold">{t("No recent notifications", "لا توجد إشعارات حديثة")}</p>
            <p className="max-w-xs text-body-sm leading-relaxed text-foreground/60">
              {loaded
                ? t("Notifications you receive show here for 30 minutes.", "تظهر هنا الإشعارات التي تصلك لمدة 30 دقيقة.")
                : t("Loading…", "جارٍ التحميل…")}
            </p>
            <button
              type="button"
              onClick={() => navigate("/notification-settings")}
              className="mt-1 min-h-[44px] rounded-full bg-primary px-5 text-body-sm font-bold text-primary-foreground transition active:scale-95"
            >
              {t("Notification Settings", "إعدادات الإشعارات")}
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((n) => (
              <li key={n.id} data-notification={n.id} data-age-minutes={Math.floor((now - n.receivedAt) / 60_000)} className="glass flex gap-3 rounded-2xl p-4">
                <IconBadge icon={n.kind === "announcement" ? Megaphone : BellRing} size="md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-display text-body-lg font-bold leading-tight">{n.title}</h3>
                  {n.body && <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-foreground/80">{n.body}</p>}
                  <time
                    dateTime={new Date(n.receivedAt).toISOString()}
                    data-testid="nc-time"
                    className="block text-caption tabular-nums text-foreground/55"
                  >
                    {relativeAgo(n.receivedAt, lang === "ar" ? "ar" : "en", now)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
