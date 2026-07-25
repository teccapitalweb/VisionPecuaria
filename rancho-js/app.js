// ═══════════════════════════════════════════════════════════
// EL RANCHO DIGITAL · shell: auth, sidebar, router, modal VIP
// ═══════════════════════════════════════════════════════════
import { auth, initAuth, cerrarSesion } from './firebase.js';
import { pintarSaludo, pintarStats } from './casco.js';
import { iniciarApoyos } from './apoyos.js';
import { iniciarHato, montarHato } from './hato.js';
import { iniciarPrediccion, montarPrediccion, pintarAnimalesPrediccion } from './prediccion.js';
import { iniciarCertificados, montarCertificados } from './certificados.js';
import { iniciarCalculadora, montarCalculadora } from './calculadora.js';
import { iniciarBiblioteca, montarBiblioteca } from './biblioteca.js';
import { iniciarWebinars } from './webinars.js';
import { iniciarProgreso, refrescarProgreso } from './progreso.js';
import { iniciarMaterial } from './material.js';
import { iniciarDiagnostico, montarDiagnostico } from './diagnostico.js';
import { iniciarBitacora, montarBitacora, pintarBitacora } from './bitacora.js';
import { iniciarComunidad, montarComunidad } from './comunidad.js';
import { iniciarSoporte, montarSoporte } from './soporte.js';
import { iniciarMercado, montarMercado } from './mercado.js';

// Secciones ya migradas: viven en rancho.html, no llevan cartel de obra.
// Con Mercado dentro, ya no queda ninguna en construcción.
const SECCIONES_LISTAS = new Set(['casco', 'apoyos', 'hato', 'prediccion',
  'calculadora', 'cursos', 'material', 'webinars', 'progreso', 'certificados',
  'diagnostico', 'bitacora', 'comunidad', 'soporte', 'mercado']);

// ── Las 17 herramientas reales ──
// vip:true → sección exclusiva: en modo Explorador (free) se inyecta
// el banner vitrina (igual que el portal actual). href → página aparte.
const TOOLS = [
  { id:'casco',        emoji:'🏠', nombre:'Casco',                grupo:'Tu rancho',    color:'salvia', desc:'Tu punto de partida: el resumen del día.' },
  { id:'hato',         emoji:'🐄', nombre:'Mi Hato',              grupo:'Tu rancho',    color:'miel',   desc:'Registro individual y por lotes.' },
  { id:'diagnostico',  emoji:'🩺', nombre:'Diagnóstico IA',       grupo:'Tu rancho',    color:'coral',  desc:'Orientación veterinaria en segundos.', vip:true },
  { id:'calculadora',  emoji:'🧮', nombre:'Calculadora',          grupo:'Tu rancho',    color:'cielo',  desc:'Cuánto te deja cada engorda.' },
  { id:'bitacora',     emoji:'📓', nombre:'Bitácora',             grupo:'Tu rancho',    color:'teal',   desc:'Vacunas, pesos y eventos con fecha.' },
  { id:'mercado',      emoji:'💰', nombre:'Mercado',              grupo:'Tu rancho',    color:'lila',   desc:'Precios estimados de referencia, actualizados cada 12 h.' },
  { id:'prediccion',   emoji:'📊', nombre:'Predicción',           grupo:'Tu rancho',    color:'miel',   desc:'Anticípate a los precios.' },
  { id:'apoyos',       emoji:'🏛️', nombre:'Apoyos Gob',           grupo:'Tu rancho',    color:'salvia', desc:'FIRA, SINIIGA, Bienestar y más.' },
  { id:'cursos',       emoji:'🎓', nombre:'Biblioteca de cursos', grupo:'Aprendizaje',  color:'cielo',  desc:'Los 26 cursos completos, a tu ritmo.', vip:true },
  { id:'material',     emoji:'📚', nombre:'Material de apoyo',    grupo:'Aprendizaje',  color:'coral',  desc:'Guías y manuales descargables.', vip:true },
  { id:'webinars',     emoji:'📡', nombre:'Webinars exclusivos',  grupo:'Aprendizaje',  color:'lila',   desc:'Sesiones en vivo con expertos.', vip:true },
  // Sin "rankings": no existen. Ver progreso.js — es un contador local.
  { id:'progreso',     emoji:'🏆', nombre:'Mi progreso',          grupo:'Tu carrera',   color:'teal',   desc:'Tu avance y logros en los cursos.' },
  { id:'certificados', emoji:'🎖️', nombre:'Certificados',         grupo:'Tu carrera',   color:'miel',   desc:'Folio oficial y QR verificable.' },
  { id:'comunidad',    emoji:'🌐', nombre:'Comunidad',            grupo:'Tu carrera',   color:'salvia', desc:'Compra, vende y conecta con otros ranchos.' },
  { id:'soporte',      emoji:'📞', nombre:'Soporte técnico',      grupo:'Tu carrera',   color:'cielo',  desc:'Te acompañamos cuando lo necesites.' },
  { id:'trazabilidad', emoji:'🔗', nombre:'Trazabilidad',         grupo:'Más',          color:'coral',  desc:'Certificados QR por animal.', href:'trazabilidad.html' },
  { id:'verificador',  emoji:'✅', nombre:'Verificador',          grupo:'Más',          color:'teal',   desc:'Valida cualquier certificado.', href:'verificar.html' },
];

