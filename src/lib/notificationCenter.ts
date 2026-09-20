import { useMemo } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useAnnouncements } from "@/lib/announcements";
import { useInbox, visibleItems, type InboxItem } from "@/lib/notificationInbox";

/** The Notification Center's contents: received pushes / local notifications +
 * published announcements, each with its real receive time, newest first, and
 * ONLY those younger than 30 minutes. Shared by the page and the header bell badge. */
export function useNotificationCenter() {
  const { lang } = useLocale();
  const { items: announcements, loaded } = useAnnouncements();
  const { items: inbox, now } = useInbox();
  const entries = useMemo(() => {
    const fromAnnouncements: InboxItem[] = announcements.map((a) => ({
      id: `announcement-${a.id}`,
      kind: "announcement",
      title: lang === "ar" ? a.title_ar : a.title_en || a.title_ar,
      body: lang === "ar" ? a.body_ar : a.body_en || a.body_ar,
      receivedAt: Date.parse(a.created_at),
    }));
    return visibleItems([...inbox, ...fromAnnouncements].filter((i) => Number.isFinite(i.receivedAt)), now);
  }, [announcements, inbox, lang, now]);
  return { entries, now, loaded };
}
