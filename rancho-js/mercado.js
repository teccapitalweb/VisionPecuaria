// ═══════════════════════════════════════════════════════════
// MERCADO PECUARIO · precios de la colección `mercado` (Firestore)
// Lo llena vp-mercado-cron cada 12 h. Lo ven free y Élite por igual,
// sin bloqueo y sin banner de vitrina — igual que Apoyos.
//
// Lo que NO se replica del portal actual, a propósito:
//  1. El campo `fuente` del documento (que el cron reescribe cada
//     corrida con nombres de organismos: "SIAP-SADER", "INEGI INPC"…)
//     NO se pinta. Esos números no salen de ningún organismo: el cron
//     los genera con ruido gaussiano alrededor de un precio base
//     hardcodeado. Presentarlos con el nombre de una institución es
//     atribuirle un dato que nunca publicó.
//     Consecuencia útil: aunque el cron siga guardando esas etiquetas,
//     este módulo no las muestra — no hay nada que revertir.
//  2. El encabezado "precios en tiempo real". No hay nada en vivo:
//     son estimados recalculados dos veces al día.
//
// Lo que sí se dice, a la vista y siempre: qué son, de cuándo es su
// base, y que el socio confirme con su comprador.
// ═══════════════════════════════════════════════════════════
import { db, collection, onSnapshot } from './firebase.js';

// La base del catálogo del cron (PRODUCTOS_BASE en server.js) es un
// snapshot de esa fecha. Si algún día se re-ancla, se cambia aquí.
const PRECIO_REF_FECHA = 'enero 2026';
const NOTA_HONESTA = `Estimados de referencia construidos sobre precios base de ${PRECIO_REF_FECHA}. ` +
  `No son cotizaciones oficiales: confirma con tu comprador o rastro.`;

// El cron guarda 7 lecturas y corre cada 12 h: la ventana del `cambio`
// son ~3 días, no una semana. Se nombra por lo que es.
const VENTANA_TXT = 'entre la primera y la última de las 7 lecturas guardadas (≈3 días)';

const CATEGORIAS = [
  { id: 'todas',     label: 'Todos' },
  { id: 'bovinos',   label: '🐂 Bovinos' },
  { id: 'cortes',    label: '🥩 Cortes' },
  { id: 'porcinos',  label: '🐖 Porcinos' },
  { id: 'avicola',   label: '🐔 Avícola' },
  { id: 'ovinos',    label: '🐑 Ovinos' },
  { id: 'caprinos',  label: '🐐 Caprinos' },
  { id: 'apicola',   label: '🍯 Apícola' },
  { id: 'otros',     label: '🐰 Otros' },
];

let unsub = null;
let usuarioActual = null;
let PRODUCTOS = [];
let filtroCat = 'todas';
let busqueda = '';
let relojNota = null;

// Los docs los puede editar un humano en Firebase Console: se escapan.
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Mismo redondeo que usa el cron al guardar: centavos abajo de $10.
function fmtPrecio(p) {
  const n = Number(p);
  if (!isFinite(n)) return '—';
  return n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString('es-MX');
}

// Firestore puede devolver `historia` como objeto {0:…,1:…} en vez de array.
function normalizarHistoria(h) {
  if (Array.isArray(h)) return h.map(Number).filter(isFinite);
  if (h && typeof h === 'object') {
    return Object.keys(h).sort((a, b) => Number(a) - Number(b))
      .map(k => Number(h[k])).filter(isFinite);
  }
  return [];
}

// Sparkline sin <defs>: los ids duplicados en un grid de 30 tarjetas
// se pisan entre sí. El área va con alfa en el color, sin gradiente.
function sparkline(arr, color, w = 76, h = 28) {
  if (arr.length < 2) return '';
  const min = Math.min(...arr), max = Math.max(...arr);
  const rango = (max - min) || 1;
  const pasoX = w / (arr.length - 1);
  const y = v => (h - ((v - min) / rango) * (h - 4) - 2).toFixed(1);
  const pts = arr.map((v, i) => `${(i * pasoX).toFixed(1)},${y(v)}`).join(' ');
  const ultX = ((arr.length - 1) * pasoX).toFixed(1);
  const ultY = y(arr[arr.length - 1]);
  return `
    <svg class="mk-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
         preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polyline points="0,${h} ${pts} ${ultX},${h}" fill="${color}1F"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${ultX}" cy="${ultY}" r="2.6" fill="${color}"/>
    </svg>`;
}

