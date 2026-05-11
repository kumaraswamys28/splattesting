// sw.js — minimal service worker (fetch interception removed)
// Model caching is handled entirely by IndexedDB in useSplatCache.js

const CACHE_NAME = 'splat-model-cache-v1';

self.addEventListener('install', () => {
  console.log('[SW] Installing');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating');
  // Clean up any old cache versions
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// No fetch handler — HTTP caching is done by the browser + netlify headers.
// Binary model caching is done by useSplatCache.js via IndexedDB.
