// Capital Rooms service worker.
//
// During active beta we deliberately do NOT cache the app's code/data — a stale
// cache once made inputs look broken on installed devices. This worker provides
// an offline fallback page and handles Web Push. Bump CACHE to force a refresh.
const CACHE = 'cros-shell-v3';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Pages: network-first, offline fallback. Everything else straight to network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});

// ---- Web Push ----------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data && event.data.text() };
  }
  const title = data.title || 'Capital Rooms';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    requireInteraction: !!data.requireInteraction,
    actions: Array.isArray(data.actions) ? data.actions : [],
    data: { url: data.url || '/', actionUrls: data.actionUrls || {} },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  // An action button may carry its own destination; else open the main url.
  const target =
    (event.action && d.actionUrls && d.actionUrls[event.action]) || d.url || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if ('focus' in w) {
            w.navigate(target);
            return w.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      })
  );
});
