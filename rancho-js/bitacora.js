// ═══════════════════════════════════════════════════════════
// BITÁCORA · timeline global de eventos del hato
// NO es una colección propia: lee `eventos` dentro de cada doc de
// `animales`, ya cargado en memoria por hato.js (window.__rancho.animales).
// Cero consultas nuevas a Firestore — solo lectura/agrupado/filtrado
// en el cliente, más el borrado de un evento puntual.
//
// Tres mejoras deliberadas vs el portal actual (aprobadas):
//  1. Borrar un evento pide confirmación (el viejo borraba al primer clic).
//  2. El gate Élite aplica también a borrar (el viejo solo lo aplicaba
//     a crear — bloqueadoPorFree() cubre ambos aquí).
//  3. Los eventos nuevos (los que escribe hato.js) llevan un `id` propio.
//     Al borrar: si el evento tiene id, se borra por id (sin ambigüedad).
//     Si es un evento viejo sin id, se identifica por su huella de
//     contenido (tipo+fecha+nota+costo+creado — `creado` es un epoch en
//     ms, prácticamente único), NO por posición en el array: la posición
//     puede cambiar entre que se pinta la pantalla y se confirma el
//     borrado (otra pestaña, otro dispositivo, un refresco del snapshot).
// ═══════════════════════════════════════════════════════════
import { db } from './firebase.js';

const TIPO_INFO = {
  peso:       { emoji: '⚖️', label: 'Peso',        color: '#4E8B3E' },
  nota:       { emoji: '📝', label: 'Nota',         color: '#9C9484' },
  enfermedad: { emoji: '🤒', label: 'Enfermedad',   color: '#D06E2C' },
  vacuna:     { emoji: '💉', label: 'Vacuna',       color: '#4E7A34' },
  parto:      { emoji: '🍼', label: 'Parto',        color: '#74586E' },
  venta:      { emoji: '💰', label: 'Venta',        color: '#A67A1F' },
  muerte:     { emoji: '⚰️', label: 'Muerte',       color: '#C0392B' }
};

