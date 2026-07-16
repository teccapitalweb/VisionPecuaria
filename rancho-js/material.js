// ═══════════════════════════════════════════════════════════
// MATERIAL DE APOYO · colección `pdfs`
//
// ⚠️ HOY LA COLECCIÓN ESTÁ VACÍA: 0 documentos (verificado contra
// producción). El portal actual promete "Guías y manuales
// descargables" y detrás no hay un solo PDF. Aquí no se promete lo
// que no existe: si no hay material, se dice que no hay.
//
// Cuando se cargue material, esto ya lo lista solo. Si los PDFs se
// suben a Google Drive con enlace abierto, heredarán la misma fuga
// que los videos de los cursos — ver biblioteca.js.
// ═══════════════════════════════════════════════════════════
import { db, collection, onSnapshot, query } from './firebase.js';

let unsub = null;
let plan = 'free';
let pdfs = [];

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
    window.abrirModalVIP('El material de apoyo es exclusivo de Élite Pecuario.');
  }
  return true;
}

function pintar() {
  const cont = document.getElementById('matLista');
  if (!cont) return;

  if (!pdfs.length) {
    cont.innerHTML = `
      <div class="h-estado">
        <span class="h-estado-emoji" aria-hidden="true">📚</span>
        <h3>Aún no hay material de apoyo disponible</h3>
        <p>Cuando se publiquen guías o manuales descargables aparecerán aquí.
           Mientras tanto, el contenido está en los videos de la Biblioteca.</p>
        <button type="button" class="btn-verde" id="matIrCursos">Ir a la Biblioteca</button>
      </div>`;
    document.getElementById('matIrCursos')?.addEventListener('click', () => { location.hash = 'cursos'; });
    return;
  }

  cont.innerHTML = pdfs.map(p => {
    const url = urlSegura(p.url || p.link || p.archivo);
    return `
      <article class="mat-card">
        <span class="mat-ico" aria-hidden="true">📄</span>
        <div class="mat-body">
          <h3>${esc(p.titulo || p.nombre || 'Material')}</h3>
          ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
          <span class="mat-meta">${esc(p.categoria || 'General')}${p.paginas ? ` · ${esc(p.paginas)} págs` : ''}</span>
        </div>
        ${url ? `<button class="btn-verde" data-link="${esc(url)}">Abrir ↗</button>`
              : '<span class="web-sin">Sin archivo</span>'}
      </article>`;
  }).join('');

  cont.querySelectorAll('[data-link]').forEach(b =>
    b.addEventListener('click', () => {
      if (bloqueadoPorFree()) return;
      window.open(b.dataset.link, '_blank', 'noopener,noreferrer');
    }));
}

export function iniciarMaterial(planUsuario) {
  plan = planUsuario || 'free';
  if (!document.getElementById('matLista')) return;
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }

  unsub = onSnapshot(query(collection(db, 'pdfs')), (snap) => {
    pdfs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    pintar();
  }, (err) => {
    console.warn('[Material] Error leyendo pdfs:', err.code || err);
    pdfs = [];
    pintar();
  });
}
