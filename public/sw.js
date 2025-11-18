const CACHE_NAME = 'iqbaes-lecturer-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.css',
  '/fcom.png',
  '/manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip service worker for ALL development resources (any localhost port)
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.includes('localhost') ||
    url.port === '5173' ||
    url.port === '5174' ||
    url.port === '3000' ||
    url.pathname.includes('@vite') ||
    url.pathname.includes('@react-refresh') ||
    url.pathname.includes('?t=') ||
    url.pathname.includes('src/') ||
    url.pathname.includes('node_modules') ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'moz-extension:' ||
    event.request.method !== 'GET'
  ) {
    // Don't intercept these requests at all
    return;
  }

  // Only handle production requests (HTTPS)
  if (location.protocol === 'https:') {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }
          
          return fetch(event.request).then((response) => {
            // Cache successful responses
            if (response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return response;
          });
        })
        .catch(() => {
          // Return cached index.html for navigation requests
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
          return new Response('Network error', { status: 503 });
        })
    );
  }
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Push notification event
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/fcom.png',
    badge: '/fcom.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('IQBAES Lecturer', options)
  );
});