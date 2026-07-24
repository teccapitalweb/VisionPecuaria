// ═══════════════════════════════════════════════════════════
// COMUNIDAD · "Radar" de clasificados (colección `avisos`)
// Réplica del modelo del portal actual: cualquiera ve, solo Élite
// publica. Misma estructura de documento, mismas validaciones.
//
// Dos mejoras deliberadas vs el portal actual (aprobadas):
//  1. Borrar SÍ verifica dueño en el cliente antes de llamar
//     deleteDoc (el viejo confiaba solo en la regla de Firestore).
//     Con modal de confirmación del rediseño, no confirm() nativo.
//  2. Botón de "Reportar" real: el campo `reportes` existía en el
//     esquema del viejo pero nada lo escribía nunca. Aquí sí lo
//     incrementa — PERO requiere que la regla de `avisos` permita a
//     terceros tocar ese campo (hoy solo permite 'vistas'). Hasta que
//     esa regla se apruebe y despliegue, el botón fallará con un
//     toast de error — no rompe nada, solo no hace efecto todavía.
//
// ⚠️ FOTOS EN BASE64 DENTRO DEL DOC: cada foto va comprimida como
// data-URI directo en el documento de Firestore (igual que el viejo).
// Firestore limita cada documento a 1 MB; 3 fotos a 600px/calidad .7
// rondan 250-450 KB — lejos del límite hoy (la colección está vacía),
// pero si crece el volumen o la resolución, lo sano es migrar a
// Firebase Storage (subir el archivo, guardar solo la URL) antes de
// acercarse al límite.
// ═══════════════════════════════════════════════════════════
import { db, collection, query, where, orderBy, onSnapshot } from './firebase.js';

const TIPOS = {
  venta:   { emoji: '🟢', label: 'Vendo' },
  compra:  { emoji: '🔵', label: 'Compro' },
  ofrezco: { emoji: '🟡', label: 'Ofrezco' },
  busco:   { emoji: '🟣', label: 'Busco' },
  aviso:   { emoji: '⚪', label: 'Aviso' }
};
const CATEGORIAS = {
  ganado:    '🐄 Ganado',
  forraje:   '🌾 Forraje',
  insumos:   '💊 Insumos / Medicamentos',
  servicios: '🩺 Servicios (MVZ, transporte)',
  tierra:    '🏞️ Tierras / Renta',
  equipo:    '🚜 Equipo / Maquinaria',
  otro:      '📋 Otro'
};
const LS_KEY_REPORTES = 'vp_com_reportes_hechos';