let plan = 'free';
let filtroTipo = 'todos';
let filtroPeriodo = 'todos';
let borrando = null;      // { ev, animalId, animalNombre, animalTag, animalEmoji }
let _renderIndex = [];    // eventos tal como se pintaron, para ubicar el click de borrar

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3500);
}
// El gate Élite es del cliente, igual que en el resto del portal
// (las reglas solo piden autenticado()). Ver BL01.
function bloqueadoPorFree() {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') {
    window.abrirModalVIP('Borrar eventos de la Bitácora es exclusivo de Élite Pecuario.');
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
// LECTURA — aplana `eventos` de todos los animales del socio
// ═══════════════════════════════════════════════════════════
function eventosAplanados() {
  const animales = (window.__rancho && window.__rancho.animales) || [];
  const todos = [];
  animales.forEach(a => {
    (a.eventos || []).forEach(ev => {
      todos.push({
        ev, // referencia real dentro de a.eventos — NO se copia
        animalId: a.id,
        animalNombre: a.nombre,
        animalTag: a.tag,
        animalEmoji: a.emoji || '🐾'
      });
    });
  });
  todos.sort((x, y) => {
    const tx = x.ev.fecha ? new Date(x.ev.fecha).getTime() : (x.ev.creado || 0);
    const ty = y.ev.fecha ? new Date(y.ev.fecha).getTime() : (y.ev.creado || 0);
    return ty - tx;
  });
  return todos;
}

// ═══════════════════════════════════════════════════════════
// STATS — honestos: solo cuentan lo que de verdad existe
// ═══════════════════════════════════════════════════════════
function pintarStats(todos) {
  const cont = document.getElementById('bitaStats');
  if (!cont) return;
  const ahora = Date.now();
  const MS_DIA = 86400000;
  const t = ev => ev.fecha ? new Date(ev.fecha).getTime() : (ev.creado || 0);
  const hoy = todos.filter(x => ahora - t(x.ev) <= MS_DIA).length;
  const semana = todos.filter(x => ahora - t(x.ev) <= 7 * MS_DIA).length;
  const mes = todos.filter(x => ahora - t(x.ev) <= 30 * MS_DIA).length;

  cont.innerHTML = `
    <div class="stat-card">
      <span class="s-emoji">📋</span>
      <b>${todos.length}</b>
      <span>${todos.length === 1 ? 'evento registrado' : 'eventos registrados'}</span>
    </div>
    <div class="stat-card">
      <span class="s-emoji">🔔</span>
      <b>${hoy}</b>
      <span>hoy</span>
    </div>
    <div class="stat-card">
      <span class="s-emoji">📅</span>
      <b>${semana}</b>
      <span>esta semana</span>
    </div>
    <div class="stat-card">
      <span class="s-emoji">📊</span>
      <b>${mes}</b>
      <span>este mes</span>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
// FILTROS
// ═══════════════════════════════════════════════════════════
function pintarChipsTipo(todos) {
  const cont = document.getElementById('bitaChipsTipo');
  if (!cont) return;
  const conteo = {};
  todos.forEach(x => {
    const t = x.ev.tipo && TIPO_INFO[x.ev.tipo] ? x.ev.tipo : 'nota';
    conteo[t] = (conteo[t] || 0) + 1;
  });
  const chips = [`<button class="h-chip${filtroTipo === 'todos' ? ' active' : ''}" data-tipo="todos">Todos <b>${todos.length}</b></button>`];
  Object.keys(TIPO_INFO).forEach(t => {
    if (!conteo[t]) return;
    chips.push(`<button class="h-chip${filtroTipo === t ? ' active' : ''}" data-tipo="${t}">${TIPO_INFO[t].emoji} ${esc(TIPO_INFO[t].label)} <b>${conteo[t]}</b></button>`);
  });
  cont.innerHTML = chips.join('');
  cont.querySelectorAll('[data-tipo]').forEach(b =>
    b.addEventListener('click', () => { filtroTipo = b.dataset.tipo; pintarBitacora(); }));
}

function aplicarFiltros(todos) {
  let lista = todos;
  if (filtroTipo !== 'todos') {
    lista = lista.filter(x => (x.ev.tipo && TIPO_INFO[x.ev.tipo] ? x.ev.tipo : 'nota') === filtroTipo);
  }
  if (filtroPeriodo !== 'todos') {
    const ahora = Date.now();
    const MS_DIA = 86400000;
    const limites = { hoy: MS_DIA, semana: 7 * MS_DIA, mes: 30 * MS_DIA, '3meses': 90 * MS_DIA };
    const limite = limites[filtroPeriodo];
    if (limite) {
      lista = lista.filter(x => {
        const t = x.ev.fecha ? new Date(x.ev.fecha).getTime() : (x.ev.creado || 0);
        return ahora - t <= limite;
      });
    }
  }
  return lista;
}

// ═══════════════════════════════════════════════════════════
// PINTAR TIMELINE
// ═══════════════════════════════════════════════════════════
const ESTADOS = {
  sinAnimales: { emoji: '🐄', titulo: 'Aún no tienes animales', texto: 'Registra tu primer animal en Mi Hato para empezar a llevar su historial.', cta: true },
  sinEventos:  { emoji: '📓', titulo: 'Sin eventos registrados', texto: 'Los eventos que registres en tus animales (como capturar un peso) aparecerán aquí.', cta: true },
  sinFiltro:   { emoji: '🔍', titulo: 'Ningún evento coincide', texto: 'Prueba con otro tipo o quita el filtro de periodo.' }
};
function estadoVacio(tipo) {
  const e = ESTADOS[tipo] || ESTADOS.sinEventos;
  return `
    <div class="h-estado">
      <span class="h-estado-emoji" aria-hidden="true">${e.emoji}</span>
      <h3>${e.titulo}</h3>
      <p>${e.texto}</p>
      ${e.cta ? '<button type="button" class="btn-verde" id="bitaIrHato">Ir a Mi Hato</button>' : ''}
    </div>`;
}
function enlazarVacio() {
  document.getElementById('bitaIrHato')?.addEventListener('click', () => { location.hash = 'hato'; });
}

function eventoHtml(x, ridx) {
  const info = TIPO_INFO[x.ev.tipo] || TIPO_INFO.nota;
  const costo = x.ev.costo ? `<span class="bita-ev-costo">$${parseFloat(x.ev.costo).toLocaleString('es-MX')}</span>` : '';
  const nota = esc(x.ev.nota || '') || '<em>Sin descripción</em>';
  return `
    <div class="bita-evento" style="--ev-color:${info.color};">
      <span class="bita-ev-ico" aria-hidden="true">${info.emoji}</span>
      <div class="bita-ev-body">
        <div class="bita-ev-head">
          <span class="bita-ev-tipo">${esc(info.label)}</span>
          <span class="bita-ev-animal">${esc(x.animalEmoji)} ${esc(x.animalNombre || 'Sin nombre')}${x.animalTag ? ' · ' + esc(x.animalTag) : ''}</span>
        </div>
        <div class="bita-ev-nota">${nota}</div>
        ${costo}
      </div>
      <button class="bita-ev-del" type="button" data-ridx="${ridx}" title="Eliminar evento" aria-label="Eliminar evento">×</button>
    </div>`;
}

export function pintarBitacora() {
  const cont = document.getElementById('bitaTimeline');
  if (!cont) return; // la sección aún no está en el DOM

  const todos = eventosAplanados();
  pintarStats(todos);
  pintarChipsTipo(todos);

  const animales = (window.__rancho && window.__rancho.animales) || [];
  if (!animales.length) { cont.innerHTML = estadoVacio('sinAnimales'); enlazarVacio(); return; }
  if (!todos.length) { cont.innerHTML = estadoVacio('sinEventos'); enlazarVacio(); return; }

  const filtrados = aplicarFiltros(todos);
  if (!filtrados.length) { cont.innerHTML = estadoVacio('sinFiltro'); return; }

  const grupos = {};
  filtrados.forEach(x => {
    const fecha = x.ev.fecha || (x.ev.creado ? new Date(x.ev.creado).toISOString().slice(0, 10) : 'sin-fecha');
    (grupos[fecha] = grupos[fecha] || []).push(x);
  });

  _renderIndex = [];
  cont.innerHTML = Object.entries(grupos).map(([fecha, items]) => {
    const fechaFmt = fecha === 'sin-fecha'
      ? 'Sin fecha'
      : new Date(fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const html = items.map(x => {
      _renderIndex.push(x);
      return eventoHtml(x, _renderIndex.length - 1);
    }).join('');
    return `
      <div>
        <div class="bita-grupo-fecha">📅 ${esc(fechaFmt)}</div>
        <div class="bita-grupo-eventos">${html}</div>
      </div>`;
  }).join('');

  cont.querySelectorAll('[data-ridx]').forEach(btn =>
    btn.addEventListener('click', () => {
      const x = _renderIndex[Number(btn.dataset.ridx)];
      if (x) pedirBorrarEvento(x);
    }));
}

// ═══════════════════════════════════════════════════════════
// BORRAR — con confirmación, gate Élite, e identidad estable
// ═══════════════════════════════════════════════════════════
function coincide(e, ev) {
  if (ev.id) return e.id === ev.id;
  // Evento viejo sin id: huella de contenido, no posición en el array.
  return e.creado === ev.creado && e.tipo === ev.tipo && e.fecha === ev.fecha &&
         e.nota === ev.nota && e.costo === ev.costo;
}

function pedirBorrarEvento(x) {
  if (bloqueadoPorFree()) return;
  borrando = x;
  const info = TIPO_INFO[x.ev.tipo] || TIPO_INFO.nota;
  document.getElementById('bbEvento').innerHTML =
    `${info.emoji} <b>${esc(info.label)}</b> · ${esc(x.animalEmoji)} ${esc(x.animalNombre || 'Sin nombre')}${x.animalTag ? ' · ' + esc(x.animalTag) : ''}`;
  const btnDel = document.getElementById('bbBtnDel');
  btnDel.disabled = false;
  btnDel.textContent = 'Sí, eliminar';
  document.getElementById('bbBtnCancel').disabled = false;
  document.getElementById('modalBorrarEvento').classList.add('active');
}
function cerrarBorrarEvento() {
  document.getElementById('modalBorrarEvento').classList.remove('active');
  borrando = null;
}

async function confirmarBorrarEvento() {
  if (!borrando) return;
  const { ev, animalId } = borrando;
  const animales = (window.__rancho && window.__rancho.animales) || [];
  const animal = animales.find(a => a.id === animalId);
  if (!animal) { cerrarBorrarEvento(); return; }

  const lista = animal.eventos || [];
  const coincidencias = lista.filter(e => coincide(e, ev)).length;

  if (coincidencias === 0) {
    cerrarBorrarEvento();
    toast('Ese evento ya no existe (puede que lo hayas borrado en otra pestaña).');
    pintarBitacora();
    return;
  }
  if (coincidencias > 1 && !ev.id) {
    // Salvaguarda rara: dos eventos viejos con huella idéntica. Mejor no
    // arriesgar borrar el que no es — se pide recargar en vez de adivinar.
    cerrarBorrarEvento();
    toast('No se pudo identificar el evento con certeza. Recarga la página e intenta de nuevo.');
    return;
  }

  const nuevos = lista.filter(e => !coincide(e, ev));
  const btnDel = document.getElementById('bbBtnDel');
  const btnCancel = document.getElementById('bbBtnCancel');
  btnDel.disabled = true; btnCancel.disabled = true;
  btnDel.textContent = 'Eliminando...';
  try {
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    await updateDoc(doc(db, 'animales', animalId), { eventos: nuevos });
    animal.eventos = nuevos; // optimista: hato.js lo corrige solo en el próximo snapshot
    cerrarBorrarEvento();
    toast('Evento eliminado 🗑️');
    pintarBitacora();
  } catch (e) {
    console.error('[Bitácora] Error al eliminar evento:', e);
    toast('No se pudo eliminar. Intenta de nuevo.');
  }
  btnDel.disabled = false; btnCancel.disabled = false;
  btnDel.textContent = 'Sí, eliminar';
}

// ═══════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════
export function iniciarBitacora(planUsuario) {
  plan = planUsuario || 'free';
  pintarBitacora();
}

export function montarBitacora() {
  const periodoBox = document.getElementById('bitaChipsPeriodo');
  if (periodoBox) {
    periodoBox.querySelectorAll('[data-periodo]').forEach(b =>
      b.addEventListener('click', () => {
        filtroPeriodo = b.dataset.periodo;
        periodoBox.querySelectorAll('[data-periodo]').forEach(x => x.classList.toggle('active', x === b));
        pintarBitacora();
      }));
  }
  document.getElementById('bbBtnCancel')?.addEventListener('click', cerrarBorrarEvento);
  document.getElementById('bbBtnDel')?.addEventListener('click', confirmarBorrarEvento);
  document.getElementById('modalBorrarEvento')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
  });
}
