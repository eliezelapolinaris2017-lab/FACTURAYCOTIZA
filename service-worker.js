/* ==========================================================
   Oasis Facturación — Service Worker (PWA Offline Cache)
   ========================================================== */

const CACHE_NAME = "oasis-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase-init.js",
  "./manifest.json"
];

// Instalar Service Worker y cachear assets
self.addEventListener("install", (event) => {
  console.log("[SW] Instalando Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar versiones antiguas
self.addEventListener("activate", (event) => {
  console.log("[SW] Activando y limpiando cache...");
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Interceptar peticiones y servir desde cache si no hay conexión
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(resp => resp || fetch(event.request).catch(() => caches.match("./index.html")))
  );
});