let unsub = null;
let usuario = null;
let plan = 'free';
let miembroActual = null;
let avisos = [];
let filtroTipo = 'todos';
let filtroCategoria = 'todas';
let mavTipoSel = 'venta';
let mavFotos = [null, null, null];
let avisoDetalleActual = null;
let borrando = null;    // aviso a confirmar borrar
let reportando = null;  // aviso a confirmar reportar
const VISTAS_CONTADAS = new Set();

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
// El gate Élite es del cliente para la UI; la regla de Firestore
// (esVip(), ya corregida) es quien de verdad lo exige al escribir.
function bloqueadoPorFree() {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') {
    window.abrirModalVIP('Publicar en Comunidad es exclusivo de Élite Pecuario.');
  }
  return true;
}
function yaReporte(id) {
  try { return JSON.parse(localStorage.getItem(LS_KEY_REPORTES) || '[]').includes(id); }
  catch (e) { return false; }
}
function marcarReportado(id) {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY_REPORTES) || '[]');
    if (!arr.includes(id)) arr.push(id);
    localStorage.setItem(LS_KEY_REPORTES, JSON.stringify(arr));
  } catch (e) {}
}
function formatearFecha(t) {
  if (!t) return '';
  let d;
  if (t.toDate) d = t.toDate();
  else if (typeof t === 'number') d = new Date(t);
  else d = new Date(t);
  if (!d || isNaN(d.getTime())) return '';
  const ahora = Date.now();
  const diff = ahora - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const dias = Math.floor(hrs / 24);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  if (hrs < 24) return `Hace ${hrs} h`;
  if (dias < 7) return `Hace ${dias} día${dias > 1 ? 's' : ''}`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// ═══════════════════════════════════════════════════════════
// ESTADOS / PINTAR
// ═══════════════════════════════════════════════════════════
const ESTADOS = {
  cargando: { emoji: '📡', titulo: 'Cargando avisos…', texto: 'Un momento.' },
  vacio:    { emoji: '📭', titulo: 'Aún no hay avisos', texto: 'Sé el primero en publicar y conecta con otros ranchos.' },
  sinFiltro:{ emoji: '🔍', titulo: 'Ningún aviso en este filtro', texto: 'Prueba con otro tipo o categoría.' },
  error:    { emoji: '⚠️', titulo: 'No pudimos cargar los avisos', texto: 'Intenta de nuevo en un momento.' }
};
function estado(tipo) {
  const e = ESTADOS[tipo] || ESTADOS.error;
  return `<div class="h-estado"><span class="h-estado-emoji" aria-hidden="true">${e.emoji}</span><h3>${e.titulo}</h3><p>${e.texto}</p></div>`;
}

function pintarChipsTipo() {
  const cont = document.getElementById('comChipsTipo');
  if (!cont) return;
  const conteo = {};
  avisos.forEach(a => { conteo[a.tipo] = (conteo[a.tipo] || 0) + 1; });
  const chips = [`<button class="h-chip${filtroTipo === 'todos' ? ' active' : ''}" type="button" data-tipo="todos">Todos <b>${avisos.length}</b></button>`];
  Object.keys(TIPOS).forEach(t => {
    if (!conteo[t]) return;
    chips.push(`<button class="h-chip${filtroTipo === t ? ' active' : ''}" type="button" data-tipo="${t}">${TIPOS[t].emoji} ${esc(TIPOS[t].label)} <b>${conteo[t]}</b></button>`);
  });
  cont.innerHTML = chips.join('');
  cont.querySelectorAll('[data-tipo]').forEach(b =>
    b.addEventListener('click', () => { filtroTipo = b.dataset.tipo; pintarComunidad(); }));
}

function avisoCardHtml(a) {
  const tipoInfo = TIPOS[a.tipo] || TIPOS.aviso;
  const catLabel = CATEGORIAS[a.categoria] || CATEGORIAS.otro;
  const fotos = a.fotos || [];
  const tieneFoto = fotos.length > 0;
  const precioHtml = (typeof a.precio === 'number' && a.precio > 0)
    ? '$' + a.precio.toLocaleString('es-MX') + ' MXN' + (a.cantidad ? ' · ' + esc(a.cantidad) : '')
    : `<span class="sin-precio">${esc(a.cantidad || 'Consultar precio')}</span>`;
  const ranchoMeta = [a.ranchoUbicacion, a.ranchoEspecialidad].filter(Boolean).map(esc).join(' · ');
  const fechaTxt = formatearFecha(a.creado);
  const esMio = usuario && a.ranchoUid === usuario.uid;
  const yaRep = yaReporte(a.id);

  const wa = (a.whatsapp || '').replace(/\D/g, '');
  const msgWa = encodeURIComponent(`Hola! Vi tu aviso en Visión Pecuaria: "${a.titulo || ''}". Me interesa, ¿podemos hablar?`);
  const linkWa = wa ? `https://wa.me/52${wa}?text=${msgWa}` : '#';

  return `
    <div class="com-card">
      <div class="com-foto" data-abrir="${a.id}" ${tieneFoto ? `style="background-image:url('${fotos[0].replace(/'/g, "\\'")}')"` : ''}>
        ${tieneFoto ? '' : `<span class="com-foto-emoji">${tipoInfo.emoji}</span>`}
        <span class="com-tipo-badge ${a.tipo}">${esc(tipoInfo.label)}</span>
        ${fotos.length > 1 ? `<span class="com-fotos-count">📷 ${fotos.length}</span>` : ''}
      </div>
      <div class="com-body" data-abrir="${a.id}">
        <span class="com-categoria">${esc(catLabel)}</span>
        <span class="com-titulo">${esc(a.titulo || 'Sin título')}</span>
        <span class="com-precio">${precioHtml}</span>
        <p class="com-desc">${esc(a.descripcion || '')}</p>
        <div class="com-rancho">
          <span class="com-rancho-emoji">${a.ranchoEmoji || '🏡'}</span>
          <span class="com-rancho-info">
            <span class="com-rancho-nombre">${esc(a.ranchoNombre || 'Rancho')}</span>
            <span class="com-rancho-meta">${ranchoMeta || 'México'}</span>
          </span>
        </div>
      </div>
      <div class="com-fecha">${fechaTxt}</div>
      <div class="com-acciones">
        <a class="com-btn-wa" href="${linkWa}" target="_blank" rel="noopener" data-wa="${a.id}">📱 WhatsApp</a>
        ${esMio
          ? `<button class="com-btn-del" type="button" data-borrar="${a.id}" title="Eliminar mi aviso">🗑️</button>`
          : `<button class="com-btn-reportar" type="button" data-reportar="${a.id}" title="Reportar" ${yaRep ? 'disabled' : ''}>${yaRep ? '✅ Reportado' : '🚩 Reportar'}</button>`
        }
      </div>
    </div>`;
}

export function pintarComunidad() {
  const cont = document.getElementById('comGrid');
  if (!cont) return;

  pintarChipsTipo();

  let lista = avisos.slice();
  if (filtroTipo !== 'todos') lista = lista.filter(a => a.tipo === filtroTipo);
  if (filtroCategoria !== 'todas') lista = lista.filter(a => a.categoria === filtroCategoria);

  if (!lista.length) {
    cont.innerHTML = avisos.length === 0 ? estado('vacio') : estado('sinFiltro');
    return;
  }

  cont.innerHTML = lista.map(avisoCardHtml).join('');
  cont.querySelectorAll('[data-abrir]').forEach(el =>
    el.addEventListener('click', () => abrirDetalleAviso(el.dataset.abrir)));
  cont.querySelectorAll('[data-borrar]').forEach(btn =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); pedirBorrarAviso(btn.dataset.borrar); }));
  cont.querySelectorAll('[data-reportar]').forEach(btn =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); pedirReportarAviso(btn.dataset.reportar); }));
  cont.querySelectorAll('[data-wa]').forEach(a =>
    a.addEventListener('click', () => contarVistaAviso(a.dataset.wa)));
}

// ═══════════════════════════════════════════════════════════
// DETALLE
// ═══════════════════════════════════════════════════════════
function abrirDetalleAviso(id) {
  const a = avisos.find(x => x.id === id);
  if (!a) return;
  avisoDetalleActual = a;
  contarVistaAviso(id);

  const fotos = a.fotos || [];
  const catLabel = CATEGORIAS[a.categoria] || CATEGORIAS.otro;
  const tipoInfo = TIPOS[a.tipo] || TIPOS.aviso;
  const precioTxt = (typeof a.precio === 'number' && a.precio > 0) ? ('$' + a.precio.toLocaleString('es-MX') + ' MXN') : 'Consultar precio';
  const ranchoMeta = [a.ranchoUbicacion, a.ranchoEspecialidad].filter(Boolean).map(esc).join(' · ');
  const wa = (a.whatsapp || '').replace(/\D/g, '');
  const msgWa = encodeURIComponent(`Hola! Vi tu aviso en Visión Pecuaria: "${a.titulo || ''}". Me interesa, ¿podemos hablar?`);
  const linkWa = wa ? `https://wa.me/52${wa}?text=${msgWa}` : '#';

  let fotosHtml = '';
  if (fotos.length) {
    fotosHtml = `<div class="com-det-foto" id="comDetFotoActual" style="background-image:url('${fotos[0].replace(/'/g, "\\'")}')"></div>`;
    if (fotos.length > 1) {
      fotosHtml += `<div class="com-det-thumbs">${fotos.map((f, i) =>
        `<div class="com-det-thumb${i === 0 ? ' activa' : ''}" data-thumb="${i}" style="background-image:url('${f.replace(/'/g, "\\'")}')"></div>`).join('')}</div>`;
    }
  }

  document.getElementById('comDetBody').innerHTML = `
    ${fotosHtml}
    <span class="com-tipo-badge ${a.tipo}" style="position:static;display:inline-block;margin-bottom:8px;">${esc(tipoInfo.label)}</span>
    <span class="com-categoria" style="display:block;margin-bottom:4px;">${esc(catLabel)}</span>
    <h3 style="margin-bottom:6px;">${esc(a.titulo || '')}</h3>
    <p class="com-precio" style="margin-bottom:12px;">${precioTxt}${a.cantidad ? ' · ' + esc(a.cantidad) : ''}</p>
    <p style="color:var(--tinta-2);line-height:1.55;white-space:pre-wrap;margin-bottom:18px;">${esc(a.descripcion || '')}</p>
    <div style="background:var(--crema);border-radius:12px;padding:13px;margin-bottom:16px;">
      <div style="font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--tinta-3);margin-bottom:7px;">Publicado por</div>
      <div style="display:flex;align-items:center;gap:11px;">
        <span class="com-rancho-emoji" style="width:40px;height:40px;font-size:1.2rem;">${a.ranchoEmoji || '🏡'}</span>
        <div style="min-width:0;">
          <div style="font-weight:700;">${esc(a.ranchoNombre || 'Rancho')}</div>
          <div style="font-size:.8rem;color:var(--tinta-3);">${ranchoMeta || 'México'}</div>
        </div>
      </div>
    </div>
    <p style="font-size:.76rem;color:var(--tinta-3);margin-bottom:14px;">${formatearFecha(a.creado)}${a.vistas ? ' · 👁️ ' + a.vistas + ' vista' + (a.vistas > 1 ? 's' : '') : ''}</p>
    <a class="com-btn-wa" style="display:block;padding:13px;font-size:.95rem;" href="${linkWa}" target="_blank" rel="noopener">📱 Contactar por WhatsApp</a>
  `;
  document.getElementById('comDetBody').querySelectorAll('[data-thumb]').forEach(t =>
    t.addEventListener('click', () => cambiarFotoDetalle(Number(t.dataset.thumb))));
  document.getElementById('modalComDetalle').classList.add('active');
}
function cerrarDetalleAviso() {
  document.getElementById('modalComDetalle').classList.remove('active');
  avisoDetalleActual = null;
}
function cambiarFotoDetalle(idx) {
  const a = avisoDetalleActual;
  if (!a || !a.fotos || !a.fotos[idx]) return;
  const main = document.getElementById('comDetFotoActual');
  if (main) main.style.backgroundImage = `url('${a.fotos[idx].replace(/'/g, "\\'")}')`;
  document.querySelectorAll('#comDetBody [data-thumb]').forEach((t, i) => t.classList.toggle('activa', i === idx));
}

