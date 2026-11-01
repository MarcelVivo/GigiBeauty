// GiGi Beauty Service Worker (PWA). Bewusst zurückhaltend:
//  * Seiten (HTML): immer zuerst Netz, damit Änderungen sofort live sind;
//    nur offline aus dem Cache bzw. offline.html.
//  * CSS/JS: sofort aus dem Cache, im Hintergrund aktualisieren (Dateien
//    tragen ?v=… und wechseln bei jedem Release ihre Adresse).
//  * Bilder/Schriften: Cache zuerst, begrenzt auf 200 Einträge.
//  * Nie gecacht: Supabase (Daten, Login, Funktionen), andere Domains,
//    alles ausser GET.
const VERSION = '2026-11-01-1';
const PAGES = `gigi-pages-${VERSION}`;
const ASSETS = `gigi-assets-${VERSION}`;
const MEDIA = 'gigi-media-v1';
const PRECACHE = ['/offline.html', '/public/images/icons/icon-192.png', '/public/images/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(PAGES).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [PAGES, ASSETS, MEDIA];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) { const copy = response.clone(); caches.open(PAGES).then(cache => cache.put(request, copy)); }
        return response;
      } catch {
        return (await caches.match(request, { ignoreSearch: true })) || caches.match('/offline.html');
      }
    })());
    return;
  }

  if (/\.(css|js|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request);
      const network = fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response; }).catch(() => cached);
      return cached || network;
    })());
    return;
  }

  if (/\.(png|jpe?g|webp|gif|svg|avif|woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) { cache.put(request, response.clone()); trim(MEDIA, 200); }
      return response;
    })());
  }
});
