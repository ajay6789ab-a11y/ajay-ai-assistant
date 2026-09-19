/**
 * Service worker — makes the app shell work with no network at all.
 *
 * Strategy:
 *   - App shell (HTML/CSS/JS/icons/manifest): cache-first, refreshed in the
 *     background so a new version appears on the next launch.
 *   - Anything not cached yet: network, then cached on success.
 *
 * Business data never goes through here — it lives in IndexedDB.
 */

const VERSION = 'kirana-v1.0.1';
const SHELL_CACHE = `${VERSION}-shell`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles.css',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './js/i18n.js',
  './js/core/db.js',
  './js/core/ids.js',
  './js/core/money.js',
  './js/core/store.js',
  './js/core/reports.js',
  './js/core/backup.js',
  './js/ui/app.js',
  './js/ui/dom.js',
  './js/ui/screens/dashboard.js',
  './js/ui/screens/sales.js',
  './js/ui/screens/products.js',
  './js/ui/screens/customers.js',
  './js/ui/screens/more.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),   // a missing asset must not brick the install
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;    // never touch cross-origin calls

  // Never route downloads (backups, exports) through the app-shell cache —
  // they are user files, not app assets, and some are large.
  if (/\.(zip|json|csv)$/i.test(url.pathname)) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));

      // Cache-first for a snappy offline launch, with a background refresh.
      return cached || network;
    }),
  );
});
