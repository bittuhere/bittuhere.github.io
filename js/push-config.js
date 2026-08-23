/* =====================================================================
   Arcade Hub — Push Notification CONFIG
   ---------------------------------------------------------------------
   🔑 YOU MUST PASTE YOUR VAPID PUBLIC KEY HERE.
   Get it from: Firebase Console → Project Settings → Cloud Messaging
               → Web Push certificates → Generate key pair.
   Copy the PUBLIC KEY (a long string starting with "B...") into VAPID_PUBLIC_KEY below.
   ===================================================================== */
window.PUSH_CONFIG = {
    // 🔑 Replace this placeholder with your Web Push certificate public key.
    VAPID_PUBLIC_KEY: 'BEtx93bNjqOn0IsKvecQj-WPTdLch9tLGJhL8W73YstrTswUldOi4TRdevy4Srvas6ul3ocA1TzuFmZKEaOHyXk',
    // Firebase path where each user's device tokens are stored.
    //   fcmTokens/<playerName>/<token> = true
    TOKENS_PATH: 'fcmTokens',
    // When a push is tapped, open this URL.
    CLICK_URL: 'https://bittuhere.github.io/'
};
