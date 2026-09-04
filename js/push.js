/* =====================================================================
   Arcade Hub — Push Notifications client module (js/push.js)
   ---------------------------------------------------------------------
   Depends on: firebase-messaging.js, js/push-config.js
   Exposes window.ArcadePush:
     init()               — wire up the UI button(s), call on load
     enable()             — request permission + register token
     disable()            — revoke permission + unregister token
     isEnabled()          — current state
   Tokens are stored at fcmTokens/<playerName>/<token> so the backend
   Cloud Function can fan-out pushes to every device, even with the
   site fully closed.
   ===================================================================== */
(function (global) {
    'use strict';

    var cfg = global.PUSH_CONFIG || {};

    // Cookie helpers — localStorage gets cleared on logout, cookies survive,
    // so "this browser had push on for user X" can be remembered across
    // logout → login of the SAME user (auto-resume).
    function _ckSet(name, val, days) {
        try { document.cookie = name + '=' + encodeURIComponent(val) + '; path=/; max-age=' + (days || 365) * 86400; } catch (e) { }
    }
    function _ckGet(name) {
        try {
            var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : null;
        } catch (e) { return null; }
    }
    function _ckDel(name) { try { document.cookie = name + '=; path=/; max-age=0'; } catch (e) { } }
    var messaging = null;
    var currentToken = null;
    var BUTTON_SELECTOR = '[data-push-toggle]';

    function supported() {
        return ('Notification' in global) &&
            ('serviceWorker' in navigator) &&
            ('PushManager' in global) &&
            (typeof firebase !== 'undefined') &&
            !!firebase.messaging;
    }

    function initMessaging() {
        if (messaging) return messaging;
        if (!supported()) return null;
        try {
            messaging = firebase.messaging();
            messaging.usePublicVapidKey(cfg.VAPID_PUBLIC_KEY);
            // Foreground (site open): do NOTHING here — the app's own Firebase
            // DB listeners already show in-app toasts + (when hidden) system
            // notifications. FCM's job is the browser-CLOSED case, handled by
            // the service worker. This prevents double notifications.
            messaging.onMessage(function () {
                var dot = document.getElementById('notif-dot');
                if (dot) dot.style.display = 'block';
            });
            // Token refresh: keep DB in sync.
            messaging.onTokenRefresh(function () {
                messaging.getToken().then(function (t) { if (t) saveToken(t); });
            });
        } catch (e) {
            console.warn('[ArcadePush] init failed', e);
        }
        return messaging;
    }

    function playerName() {
        return (localStorage.getItem('playerName') || '').toLowerCase().trim();
    }

    // Token storage goes through OUR Render server — NOT direct Firebase writes.
    // (Direct writes hit PERMISSION_DENIED under the site's security rules; the
    //  server's Admin SDK bypasses rules and owns all token storage.)
    function saveToken(token) {
        var name = playerName();
        if (!name || !token) return Promise.resolve();
        return fetch(cfg.SERVER_URL + '/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: name, token: token })
        }).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) throw new Error(j.error || 'Registration failed');
        });
    }

    function removeToken(token) {
        var name = playerName();
        if (!name || !token) return Promise.resolve();
        return fetch(cfg.SERVER_URL + '/push/unregister', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: name, token: token })
        }).catch(function () { });
    }

    async function enable() {
        if (_busy || isEnabled()) return false;
        setBusy(true, '⏳ Turning on notifications…');
        var done = function (ok) { setBusy(false); return ok; };
        if (!playerName()) {
            try { global.showNotify && global.showNotify('Log in first to enable push notifications.', 'error'); } catch (e) { }
            return done(false);
        }
        if (!supported()) {
            try { global.showNotify && global.showNotify('Push notifications are not supported on this browser.', 'error'); } catch (e) {}
            return done(false);
        }
        var m = initMessaging();
        if (!m) return done(false);
        try {
            var perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                try { global.showNotify && global.showNotify('Notifications were blocked. Enable them in your browser settings to receive updates.', 'error'); } catch (e) {}
                updateButtons(false);
                return done(false);
            }
            // register the SW explicitly (firebase-messaging-sw.js at root)
            await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            var token = await m.getToken();
            if (!token) {
                try { global.showNotify && global.showNotify('Could not get a push token. Try again.', 'error'); } catch (e) {}
                return done(false);
            }
            currentToken = token;
            await saveToken(token);
            try { localStorage.setItem('push_pref', 'on'); } catch (e) { }
            _ckSet('ah_push', 'on');
            _ckSet('ah_push_user', playerName() || '');
            try { global.showNotify && global.showNotify('🔔 Push notifications enabled! You’ll get updates even when the site is closed.', 'success'); } catch (e) {}
            updateButtons(true);
            return done(true);
        } catch (err) {
            console.error('[ArcadePush] enable error', err);
            try { global.showNotify && global.showNotify('Push setup failed: ' + (err.message || err), 'error'); } catch (e) {}
            updateButtons(false);
            return done(false);
        }
    }

    async function disable() {
        if (_busy) return;
        setBusy(true, '⏳ Turning off…');
        try {
            try { localStorage.removeItem('push_pref'); } catch (e) { }
            _ckDel('ah_push'); _ckDel('ah_push_user');
            if (messaging && currentToken) {
                await messaging.deleteToken(currentToken);
                await removeToken(currentToken);
            }
            currentToken = null;
            updateButtons(false);
            try { global.showNotify && global.showNotify('Push notifications disabled.', 'info'); } catch (e) {}
        } catch (e) {
            console.warn('[ArcadePush] disable error', e);
        }
        setBusy(false);
    }

    // ── Account switch handling ──────────────────────────────────────────
    // Logout: REMOVE this device's token from the user (otherwise the next
    // account on this device would receive the previous user's pushes!).
    function onLogout() {
        // Remember WHO had push on (cookie survives localStorage.clear) but
        // remove THIS device's token so the next account isn't spammed.
        var name = playerName();
        if (name) _ckSet('ah_push_user', name);
        if (currentToken && name) removeToken(currentToken);   // fire & forget
    }
    // ── ULTRA LOGIN FLOW (any ID, WhatsApp model) ────────────────────────
    // 1. Permission granted → auto-register this device under the user. Done.
    // 2. Permission 'default' + the user has push devices elsewhere (server
    //    check) → show ONE gentle confirm: "enable notifications?" — delayed
    //    9s so it never collides with the post-login email modal.
    async function onLogin() {
        try {
            var name = playerName();
            if (!name || !supported()) return;
            if (Notification.permission === 'granted') {
                var m = initMessaging();
                if (!m) return;
                await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                var t = await m.getToken();
                if (t) {
                    currentToken = t; await saveToken(t); updateButtons(true);
                    try { localStorage.setItem('push_pref', 'on'); } catch (e) { }
                    _ckSet('ah_push', 'on'); _ckSet('ah_push_user', name);
                }
                return;
            }
            if (Notification.permission !== 'default') return;   // 'denied' → browser-level block
            // Does this user have push on other devices?
            fetch(cfg.SERVER_URL + '/push/has-tokens?user=' + encodeURIComponent(name))
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    if (!j || !j.has) return;
                    // wait 9s so the email modal (if any) finishes first — no modal collision
                    setTimeout(function () {
                        try {
                            showConfirm('🔔 We detected you have push notifications enabled on another device,\n\nbut this browser is not allowing notifications. Allow them here so you never miss a message?',
                                function () {
                                    Notification.requestPermission().then(function (perm) {
                                        if (perm === 'granted') { onLogin(); }   // re-run → auto-registers
                                        else { showNotify('🔕 Notifications stay off for this browser.', 'info'); }
                                    });
                                }, '🔔');
                        } catch (e) { }
                    }, 9000);
                })
                .catch(function () { });
        } catch (e) { }
    }

    function isEnabled() {
        return ('Notification' in global) && Notification.permission === 'granted' && !!currentToken;
    }

    function updateButtons(on) {
        document.querySelectorAll(BUTTON_SELECTOR).forEach(function (btn) {
            btn.dataset.on = on ? '1' : '0';
            var onLabel = btn.getAttribute('data-label-on') || '🔔 Notifications On';
            var offLabel = btn.getAttribute('data-label-off') || '🔔 Enable Notifications';
            btn.textContent = on ? onLabel : offLabel;
        });
    }

    // Restore button state on load (permission may persist; re-fetch token).
    async function refreshState() {
        if (!supported()) { updateButtons(false); return; }
        var m = initMessaging();
        if (!m) { updateButtons(false); return; }
        // Only resume if the user actually WANTS push (off must stay off —
        // browser permission being granted is not the same as opted-in!)
        var wantsPush = false;
        try { wantsPush = localStorage.getItem('push_pref') === 'on' || _ckGet('ah_push') === 'on'; } catch (e) { }
        if (Notification.permission === 'granted' && wantsPush) {
            try {
                await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                var t = await m.getToken();
                if (t) { currentToken = t; await saveToken(t); updateButtons(true); return; }
            } catch (e) {}
        }
        updateButtons(false);
    }

    var _busy = false;
    function setBusy(b, label) {
        _busy = b;
        document.querySelectorAll(BUTTON_SELECTOR).forEach(function (btn) {
            btn.disabled = b;
            btn.style.opacity = b ? '0.6' : '';
            btn.style.cursor = b ? 'wait' : '';
            if (b && label) btn.textContent = label;
        });
    }

    function init() {
        document.querySelectorAll(BUTTON_SELECTOR).forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (_busy) return;                       // no double-clicks mid-flight
                if (btn.dataset.on === '1') {
                    // Already ON → confirm before disabling (no accidental taps)
                    try {
                        if (typeof showConfirm === 'function') {
                            showConfirm('Disable push notifications?\n\nYou will stop receiving messages and announcements when the site is closed.',
                                function () { disable(); }, '🔕');
                            return;
                        }
                    } catch (e) { }
                    disable();
                } else {
                    enable();
                }
            });
        });
        // Wait until logged in + firebase ready before checking state.
        var tries = 0;
        var iv = setInterval(function () {
            tries++;
            if ((firebase && firebase.apps.length && playerName()) || tries > 60) {
                clearInterval(iv);
                refreshState();
            }
        }, 500);
    }

    global.ArcadePush = { init: init, enable: enable, disable: disable,
                          isEnabled: isEnabled, supported: supported,
                          onLogout: onLogout, onLogin: onLogin };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 600);
    } else {
        global.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
    }
})(window);
