/* =====================================================================
   Arcade Hub — Push fan-out Cloud Functions (functions/index.js)
   ---------------------------------------------------------------------
   Deploy:   cd functions && npm install && firebase deploy --only functions
   Requires: Firebase Blaze (pay-as-you-go) plan.
             The Web Push VAPID key configured in the Console (so the
             browser can subscribe). No server key needed — admin SDK
             authenticates via the service account.

   What it does:
     • When an admin writes notifications/global/{id}   -> push to ALL devices
     • When an admin writes notifications/private/{uid}/{id} -> push to that user
   Devices are registered by js/push.js at fcmTokens/<playerName>/<token>.
   Pushes are delivered by the browser EVEN WHEN THE SITE IS CLOSED.
   ===================================================================== */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.database();

/** Strip HTML tags + decode common entities so the push body is plain text. */
function toPlainText(html) {
    if (!html) return '';
    return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

/** Collect every token under fcmTokens (optionally one user only). */
async function collectTokens(uid) {
    const snap = await db.ref(uid ? `fcmTokens/${uid}` : 'fcmTokens').once('value');
    const tokens = [];
    snap.forEach((userNode) => {
        const val = userNode.val();
        if (val && typeof val === 'object') {
            Object.keys(val).forEach((t) => { if (val[t]) tokens.push(t); });
        } else if (typeof val === 'string') {
            tokens.push(val);
        }
    });
    return tokens;
}

/** Send a multicast; prune tokens that are stale/invalid. */
async function sendTo(tokens, title, body, scope, url) {
    if (!tokens.length) return;
    const payload = {
        notification: { title, body },
        data: { scope: scope || 'general', url: url || '/' },
        android: { priority: 'high', notification: { tag: 'arcade-' + (scope || 'general') } },
        webpush: {
            notification: { icon: '/favicon-192.png', badge: '/favicon-48.png', tag: 'arcade-' + (scope || 'general') },
            fcmOptions: { link: url || '/' }
        }
    };
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 450) chunks.push(tokens.slice(i, i + 450));
    for (const chunk of chunks) {
        const res = await admin.messaging().sendEachForMulticast({ ...payload, tokens: chunk });
        res.responses.forEach((r, i) => {
            if (!r.success && r.error && /registration-token-not-registered|invalid-registration-token|UNREGISTERED/.test(r.error.code || r.error.message)) {
                // Best-effort cleanup of dead tokens.
                db.ref('fcmTokens').once('value').then((snap) => {
                    snap.forEach((userNode) => {
                        if (userNode.child(chunk[i]).exists()) {
                            userNode.child(chunk[i]).ref.remove();
                        }
                    });
                }).catch(() => {});
            }
        });
    }
}

/** GLOBAL announcement -> every device. */
exports.onGlobalNotification = functions.database
    .ref('notifications/global/{pushId}')
    .onCreate(async (snap) => {
        const v = snap.val();
        if (!v || !v.message) return null;
        const tokens = await collectTokens();
        await sendTo(tokens, '📢 Arcade Hub', toPlainText(v.message), 'global', '/');
        return null;
    });

/** PRIVATE message -> that one user's devices. */
exports.onPrivateNotification = functions.database
    .ref('notifications/private/{uid}/{pushId}')
    .onCreate(async (snap, ctx) => {
        const v = snap.val();
        if (!v || !v.message) return null;
        const tokens = await collectTokens(ctx.params.uid);
        await sendTo(tokens, '🔔 Arcade Hub', toPlainText(v.message), 'private-' + ctx.params.uid, '/');
        return null;
    });
