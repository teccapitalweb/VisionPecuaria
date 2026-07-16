// ═══════════════════════════════════════════════════════════
// WEBINARS · colección `sesiones`
// Campos: titulo, fecha, hora, duracion, instructor, rol, link, grabacion
//
// ⚠️ MISMA FAMILIA DE FUGA QUE LA BIBLIOTECA (ver biblioteca.js):
// `link` apunta a Google Meet y `grabacion` puede apuntar a Drive.
// Ninguno pasa por Firebase ni por regla alguna: quien tenga el enlace
// entra o ve la grabación sin pagar. El de Meet es efímero (la sesión
// termina); el de `grabacion` NO — se queda accesible para siempre.
// Se migra tal cual por decisión de producto; el arreglo va aparte.
// ═══════════════════════════════════════════════════════════
import { db, collection, onSnapshot, query } from './firebase.js';

let unsub = null;
let plan = 'free';
let sesiones = [];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function urlSegura(u) {
  try {
    const x = new URL(String(u));
    return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null;
  } catch { return null; }
}
function bloqueadoPorFree() {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') {
    window.abrirModalVIP('Las sesiones en vivo son exclusivas de Élite Pecuario.');
  }
  return true;
}

// La fecha puede venir como timestamp, string o {seconds}
function parsearFecha(v) {
  if (!v) return null;
  try {
    if (v?.toDate) return v.toDate();
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}
function fechaLegible(s) {
  const d = parsearFecha(s.fecha);
  if (!d) return esc(s.fecha || 'Fecha por confirmar');
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
// ¿Ya pasó? Solo con la fecha; sin hora fiable no se afina más.
function yaPaso(s) {
  const d = parsearFecha(s.fecha);
  if (!d) return false;
  return d.getTime() + 86400000 < Date.now();
}

function pintar() {
  const cont = document.getElementById('webLista');
  if (!cont) return;

  if (!sesiones.length) {
    cont.innerHTML = `
      <div class="h-estado">
        <span class="h-estado-emoji" aria-hidden="true">📡</span>
        <h3>No hay sesiones programadas</h3>
        <p>Cuando se agende un webinar nuevo aparecerá aquí.</p>
      </div>`;
    return;
  }

  cont.innerHTML = sesiones.map(s => {
    const pasada = yaPaso(s);
    const link = urlSegura(s.link);
    const grab = urlSegura(s.grabacion);
    return `
      <article class="web-card${pasada ? ' web-card--pasada' : ''}">
        <div class="web-fecha">
          <span class="web-f-ico" aria-hidden="true">${pasada ? '🎬' : '📡'}</span>
          <span class="web-f-txt">${fechaLegible(s)}</span>
          ${s.hora ? `<span class="web-f-hora">${esc(s.hora)}${s.duracion ? ` · ${esc(s.duracion)}` : ''}</span>` : ''}
        </div>
        <div class="web-body">
          <span class="web-tag">${pasada ? 'Sesión pasada' : 'Próxima sesión'}</span>
          <h3>${esc(s.titulo || 'Sesión en vivo')}</h3>
          ${s.instructor ? `<p class="web-inst">${esc(s.instructor)}${s.rol ? ` · ${esc(s.rol)}` : ''}</p>` : ''}
        </div>
        <div class="web-acciones">
          ${!pasada && link ? `<button class="btn-verde" data-link="${esc(link)}">Entrar a la sesión ↗</button>` : ''}
          ${grab ? `<button class="h-btn" data-link="${esc(grab)}">🎬<span>Ver grabación</span></button>` : ''}
          ${pasada && !grab ? '<span class="web-sin">Sin grabación disponible</span>' : ''}
        </div>
      </article>`;
  }).join('');

  // El gate se aplica al abrir, no al listar: el free ve la programación.
  cont.querySelectorAll('[data-link]').forEach(b =>
    b.addEventListener('click', () => {
      if (bloqueadoPorFree()) return;
      window.open(b.dataset.link, '_blank', 'noopener,noreferrer');
    }));
}

export function iniciarWebinars(planUsuario) {
  plan = planUsuario || 'free';
  const cont = document.getElementById('webLista');
  if (!cont) return;
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }

  unsub = onSnapshot(query(collection(db, 'sesiones')), (snap) => {
    sesiones = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const da = parsearFecha(a.fecha), dbb = parsearFecha(b.fecha);
        if (!da && !dbb) return 0;
        if (!da) return 1;
        if (!dbb) return -1;
        return dbb - da;   // más reciente primero
      });
    pintar();
  }, (err) => {
    console.warn('[Webinars] Error leyendo sesiones:', err.code || err);
    sesiones = [];
    pintar();
  });
}
