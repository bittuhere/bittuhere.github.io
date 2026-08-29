/* =====================================================================
   Arcade Hub — Firebase Messaging Service Worker
   ---------------------------------------------------------------------
   Handles push delivery WHILE THE SITE IS CLOSED (the whole point of Web
   Push) and focuses the site on tap.

   NOTE: since the great service-worker unification this file is NO LONGER
   registered on its own. It is imported by /sw.js (the site's single
   service worker: importScripts('./firebase-messaging-sw.js')), so the
   FCM background handler and the site's caching live in ONE worker.
   js/push.js passes that same /sw.js registration to getToken(), which
   stops the FCM SDK from auto-registering a second, competing worker.
   Keep this file at the root next to sw.js — do not rename either.
   ===================================================================== */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// Same config as the host page (kept in sync manually).
firebase.initializeApp({
    apiKey: "AIzaSyD8KMiqZTr39IPw8LENyahLILLNbkFfQXM",
    authDomain: "bittuhere-90415.firebaseapp.com",
    databaseURL: "https://bittuhere-90415-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bittuhere-90415",
    storageBucket: "bittuhere-90415.firebasestorage.app",
    messagingSenderId: "600472267274",
    appId: "1:600472267274:web:b5f8394f99e17b232f3ca7"
});

var messaging = firebase.messaging();

// Background/data-only messages (when a `data` payload is sent without a
// `notification` block). We display a notification manually so it still
// shows when the tab/site is closed.
messaging.onBackgroundMessage(function (payload) {
    var data = payload.data || {};
    var n = payload.notification || {};
    var title = n.title || data.title || '🎮 Arcade Hub';
    var body = n.body || data.body || data.message || 'You have a new update!';
    var icon = data.icon || '/favicon-192.png';
    var badge = data.badge || '/favicon-48.png';
    var tag = data.tag || 'arcade-' + (data.scope || 'general');

    var clickUrl = data.url || data.click_url || '/';
    self.registration.showNotification(title, {
        body: body,
        icon: icon,
        badge: badge,
        tag: tag,
        data: { url: clickUrl },
        requireInteraction: false
    });
});

// Tap on the notification → open/focus the site at the right place.
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var c = clientList[i];
                if ('focus' in c) {
                    c.postMessage({ type: 'push-click', url: targetUrl });
                    return c.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
