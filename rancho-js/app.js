// ═══════════════════════════════════════════════════════════
// EL RANCHO DIGITAL · shell: auth, sidebar, router, modal VIP
// ═══════════════════════════════════════════════════════════
import { auth, initAuth, cerrarSesion, detectarPlan } from './firebase.js';
import { pintarSaludo, pintarStats } from './casco.js';
import { iniciarApoyos } from './apoyos.js';
import { iniciarHato, montarHato } from './hato.js';
import { iniciarPrediccion, montarPrediccion, pintarAnimalesPrediccion } from './prediccion.js';
import { iniciarCertificados, montarCertificados } from './certificados.js';
import { iniciarCalculadora, montarCalculadora } from './calculadora.js';
import { iniciarBiblioteca, montarBiblioteca } from './biblioteca.js?v=20260730-free1';
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
// El orden también define la jerarquía del menú y del buscador: la formación
// es el producto principal; el resto acompaña la experiencia del productor.
const TOOLS = [
  { id:'cursos',       emoji:'🎓', nombre:'Biblioteca de cursos', grupo:'Cursos y formación', color:'cielo', desc:'La biblioteca completa, a tu ritmo.', vip:true, principal:true },
  { id:'material',     emoji:'📚', nombre:'Material de apoyo',    grupo:'Cursos y formación', color:'coral', desc:'Guías y manuales descargables.', vip:true, principal:true },
  { id:'webinars',     emoji:'📡', nombre:'Webinars exclusivos',  grupo:'Cursos y formación', color:'lila',  desc:'Sesiones en vivo con expertos.', vip:true, principal:true },
  // Sin "rankings": no existen. Ver progreso.js — es un contador local.
  { id:'progreso',     emoji:'🏆', nombre:'Mi progreso',          grupo:'Cursos y formación', color:'teal', desc:'Tu avance y logros en los cursos.', principal:true },
  { id:'certificados', emoji:'🎖️', nombre:'Certificados',         grupo:'Cursos y formación', color:'miel', desc:'Folio oficial y QR verificable.', principal:true },
  { id:'casco',        emoji:'🏠', nombre:'Casco',                grupo:'Herramientas del rancho', color:'salvia', desc:'Tu punto de partida: el resumen del día.' },
  { id:'hato',         emoji:'🐄', nombre:'Mi Hato',              grupo:'Herramientas del rancho', color:'miel',   desc:'Registro individual y por lotes.' },
  { id:'diagnostico',  emoji:'🩺', nombre:'Diagnóstico IA',       grupo:'Herramientas del rancho', color:'coral',  desc:'Orientación veterinaria en segundos.', vip:true },
  { id:'calculadora',  emoji:'🧮', nombre:'Calculadora',          grupo:'Herramientas del rancho', color:'cielo',  desc:'Cuánto te deja cada engorda.' },
  { id:'bitacora',     emoji:'📓', nombre:'Bitácora',             grupo:'Herramientas del rancho', color:'teal',   desc:'Vacunas, pesos y eventos con fecha.' },
  { id:'mercado',      emoji:'💰', nombre:'Mercado',              grupo:'Herramientas del rancho', color:'lila',   desc:'Precios estimados de referencia, actualizados cada 12 h.' },
  { id:'prediccion',   emoji:'📊', nombre:'Predicción',           grupo:'Herramientas del rancho', color:'miel',   desc:'Anticípate a los precios.' },
  { id:'apoyos',       emoji:'🏛️', nombre:'Apoyos Gob',           grupo:'Herramientas del rancho', color:'salvia', desc:'FIRA, SINIIGA, Bienestar y más.' },
  { id:'comunidad',    emoji:'🌐', nombre:'Comunidad',            grupo:'Comunidad y ayuda', color:'salvia', desc:'Compra, vende y conecta con otros ranchos.' },
  { id:'soporte',      emoji:'📞', nombre:'Soporte técnico',      grupo:'Comunidad y ayuda', color:'cielo',  desc:'Te acompañamos cuando lo necesites.' },
  { id:'trazabilidad', emoji:'🔗', nombre:'Trazabilidad',         grupo:'Más',          color:'coral',  desc:'Certificados QR por animal.', href:'trazabilidad.html' },
  { id:'verificador',  emoji:'✅', nombre:'Verificador',          grupo:'Más',          color:'teal',   desc:'Valida cualquier certificado.', href:'verificar.html' },
];

