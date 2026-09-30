/**
 * The iPhone app's pinch, recognised natively (ios/App/App/MushafGesturePlugin.swift): a UIKit
 * pinch recognizer on the web view that runs alongside WebKit's own gestures and, while it pinches,
 * pauses every scroll view's pan so the vertical scroll can never take the gesture over. The web
 * view's touch events cannot guarantee that on iOS (once a scroll starts they are no longer
 * cancelable), which is why this exists. Anywhere else (or on a native build without the plugin)
 * the web pinch (pinchInput.ts) is used.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isIOSNativeApp } from "@/lib/platform";
import type { PinchEvent } from "./pinchInput";

interface NativePinchData {
  phase: "start" | "change" | "end" | "cancel";
  scale: number;
  x: number;
  y: number;
}

interface MushafGesturePlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
  addListener(event: "pinch", cb: (data: NativePinchData) => void): Promise<PluginListenerHandle>;
}

let plugin: MushafGesturePlugin | null = null;
const getPlugin = () => (plugin ??= registerPlugin<MushafGesturePlugin>("MushafGesture"));

/** Starts the native pinch; resolves to its cleanup, or null when the web pinch must be used. */
export async function startNativePinch(onPinch: (e: PinchEvent) => void): Promise<(() => void) | null> {
  if (!isIOSNativeApp()) return null;
  let handle: PluginListenerHandle | null = null;
  try {
    const p = getPlugin();
    handle = await p.addListener("pinch", (d) => {
      const scale = Number(d?.scale);
      if (!Number.isFinite(scale) || scale <= 0) return;
      onPinch({ phase: d.phase === "cancel" ? "end" : d.phase, scale, x: Number(d.x) || 0, y: Number(d.y) || 0 });
    });
    await p.enable();
    return () => {
      void handle?.remove();
      void p.disable().catch(() => undefined);
    };
  } catch {
    void handle?.remove();
    return null;
  }
}
