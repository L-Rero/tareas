/* Service worker: guarda la app para que abra sin conexión. Nunca guarda datos del usuario
 * (las llamadas a Supabase no pasan por la caché). Cambia VERSION al publicar cambios. */
const VERSION = 'tareas-v3';
const ASSETS = ['./', 'index.html', 'tareas.css', 'config.js', 'manifest.webmanifest',
  'js/crypto.js', 'js/common.js', 'js/logica.js', 'js/datos.js', 'js/sync.js', 'js/vistas.js', 'js/setup.js',
  'vendor/supabase.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
// cache: 'reload' evita guardar archivos antiguos que el navegador tuviera en su caché
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Primero la red (para recibir siempre la versión más reciente); sin conexión, la copia guardada.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
