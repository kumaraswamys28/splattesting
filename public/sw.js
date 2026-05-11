// Service Worker for caching .ply splat files
const CACHE_NAME = 'splat-model-cache-v1';
const PLY_EXTENSIONS = ['.ply', '.splat', '.ksplat'];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing splat cache service worker');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating splat cache service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSplatFile = PLY_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));

  if (isSplatFile) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          console.log('[SW] Serving from cache:', url.pathname);
          return cached;
        }

        console.log('[SW] Fetching and caching:', url.pathname);
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (err) {
          console.error('[SW] Fetch failed:', err);
          throw err;
        }
      })
    );
  }
});

// Listen for cache-clear messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      event.source.postMessage({ type: 'CACHE_SIZE', count: keys.length, keys: keys.map(k => k.url) });
    });
  }
});
