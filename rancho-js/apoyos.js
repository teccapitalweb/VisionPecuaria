// ═══════════════════════════════════════════════════════════
// APOYOS DE GOBIERNO · datos reales de Firestore (colección `apoyos`)
// Misma fuente que el portal actual, en tiempo real.
//
// A propósito NO hay catálogo de respaldo: si la carga falla, se dice.
// Mostrar los programas de mayo como si fueran de hoy es peor que no
// mostrar nada — las convocatorias abren y cierran con fecha.
// Por eso cada tarjeta enseña su `actualizado` a la vista.
// ═══════════════════════════════════════════════════════════
import { db, collection, query, where, onSnapshot } from './firebase.js';

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

let unsub = null;
let usuarioActual = null;

// Los textos vienen de Firebase Console (los edita un humano): se escapan.
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Solo http/https — un `javascript:` en la url no debe volverse un enlace.
function urlSegura(u) {
  try {
    const url = new URL(String(u));
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
  } catch { return null; }
}

// "2026-05" → "mayo 2026"
function fmtActualizado(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(String(v).trim());
  if (!m) return String(v);
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${mes} ${m[1]}` : String(v);
}

function fmtTimestamp(ts) {
  try {
    const d = ts?.toDate?.();
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });
  } catch { return ''; }
}

function tarjeta(a) {
  const url = urlSegura(a.url);
  const verificada = fmtActualizado(a.actualizado);
  const editada = fmtTimestamp(a.ultimaActualizacion);
  const reqs = Array.isArray(a.requisitos) ? a.requisitos : [];
  const destino = a.fuente ? `Abre ${a.fuente} en una pestaña nueva` : 'Abre en una pestaña nueva';

  return `
    <article class="apoyo-card" style="--ap-color:${esc(a.color || '#4E8B3E')}">
      <div class="ap-head">
        <span class="ap-ico" aria-hidden="true">${esc(a.emoji || '🏛️')}</span>
        <div class="ap-id">
          <h3>${esc(a.nombre || 'Programa')}</h3>
          ${a.institucion ? `<span class="ap-inst">${esc(a.institucion)}</span>` : ''}
        </div>
      </div>

      ${a.montos ? `
      <div class="ap-monto">
        <span class="ap-monto-lbl">💰 Apoyo</span>
        <strong>${esc(a.montos)}</strong>
      </div>` : ''}

      ${a.descripcion ? `<p class="ap-desc">${esc(a.descripcion)}</p>` : ''}

      ${reqs.length ? `
      <div class="ap-req">
        <span class="ap-req-lbl">📋 Requisitos principales</span>
        <ul>${reqs.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="ap-foot">
        ${verificada
          ? `<span class="ap-fecha"${editada ? ` title="Última edición: ${esc(editada)}"` : ''}>🗓️ Info verificada: ${esc(verificada)}</span>`
          : `<span class="ap-fecha ap-fecha--sin">🗓️ Sin fecha de verificación</span>`}
        ${url
          ? `<a class="ap-cta" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(destino)}">Ver convocatoria ↗</a>`
          : ''}
      </div>
    </article>`;
}

const ESTADOS = {
  cargando: { emoji:'🏛️', titulo:'Cargando apoyos…',
    texto:'Buscando los programas vigentes.', reintentar:false },
  anonimo:  { emoji:'🔒', titulo:'Inicia sesión para ver los apoyos',
    texto:'Los programas de gobierno están disponibles para cualquier socio con sesión iniciada, seas free o Élite.', reintentar:false },
  error:    { emoji:'⚠️', titulo:'No pudimos cargar los apoyos',
    texto:'Hubo un problema al leer la información. Intenta de nuevo.', reintentar:true },
  vacio:    { emoji:'📭', titulo:'No hay apoyos vigentes ahora mismo',
    texto:'Cuando se publique una convocatoria nueva aparecerá aquí.', reintentar:true },
};

function pintarEstado(tipo) {
  const cont = document.getElementById('apoyosGrid');
  if (!cont) return;
  const e = ESTADOS[tipo] || ESTADOS.error;
  cont.innerHTML = `
    <div class="ap-estado">
      <span class="ap-estado-emoji" aria-hidden="true">${e.emoji}</span>
      <h3>${e.titulo}</h3>
      <p>${e.texto}</p>
      ${e.reintentar ? '<button type="button" id="apoyosRetry">Intentar de nuevo</button>' : ''}
    </div>`;
  document.getElementById('apoyosRetry')
    ?.addEventListener('click', () => iniciarApoyos(usuarioActual));
}

// Listener en tiempo real. Se llama después de resolver el login:
// las reglas de Firestore piden autenticado() para leer `apoyos`.
export function iniciarApoyos(user) {
  usuarioActual = user || null;
  const cont = document.getElementById('apoyosGrid');
  if (!cont) return;

  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }

  if (!usuarioActual) { pintarEstado('anonimo'); return; }

  pintarEstado('cargando');

  const q = query(collection(db, 'apoyos'), where('vigente', '==', true));
  unsub = onSnapshot(q, (snap) => {
    const apoyos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.orden || 999) - (b.orden || 999));
    if (!apoyos.length) { pintarEstado('vacio'); return; }
    cont.innerHTML = apoyos.map(tarjeta).join('');
  }, (err) => {
    console.warn('[Apoyos] Error leyendo Firestore:', err.code || err);
    pintarEstado(err.code === 'permission-denied' ? 'anonimo' : 'error');
  });
}
