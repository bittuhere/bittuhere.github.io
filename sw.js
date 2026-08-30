/* Arcade Hub service worker — v3 (app shell + offline + one-worker design)
 * ONE worker handles everything: FCM (imported), PDF.js viewer caches,
 * app-shell precache, offline navigation fallback, stale-while-revalidate
 * for same-origin static assets. POSTs always bypass (upload progress fix). */
importScripts('./firebase-messaging-sw.js');

var VERSION = 'ah-v3.0.0';
var SHELL_CACHE = 'ah-shell-' + VERSION;
var RUNTIME_CACHE = 'ah-runtime-' + VERSION;
var PDFJS_CACHES = { '/pdfjs/': 'ah-pdfjs-3.11.174', '/pdfjs6/': 'ah-pdfjs6-6.2.108' };

var SHELL_FILES = [
  '/', '/index.html', '/js/pdf-embed.js', '/manifest.webmanifest',
  '/favicon.ico', '/favicon.svg', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) {
    // addAll is all-or-nothing: add individually so one 404 can't kill install
    return Promise.all(SHELL_FILES.map(function (f) {
      return c.add(new Request(f, { cache: 'reload' })).catch(function () { });
    }));
  }));
});

self.addEventListener('activate', function (e) {
  var keep = [SHELL_CACHE, RUNTIME_CACHE].concat(Object.keys(PDFJS_CACHES).map(function (k) { return PDFJS_CACHES[k]; }));
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) { if (keep.indexOf(n) === -1) return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;            // uploads bypass (progress events!)

  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // let cross-origin load natively

  // 1) PDF.js viewers: cache-first (immutable per release)
  for (var prefix in PDFJS_CACHES) {
    if (url.pathname.indexOf(prefix) === 0) {
      e.respondWith(_cacheFirst(e.request, PDFJS_CACHES[prefix]));
      return;
    }
  }

  // 2) Navigations (the SPA): network-first → cache → offline shell
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put('/index.html', copy); }).catch(function () { });
        return res;
      }).catch(function () {
        return caches.match('/index.html').then(function (hit) {
          return hit || caches.match('/') || new Response('Offline — Arcade Hub will be back when your internet returns.', { headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // 3) Same-origin static assets: stale-while-revalidate
  e.respondWith(
    caches.open(RUNTIME_CACHE).then(function (c) {
      return c.match(e.request).then(function (hit) {
        var fetching = fetch(e.request).then(function (res) {
          if (res && res.ok && res.type === 'basic') c.put(e.request, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || fetching;
      });
    })
  );
});

function _cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (c) {
    return c.match(request).then(function (hit) {
      return hit || fetch(request).then(function (res) {
        if (res && res.ok && res.type === 'basic') c.put(request, res.clone());
        return res;
      });
    });
  });
}
