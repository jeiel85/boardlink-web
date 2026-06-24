/* global self, caches, fetch, URL */

const CACHE_NAME = 'boardlink-cache-v1';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // WebSocket traffic and API endpoints must never be cached
  if (
    event.request.headers.get('upgrade') === 'websocket' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation requests serve cached app shell fallback when offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      }),
    );
    return;
  }

  // Cache-first for local static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse.status === 200 &&
          (url.pathname.includes('/assets/') ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.png') ||
            url.pathname.endsWith('.svg') ||
            url.pathname.endsWith('.json'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
