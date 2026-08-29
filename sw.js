/* Arcade Hub service worker — THE ONE AND ONLY service worker.
 *
 * This is the single SW for the whole site. It also imports the Firebase
 * Cloud Messaging handler (firebase-messaging-sw.js) so background push
 * and the caching below live in ONE worker — registering two different SW
 * files at the same scope ("/") makes them fight each other (only one can
 * be active), which silently killed either push or caching.
 *
 * 1) FCM background push + notification tap handling
 *    → imported from ./firebase-messaging-sw.js below.
 * 2) /pdfjs/** (official Mozilla PDF.js v3.11.174 — default viewer)
 *    and /pdfjs6/** (official Mozilla PDF.js v6.2.108 — customized viewer):
 *       cache-first. These files never change for a given release, so after
 *       the first PDF you open, the viewer boots instantly and also works
 *       OFFLINE (great for flaky internet).
 * 3) Everything else: passed straight to the network (unchanged behaviour).
 *
 * If a newer PDF.js release is dropped in, bump the matching cache name
 * (e.g. 'ah-pdfjs-4.x.y' / 'ah-pdfjs6-7.x.y') so old copies are replaced.
 */
importScripts('./firebase-messaging-sw.js');

var PDFJS_CACHES = {
    '/pdfjs/': 'ah-pdfjs-3.11.174',
    '/pdfjs6/': 'ah-pdfjs6-6.2.108'
};

self.addEventListener('install', function (e) {
    console.log('Service Worker: Installed');
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    // Drop caches from older PDF.js versions, keep the current ones.
    var keep = Object.keys(PDFJS_CACHES).map(function (k) { return PDFJS_CACHES[k]; });
    e.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(names.map(function (n) {
                if (keep.indexOf(n) === -1) return caches.delete(n);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (e) {
  // POST/PUT/etc. bypass the service worker COMPLETELY: proxying upload
  // requests through a SW breaks XMLHttpRequest upload progress events
  // (the contact form's "Uploading... X of Y (Z%)" bar) and buys nothing —
  // only GET responses are cacheable anyway.
  if (e.request.method !== 'GET') {
    return; // no respondWith → the browser handles it natively
  }

  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }

    var pdfjsCache = null;
    if (e.request.method === 'GET' && url.origin === self.location.origin) {
        for (var prefix in PDFJS_CACHES) {
            if (url.pathname.indexOf(prefix) === 0) {
                pdfjsCache = PDFJS_CACHES[prefix];
                break;
            }
        }
    }

    if (pdfjsCache) {
        e.respondWith(
            caches.open(pdfjsCache).then(function (cache) {
                return cache.match(e.request).then(function (hit) {
                    if (hit) return hit;                     // instant + offline
                    return fetch(e.request).then(function (res) {
                        if (res && res.ok && res.type === 'basic') {
                            cache.put(e.request, res.clone()); // remember for next time
                        }
                        return res;
                    });
                });
            }).catch(function () { return fetch(e.request); })
        );
        return;
    }

    // Everything else: straight through to the network (previous behaviour).
    e.respondWith(fetch(e.request));
});
