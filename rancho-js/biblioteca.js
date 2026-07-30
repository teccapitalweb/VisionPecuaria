// ═══════════════════════════════════════════════════════════
// BIBLIOTECA DE CURSOS · colección `cursos` (12 docs, 52 clases)
//
// ⚠️⚠️ FUGA CONOCIDA — LEER ANTES DE TOCAR ESTE ARCHIVO ⚠️⚠️
//
// Los videos NO viven en Firebase Storage ni detrás de ninguna regla.
// Cada clase guarda en Firestore una URL de Google Drive, y las 52
// están compartidas como "cualquiera con el enlace": se comprobó
// pidiéndolas sin sesión y sin cookies — las 52 devolvieron HTTP 200.
//
// O sea: las reglas protegen la LISTA de cursos, no el CONTENIDO.
// Quien copie un enlace ve el curso sin pagar, sin cuenta y sin dejar
// rastro; y quien ya lo tenga lo conserva aunque después se cierren
// los permisos en Drive.
//
// Esto se migró tal cual por decisión de producto: el arreglo va
// aparte. CUANDO SE ARREGLE, el punto a tocar es `montarReproductor()`
// aquí abajo y el campo `clase.url` en Firestore — no las reglas de
// Firestore, que sobre esto no pueden hacer nada.
// ═══════════════════════════════════════════════════════════
import { db, collection, onSnapshot, query } from './firebase.js';

let unsub = null;
let plan = 'free';
let miembro = null;
let cursos = [];
let cursoAbierto = null;
let claseActual = 0;

// El avance vive en localStorage — ver progreso.js para la nota completa.
const LS_PROGRESO = 'vp_progreso_cursos';
function leerProgreso() {
  try { return JSON.parse(localStorage.getItem(LS_PROGRESO) || '{}'); } catch (e) { return {}; }
}
function guardarProgreso(p) {
  try { localStorage.setItem(LS_PROGRESO, JSON.stringify(p)); } catch (e) {}
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500);
}
function bloqueadoPorFree() {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') {
    window.abrirModalVIP('Los cursos completos son exclusivos de Élite Pecuario.');
  }
  return true;
}

// ── Drip: el curso ordenDrip=1 es libre; los demás se abren N días
//    después de fechaUltimaActivacion. Versión de solo lectura: el
//    viejo además INFIERE y PERSISTE la fecha en Firestore; eso es una
//    escritura y aquí no se hace.
function fechaActivacion() {
  const cand = [miembro?.fechaUltimaActivacion, miembro?.fechaInicio,
                miembro?.fechaActivacion, miembro?.fechaPago, miembro?.fechaRegistro];
  for (const v of cand) {
    if (!v) continue;
    let d = null;
    try {
      if (v?.toDate) d = v.toDate();
      else if (typeof v?.seconds === 'number') d = new Date(v.seconds * 1000);
      else d = new Date(v);
    } catch (e) {}
    if (d && !isNaN(d.getTime())) return d;
  }
  return null;
}

function estadoCurso(curso) {
  const orden = curso.ordenDrip || 999;
  const dias = curso.diasDrip || 8;
  if (orden === 1) return { desbloqueado: true, esLibre: true, diasRestantes: 0 };
  if (plan !== 'vip') return { desbloqueado: false, esLibre: false, diasRestantes: 0, requierePago: true };

  const desde = fechaActivacion();
  if (!desde) return { desbloqueado: true, esLibre: false, diasRestantes: 0 };

  const abre = new Date(desde.getTime() + (orden - 1) * dias * 86400000);
  const restan = Math.ceil((abre - Date.now()) / 86400000);
  return restan <= 0
    ? { desbloqueado: true, esLibre: false, diasRestantes: 0 }
    : { desbloqueado: false, esLibre: false, diasRestantes: restan, fechaDesbloqueo: abre };
}