async function contarVistaAviso(id) {
  if (VISTAS_CONTADAS.has(id)) return;
  VISTAS_CONTADAS.add(id);
  try {
    const { doc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    await updateDoc(doc(db, 'avisos', id), { vistas: increment(1) });
  } catch (e) { /* silencioso, igual que el viejo */ }
}

// ═══════════════════════════════════════════════════════════
// PUBLICAR
// ═══════════════════════════════════════════════════════════
function comprimirImagen(file, maxW, quality) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = rej;
      img.src = e.target.result;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function actualizarSlotFoto(idx) {
  const slot = document.getElementById('comFotoSlot' + idx);
  if (!slot) return;
  if (mavFotos[idx]) {
    slot.classList.add('lleno');
    slot.style.backgroundImage = `url('${mavFotos[idx]}')`;
    const ph = slot.querySelector('.com-foto-placeholder');
    if (ph) ph.style.display = 'none';
    if (!slot.querySelector('.com-foto-quitar')) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'com-foto-quitar';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Quitar foto');
      x.onclick = (e) => { e.preventDefault(); e.stopPropagation(); mavFotos[idx] = null; actualizarSlotFoto(idx); };
      slot.appendChild(x);
    }
  } else {
    slot.classList.remove('lleno');
    slot.style.backgroundImage = '';
    const ph = slot.querySelector('.com-foto-placeholder');
    if (ph) ph.style.display = '';
    const x = slot.querySelector('.com-foto-quitar');
    if (x) x.remove();
    const inp = slot.querySelector('input');
    if (inp) inp.value = '';
  }
}

