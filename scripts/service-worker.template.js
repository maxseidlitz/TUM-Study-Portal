const BUILD_ID = '__BUILD_ID__';
const CACHE_PREFIX = 'tum-study-static-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const OFFLINE_URL = '/offline.html';
const BUILD_ASSETS = __BUILD_ASSETS__;
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/offline-locale.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  ...BUILD_ASSETS,
];

function isCacheableStaticUrl(url) {
  return url.origin === self.location.origin
    && (url.pathname.startsWith('/static/') || PRECACHE_URLS.includes(url.pathname));
}

self.addEventListener('install', event => {
  // addAll is atomic: a failed response rejects installation and leaves the
  // currently active worker/cache untouched.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
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
      const cache = await caches.open(CACHE_NAME);
      return cache.match(OFFLINE_URL);
    }));
    return;
  }

  if (!isCacheableStaticUrl(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