// Textos del banner vitrina por sección exclusiva (réplica del portal)
const VITRINA = {
  hato:        { icon:'🐄', desc:'Puedes recorrer la sección. Para registrar y gestionar tu ganado, hazte Élite Pecuario.' },
  bitacora:    { icon:'📓', desc:'Puedes ver el historial de tu hato. Para borrar eventos necesitas ser Élite Pecuario.' },
  prediccion:  { icon:'📊', desc:'Ves la calculadora. Para correr el análisis de venta óptima, hazte Élite Pecuario.' },
  calculadora: { icon:'🧮', desc:'Ves la calculadora. Para correr el análisis de rentabilidad, hazte Élite Pecuario.' },
  cursos:      { icon:'🎓', desc:'Mira la primera clase gratis. Para acceder a los cursos completos, hazte Élite Pecuario.' },
  progreso:    { icon:'🏆', desc:'Tu avance en los cursos. Para tomarlos completos, hazte Élite Pecuario.' },
  certificados:{ icon:'🎖️', desc:'Aquí aparecen tus certificados con folio y QR. Para ganarlos, hazte Élite Pecuario.' },
  material:    { icon:'📚', desc:'Ves los títulos. Para descargar el material completo, hazte Élite Pecuario.' },
  webinars:    { icon:'📡', desc:'Ves la programación. Para unirte a las sesiones en vivo, hazte Élite Pecuario.' },
  diagnostico: { icon:'⚕️', desc:'Función exclusiva. Solicítalo siendo Élite Pecuario.' },
  comunidad:   { icon:'🌐', desc:'Puedes ver todos los avisos. Para publicar el tuyo, hazte Élite Pecuario.' },
};

const WEBHOOK = 'https://visionpecuaria-webhook-production.up.railway.app/crear-checkout';
const STRIPE_PK = 'pk_live_51TMAcSA7If2CqXs9NuKsM1cVT9n5agProkMR8HFiT6QTXzS0g9PtiokZ4cpT1Qo3rk9bbsrZHx9sOUbE9UEOjgGs00n1OM3Y9b';

let currentUser = null;
let userPlan = 'free';

// ── Toast ──
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Render del sidebar y las secciones ──
function renderShell() {
  const nav = document.getElementById('sbNav');
  const grupos = [...new Set(TOOLS.map(t => t.grupo))];
  nav.innerHTML = grupos.map(g =>
    `<div class="sb-label">${g}</div>` +
    TOOLS.filter(t => t.grupo === g).map(t => t.href
      ? `<a class="sb-item" href="${t.href}"><span class="ico">${t.emoji}</span>${t.nombre}<span class="ext">↗</span></a>`
      : `<button class="sb-item" data-section="${t.id}"><span class="ico">${t.emoji}</span>${t.nombre}</button>`
    ).join('')
  ).join('');

  // Secciones "en construcción" (las que aún no se migran)
  const cont = document.getElementById('sections');
  cont.insertAdjacentHTML('beforeend', TOOLS.filter(t => !t.href && !SECCIONES_LISTAS.has(t.id)).map(t => `
    <section class="section" id="section-${t.id}" aria-label="${t.nombre}">
      <div class="wip">
        <span class="w-emoji">${t.emoji}</span>
        <span class="w-tag">🚧 EN CONSTRUCCIÓN</span>
        <h2>${t.nombre}</h2>
        <p>${t.desc}</p>
        <p>Esta herramienta se está migrando al nuevo Rancho Digital.
           Mientras tanto, úsala en <a href="index.html">el portal actual</a>.</p>
      </div>
    </section>`).join(''));

  // Tarjetas de acceso en el Casco
  const grid = document.getElementById('cascoTools');
  grid.innerHTML = TOOLS.filter(t => t.id !== 'casco').map(t => t.href
    ? `<a class="tool-card tc--${t.color}" href="${t.href}" style="text-decoration:none;display:block">
         <span class="t-emoji">${t.emoji}</span><h4>${t.nombre} ↗</h4><p>${t.desc}</p></a>`
    : `<button class="tool-card tc--${t.color}" data-goto="${t.id}">
         <span class="t-emoji">${t.emoji}</span><h4>${t.nombre}</h4><p>${t.desc}</p></button>`
  ).join('');

  nav.querySelectorAll('[data-section]').forEach(b => b.addEventListener('click', () => navigateTo(b.dataset.section)));
  grid.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => navigateTo(b.dataset.goto)));
}

