// Service worker: deja el simulador y el banco de preguntas funcionando sin conexión.
// Las páginas (index.html, quiz.html) y quiz/banco.json van primero a la red (para recibir cambios en cuanto
// hay señal) y si no hay, salen de la caché. Íconos, figuras del banco, manifest y fuentes de Google salen
// de la caché y se guardan la primera vez que se piden.
// Si cambias la lista de APP, sube la versión de CACHE para que se borre la anterior.
const CACHE = 'simguardia-v2';
const APP = ['./', './index.html', './quiz.html', './quiz/banco.json', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;

  if (req.mode === 'navigate' || url.pathname.endsWith('/quiz/banco.json')) {
    // cada página se guarda con su propia dirección (sin ?parámetros); la raíz cuenta como index.html
    const clave = url.pathname.endsWith('/') ? new URL('./index.html', url).href : url.origin + url.pathname;
    e.respondWith(fetch(req)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(clave, copy)); } return res; })
      .catch(() => caches.match(clave).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