// ═══════════════════════════════════════════════════════════
// LISTA DE CURSOS
// ═══════════════════════════════════════════════════════════
function pintar() {
  const cont = document.getElementById('bibGrid');
  if (!cont) return;

  if (!cursos.length) {
    cont.innerHTML = `
      <div class="h-estado">
        <span class="h-estado-emoji" aria-hidden="true">🎓</span>
        <h3>No pudimos cargar los cursos</h3>
        <p>Intenta de nuevo en un momento.</p>
      </div>`;
    return;
  }

  const prog = leerProgreso();
  cont.innerHTML = cursos.map(c => {
    const st = estadoCurso(c);
    const clases = Array.isArray(c.clases) ? c.clases : [];
    const vistas = (prog[c.id] || []).length;
    const pct = clases.length ? Math.round((vistas / clases.length) * 100) : 0;

    let candado = '';
    if (!st.desbloqueado) {
      candado = st.requierePago
        ? '<span class="bib-lock">🔒 Élite</span>'
        : `<span class="bib-lock">🔒 En ${st.diasRestantes} ${st.diasRestantes === 1 ? 'día' : 'días'}</span>`;
    } else if (st.esLibre) {
      candado = '<span class="bib-libre">Gratis</span>';
    }

    return `
      <article class="bib-card${st.desbloqueado ? '' : ' bib-card--lock'}" data-id="${esc(c.id)}" tabindex="0" role="button">
        <div class="bib-foto">
          ${c.foto ? `<img src="${esc(c.foto)}" alt="" loading="lazy" decoding="async">` : '<span class="bib-sinfoto">🎓</span>'}
          ${candado}
        </div>
        <div class="bib-body">
          <span class="bib-cat">${esc(c.categoria || 'General')}</span>
          <h3>${esc(c.titulo || 'Curso')}</h3>
          <p>${esc(c.instructor || 'Visión Pecuaria')} · ${clases.length} ${clases.length === 1 ? 'clase' : 'clases'}</p>
          ${vistas ? `<div class="bib-prog"><span style="width:${pct}%"></span></div>
                      <small class="bib-prog-txt">${vistas}/${clases.length} vistas</small>` : ''}
        </div>
      </article>`;
  }).join('');

  cont.querySelectorAll('[data-id]').forEach(el => {
    const abrir = () => abrirCurso(el.dataset.id);
    el.addEventListener('click', abrir);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  });
}

// ═══════════════════════════════════════════════════════════
// DETALLE + REPRODUCTOR
// ═══════════════════════════════════════════════════════════
function abrirCurso(id) {
  const c = cursos.find(x => x.id === id);
  if (!c) return;
  const st = estadoCurso(c);

  if (!st.desbloqueado) {
    if (st.requierePago) { bloqueadoPorFree(); return; }
    toast(`Este curso se abre en ${st.diasRestantes} ${st.diasRestantes === 1 ? 'día' : 'días'} ⏳`);
    return;
  }

  cursoAbierto = c;
  claseActual = 0;
  document.getElementById('bibTitulo').textContent = c.titulo || 'Curso';
  document.getElementById('bibInstructor').textContent =
    `${c.instructor || 'Visión Pecuaria'} · ${c.categoria || 'General'}`;
  document.getElementById('bibDesc').textContent = c.descripcion || '';
  document.getElementById('modalCurso').classList.add('active');
  pintarClases();
  montarReproductor(0);
}
function cerrarCurso() {
  document.getElementById('modalCurso').classList.remove('active');
  document.getElementById('bibPlayer').innerHTML = '';   // corta el iframe
  cursoAbierto = null;
}

function pintarClases() {
  const cont = document.getElementById('bibClases');
  if (!cont || !cursoAbierto) return;
  const clases = Array.isArray(cursoAbierto.clases) ? cursoAbierto.clases : [];
  const vistas = leerProgreso()[cursoAbierto.id] || [];

  cont.innerHTML = clases.map((cl, i) => `
    <button type="button" class="bib-clase${i === claseActual ? ' active' : ''}" data-idx="${i}">
      <span class="bib-cl-num">${vistas.includes(i) ? '✓' : i + 1}</span>
      <span class="bib-cl-tit">${esc(cl.titulo || 'Clase ' + (i + 1))}</span>
    </button>`).join('');

  cont.querySelectorAll('[data-idx]').forEach(b =>
    b.addEventListener('click', () => { claseActual = Number(b.dataset.idx); pintarClases(); montarReproductor(claseActual); }));
}

