/**
 * Cross-platform alignment feedback (haptics + audible ding).
 *
 * iOS Safari (web) has NO vibration API — so we also play a short
 * synthesized beep using Web Audio so the user always gets a cue.
 * On native iOS/Android (Capacitor), the Taptic Engine / Vibrator is used.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const isNative = () => {
  try {
    return Capacitor.isNativePlatform?.() === true;
  } catch {
    return false;
  }
};

// --- Audio fallback (works on iOS Safari) -----------------------------------
let audioCtx: AudioContext | null = null;

/** Must be called from a user gesture (click/tap) on iOS to unlock audio. */
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}

function beep(freq: number, durationMs: number, when = 0, gain = 0.18) {
  try {
    if (!audioCtx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.02);
  } catch {}
}

// --- Public API -------------------------------------------------------------
export async function hapticImpact(style: "light" | "medium" | "heavy" = "medium") {
  if (isNative()) {
    try {
      await Haptics.impact({
        style:
          style === "light" ? ImpactStyle.Light : style === "heavy" ? ImpactStyle.Heavy : ImpactStyle.Medium,
      });
      return;
    } catch {}
  }
  if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
    (navigator as any).vibrate(style === "light" ? 20 : style === "heavy" ? 80 : 40);
  }
}

/** Strong success pattern — fired when the user becomes aligned with the Qibla. */
export async function hapticQiblaAligned() {
  // 1) Native haptics where available
  if (isNative()) {
    try {
      await Haptics.notification({ type: NotificationType.Success });
      setTimeout(() => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}), 120);
    } catch {}
  }
  // 2) Web vibration (Android Chrome)
  if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
    (navigator as any).vibrate([60, 40, 100, 40, 60]);
  }
  // 3) Audible ding — universal fallback (works on iOS Safari)
  beep(880, 180, 0, 0.28);
  beep(1320, 220, 0.15, 0.28);
  beep(1760, 260, 0.32, 0.24);
}

/** Quick tick — also unlocks iOS haptics + audio when called from a user gesture. */
export async function hapticTick() {
  unlockAudio();
  if (isNative()) {
    try {
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
      return;
    } catch {}
  }
  if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
    (navigator as any).vibrate(10);
  }
  beep(660, 60, 0, 0.1);
}
