/* Service Worker · Visión Pecuaria — El Rancho Digital (PWA) */
const CACHE = 'vision-pecuaria-v1';
const ASSETS = ['./', 'index.html', 'login.html', 'vip.html', 'manifest.json', 'pwa-192.png', 'pwa-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                  // no tocar POST (Firebase/Stripe)
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;        // dejar pasar Firebase/Google/Stripe
  // El Rancho Digital (rancho.html) se sirve en módulos .js + .css sueltos, y el
  // caché-primero de abajo los congelaría en el navegador del socio: una corrección
  // (una dosis del diagnóstico, por ejemplo) no le llegaría nunca. Se dejan fuera del
  // SW para que vayan siempre a la red. El portal actual no pide estas rutas.
  // Nota: rancho.html NO entra aquí — es HTML y sigue por red-primero, abajo.
  if (url.pathname.includes('/rancho-js/') || url.pathname.endsWith('/rancho.css')) return;
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
});
