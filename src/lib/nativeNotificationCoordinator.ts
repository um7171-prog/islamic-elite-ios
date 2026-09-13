type RebuildHandler = () => void;

let activeHandler: RebuildHandler | null = null;
let queuedBeforeRegistration = false;

export function registerNativeNotificationCoordinator(handler: RebuildHandler): () => void {
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

export function requestNativeNotificationRebuild(): void {
  if (activeHandler) {
    activeHandler();
    return;
  }
  queuedBeforeRegistration = true;
}