async function cargarFoto(idx, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    toast('Máx 8 MB por imagen. Comprime la foto.');
    input.value = '';
    return;
  }
  try {
    const base64 = await comprimirImagen(file, 600, 0.7);
    mavFotos[idx] = base64;
    actualizarSlotFoto(idx);
  } catch (e) {
    console.error('[Comunidad] Error procesando foto:', e);
    toast('No se pudo procesar la imagen.');
  }
}

function abrirModalPublicar() {
  if (bloqueadoPorFree()) return;
  document.getElementById('comTitulo').value = '';
  document.getElementById('comPrecio').value = '';
  document.getElementById('comCantidad').value = '';
  document.getElementById('comDescripcion').value = '';
  document.getElementById('comCategoria').value = 'ganado';
  document.getElementById('comWhatsapp').value = miembroActual?.whatsappRancho || '';
  document.getElementById('comError').textContent = '';
  document.querySelectorAll('.com-tipo-btn').forEach((b, i) => b.classList.toggle('sel', i === 0));
  mavTipoSel = 'venta';
  mavFotos = [null, null, null];
  [0, 1, 2].forEach(actualizarSlotFoto);
  document.getElementById('modalComPublicar').classList.add('active');
  document.getElementById('comTitulo')?.focus();
}
function cerrarModalPublicar() {
  document.getElementById('modalComPublicar').classList.remove('active');
}

