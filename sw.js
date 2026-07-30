/* Service Worker · Visión Pecuaria — El Rancho Digital (PWA) */
const CACHE = 'vision-pecuaria-v4';
// La app instalada empieza en login.html. Si ya hay una sesión activa, el propio
// login lleva al socio a rancho.html; sin conexión, el acceso sigue siendo la
// pantalla segura de entrada. El landing comercial vive en visionpecuariamx.com.
const ASSETS = ['./', 'login.html', 'rancho.html', 'manifest.json', 'pwa-install.js', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'];
self.addEventListener('install', (e) => {
  // Sin .catch: si el precaché falla (socio sin red o con señal mala justo cuando se
  // descubre el SW nuevo), el install falla y NO se llega al activate. Así el caché
  // anterior sobrevive intacto en vez de quedar borrado y sin reemplazo. El navegador
  // reintenta la instalación en la siguiente visita.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
    e.respondWith(fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; }).catch(() => caches.match(req).then((r) => r || caches.match('login.html'))));
    return;
  }
  // JS y CSS de mismo origen (los que no salieron por el bypass de arriba):
  // stale-while-revalidate. Se responde del caché al instante —la carga no espera
  // a la red— y en paralelo se revalida contra el servidor, así la próxima visita
  // ya trae la versión fresca. Si no hay copia en caché, va a red normal.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    e.respondWith(caches.match(req).then((cached) => {
      const fresca = fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; });
      if (!cached) return fresca;
      e.waitUntil(fresca.catch(() => {}));           // sin red: se conserva lo cacheado
      return cached;
    }));
    return;
  }
  // Imágenes y demás estáticos: caché-primero (no cambian).
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
});