// ── Navegación show/hide + hash deep-links ──
function navigateTo(section, pushHash = true) {
  if (!document.getElementById('section-' + section)) section = 'casco';
  document.querySelectorAll('.sb-item[data-section]').forEach(b =>
    b.classList.toggle('active', b.dataset.section === section));
  document.querySelectorAll('.section').forEach(s =>
    s.classList.toggle('active', s.id === 'section-' + section));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.innerWidth <= 880) toggleSidebar(false);
  if (pushHash && ('#' + section) !== location.hash) location.hash = section;
  // El hato llega por onSnapshot: al entrar, repintar con lo ya cargado.
  if (section === 'prediccion') pintarAnimalesPrediccion();
  if (section === 'progreso') refrescarProgreso();
  if (section === 'bitacora') pintarBitacora();
  actualizarVitrina(section);
}
window.addEventListener('hashchange', () => navigateTo(location.hash.slice(1) || 'casco', false));

// ── Banner vitrina para modo Explorador (free) ──
function actualizarVitrina(section) {
  document.querySelectorAll('.vitrina').forEach(b => b.remove());
  if (userPlan === 'vip') return;
  const cfg = VITRINA[section];
  if (!cfg) return;
  const sectionEl = document.getElementById('section-' + section);
  const banner = document.createElement('div');
  banner.className = 'vitrina';
  banner.innerHTML = `
    <span class="v-ico">${cfg.icon}</span>
    <div class="v-txt">
      <strong>👑 Estás en modo Explorador (FREE)</strong>
      <span>${cfg.desc}</span>
    </div>
    <button type="button">Hazte Élite</button>`;
  banner.querySelector('button').addEventListener('click', () => abrirModalVIP());
  sectionEl.prepend(banner);
}

// ── Sidebar móvil ──
function toggleSidebar(force) {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sbOverlay');
  const open = force === undefined ? !sb.classList.contains('open') : force;
  sb.classList.toggle('open', open);
  ov.classList.toggle('active', open);
}
document.getElementById('tbBurger').addEventListener('click', () => toggleSidebar());
document.getElementById('sbOverlay').addEventListener('click', () => toggleSidebar(false));

// ── Usuario en el sidebar ──
function pintarUsuario(user, plan, miembro) {
  const nombre = user.displayName || (user.email || '').split('@')[0];
  const iniciales = nombre.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  document.getElementById('sbAvatar').textContent = iniciales;
  document.getElementById('sbUserName').textContent = nombre;
  document.getElementById('sbUserEmail').textContent = user.email || '';
  const badge = document.getElementById('sbBadge');
  if (plan === 'vip') {
    badge.textContent = '👑 ÉLITE';
    badge.className = 'sb-badge sb-badge--vip';
    badge.title = miembro?.plan || 'Élite Pecuario';
    document.getElementById('sbCta').style.display = 'none';
  } else {
    badge.textContent = 'FREE';
    badge.className = 'sb-badge sb-badge--free';
  }
}

// ── Modal VIP + checkout (mismo funnel del portal: webhook Railway + Stripe) ──
window.abrirModalVIP = function(razon) {
  if (razon) document.getElementById('mvSub').textContent = razon;
  document.getElementById('modalVip').classList.add('active');
};
document.getElementById('mvClose').addEventListener('click', () =>
  document.getElementById('modalVip').classList.remove('active'));
document.getElementById('modalVip').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});
document.querySelectorAll('[data-plan]').forEach(b =>
  b.addEventListener('click', () => suscribirElite(b.dataset.plan)));

async function suscribirElite(plan) {
  toast('🚀 Conectando con Stripe...');
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('Inicia sesión primero');
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, email: user.email, uid: user.uid, nombre: user.displayName || '' })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' del servidor de pagos');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.url) { window.location.href = data.url; return; }
    if (data.clientSecret) {
      if (typeof Stripe === 'undefined') {
        const s = document.createElement('script');
        s.src = 'https://js.stripe.com/v3/';
        s.onload = () => montarStripeEmbedded(data.clientSecret);
        document.head.appendChild(s);
      } else {
        montarStripeEmbedded(data.clientSecret);
      }
      return;
    }
    throw new Error('Respuesta inesperada del servidor');
  } catch (e) {
    console.error('Error suscribiendo:', e);
    const numero = '5212361100649';
    const msg = encodeURIComponent('Hola, intenté pagar mi suscripción Élite Pecuario y me dio error. Email: ' + (auth.currentUser?.email || '') + ' Plan: ' + plan);
    toast('Error: ' + e.message + ' — abriendo WhatsApp...');
    setTimeout(() => window.open('https://wa.me/' + numero + '?text=' + msg, '_blank'), 1500);
  }
}

