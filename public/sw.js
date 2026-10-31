// HUFRA Service Worker (public/sw.js)
const CACHE_VERSION = 'hufra-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const APP_SHELL_URLS = [
  '/',
  '/map',
  '/report',
  '/transparency',
  '/trust',
  '/login',
  '/register',
  '/account',
  '/admin',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/static/css/tokens.css',
  '/static/css/fonts.css',
  '/static/vendor/leaflet/leaflet.css',
  '/static/vendor/leaflet/leaflet.js',
  '/static/vendor/leaflet/MarkerCluster.css',
  '/static/vendor/leaflet/MarkerCluster.Default.css',
  '/static/vendor/leaflet/leaflet.markercluster.js',
  '/static/vendor/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  '/static/vendor/fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2',
  '/static/vendor/fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2',
  '/static/vendor/fonts/ibm-plex-sans-arabic-latin-400-normal.woff2',
  '/static/vendor/fonts/ibm-plex-sans-arabic-latin-600-normal.woff2',
  '/static/vendor/fonts/ibm-plex-sans-arabic-latin-700-normal.woff2',
  '/static/js/icons.js',
  '/static/js/map-common.js',
  '/static/img/icons/icon-192.png',
  '/static/img/icons/icon-512.png',
  '/static/css/app.css',
  '/static/js/i18n.js',
  '/static/js/theme.js',
  '/static/js/native-bridge.js',
  '/static/js/api.js',
  '/static/js/offline-queue.js',
  '/static/js/ui.js',
  '/static/js/image-compress.js',
  '/static/js/report-form.js',
  '/static/js/map-page.js',
  '/static/js/account.js',
  '/static/js/admin.js',
  '/static/js/home.js',
  '/static/js/transparency.js',
  '/static/js/auth-pages.js',
  '/static/js/pothole-detail.js',
  '/static/img/logo/hufra-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(
          APP_SHELL_URLS.map((url) =>
            fetch(url, { credentials: 'same-origin' }).then((res) => {
              if (res.ok) return cache.put(url, res);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/api/regions') ||
      url.pathname.startsWith('/api/potholes') ||
      url.pathname.startsWith('/api/donors/top'))
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ offline: true, results: [], error: 'Offline mode' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/static/') ||
      url.pathname.startsWith('/media/') ||
      url.pathname === '/favicon.svg' ||
      url.pathname === '/manifest.webmanifest')
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const exact = await caches.match(url.pathname);
          if (exact) return exact;
          if (url.pathname.startsWith('/pothole/')) {
            const home = (await caches.match('/map')) || (await caches.match('/'));
            if (home) return home;
          }
          return (await caches.match('/')) || new Response('Offline', { status: 503 });
        })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'hufra-offline-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'HUFRA_TRIGGER_SYNC' }));
      })
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'حفرة — HUFRA',
    body: 'لديك تحديث جديد بخصوص البلاغات.',
    url: '/',
  };
  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = Object.assign(payload, parsed.notification || parsed);
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/static/img/icons/icon-192.png',
      badge: '/static/img/icons/icon-192.png',
      dir: 'auto',
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
