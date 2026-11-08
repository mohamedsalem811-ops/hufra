// Plan 9.2: the old HUFRA website installed an offline service worker at /sw.js.
// Browsers that still have it fetch this file when they check for an update:
// it clears the old caches, removes itself and reloads open pages, so they show
// the new website. The new website registers no service worker.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key)
      await self.registration.unregister()
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
    })(),
  )
})
