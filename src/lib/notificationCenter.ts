import { useMemo } from "react";
import { useInbox, visibleItems } from "@/lib/notificationInbox";

/** The Notification Center's contents: received pushes / local notifications, each with its
 * real receive time, newest first, and ONLY those younger than 30 minutes. Shared by the page
 * and the header bell badge. */
export function useNotificationCenter() {
  const { items: inbox, now } = useInbox();
  const entries = useMemo(
    () => visibleItems(inbox.filter((i) => Number.isFinite(i.receivedAt)), now),
    [inbox, now],
  );
  // The inbox is read synchronously from this device, so it is always loaded.
  return { entries, now, loaded: true };
}