// Bunny se vuelve la fuente principal clase por clase. Mientras termina la
// migración, `clase.url` conserva Google Drive como respaldo reversible.
// `bunnyActivo:false` permite volver a Drive sin borrar el mapeo de Bunny.
function montarReproductor(idx) {
  const player = document.getElementById('bibPlayer');
  if (!player || !cursoAbierto) return;
  const clases = Array.isArray(cursoAbierto.clases) ? cursoAbierto.clases : [];
  const clase = clases[idx];
  if (!clase) { player.innerHTML = ''; return; }

  const bunnyLibraryId = String(clase.bunnyLibraryId || '').trim();
  const bunnyVideoId = String(clase.bunnyVideoId || '').trim();
  const bunnyValido = /^\d+$/.test(bunnyLibraryId)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bunnyVideoId);
  if (clase.bunnyActivo !== false && bunnyValido) {
    const bunnyUrl = `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}`;
    player.innerHTML = `<iframe src="${bunnyUrl}"
      allowfullscreen allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
      title="${esc(clase.titulo || 'Clase')}"></iframe>`;
    document.getElementById('bibMarcar').style.display = '';
    return;
  }

  const url = clase.url || clase.videoUrl || '';
  if (!url) {
    player.innerHTML = `<div class="bib-vacio">
      <span>📝</span>
      <p>${esc(clase.titulo || 'Clase ' + (idx + 1))}</p>
      <small>Esta clase aún no tiene video.</small>
    </div>`;
    return;
  }

  // 1. Google Drive → /preview (los 52 videos de hoy caen aquí)
  const drive = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/);
  if (drive) {
    player.innerHTML = `<iframe src="https://drive.google.com/file/d/${drive[1]}/preview"
      allowfullscreen allow="autoplay; encrypted-media" title="${esc(clase.titulo || 'Clase')}"></iframe>`;
  } else {
    // 2. YouTube
    const yt = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
    if (yt) {
      player.innerHTML = `<iframe src="https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1"
        allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" title="${esc(clase.titulo || 'Clase')}"></iframe>`;
    } else if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
      // 3. MP4/WebM directo
      player.innerHTML = `<video src="${esc(url)}" controls playsinline></video>`;
    } else {
      player.innerHTML = `<div class="bib-vacio"><span>🎬</span><p>Formato de video no reconocido.</p></div>`;
    }
  }
  document.getElementById('bibMarcar').style.display = '';
}

function marcarVista() {
  if (!cursoAbierto) return;
  const p = leerProgreso();
  const arr = p[cursoAbierto.id] || [];
  if (!arr.includes(claseActual)) { arr.push(claseActual); p[cursoAbierto.id] = arr; guardarProgreso(p); }
  pintarClases();
  pintar();
  toast('Clase marcada como vista ✓');
}

// ═══════════════════════════════════════════════════════════
export function iniciarBiblioteca(planUsuario, miembroDoc) {
  plan = planUsuario || 'free';
  miembro = miembroDoc || null;
  const cont = document.getElementById('bibGrid');
  if (!cont) return;
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }

  unsub = onSnapshot(query(collection(db, 'cursos')), (snap) => {
    cursos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.ordenDrip || 999) - (b.ordenDrip || 999));
    pintar();
  }, (err) => {
    console.warn('[Biblioteca] Error leyendo cursos:', err.code || err);
    cursos = [];
    pintar();
  });
}

export function montarBiblioteca() {
  document.getElementById('bibCerrar')?.addEventListener('click', cerrarCurso);
  document.getElementById('bibMarcar')?.addEventListener('click', marcarVista);
  document.getElementById('modalCurso')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) cerrarCurso();
  });
}
