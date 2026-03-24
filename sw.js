self.addEventListener('install', (e) => {
  console.log('Service Worker: Installed');
});

self.addEventListener('fetch', (e) => {
  // Abhi ke liye sirf request pass kar rahe hain
  e.respondWith(fetch(e.request));
});
