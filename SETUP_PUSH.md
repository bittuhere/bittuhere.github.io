# 🔔 Push Notifications — FULLY FREE (Spark plan) — Setup Guide

FCM itself is **free on Spark** (unlimited sends). Cloud Functions would need Blaze —
so we DON'T use them. **Your Render server (server.js) is the sender**, using the
Firebase Admin SDK. No GAS, no Cloud Functions, no Blaze.

## What's already DONE (by Arena)
- ✅ `firebase-messaging-sw.js` — service worker: shows notifications when the
  browser/tab is CLOSED, focuses the site on tap
- ✅ `js/push.js` + `js/push-config.js` — permission flow, token capture, saves to
  `fcmTokens/<playerName>/<token>` in the database. VAPID key already pasted ✅
- ✅ Profile → "🔔 Enable Push Notifications" button (restored)
- ✅ `server.js` → `POST /notify/user` (chat messages) + `POST /notify/all`
  (admin announcements, admin-key protected) + rate limiting + dead-token cleanup
- ✅ Chat: every message now ALSO pushes to the friend's devices (browser closed!)
- ✅ Admin → Global Announce now ALSO pushes to every device

## 🔑 The ONE remaining step (5 minutes, only you can do it)
Add the Firebase service account to Render so the server can send:

1. **Firebase Console** → Project Settings → **Service accounts** →
   **Generate new private key** → a JSON file downloads
2. Open the JSON, copy ALL of it
3. **render.com** → your `arcade-hub-email` service → **Environment** →
   Add Environment Variable:
   - Key: `FIREBASE_SERVICE_ACCOUNT`
   - Value: paste the whole JSON
4. (Optional, extra safety) Add `ADMIN_NOTIFY_KEY` with a secret string —
   otherwise the admin-announce push uses the same key as the admin panel.
5. **Save & Deploy** — done!

## How to test it
1. Open the site on your phone → Profile → 🔔 Enable Push Notifications → Allow
2. CLOSE the browser completely
3. From a PC (different account), send that account a chat message
4. 🎉 Notification appears with the sender's name + message preview
5. Admin panel → Global Announce → everyone with push enabled gets it

## Notes
- `GET /notify/status` on the server tells you if push is configured
- Rich media (images) in notifications: host them on GitHub Pages (we do —
  favicon-192.png), NOT Firebase Storage (that needs Blaze — avoid it)
- firebase-admin SDK is lazy-loaded: if the env var is missing, the server
  still works fine for email/chess/etc — endpoints just return sent:0
