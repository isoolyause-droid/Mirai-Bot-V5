// GOMO App v1.0 — Service Worker
// Cache-first for app shell, network-first for API

const CACHE_NAME    = 'gomo-v1.0.0';
const APP_SHELL     = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API calls — always network, no cache (fresh music data)
  if (url.pathname.startsWith('/api/')) {
    return e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ error: 'Offline — walang internet connection' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
  }

  // App shell — cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match('/'));
    })
  );
});

// ── Push notifications (future use) ──────────────────────────────────────────
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'GOMO', body: 'May bagong kanta!' };
  e.waitUntil(
    self.registration.showNotification(data.title || 'GOMO', {
      body:  data.body  || 'May bagong kanta para sa iyo!',
      icon:  '/icon-192.png',
      badge: '/icon-72.png',
      tag:   'gomo-notif',
    })
  );
});