async function montarStripeEmbedded(clientSecret) {
  if (window.__stripeCheckoutInstance) {
    try { window.__stripeCheckoutInstance.destroy(); } catch (e) {}
    window.__stripeCheckoutInstance = null;
  }
  const prev = document.getElementById('stripeCheckoutOverlay');
  if (prev) prev.remove();
  const overlay = document.createElement('div');
  overlay.id = 'stripeCheckoutOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,25,15,.88);backdrop-filter:blur(10px);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow-y:auto';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:20px;max-width:520px;width:100%;padding:14px;position:relative;margin-top:20px';
  const close = document.createElement('button');
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Cerrar pago');
  close.style.cssText = 'position:absolute;top:-14px;right:-6px;background:#F5EFE4;color:#33352D;border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3)';
  close.onclick = () => {
    try { window.__stripeCheckoutInstance?.destroy(); } catch (e) {}
    window.__stripeCheckoutInstance = null;
    overlay.remove();
  };
  const mount = document.createElement('div');
  mount.id = 'stripeCheckoutMount';
  box.appendChild(close); box.appendChild(mount);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const stripe = Stripe(STRIPE_PK);
  const checkout = await stripe.initEmbeddedCheckout({ clientSecret });
  window.__stripeCheckoutInstance = checkout;
  checkout.mount('#stripeCheckoutMount');
}

// ── Búsqueda del topbar: filtra herramientas y navega con Enter ──
const searchInput = document.getElementById('tbSearch');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  document.querySelectorAll('#cascoTools .tool-card').forEach(card => {
    card.style.display = !q || card.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = searchInput.value.trim().toLowerCase();
  const hit = TOOLS.find(t => t.nombre.toLowerCase().includes(q));
  if (hit) {
    if (hit.href) { window.location.href = hit.href; return; }
    navigateTo(hit.id);
    searchInput.value = '';
    document.querySelectorAll('#cascoTools .tool-card').forEach(c => c.style.display = '');
  }
});

document.getElementById('tbOut').addEventListener('click', cerrarSesion);
document.getElementById('sbCtaBtn').addEventListener('click', () => abrirModalVIP());
document.getElementById('iaCta').addEventListener('click', () => navigateTo('diagnostico'));

// ── Arranque ──
renderShell();
montarHato();
montarBitacora();
montarComunidad();
montarPrediccion();
montarCertificados();
montarCalculadora();
montarBiblioteca();
montarDiagnostico();
montarSoporte();
montarMercado();
// Soporte no depende de sesión ni de plan: es contenido estático.
iniciarSoporte();
initAuth({
  setBootStatus: (t) => { const el = document.getElementById('bootStatus'); if (el) el.textContent = t; },
  onUser: (user, plan, miembro) => {
    currentUser = user;
    userPlan = plan;
    pintarUsuario(user, plan, miembro);
    pintarSaludo(user);
    pintarStats(user);
    // Apoyos: las reglas piden autenticado(), así que se cablea ya con sesión.
    // Lo ven free y Élite por igual — sin banner de vitrina.
    iniciarApoyos(user);
    // Mercado: mismo caso que Apoyos — las reglas solo piden autenticado()
    // y no hay gate de plan. El Explorador ve los mismos precios que el Élite.
    iniciarMercado(user);
    // Hato: el gate Élite es del cliente (las reglas solo piden
    // autenticado()), igual que en el portal actual. Ver BL01.
    iniciarHato(user, plan);
    iniciarBitacora(plan);
    // Comunidad: la regla de `avisos` exige esVip() solo para crear —
    // leer el radar es para cualquier autenticado. El gate de publicar
    // en la UI es del cliente (bloqueadoPorFree), la regla ya lo exige de verdad.
    iniciarComunidad(user, plan, miembro);
    iniciarPrediccion(plan);
    iniciarCalculadora(plan);
    iniciarCertificados(user, plan);
    iniciarBiblioteca(plan, miembro);
    iniciarWebinars(plan);
    iniciarProgreso(user, plan);
    iniciarMaterial(plan);
    iniciarDiagnostico(plan);
    navigateTo(location.hash.slice(1) || 'casco', false);
    setTimeout(() => document.getElementById('boot').classList.add('hide'), 400);
  }
});