// Textos del banner vitrina por sección exclusiva (réplica del portal)
const VITRINA = {
  hato:        { icon:'🐄', desc:'Puedes recorrer la sección. Para registrar y gestionar tu ganado, hazte Élite Pecuario.' },
  bitacora:    { icon:'📓', desc:'Puedes ver el historial de tu hato. Para borrar eventos necesitas ser Élite Pecuario.' },
  prediccion:  { icon:'📊', desc:'Ves la calculadora. Para correr el análisis de venta óptima, hazte Élite Pecuario.' },
  calculadora: { icon:'🧮', desc:'Ves la calculadora. Para correr el análisis de rentabilidad, hazte Élite Pecuario.' },
  cursos:      { icon:'🎓', desc:'La Clase 1 del curso de muestra es gratis. Las demás clases y los cursos completos son Élite.' },
  progreso:    { icon:'🏆', desc:'Tu avance en los cursos. Para tomarlos completos, hazte Élite Pecuario.' },
  certificados:{ icon:'🎖️', desc:'Aquí aparecen tus certificados con folio y QR. Para ganarlos, hazte Élite Pecuario.' },
  material:    { icon:'📚', desc:'Ves los títulos. Para descargar el material completo, hazte Élite Pecuario.' },
  webinars:    { icon:'📡', desc:'Ves la programación. Para unirte a las sesiones en vivo, hazte Élite Pecuario.' },
  diagnostico: { icon:'⚕️', desc:'Función exclusiva. Solicítalo siendo Élite Pecuario.' },
  comunidad:   { icon:'🌐', desc:'Puedes ver todos los avisos. Para publicar el tuyo, hazte Élite Pecuario.' },
};

const API_BASE = 'https://visionpecuaria-webhook-production.up.railway.app';
const WEBHOOK = `${API_BASE}/crear-checkout`;
const STRIPE_PK = 'pk_live_51TMAcSA7If2CqXs9NuKsM1cVT9n5agProkMR8HFiT6QTXzS0g9PtiokZ4cpT1Qo3rk9bbsrZHx9sOUbE9UEOjgGs00n1OM3Y9b';

let currentUser = null;
let userPlan = 'free';
let retornoPagoProcesado = false;

// ── Toast ──
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3500);
}

function limpiarRetornoPago() {
  const url = new URL(window.location.href);
  url.searchParams.delete('pago_exitoso');
  url.searchParams.delete('session_id');
  const query = url.searchParams.toString();
  history.replaceState(null, '', url.pathname + (query ? `?${query}` : '') + url.hash);
}

async function procesarRetornoPago(user, planInicial) {
  if (retornoPagoProcesado || new URLSearchParams(location.search).get('pago_exitoso') !== '1') return;
  retornoPagoProcesado = true;

  if (planInicial === 'vip') {
    limpiarRetornoPago();
    toast('✅ Pago confirmado. Tu Rancho ya está desbloqueado.');
    return;
  }

  toast('⏳ Pago recibido. Estamos activando tu cuenta Élite...');
  for (let intento = 0; intento < 12; intento += 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const estado = await detectarPlan(user);
    if (estado.plan === 'vip') {
      limpiarRetornoPago();
      toast('✅ Cuenta Élite activada. Cargando tus herramientas...');
      setTimeout(() => window.location.reload(), 900);
      return;
    }
  }

  limpiarRetornoPago();
  toast('Tu pago está en proceso. Si no se activa en un minuto, escríbenos por WhatsApp.');
}

