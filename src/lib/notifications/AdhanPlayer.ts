import type { AthanSoundId } from "./NotificationSounds";
import { athanFullAudioUrl } from "./NotificationSounds";

/**
 * Plays the FULL, untruncated athan in-app.
 *
 * iOS local-notification custom sounds have an (undocumented but real) short duration ceiling —
 * that is why the bundled `.caf` used as the notification's OWN sound is short. It is never the
 * limit on how much of the athan the user gets to hear: the moment the app becomes the foreground
 * app (the notification is delivered while open, or the user taps it), this plays the same
 * recitation's full local file end to end through a plain <audio> element. Nothing here touches
 * notification scheduling, permission or delivery — playback is a pure side effect of an event
 * that already happened.
 *
 * De-duplicated by notification id: `localNotificationReceived` (foreground) and
 * `localNotificationActionPerformed` (tap) can both fire for the same notification; only the
 * first one starts playback.
 */
let currentAudio: HTMLAudioElement | null = null;
let currentId: number | null = null;

export function playFullAdhan(sound: AthanSoundId, notificationId: number): void {
  if (currentId === notificationId) return; // already started for this exact notification
  const url = athanFullAudioUrl(sound);
  if (!url) return;
  try {
    currentAudio?.pause();
    currentId = notificationId;
    const audio = new Audio(url);
    currentAudio = audio;
    void audio.play().catch(() => undefined); // autoplay can be refused; the short OS sound already played
  } catch {
    /* audio unavailable */
  }
}

export function stopAdhanPlayback(): void {
  try {
    currentAudio?.pause();
  } catch {
    /* noop */
  }
  currentAudio = null;
  currentId = null;
}

/** Test-only: forget which notification id already played, without touching playback state. */
export function _resetAdhanPlayerDedupe(): void {
  currentId = null;
}
