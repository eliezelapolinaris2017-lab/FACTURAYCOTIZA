/* Oasis PWA — service-worker */
const CACHE = 'oasis-v1';
const ASSETS = [
'./',
'./index.html',
'./styles.css',
'./app-core.js',
'./nuevo.html',
'./historial.html',
'./catalogo.html',
'./reportes.html',
'./config.html',
'./manifest.json'
];

self.addEventListener('install', (e) => {
e.waitUntil(
caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(self.skipWaiting())
);
});

self.addEventListener('activate', (e) => {
e.waitUntil(
caches.keys().then(keys =>
Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
).then(self.clients.claim())
);
});

self.addEventListener('fetch', (e) => {
const { request } = e;
if (request.method !== 'GET') return;
e.respondWith(
caches.match(request).then((cached) =>
cached ||
fetch(request).then((res) => {
const copy = res.clone();
caches.open(CACHE).then((c) => c.put(request, copy));
return res;
}).catch(() => cached)
)
);
});
