// Service Worker for background push notifications (prayer alerts)
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const ATHAN_SOUNDS = {
  'athan-fajr':    'https://www.islamcan.com/audio/adhan/azan2.mp3',
  'athan-dhuhr':   'https://www.islamcan.com/audio/adhan/azan3.mp3',
  'athan-asr':     'https://www.islamcan.com/audio/adhan/azan3.mp3',
  'athan-maghrib': 'https://www.islamcan.com/audio/adhan/azan3.mp3',
  'athan-isha':    'https://www.islamcan.com/audio/adhan/azan3.mp3',
};

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'تنبيه', body: event.data?.text() || '' }; }
  const title = data.title || 'تنبيه الصلاة';
  const tag = data.tag || 'prayer';
  const isAthan = typeof tag === 'string' && tag.startsWith('athan-');
  const soundUrl = data.soundUrl || ATHAN_SOUNDS[tag];

  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag,
    renotify: true,
    requireInteraction: isAthan,
    silent: false,
    dir: 'rtl',
    lang: data.lang || 'ar',
    vibrate: isAthan ? [400, 200, 400, 200, 400] : [200, 100, 200],
    data: { url: data.url || '/', soundUrl, isAthan },
  };

  event.waitUntil((async () => {
    // Tell any open clients to play the athan audio (foreground/PWA visible)
    if (soundUrl) {
      try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of clients) {
          c.postMessage({ type: 'PLAY_ATHAN', soundUrl, tag });
        }
      } catch {}
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  const soundUrl = event.notification.data?.soundUrl;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        if (soundUrl) w.postMessage({ type: 'PLAY_ATHAN', soundUrl });
        return w.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
