/* Service worker de la app de puerta: deja la aplicación disponible sin conexión.
   La API nunca se guarda en caché (los datos de entradas los gestiona la propia app). */
const CACHE = 'taquilla-puerta-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/puerta', '/icono.svg', '/puerta.webmanifest'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Recursos con huella (no cambian): primero la caché
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return res; })));
    return;
  }
  // Páginas: primero la red y, sin conexión, lo último guardado
  e.respondWith(fetch(e.request).then((res) => { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/puerta'))));
});
