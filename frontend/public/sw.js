const CACHE_NAME = 'inventra-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/main.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/socket.js',
  '/js/app.js',
  '/js/modules/dashboard.js',
  '/js/modules/inventory.js',
  '/js/modules/pos.js',
  '/js/modules/sales.js',
  '/js/modules/purchase.js',
  '/js/modules/accounting.js',
  '/js/modules/crm.js',
  '/js/modules/hrms.js',
  '/js/modules/manufacturing.js',
  '/js/modules/warehouse.js',
  '/js/modules/reports.js',
  '/js/modules/gst.js',
  '/js/modules/admin.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.datatables.net/1.13.7/css/dataTables.bootstrap5.min.css',
  'https://cdn.datatables.net/responsive/2.5.0/css/responsive.bootstrap5.min.css',
  'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js',
  'https://cdn.datatables.net/1.13.7/js/dataTables.bootstrap5.min.js',
  'https://cdn.datatables.net/responsive/2.5.0/js/dataTables.responsive.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Exclude API requests and WebSockets from local caching
  if (event.request.url.includes('/api/') || event.request.url.includes('socket.io')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return offline response for APIs if offline
        return new Response(JSON.stringify({
          success: false,
          error: 'Offline mode active. Connection lost.',
          offline: true
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return from cache, fetch update in background (Stale While Revalidate)
        fetch(event.request).then(networkResponse => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Ignore network error offline */});
        
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
