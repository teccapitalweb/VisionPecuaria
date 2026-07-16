// ═══════════════════════════════════════════════════════════
// CERTIFICADOS · lista los del socio y genera el PDF con QR
// Colección `certificados`, filtrada por uid. El QR apunta a
// verificar.html?f={folio} — el verificador vigente, que busca el
// folio como CAMPO (ver-certificado.html buscaba por docId y por eso
// no resolvía los folios VP-*; se borró por huérfano).
// Las librerías (qrcode/html2canvas/jsPDF) se cargan bajo demanda.
// ═══════════════════════════════════════════════════════════
import { db, collection, query, where, onSnapshot } from './firebase.js';

const BASE_VERIFICAR = 'https://teccapitalweb.github.io/VisionPecuaria/verificar.html';
const LIBS = {
  qr:   'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
  h2c:  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  pdf:  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
};

let unsub = null;
let usuario = null;
let plan = 'free';
let certificados = [];

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
    window.abrirModalVIP('Los Certificados oficiales son exclusivos de Élite Pecuario.');
  }
  return true;
}
function cargarScript(src) {
  return new Promise((ok, err) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = () => ok(); s.onerror = () => err(new Error('No cargó ' + src));
    document.head.appendChild(s);
  });
}
function fechaLegible(c) {
  const v = c.fechaEmision || c.creadoEn;
  let d = null;
  try {
    if (v?.toDate) d = v.toDate();
    else if (v?.seconds) d = new Date(v.seconds * 1000);
    else if (v) d = new Date(v);
  } catch (e) {}
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}
// El folio es el dato canónico; validURL puede traer un dominio viejo.
const urlVerificar = c => `${BASE_VERIFICAR}?f=${encodeURIComponent(c.folio || '')}`;

// ═══════════════════════════════════════════════════════════
// LISTA
// ═══════════════════════════════════════════════════════════
function pintar() {
  const cont = document.getElementById('certLista');
  if (!cont) return;

  if (!certificados.length) {
    cont.innerHTML = `
      <div class="h-estado">
        <span class="h-estado-emoji" aria-hidden="true">🎖️</span>
        <h3>Aún no tienes certificados</h3>
        <p>Completa un curso de la Biblioteca y tu certificado aparece aquí, con folio y QR verificable.</p>
        <button type="button" class="btn-verde" id="certIrCursos">Ir a la Biblioteca</button>
      </div>`;
    document.getElementById('certIrCursos')?.addEventListener('click', () => { location.hash = 'cursos'; });
    return;
  }

  cont.innerHTML = certificados.map(c => `
    <article class="cert-card">
      <div class="cert-sello" aria-hidden="true">🎖️</div>
      <div class="cert-body">
        <h3>${esc(c.cursoTitulo || 'Curso')}</h3>
        <span class="cert-folio">${esc(c.folio || 'sin folio')}</span>
        <p class="cert-meta">
          ${esc(c.categoria || 'General')} · ${fechaLegible(c)}
          ${c.horas ? ` · ${esc(c.horas)} h` : ''}
          ${c.instructor ? `<br>${esc(c.instructor)}` : ''}
        </p>
      </div>
      <div class="cert-acciones">
        <button class="h-btn" data-ver="${esc(c.id)}">👁️<span>Ver</span></button>
        <a class="h-btn" href="${esc(urlVerificar(c))}" target="_blank" rel="noopener noreferrer">🔗<span>Verificar</span></a>
      </div>
    </article>`).join('');

  cont.querySelectorAll('[data-ver]').forEach(b =>
    b.addEventListener('click', () => abrirCertificado(b.dataset.ver)));
}

// ═══════════════════════════════════════════════════════════
// VISTA + PDF
// ═══════════════════════════════════════════════════════════
let activo = null;

async function abrirCertificado(id) {
  if (bloqueadoPorFree()) return;
  const c = certificados.find(x => x.id === id);
  if (!c) return;
  activo = c;

  const url = urlVerificar(c);
  document.getElementById('certTplNombre').textContent = (c.nombre || c.miembroNombre || 'Socio Visión Pecuaria').toUpperCase();
  document.getElementById('certTplCurso').textContent = c.cursoTitulo || 'Curso';
  document.getElementById('certTplCategoria').textContent = c.categoria || 'General';
  document.getElementById('certTplFecha').textContent = fechaLegible(c);
  document.getElementById('certTplFolio').textContent = c.folio || '—';
  document.getElementById('certTplInstructor').textContent = c.instructor || 'Visión Pecuaria';
  document.getElementById('modalCert').classList.add('active');

  // QR del verificador
  const qrBox = document.getElementById('certTplQr');
  qrBox.innerHTML = '';
  try {
    await cargarScript(LIBS.qr);
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    qrBox.innerHTML = qr.createImgTag(4, 0);
    const img = qrBox.querySelector('img');
    if (img) { img.style.width = '100%'; img.style.height = 'auto'; img.alt = 'QR de verificación'; }
  } catch (e) {
    console.warn('[Certificados] No se pudo generar el QR:', e);
    qrBox.textContent = 'QR no disponible';
  }
}
function cerrarCertificado() {
  document.getElementById('modalCert').classList.remove('active');
  activo = null;
}

async function descargarPDF() {
  if (!activo) return;
  const btn = document.getElementById('certBtnPdf');
  btn.disabled = true;
  btn.textContent = 'Generando…';
  try {
    await cargarScript(LIBS.h2c);
    await cargarScript(LIBS.pdf);
    const tpl = document.getElementById('certTpl');
    const canvas = await html2canvas(tpl, { scale: 2, backgroundColor: '#FCFAF4', logging: false, useCORS: true });
    const img = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.addImage(img, 'JPEG', 0, 0, 297, 210);   // A4 horizontal
    pdf.save(`Certificado_${activo.folio || 'VP'}_${String(activo.nombre || '').replace(/\s+/g, '_')}.pdf`);
    toast('PDF descargado ✅');
  } catch (e) {
    console.error('[Certificados] Error generando PDF:', e);
    toast('No se pudo generar el PDF. Intenta de nuevo.');
  }
  btn.disabled = false;
  btn.textContent = '⬇️ Descargar PDF';
}

// ═══════════════════════════════════════════════════════════
export function iniciarCertificados(user, planUsuario) {
  usuario = user || null;
  plan = planUsuario || 'free';
  const cont = document.getElementById('certLista');
  if (!cont) return;
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
  if (!usuario) return;

  const q = query(collection(db, 'certificados'), where('uid', '==', usuario.uid));
  unsub = onSnapshot(q, (snap) => {
    certificados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    pintar();
  }, (err) => {
    console.warn('[Certificados] Error leyendo:', err.code || err);
    certificados = [];
    pintar();
  });
}

export function montarCertificados() {
  document.getElementById('certCerrar')?.addEventListener('click', cerrarCertificado);
  document.getElementById('certBtnPdf')?.addEventListener('click', descargarPDF);
  document.getElementById('modalCert')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) cerrarCertificado();
  });
}
