// Listens for messages from the Service Worker (PLAY_ATHAN) and plays the
// athan audio in the foreground page. Web Push notifications cannot play
// custom sounds on their own, so we use this bridge whenever a tab/PWA is open.

let installed = false;

export function installAthanAudioBridge() {
  if (installed) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  installed = true;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "PLAY_ATHAN" || !data.soundUrl) return;
    try {
      const audio = new Audio(data.soundUrl);
      audio.volume = 1.0;
      // Some browsers require a prior user gesture; we just attempt and ignore failures.
      void audio.play().catch(() => {});
    } catch {}
  });
}
