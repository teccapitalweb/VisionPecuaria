// ═══════════════════════════════════════════════════════════
// MI PROGRESO · avance en los cursos
//
// ⚠️ EL AVANCE VIVE EN localStorage, NO EN FIRESTORE.
// Clave `vp_progreso_cursos` = { cursoId: [idxClase, ...] }.
// Consecuencias que el socio no ve y conviene tener presentes:
//   · Cambia de teléfono o borra caché → pierde TODO su avance.
//   · Entra desde otro dispositivo → aparece en cero.
//   · No se puede auditar ni restaurar desde el panel.
// Se migró tal cual por decisión de producto. Moverlo a Firestore
// (p. ej. `progreso/{uid}`) es la decisión pendiente; el punto a
// tocar es leerProgreso()/guardarProgreso(), aquí y en biblioteca.js.
//
// ⚠️ Y NO HAY RANKING. El portal actual promete "logros y rankings"
// (index.html:11659, 11007), pero nada consulta a otros usuarios:
// es un contador local. Aquí no se promete lo que no existe.
// ═══════════════════════════════════════════════════════════
import { db, collection, onSnapshot, query, where } from './firebase.js';

const LS_PROGRESO = 'vp_progreso_cursos';

let unsubCerts = null;
let plan = 'free';
let usuario = null;
let cursos = [];
let certificados = 0;

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function leerProgreso() {
  try { return JSON.parse(localStorage.getItem(LS_PROGRESO) || '{}'); } catch (e) { return {}; }
}

// Logros: se derivan del avance real, no hay colección de logros.
function calcularLogros(clasesVistas, cursosCompletos) {
  return [
    { emoji: '🌱', nombre: 'Primer paso',      desc: 'Viste tu primera clase',        logrado: clasesVistas >= 1 },
    { emoji: '📚', nombre: 'Constante',        desc: '10 clases vistas',              logrado: clasesVistas >= 10 },
    { emoji: '🎓', nombre: 'Primer curso',     desc: 'Completaste un curso entero',   logrado: cursosCompletos >= 1 },
    { emoji: '🎖️', nombre: 'Certificado',      desc: 'Ganaste tu primer certificado', logrado: certificados >= 1 },
    { emoji: '🔥', nombre: 'Medio camino',     desc: '25 clases vistas',              logrado: clasesVistas >= 25 },
    { emoji: '👑', nombre: 'Patrón del saber', desc: '3 cursos completos',            logrado: cursosCompletos >= 3 },
  ];
}

function pintar() {
  const cont = document.getElementById('progContenido');
  if (!cont) return;

  const prog = leerProgreso();
  const totalClases = cursos.reduce((n, c) => n + (Array.isArray(c.clases) ? c.clases.length : 0), 0);
  let vistas = 0, completos = 0;
  cursos.forEach(c => {
    const v = (prog[c.id] || []).length;
    const t = Array.isArray(c.clases) ? c.clases.length : 0;
    vistas += Math.min(v, t);
    if (t && v >= t) completos++;
  });
  const pct = totalClases ? Math.round((vistas / totalClases) * 100) : 0;
  const logros = calcularLogros(vistas, completos);
  const ganados = logros.filter(l => l.logrado).length;

  cont.innerHTML = `
    <div class="stats-row">
      <div class="stat-card"><span class="s-emoji">📚</span><b>${vistas}</b><span>de ${totalClases} clases vistas</span></div>
      <div class="stat-card"><span class="s-emoji">🎓</span><b>${completos}</b><span>${completos === 1 ? 'curso completo' : 'cursos completos'}</span></div>
      <div class="stat-card"><span class="s-emoji">🎖️</span><b>${certificados}</b><span>${certificados === 1 ? 'certificado' : 'certificados'}</span></div>
      <div class="stat-card"><span class="s-emoji">🏅</span><b>${ganados}/${logros.length}</b><span>logros</span></div>
    </div>

    <div class="prog-barra-box">
      <div class="prog-barra-top">
        <span>Avance general</span><b>${pct}%</b>
      </div>
      <div class="prog-barra"><span style="width:${pct}%"></span></div>
    </div>

    <h3 class="pr-h">Tus logros</h3>
    <div class="prog-logros">
      ${logros.map(l => `
        <div class="prog-logro${l.logrado ? ' prog-logro--ok' : ''}">
          <span class="prog-l-emoji">${l.emoji}</span>
          <div>
            <strong>${esc(l.nombre)}</strong>
            <small>${esc(l.desc)}</small>
          </div>
          ${l.logrado ? '<span class="prog-l-check">✓</span>' : ''}
        </div>`).join('')}
    </div>

    <h3 class="pr-h">Curso por curso</h3>
    <div class="prog-cursos">
      ${cursos.length ? cursos.map(c => {
        const t = Array.isArray(c.clases) ? c.clases.length : 0;
        const v = Math.min((prog[c.id] || []).length, t);
        const p = t ? Math.round((v / t) * 100) : 0;
        return `
          <div class="prog-curso">
            <div class="prog-c-top">
              <span>${esc(c.titulo || 'Curso')}</span>
              <b>${v}/${t}</b>
            </div>
            <div class="prog-barra"><span style="width:${p}%"></span></div>
          </div>`;
      }).join('') : '<p class="pr-sub">Aún no hay cursos cargados.</p>'}
    </div>

    <p class="prog-nota">
      ℹ️ Tu avance se guarda <b>en este dispositivo</b>. Si cambias de teléfono o borras
      los datos del navegador, el conteo empieza de cero — tus certificados no se pierden,
      esos sí quedan guardados en tu cuenta.
    </p>`;
}

export function iniciarProgreso(user, planUsuario) {
  usuario = user || null;
  plan = planUsuario || 'free';
  if (!document.getElementById('progContenido')) return;
  if (unsubCerts) { try { unsubCerts(); } catch (e) {} unsubCerts = null; }
  if (!usuario) return;

  fetch('https://visionpecuaria-webhook-production.up.railway.app/catalogo-cursos')
    .then(async respuesta => {
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(datos.error || `HTTP ${respuesta.status}`);
      cursos = Array.isArray(datos.cursos) ? datos.cursos : [];
      pintar();
    })
    .catch(err => { console.warn('[Progreso] cursos:', err.message || err); pintar(); });

  unsubCerts = onSnapshot(query(collection(db, 'certificados'), where('uid', '==', usuario.uid)), (snap) => {
    certificados = snap.size;
    pintar();
  }, (err) => { console.warn('[Progreso] certificados:', err.code || err); });
}

// La Biblioteca escribe el progreso en localStorage; al volver aquí hay que repintar.
export function refrescarProgreso() { pintar(); }