async function publicarAviso() {
  if (bloqueadoPorFree()) return;
  const btn = document.getElementById('comBtnPublicar');
  const err = document.getElementById('comError');
  err.textContent = '';

  const titulo = (document.getElementById('comTitulo').value || '').trim();
  const descripcion = (document.getElementById('comDescripcion').value || '').trim();
  const categoria = document.getElementById('comCategoria').value;
  const precioRaw = document.getElementById('comPrecio').value;
  const precio = precioRaw ? parseFloat(precioRaw) : 0;
  const cantidad = (document.getElementById('comCantidad').value || '').trim();
  const whatsapp = (document.getElementById('comWhatsapp').value || '').trim().replace(/\D/g, '');

  if (!titulo || titulo.length < 5) { err.textContent = 'El título debe tener mínimo 5 caracteres'; return; }
  if (!descripcion || descripcion.length < 10) { err.textContent = 'La descripción debe tener mínimo 10 caracteres'; return; }
  if (!whatsapp || whatsapp.length !== 10) { err.textContent = 'WhatsApp debe ser de 10 dígitos (sin lada)'; return; }
  if (!usuario) { err.textContent = 'Inicia sesión primero.'; return; }

  btn.disabled = true;
  btn.textContent = 'Publicando…';

  try {
    const { addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    const fotos = mavFotos.filter(f => f);

    const datos = {
      tipo: mavTipoSel,
      categoria,
      titulo: titulo.slice(0, 80),
      descripcion: descripcion.slice(0, 500),
      precio,
      cantidad: cantidad.slice(0, 30),
      whatsapp,
      fotos, // ⚠️ ver aviso de riesgo en el encabezado del archivo (base64 en el doc)
      ranchoUid: usuario.uid,
      ranchoNombre: miembroActual?.nombreRancho || usuario.displayName || 'Mi Rancho',
      ranchoEmoji: miembroActual?.emojiRancho || '🏡',
      ranchoUbicacion: miembroActual?.ubicacionRancho || '',
      ranchoEspecialidad: miembroActual?.especialidadRancho || '',
      ranchoPlan: 'elite',
      creado: serverTimestamp(),
      activo: true,
      reportes: 0,
      vistas: 0
    };
    // Nota: el viejo también guardaba `ranchoNivel` (nivel de gamificación).
    // Aquí se omite a propósito: ese nivel sale de un cálculo local en
    // progreso.js que no está expuesto para reutilizar, y no vale la pena
    // inventar un número — mejor omitirlo que mostrar un nivel falso.

    await addDoc(collection(db, 'avisos'), datos);

    cerrarModalPublicar();
    toast('Aviso publicado 📡');
  } catch (e) {
    console.error('[Comunidad] Error publicando aviso:', e);
    err.textContent = 'No se pudo publicar: ' + (e.code || e.message || 'error desconocido');
  }
  btn.disabled = false;
  btn.textContent = 'Publicar aviso';
}

// ═══════════════════════════════════════════════════════════
// BORRAR — solo el dueño. Verificado en el CLIENTE (defensa en
// profundidad) además de en la regla de Firestore, a diferencia
// del portal viejo que solo confiaba en la regla.
// ═══════════════════════════════════════════════════════════
function pedirBorrarAviso(id) {
  const a = avisos.find(x => x.id === id);
  if (!a) return;
  if (!usuario || a.ranchoUid !== usuario.uid) {
    toast('Solo puedes borrar tus propios avisos.');
    return;
  }
  borrando = a;
  document.getElementById('cbaTitulo').textContent = a.titulo || 'este aviso';
  const btnDel = document.getElementById('cbaBtnDel');
  btnDel.disabled = false;
  btnDel.textContent = 'Sí, eliminar';
  document.getElementById('cbaBtnCancel').disabled = false;
  document.getElementById('modalComBorrar').classList.add('active');
}
function cerrarBorrarAviso() {
  document.getElementById('modalComBorrar').classList.remove('active');
  borrando = null;
}
async function confirmarBorrarAviso() {
  if (!borrando) return;
  // Revalida dueño otra vez aquí, justo antes de escribir (no solo al
  // abrir el modal) — es la defensa en profundidad que pidió el análisis.
  if (!usuario || borrando.ranchoUid !== usuario.uid) {
    cerrarBorrarAviso();
    toast('Solo puedes borrar tus propios avisos.');
    return;
  }
  const id = borrando.id;
  const btnDel = document.getElementById('cbaBtnDel');
  const btnCancel = document.getElementById('cbaBtnCancel');
  btnDel.disabled = true; btnCancel.disabled = true;
  btnDel.textContent = 'Eliminando...';
  try {
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    await deleteDoc(doc(db, 'avisos', id));
    cerrarBorrarAviso();
    toast('Aviso eliminado 🗑️');
  } catch (e) {
    console.error('[Comunidad] Error al eliminar:', e);
    toast('No se pudo eliminar.');
  }
  btnDel.disabled = false; btnCancel.disabled = false;
  btnDel.textContent = 'Sí, eliminar';
}

// ═══════════════════════════════════════════════════════════
// REPORTAR — funcionalidad nueva. El campo `reportes` existía en el
// esquema del viejo pero nada lo escribía. Aquí sí.
//
// 🔴 BLOQUEADO HOY POR LA REGLA ACTIVA: `avisos.update` solo permite a
// terceros tocar el campo 'vistas' (hasOnly(['vistas'])). Este botón
// hace un updateDoc de 'reportes' desde alguien que NO es el dueño, así
// que fallará con permission-denied hasta que se apruebe y despliegue
// el cambio de regla propuesto (agregar 'reportes' a ese hasOnly). El
// error se maneja con un toast, no rompe nada mientras tanto.
// ═══════════════════════════════════════════════════════════
function pedirReportarAviso(id) {
  if (!usuario) { toast('Inicia sesión para reportar.'); return; }
  const a = avisos.find(x => x.id === id);
  if (!a || a.ranchoUid === usuario.uid) return;
  if (yaReporte(id)) { toast('Ya reportaste este aviso.'); return; }
  reportando = a;
  document.getElementById('rpaTitulo').textContent = a.titulo || 'este aviso';
  const btn = document.getElementById('rpaBtnConfirmar');
  btn.disabled = false;
  btn.textContent = 'Sí, reportar';
  document.getElementById('modalComReportar').classList.add('active');
}
function cerrarReportarAviso() {
  document.getElementById('modalComReportar').classList.remove('active');
  reportando = null;
}
async function confirmarReportarAviso() {
  if (!reportando) return;
  const id = reportando.id;
  const btn = document.getElementById('rpaBtnConfirmar');
  btn.disabled = true;
  btn.textContent = 'Reportando...';
  try {
    const { doc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    await updateDoc(doc(db, 'avisos', id), { reportes: increment(1) });
    marcarReportado(id);
    cerrarReportarAviso();
    toast('Gracias, lo vamos a revisar 🚩');
    pintarComunidad();
  } catch (e) {
    console.error('[Comunidad] Error al reportar:', e);
    toast('No se pudo reportar por ahora. Intenta más tarde.');
  }
  btn.disabled = false;
  btn.textContent = 'Sí, reportar';
}

// ═══════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════
export function iniciarComunidad(user, planUsuario, miembroDoc) {
  usuario = user || null;
  plan = planUsuario || 'free';
  miembroActual = miembroDoc || null;

  const cont = document.getElementById('comGrid');
  if (!cont) return;
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }

  cont.innerHTML = estado('cargando');

  // Público para cualquier autenticado (Élite o free) — es la vitrina.
  const q = query(collection(db, 'avisos'), orderBy('creado', 'desc'));
  unsub = onSnapshot(q, (snap) => {
    avisos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.activo !== false);
    pintarComunidad();
  }, (err) => {
    console.warn('[Comunidad] Error leyendo avisos:', err.code || err);
    avisos = [];
    cont.innerHTML = estado('error');
  });
}

