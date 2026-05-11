// sw.js — Splat viewer service worker
//
// PATCH: removed the 'fetch' intercept handler that was double-caching .ply
// files. The app now relies solely on IndexedDB (useSplatCache.js) for binary
// model caching, which gives full programmatic control (progress, clear, etc).
// The SW is kept for the CLEAR_CACHE / GET_CACHE_SIZE message API used by HUD.
//
// If you later want HTTP-level caching back (e.g. for offline shell caching),
// re-add the fetch handler here — but make sure SplatViewer skips IndexedDB
// on cache-hit so the two layers don't race each other.

const CACHE_NAME = 'splat-model-cache-v1';

self.addEventListener('install', () => {
  console.log('[SW] Installing');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating');
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

// No 'fetch' handler — HTTP caching delegated entirely to IndexedDB layer.

// ── Message API (used by HUD cache controls) ────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
  if (event.data?.type === 'GET_CACHE_SIZE') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      event.source.postMessage({
        type:  'CACHE_SIZE',
        count: keys.length,
        keys:  keys.map((k) => k.url),
      });
    });
  }
});