// "hace 3 h" — cuándo recalculó el cron, no cuándo se movió el mercado.
function haceCuanto(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const dias = Math.floor(hrs / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

function tarjeta(m) {
  const cambio = Number(m.cambio) || 0;
  const sube = cambio >= 0;
  const color = m.color || (sube ? '#4E8B3E' : '#D06E2C');
  const hist = normalizarHistoria(m.historia);
  const signo = sube ? '↗' : '↘';

  return `
    <article class="mk-card">
      <div class="mk-top">
        <span class="mk-emoji" aria-hidden="true">${esc(m.emoji || '💰')}</span>
        <div class="mk-id">
          <h3>${esc(m.nombre || 'Producto')}</h3>
          ${m.detalle ? `<span class="mk-det">${esc(m.detalle)}</span>` : ''}
        </div>
      </div>

      <div class="mk-cifra">
        <div class="mk-precio">
          <span class="mk-signo">$</span>${fmtPrecio(m.precio)}
          <span class="mk-unidad">${esc(m.unidad || '/kg')}</span>
        </div>
        ${hist.length > 1 ? sparkline(hist, color) : '<span class="mk-sin-spark">sin histórico</span>'}
      </div>

      <div class="mk-pie">
        <span class="mk-delta ${sube ? 'mk-delta--sube' : 'mk-delta--baja'}"
              title="Cambio ${VENTANA_TXT}">
          ${signo} ${Math.abs(cambio).toFixed(1)}%
        </span>
        <span class="mk-ventana">7 lecturas</span>
      </div>
    </article>`;
}

const ESTADOS = {
  cargando: { emoji:'💰', titulo:'Cargando precios…',
    texto:'Buscando los estimados más recientes.', reintentar:false },
  anonimo:  { emoji:'🔒', titulo:'Inicia sesión para ver los precios',
    texto:'Los estimados de referencia están disponibles para cualquier socio con sesión iniciada, seas free o Élite.', reintentar:false },
  error:    { emoji:'⚠️', titulo:'No pudimos cargar los precios',
    texto:'Hubo un problema al leer la información. Intenta de nuevo.', reintentar:true },
  vacio:    { emoji:'📭', titulo:'Todavía no hay precios cargados',
    texto:'En cuanto se publique el primer corte aparecerá aquí.', reintentar:true },
  sinfiltro:{ emoji:'🔍', titulo:'Nada con ese filtro',
    texto:'Prueba con otra categoría o limpia la búsqueda.', reintentar:false },
};

function pintarEstado(tipo) {
  const cont = document.getElementById('mercadoGrid');
  if (!cont) return;
  const e = ESTADOS[tipo] || ESTADOS.error;
  cont.innerHTML = `
    <div class="mk-estado">
      <span class="mk-estado-emoji" aria-hidden="true">${e.emoji}</span>
      <h3>${e.titulo}</h3>
      <p>${e.texto}</p>
      ${e.reintentar ? '<button type="button" id="mercadoRetry">Intentar de nuevo</button>' : ''}
    </div>`;
  document.getElementById('mercadoRetry')
    ?.addEventListener('click', () => iniciarMercado(usuarioActual));
}

// Chips de categoría — solo las que traen productos, con su conteo.
function pintarChips() {
  const cont = document.getElementById('mercadoChips');
  if (!cont) return;
  // Sin datos todavía no hay nada que filtrar: mejor vacío que "Todos 0".
  if (!PRODUCTOS.length) { cont.innerHTML = ''; return; }
  const conteo = {};
  PRODUCTOS.forEach(p => {
    const c = p.categoria || 'otros';
    conteo[c] = (conteo[c] || 0) + 1;
  });
  cont.innerHTML = CATEGORIAS
    .filter(c => c.id === 'todas' || conteo[c.id])
    .map(c => {
      const n = c.id === 'todas' ? PRODUCTOS.length : conteo[c.id];
      return `<button type="button" class="h-chip${filtroCat === c.id ? ' active' : ''}"
        data-cat="${c.id}" aria-pressed="${filtroCat === c.id}">${c.label}<b>${n}</b></button>`;
    }).join('');
  cont.querySelectorAll('[data-cat]').forEach(b =>
    b.addEventListener('click', () => { filtroCat = b.dataset.cat; pintarChips(); pintarGrid(); }));
}

// La nota de cuándo recalculó el cron. Se refresca sola cada minuto.
function pintarSello() {
  const el = document.getElementById('mercadoSello');
  if (!el) return;
  let masReciente = null;
  PRODUCTOS.forEach(p => {
    let d = null;
    try { d = p.actualizado?.toDate?.(); } catch (e) { d = null; }
    if (d && !isNaN(d.getTime()) && (!masReciente || d > masReciente)) masReciente = d;
  });
  const cuando = haceCuanto(masReciente);
  el.textContent = cuando
    ? `Estimados recalculados ${cuando} · se recalculan cada 12 h`
    : 'Se recalculan cada 12 h';
}

function pintarGrid() {
  const cont = document.getElementById('mercadoGrid');
  if (!cont) return;
  const q = busqueda.trim().toLowerCase();
  const lista = PRODUCTOS.filter(p => {
    if (filtroCat !== 'todas' && (p.categoria || 'otros') !== filtroCat) return false;
    if (!q) return true;
    return `${p.nombre || ''} ${p.detalle || ''}`.toLowerCase().includes(q);
  });
  if (!lista.length) { pintarEstado('sinfiltro'); return; }
  cont.innerHTML = lista.map(tarjeta).join('');
}

// El precio de referencia del Casco: la tarjeta que estaba como
// "DATO DE EJEMPLO" hasta que existió esta herramienta.
function pintarStatCasco() {
  const el = document.getElementById('statPrecioRef');
  if (!el) return;
  const becerro = PRODUCTOS.find(p => p.id === 'becerro-engorda');
  el.textContent = becerro ? '$' + fmtPrecio(becerro.precio) : '—';
}

// Listeners de la barra. Se llama una vez al arrancar, antes del login.
export function montarMercado() {
  const input = document.getElementById('mercadoBuscar');
  input?.addEventListener('input', () => { busqueda = input.value; pintarGrid(); });
  const nota = document.getElementById('mercadoNota');
  if (nota) nota.textContent = NOTA_HONESTA;
  pintarChips();
}

// Listener en vivo sobre `mercado`. Las reglas piden autenticado() para
// leer, así que se cablea después de resolver el login. Sin gate de plan:
// el Explorador ve exactamente lo mismo que el Élite.
export function iniciarMercado(user) {
  usuarioActual = user || null;
  const cont = document.getElementById('mercadoGrid');
  if (!cont) return;

  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
  if (relojNota) { clearInterval(relojNota); relojNota = null; }

  if (!usuarioActual) { pintarEstado('anonimo'); return; }

  pintarEstado('cargando');

  unsub = onSnapshot(collection(db, 'mercado'), (snap) => {
    PRODUCTOS = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.orden || 999) - (b.orden || 999));
    if (!PRODUCTOS.length) { pintarEstado('vacio'); return; }
    pintarChips();
    pintarGrid();
    pintarSello();
    pintarStatCasco();
    // Un solo reloj para todo el listener, no uno por snapshot.
    if (!relojNota) relojNota = setInterval(pintarSello, 60000);
  }, (err) => {
    console.warn('[Mercado] Error leyendo Firestore:', err.code || err);
    pintarEstado(err.code === 'permission-denied' ? 'anonimo' : 'error');
  });
}