// ── Render del sidebar y las secciones ──
function renderShell() {
  const nav = document.getElementById('sbNav');
  const grupos = [...new Set(TOOLS.map(t => t.grupo))];
  nav.innerHTML = grupos.map(g =>
    `<div class="sb-group${g === 'Cursos y formación' ? ' sb-group--principal' : ''}">
      <div class="sb-label">${g}</div>
      ${TOOLS.filter(t => t.grupo === g).map(t => t.href
        ? `<a class="sb-item" href="${t.href}"><span class="ico">${t.emoji}</span>${t.nombre}<span class="ext">↗</span></a>`
        : `<button class="sb-item" data-section="${t.id}"><span class="ico">${t.emoji}</span>${t.nombre}</button>`
      ).join('')}
    </div>`
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
        <p>Esta herramienta se está preparando para El Rancho Digital.
           Vuelve al <a href="#casco">Casco</a> para usar las funciones disponibles.</p>
      </div>
    </section>`).join(''));

  // El Casco repite la jerarquía del menú: formación primero, complementos después.
  const cardMarkup = t => {
    const clases = `tool-card tc--${t.color}${t.principal ? ' tool-card--principal' : ''}${t.id === 'cursos' ? ' tool-card--cursos' : ''}`;
    const badge = t.id === 'cursos' ? '<span class="t-badge">Empieza aquí</span>' : '';
    return t.href
      ? `<a class="${clases}" href="${t.href}" style="text-decoration:none;display:block">
           ${badge}<span class="t-emoji">${t.emoji}</span><h4>${t.nombre} ↗</h4><p>${t.desc}</p></a>`
      : `<button class="${clases}" data-goto="${t.id}">
           ${badge}<span class="t-emoji">${t.emoji}</span><h4>${t.nombre}</h4><p>${t.desc}</p></button>`;
  };
  const learningGrid = document.getElementById('cascoLearning');
  const toolsGrid = document.getElementById('cascoTools');
  learningGrid.innerHTML = TOOLS.filter(t => t.principal).map(cardMarkup).join('');
  toolsGrid.innerHTML = TOOLS.filter(t => t.id !== 'casco' && !t.principal).map(cardMarkup).join('');

  nav.querySelectorAll('[data-section]').forEach(b => b.addEventListener('click', () => navigateTo(b.dataset.section)));
  document.querySelectorAll('#section-casco [data-goto]').forEach(b =>
    b.addEventListener('click', () => navigateTo(b.dataset.goto)));
  document.querySelectorAll('[data-mobile-section]').forEach(b =>
    b.addEventListener('click', () => navigateTo(b.dataset.mobileSection)));
  document.querySelector('[data-mobile-menu]')?.addEventListener('click', () => toggleSidebar(true));
}

// ── Navegación show/hide + hash deep-links ──
function navigateTo(section, pushHash = true) {
  if (!document.getElementById('section-' + section)) section = 'casco';
  document.querySelectorAll('.sb-item[data-section]').forEach(b =>
    b.classList.toggle('active', b.dataset.section === section));
  document.querySelectorAll('.section').forEach(s =>
    s.classList.toggle('active', s.id === 'section-' + section));
  document.querySelectorAll('[data-mobile-section]').forEach(b => {
    const activo = b.dataset.mobileSection === section;
    b.classList.toggle('active', activo);
    if (activo) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
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
  document.body.classList.toggle('nav-open', open);
  document.getElementById('tbBurger').setAttribute('aria-expanded', String(open));
  document.querySelector('[data-mobile-menu]')?.classList.toggle('active', open);
}
document.getElementById('tbBurger').addEventListener('click', () => toggleSidebar());
document.getElementById('sbOverlay').addEventListener('click', () => toggleSidebar(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('sidebar').classList.contains('open')) toggleSidebar(false);
});

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
const MENSAJE_VIP_BASE = 'Desbloquea la biblioteca completa, las herramientas del rancho y la comunidad.';
window.abrirModalVIP = function(razon) {
  document.getElementById('mvSub').textContent = razon || MENSAJE_VIP_BASE;
  limpiarErrorPago();
  document.getElementById('modalVip').classList.add('active');
};
document.getElementById('mvClose').addEventListener('click', () =>
  document.getElementById('modalVip').classList.remove('active'));
document.getElementById('modalVip').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});
document.querySelectorAll('[data-plan]').forEach(b =>
  b.addEventListener('click', () => suscribirElite(b.dataset.plan)));

function limpiarErrorPago() {
  const error = document.getElementById('mvPaymentError');
  if (!error) return;
  error.hidden = true;
  error.replaceChildren();
}

function bloquearPlanesPago(bloqueados) {
  document.querySelectorAll('[data-plan]').forEach(boton => {
    boton.disabled = bloqueados;
    boton.setAttribute('aria-busy', String(bloqueados));
  });
}

function mostrarErrorPago(error, plan) {
  const contenedor = document.getElementById('mvPaymentError');
  if (!contenedor) return;

  const titulo = document.createElement('strong');
  titulo.textContent = 'No pudimos abrir el pago.';
  const detalle = document.createElement('span');
  detalle.textContent = `${error.message || 'Error de conexión'}. Revisa tu conexión e inténtalo nuevamente.`;
  const ayuda = document.createElement('a');
  const mensaje = encodeURIComponent(
    'Hola, intenté pagar mi suscripción Élite Pecuario y me dio error. Email: ' +
    (auth.currentUser?.email || '') + ' Plan: ' + plan
  );
  ayuda.href = `https://wa.me/522361049715?text=${mensaje}`;
  ayuda.target = '_blank';
  ayuda.rel = 'noopener';
  ayuda.textContent = 'Necesito ayuda por WhatsApp';

  contenedor.replaceChildren(titulo, detalle, ayuda);
  contenedor.hidden = false;
}

async function cargarStripe() {
  if (typeof Stripe !== 'undefined') return;

  await new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-stripe-sdk]');
    if (script) {
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('No se pudo cargar Stripe')), { once: true });
      return;
    }

    script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.dataset.stripeSdk = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Stripe'));
    document.head.appendChild(script);
  });
}

