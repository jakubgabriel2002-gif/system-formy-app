/* System Formy PWA: cache immutable frontend assets only. API, account data and HTML stay network-only. */
const CACHE_NAME = 'system-formy-static-v2';
const OFFLINE_URL = '/offline.html';
const STATIC_PREFIXES = ['/assets/', '/pwa-192.png', '/pwa-512.png', '/apple-touch-icon.png', '/favicon-32.png', '/sf-logo.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try { await cache.add(new Request(OFFLINE_URL, { cache: 'reload' })); } catch { /* Offline fallback is best-effort during installation. */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('system-formy-static-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A navigation can fall back to a neutral offline screen. Never cache an authenticated HTML response.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) || new Response('Brak połączenia z internetem. Połącz się ponownie i odśwież System Formy.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
    })());
    return;
  }

  // API responses, login responses and personalized information are always network-only.
  if (url.pathname.startsWith('/api/')) return;
  const isStatic = STATIC_PREFIXES.some((prefix) => url.pathname === prefix || (prefix === '/assets/' && url.pathname.startsWith(prefix)));
  if (!isStatic) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && (response.type === 'basic' || response.type === 'default')) await cache.put(request, response.clone());
    return response;
  })());
});
