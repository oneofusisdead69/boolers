// Minimal service worker so phones offer "Install app". It doesn't cache anything:
// the games need a live connection anyway, and caching would only serve stale code.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
