const CACHE_NAME = 'isivoltpro-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request) || fetch(e.request));
});