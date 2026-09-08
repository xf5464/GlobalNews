'use strict';

const APP_CACHE = 'globalnews-app-__APP_VERSION__';
const APP_SHELL = [
  './',
  'index.html',
  'reader.css',
  'reader.js',
  'reader-hn.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'data/recent.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('globalnews-app-') && name !== APP_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await cache.match(fallbackPath, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, 'index.html'));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
