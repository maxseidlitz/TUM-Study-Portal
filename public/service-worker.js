const CACHE_VERSION = 'tum-study-static-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

function isCacheableStaticUrl(url) {
  return url.origin === self.location.origin
    && (url.pathname.startsWith('/static/') || PRECACHE_URLS.includes(url.pathname));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(PRECACHE_URLS);

    // CRA fingerprints build assets. Discover those names without ever storing
    // asset-manifest.json or index.html themselves.
    try {
      const response = await fetch('/asset-manifest.json', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const manifest = await response.json();
      const staticUrls = Object.values(manifest.files || {})
        .filter(value => typeof value === 'string')
        .map(value => new URL(value, self.location.origin))
        .filter(url => isCacheableStaticUrl(url) && /\.(?:css|js)$/.test(url.pathname))
        .map(url => url.pathname);
      await cache.addAll([...new Set(staticUrls)]);
    } catch {
      // The neutral offline page still works if optional asset discovery fails.
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('tum-study-static-') && name !== CACHE_VERSION)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Every navigation remains network-only because it can return login HTML or
  // the dynamically CSRF-injected index. Only the neutral page is a fallback.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_VERSION);
      return cache.match(OFFLINE_URL);
    }));
    return;
  }

  if (!isCacheableStaticUrl(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
