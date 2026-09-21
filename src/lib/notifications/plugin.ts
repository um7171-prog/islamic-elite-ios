/**
 * Thin bridge to the app's native iOS plugin (ios/App/App/NativeNotificationPlugin.swift,
 * registered under the Capacitor plugin name "NativeNotification").
 *
 * This plugin is intentionally kept as-is: it is a small, generic, local-only
 * primitive (UNUserNotificationCenter under the hood — no APNs) that just
 * schedules/cancels/lists notifications within an id range handed to it by
 * the caller. It has no idea what a "prayer" or "athkar" is — all of that
 * policy lives in this TypeScript layer. Rewriting genuinely native Swift
 * code cannot be verified without a real Xcode/iPhone build, which is not
 * available in this environment, so the safe and honest choice is to keep
 * reusing this already-correct native executor rather than replace it blind.
 */

export interface NativeScheduleItem {
  id: number;
  title: string;
  body: string;
  /** Epoch milliseconds. */
  atMs: number;
  /** iOS bundled `.caf` filename, or "default" for the system sound. */
  sound: string;
  extra?: Record<string, unknown>;
}

export interface NativeScheduleResult {
  acceptedIds: number[];
  verifiedIds: number[];
  errors: string[];
}

interface NativeNotificationPlugin {
  scheduleGroup(options: { minId: number; maxId: number; items: NativeScheduleItem[] }): Promise<NativeScheduleResult>;
  pendingGroup(options: { minId: number; maxId: number }): Promise<{ ids: number[] }>;
  cancelGroup(options: { minId: number; maxId: number }): Promise<void>;
}

let cached: NativeNotificationPlugin | null = null;

async function getPlugin(): Promise<NativeNotificationPlugin> {
  if (cached) return cached;
  const { registerPlugin } = await import("@capacitor/core");
  cached = registerPlugin<NativeNotificationPlugin>("NativeNotification");
  return cached;
}

export async function pluginScheduleGroup(minId: number, maxId: number, items: NativeScheduleItem[]): Promise<NativeScheduleResult> {
  try {
    const plugin = await getPlugin();
    return await plugin.scheduleGroup({ minId, maxId, items });
  } catch (error) {
    return { acceptedIds: [], verifiedIds: [], errors: [String((error as Error)?.message || error)] };
  }
}

export async function pluginPendingGroup(minId: number, maxId: number): Promise<number[]> {
  try {
    const plugin = await getPlugin();
    const { ids } = await plugin.pendingGroup({ minId, maxId });
    return ids;
  } catch {
    return [];
  }
}

export async function pluginCancelGroup(minId: number, maxId: number): Promise<void> {
  try {
    const plugin = await getPlugin();
    await plugin.cancelGroup({ minId, maxId });
  } catch {
    /* nothing pending / plugin unavailable */
  }
}