export function montarComunidad() {
  document.getElementById('btnPublicarAviso')?.addEventListener('click', abrirModalPublicar);
  document.getElementById('comCerrarPublicar')?.addEventListener('click', cerrarModalPublicar);

  document.querySelectorAll('.com-tipo-btn').forEach(b =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.com-tipo-btn').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      mavTipoSel = b.dataset.tipo;
    }));

  [0, 1, 2].forEach(i =>
    document.getElementById('comFotoInput' + i)?.addEventListener('change', (e) => cargarFoto(i, e.target)));

  document.getElementById('comBtnPublicar')?.addEventListener('click', publicarAviso);

  document.getElementById('comFiltroCategoria')?.addEventListener('change', (e) => {
    filtroCategoria = e.target.value;
    pintarComunidad();
  });

  document.getElementById('comDetCerrar')?.addEventListener('click', cerrarDetalleAviso);

  document.getElementById('cbaBtnCancel')?.addEventListener('click', cerrarBorrarAviso);
  document.getElementById('cbaBtnDel')?.addEventListener('click', confirmarBorrarAviso);

  document.getElementById('rpaBtnCancel')?.addEventListener('click', cerrarReportarAviso);
  document.getElementById('rpaBtnConfirmar')?.addEventListener('click', confirmarReportarAviso);

  ['modalComPublicar', 'modalComDetalle', 'modalComBorrar', 'modalComReportar'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
    });
  });
}
