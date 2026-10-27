/* System Formy PWA: cache immutable frontend assets only. API, HTML and account data stay network-only. */
const CACHE_NAME = 'system-formy-static-v1';
const STATIC_PREFIXES = ['/assets/', '/pwa-192.png', '/pwa-512.png', '/apple-touch-icon.png', '/favicon-32.png', '/sf-logo.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
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
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/' || url.pathname.endsWith('.html')) return;
  const isStatic = STATIC_PREFIXES.some((prefix) => url.pathname === prefix || (prefix === '/assets/' && url.pathname.startsWith(prefix)));
  if (!isStatic) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
