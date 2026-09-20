/**
 * Notification DRY-RUN (test/diagnostic only, off by default).
 *
 * In a browser there is no iOS notification centre, so nothing can be delivered
 * or verified there. When `localStorage["elite.debug.notifications"] === "1"` the
 * app runs the SAME scheduling pipeline (calendar + Athkar) but, instead of
 * calling the native plugin, records the exact request it WOULD send into
 * `window.__eliteNotifLog`. That lets a browser test prove the payload, the
 * replace-on-edit and the cancel-on-delete behaviour. It never claims a
 * notification was delivered.
 */
export interface DryRunEntry {
  group: string;
  minId: number;
  maxId: number;
  items: { id: number; atMs: number; title: string; body: string }[];
  at: number;
}

export function isDryRun(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("elite.debug.notifications") === "1";
  } catch {
    return false;
  }
}

export function logDryRun(entry: Omit<DryRunEntry, "at">) {
  const w = window as unknown as { __eliteNotifLog?: DryRunEntry[] };
  (w.__eliteNotifLog ||= []).push({ ...entry, at: Date.now() });
}
