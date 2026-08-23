# 🔔 Push Notifications — Setup Guide

This adds **real Web Push notifications** (Firebase Cloud Messaging) so your players
get announcements & private messages **even when the site/tab is fully closed** —
just like a native app. Players opt in via the **"Enable Push Notifications"**
button in their Profile.

The code is already written & wired in. You only need to do these **one-time
Firebase Console steps**.

---

## Step 1 — Get your Web Push VAPID key (2 min)
1. Open [Firebase Console](https://console.firebase.google.com/) → your project
   (**bittuhere-90415**).
2. ⚙️ **Project Settings** → **Cloud Messaging**.
3. Under **Web Push certificates**, click **Generate key pair** (if not already).
4. Copy the **Public Key** (a long string starting with `B`).
5. Open `js/push-config.js` and paste it:
   ```js
   VAPID_PUBLIC_KEY: 'BPasteYourPublicKeyHere....',
   ```

## Step 2 — Enable the Cloud Functions backend (sends the pushes)
Pushes can't be sent from the browser — a backend must deliver them. This repo
includes the function in `functions/index.js`. It auto-sends a push whenever an
admin posts a global or private notification.

1. Upgrade to the **Blaze** plan (pay-as-you-go). FCM is free for the volumes
   you'll use; Blaze is required to run Cloud Functions. *(Project Settings →
   "Upgrade" if you're on Spark.)*
2. Install the Firebase CLI once: `npm install -g firebase-tools`
3. Log in: `firebase login`
4. From the repo root, link the project: `firebase use bittuhere-90415`
   (create `firebase.json` + `.firebaserc` if needed — the CLI will offer.)
5. Deploy only the functions:
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```

That's it. Now whenever you (admin) publish a **Global Announcement** or send a
**Private Notification**, every opted-in device gets a system push — site open
or closed.

---

## How it works
| File | Role |
|------|------|
| `js/push.js` | Client: permission prompt, FCM token, foreground toast, enable/disable toggle |
| `js/push-config.js` | Your VAPID key + token DB path |
| `firebase-messaging-sw.js` | Background service worker — receives pushes & shows them when the site is closed; opens the site on tap |
| `functions/index.js` | Cloud Functions — fans out a push on each new admin notification |
| index.html | Loads `firebase-messaging.js` + the push scripts; shows the toggle in Profile |

**Token storage:** `fcmTokens/<playerName>/<token> = true` (written by the client on
enable, read by the function to send, pruned when a token goes stale).

## Testing
1. Complete Steps 1 & 2.
2. Log in, open **Profile → 🔔 Enable Push Notifications**, allow the browser prompt.
3. Close the tab (and even the browser on mobile).
4. From the **Admin Panel**, publish a Global Announcement.
5. The push should arrive on the device within a few seconds. ✅

> **iOS note:** Web Push on iPhone/iPad requires the site be **Added to Home
> Screen** (PWA) and opened from there. Android + desktop Chrome work directly.
> Your `manifest.json` already makes the site installable. ✅
