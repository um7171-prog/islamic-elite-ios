import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/contexts/LocaleContext";
import { useNotificationCenter } from "@/lib/notificationCenter";

/** Header bell: opens the Notification Center (received announcements) with an
 * unread badge. Notification *settings* live under Settings, not here. */
export function AnnouncementsBell({ tone = "card" }: { tone?: "card" | "header" }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { entries } = useNotificationCenter();
  const unread = entries.length;

  return (
    <button
      type="button"
      onClick={() => navigate("/notifications")}
      aria-label={t("Notification Center", "مركز الإشعارات")}
      data-testid="bell"
      className={`relative grid h-11 w-11 place-items-center transition active:scale-95 ${tone === "header" ? "rounded-full bg-white/10 text-white" : "rounded-2xl bg-card shadow-sm ring-1 ring-foreground/[0.07]"}`}
    >
      <Bell className={`h-5 w-5 ${tone === "header" ? "text-white" : "text-foreground/80"}`} />
      {unread > 0 && (
        <span className="absolute -end-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-elite-gold px-1 text-[11px] font-bold tabular-nums text-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