async function suscribirElite(plan) {
  toast('🚀 Conectando con Stripe...');
  limpiarErrorPago();
  bloquearPlanesPago(true);
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('Inicia sesión primero');
    const res = await fetch(WEBHOOK, {
      method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
      body: JSON.stringify({ plan, email: user.email, uid: user.uid, nombre: user.displayName || '' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status + ' del servidor de pagos'));
    if (data.error) throw new Error(data.error);
    if (data.url) { window.location.href = data.url; return; }
    if (data.clientSecret) {
      await cargarStripe();
      await montarStripeEmbedded(data.clientSecret);
      return;
    }
    throw new Error('Respuesta inesperada del servidor');
  } catch (e) {
    console.error('Error suscribiendo:', e);
    mostrarErrorPago(e, plan);
    toast('No pudimos abrir el pago. Puedes intentarlo nuevamente.');
  } finally {
    bloquearPlanesPago(false);
  }
}

async function cancelarRenovacionElite() {
  const boton = document.getElementById('sopCancelarRenovacion');
  const estado = document.getElementById('sopMembresiaEstado');
  const user = auth.currentUser;
  if (!user) {
    if (estado) estado.textContent = 'Tu sesión venció. Vuelve a iniciar sesión para gestionar la membresía.';
    return;
  }
  if (!window.confirm('¿Quieres detener la renovación automática? Conservarás el acceso hasta terminar el periodo que ya pagaste.')) return;

  if (boton) {
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Procesando…';
  }
  if (estado) estado.textContent = 'Conectando de forma segura con Stripe…';

  try {
    const respuesta = await fetch(`${API_BASE}/cancelar-membresia`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await user.getIdToken()}`
      },
      body: JSON.stringify({})
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || `Error ${respuesta.status}`);

    const hasta = datos.accesoHasta
      ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(datos.accesoHasta))
      : 'el final de tu periodo actual';
    if (estado) estado.textContent = `Renovación detenida. Tu acceso Élite continúa hasta ${hasta}.`;
    if (boton) {
      boton.textContent = 'Renovación cancelada';
      boton.disabled = true;
    }
    toast('Renovación automática cancelada correctamente.');
  } catch (error) {
    console.error('Error cancelando renovación:', error);
    if (estado) estado.textContent = `No pudimos cancelar: ${error.message}. Escríbenos por WhatsApp si necesitas ayuda.`;
    if (boton) {
      boton.disabled = false;
      boton.textContent = 'Cancelar renovación automática';
    }
  } finally {
    boton?.removeAttribute('aria-busy');
  }
}

function pintarGestionMembresia(plan, miembro) {
  const bloque = document.getElementById('sopGestionMembresia');
  const boton = document.getElementById('sopCancelarRenovacion');
  const estado = document.getElementById('sopMembresiaEstado');
  if (!bloque || !boton || !estado) return;

  bloque.hidden = plan !== 'vip';
  if (plan !== 'vip') return;
  const cancelada = Boolean(miembro?.cancelado || miembro?.cancelarAlFinal);
  boton.disabled = cancelada;
  boton.textContent = cancelada ? 'Renovación cancelada' : 'Cancelar renovación automática';
  estado.textContent = cancelada
    ? 'Tu renovación ya está detenida. Mantendrás el acceso hasta la fecha de fin registrada en tu cuenta.'
    : 'Tu plan se renueva automáticamente. Puedes detener la próxima renovación sin perder el periodo ya pagado.';
}

window.cancelarRenovacionElite = cancelarRenovacionElite;

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
  document.querySelectorAll('#section-casco .tool-card').forEach(card => {
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
    document.querySelectorAll('#section-casco .tool-card').forEach(c => c.style.display = '');
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
    pintarGestionMembresia(plan, miembro);
    pintarSaludo(user);
    pintarStats(user);
    // Apoyos: las reglas piden autenticado(), así que se cablea ya con sesión.
    // Lo ven free y Élite por igual — sin banner de vitrina.
    iniciarApoyos(user);
    // Mercado: mismo caso que Apoyos — las reglas solo piden autenticado()
    // y no hay gate de plan. El Explorador ve los mismos precios que el Élite.
    iniciarMercado(user);
    // Hato: la interfaz muestra el gate Élite y Firestore lo vuelve a
    // comprobar al registrar, editar o borrar animales.
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
    procesarRetornoPago(user, plan);
  }
});
