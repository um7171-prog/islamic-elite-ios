/**
 * Lets Athkar/Calendar settings changes ask the notifications provider
 * (see components/notifications/NotificationsProvider.tsx) to rebuild the
 * athkar + calendar native schedules through the one shared pipeline,
 * instead of each feature scheduling on its own. Prayer notifications are
 * rebuilt separately by the same provider when prayer-affecting settings
 * change (city, madhab, calculation method, prayer toggles).
 */
type RebuildHandler = () => void;

let activeHandler: RebuildHandler | null = null;
let queuedBeforeRegistration = false;

export function registerNotificationRebuildHandler(handler: RebuildHandler): () => void {
  activeHandler = handler;
  if (queuedBeforeRegistration) {
    queuedBeforeRegistration = false;
    queueMicrotask(() => {
      if (activeHandler === handler) handler();
    });
  }
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function requestNotificationRebuild(): void {
  if (activeHandler) {
    activeHandler();
    return;
  }
  queuedBeforeRegistration = true;
}
