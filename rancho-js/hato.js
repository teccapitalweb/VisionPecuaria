// ═══════════════════════════════════════════════════════════
// MI HATO · CRUD sobre la colección `animales` (Firestore)
// Misma forma de documento que el portal actual, para que los
// dos convivan sobre los mismos datos sin pelearse.
//
// Dos diferencias deliberadas con el viejo:
//  1. Se puede EDITAR EL PESO sin borrar el animal (y queda el
//     historial de la pesada en `eventos`).
//  2. El valor del hato se calcula SOLO con pesos reales. El
//     viejo imputa 350 kg a vacas sin peso y 50 kg al resto, lo
//     que infla el número con supuestos que el socio no ve.
// ═══════════════════════════════════════════════════════════
import { db, collection, query, where, onSnapshot } from './firebase.js';

const EMOJI_TIPO = {
  vaca: '🐄', toro: '🐂', becerro: '🐃',
  cerdo: '🐖', oveja: '🐑', cabra: '🐐',
  caballo: '🐎', pollo: '🐔'
};

// Precio de referencia por tipo, en MXN/kg en pie.
// Son los mismos valores del portal actual (TIPO_ANIMAL_INFO): un
// snapshot de ene-2026, NO una cotización viva. El viejo intenta
// leer window.MERCADO primero, pero esa variable nunca se asigna
// (es `let` dentro de un <script>, no propiedad de window), así que
// en la práctica siempre usa estos números. Aquí se usan directo y
// se declara su antigüedad en pantalla.
const PRECIO_REF = {
  vaca: 41, toro: 88, becerro: 78, cerdo: 51,
  oveja: 78, cabra: 65, caballo: 88, pollo: 47
};
const PRECIO_REF_FECHA = 'enero 2026';

const LABEL_TIPO = {
  vaca: 'Vaca', toro: 'Toro', becerro: 'Becerro', cerdo: 'Cerdo',
  oveja: 'Oveja', cabra: 'Cabra', caballo: 'Caballo', pollo: 'Pollo'
};

let unsub = null;
let usuario = null;
let plan = 'free';
let animales = [];
let filtroTipo = 'todos';
let busqueda = '';
let editando = null;   // animal cuyo peso se edita
let borrando = null;   // animal por borrar
let loteDatos = null;  // lote pendiente de confirmar
let avisoDuplicado = false; // el arete ya existe y el socio ya fue avisado

// ── utilidades ──
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return isFinite(n) ? n : 0;
}
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3500);
}
// El cliente muestra el gate Élite y las reglas de Firestore lo vuelven
// a comprobar antes de guardar cualquier cambio en el hato.
function bloqueadoPorFree(razon) {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') window.abrirModalVIP(razon);
  return true;
}
const hoyISO = () => new Date().toISOString().slice(0, 10);
// Id estable por evento (Bitácora lo usa para borrar sin ambigüedad).
// El portal viejo no lo escribe ni lo necesita, pero lo ignora sin problema.
function generarIdEvento() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ═══════════════════════════════════════════════════════════
// STATS HONESTOS — solo sobre pesos realmente capturados
// ═══════════════════════════════════════════════════════════
function stats(lista) {
  const total = lista.length;
  const conPeso = lista.filter(a => num(a.peso) > 0);
  const pesos = conPeso.map(a => num(a.peso));
  const pesoProm = pesos.length ? Math.round(pesos.reduce((a, b) => a + b, 0) / pesos.length) : null;
  const valor = conPeso.reduce((acc, a) => {
    const precio = PRECIO_REF[(a.tipo || '').toLowerCase()] || 0;
    return acc + num(a.peso) * precio;
  }, 0);
  return {
    total,
    conPeso: conPeso.length,
    sinPeso: total - conPeso.length,
    pesoProm,
    valor: Math.round(valor)
  };
}

function pintarStats() {
  const cont = document.getElementById('hatoStats');
  if (!cont) return;
  const s = stats(animales);
  const mxn = n => '$' + n.toLocaleString('es-MX');

  // El valor solo dice de cuántos animales sale. Sin pesos, no hay valor.
  let valorTxt, valorPie;
  if (!s.conPeso) {
    valorTxt = '—';
    valorPie = s.total ? 'Captura pesos para estimarlo' : 'Registra tu primer animal';
  } else {
    valorTxt = mxn(s.valor);
    valorPie = `basado en ${s.conPeso} de ${s.total} ${s.total === 1 ? 'animal' : 'animales'} con peso capturado`;
  }

  cont.innerHTML = `
    <div class="stat-card">
      <span class="s-emoji">🐄</span>
      <b>${s.total}</b>
      <span>${s.total === 1 ? 'animal en tu hato' : 'animales en tu hato'}</span>
    </div>
    <div class="stat-card">
      <span class="s-emoji">⚖️</span>
      <b>${s.pesoProm !== null ? s.pesoProm + ' kg' : '—'}</b>
      <span>${s.pesoProm !== null ? `peso promedio de ${s.conPeso} con peso` : 'sin pesos capturados'}</span>
    </div>
    <div class="stat-card">
      <span class="s-emoji">💰</span>
      <b>${valorTxt}</b>
      <span>${valorPie}</span>
    </div>
    <div class="stat-card${s.sinPeso ? ' stat-card--aviso' : ''}">
      <span class="s-emoji">${s.sinPeso ? '📋' : '✅'}</span>
      <b>${s.sinPeso}</b>
      <span>${s.sinPeso ? 'sin peso capturado' : 'todos con peso'}</span>
    </div>`;

  const nota = document.getElementById('hatoNotaPrecio');
  if (nota) {
    nota.textContent = s.conPeso
      ? `Valor estimado con precios de referencia en pie (base ${PRECIO_REF_FECHA}). No es una cotización de venta.`
      : '';
  }
}

// ═══════════════════════════════════════════════════════════
// TABLA
// ═══════════════════════════════════════════════════════════
function filtrados() {
  const q = busqueda.trim().toLowerCase();
  return animales.filter(a => {
    if (filtroTipo !== 'todos' && (a.tipo || '').toLowerCase() !== filtroTipo) return false;
    if (!q) return true;
    return [a.tag, a.nombre, a.raza, a.potrero]
      .some(v => String(v || '').toLowerCase().includes(q));
  });
}

function pintarFiltros() {
  const cont = document.getElementById('hatoChips');
  if (!cont) return;
  const conteo = {};
  animales.forEach(a => {
    const t = (a.tipo || '').toLowerCase();
    conteo[t] = (conteo[t] || 0) + 1;
  });
  const chips = [`<button class="h-chip${filtroTipo === 'todos' ? ' active' : ''}" data-tipo="todos">Todos <b>${animales.length}</b></button>`];
  Object.keys(EMOJI_TIPO).forEach(t => {
    if (!conteo[t]) return;
    chips.push(`<button class="h-chip${filtroTipo === t ? ' active' : ''}" data-tipo="${t}">${EMOJI_TIPO[t]} ${esc(LABEL_TIPO[t])} <b>${conteo[t]}</b></button>`);
  });
  cont.innerHTML = chips.join('');
  cont.querySelectorAll('[data-tipo]').forEach(b =>
    b.addEventListener('click', () => { filtroTipo = b.dataset.tipo; pintarFiltros(); pintarTabla(); }));
}

function fila(a, pesoMaxTipo) {
  const tipo = (a.tipo || '').toLowerCase();
  const peso = num(a.peso);
  const max = pesoMaxTipo[tipo] || 0;
  // La barra compara contra el animal más pesado de SU tipo en tu hato.
  // Es una referencia visual entre tus animales, no una meta de engorda.
  const pct = peso > 0 && max > 0 ? Math.max(6, Math.round((peso / max) * 100)) : 0;

  return `
    <tr data-id="${esc(a.id)}">
      <td class="h-animal">
        <span class="h-emoji">${esc(a.emoji || EMOJI_TIPO[tipo] || '🐾')}</span>
        <div class="h-id">
          <strong>${esc(a.nombre || 'Sin nombre')}</strong>
          ${a.tag ? `<span class="h-arete">${esc(a.tag)}</span>` : ''}
        </div>
      </td>
      <td class="h-col-tipo">${esc(LABEL_TIPO[tipo] || a.tipo || '—')}</td>
      <td class="h-col-raza">${esc(a.raza || '—')}</td>
      <td class="h-col-peso">
        ${peso > 0 ? `
          <div class="h-peso">
            <span class="h-peso-num">${peso} kg</span>
            <span class="h-peso-barra"><i style="width:${pct}%"></i></span>
          </div>`
        : `<span class="h-sinpeso">Sin peso</span>`}
      </td>
      <td class="h-col-edad">${esc(a.edad || '—')}</td>
      <td class="h-acciones">
        <button class="h-btn" data-accion="peso" data-id="${esc(a.id)}" title="Editar peso">⚖️<span>Peso</span></button>
        <button class="h-btn h-btn--del" data-accion="borrar" data-id="${esc(a.id)}" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
}

function pintarTabla() {
  const cont = document.getElementById('hatoTabla');
  if (!cont) return;
  const lista = filtrados();

  if (!animales.length) {
    cont.innerHTML = estado('vacio');
    enlazarVacio();
    return;
  }
  if (!lista.length) {
    cont.innerHTML = estado('sinResultados');
    return;
  }

  const pesoMaxTipo = {};
  animales.forEach(a => {
    const t = (a.tipo || '').toLowerCase();
    pesoMaxTipo[t] = Math.max(pesoMaxTipo[t] || 0, num(a.peso));
  });

  cont.innerHTML = `
    <table class="h-tabla">
      <thead>
        <tr>
          <th>Animal</th>
          <th class="h-col-tipo">Tipo</th>
          <th class="h-col-raza">Raza</th>
          <th class="h-col-peso">Peso</th>
          <th class="h-col-edad">Edad</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${lista.map(a => fila(a, pesoMaxTipo)).join('')}</tbody>
    </table>`;

  cont.querySelectorAll('[data-accion]').forEach(b =>
    b.addEventListener('click', () => {
      const a = animales.find(x => x.id === b.dataset.id);
      if (!a) return;
      if (b.dataset.accion === 'peso') abrirEditarPeso(a);
      else abrirBorrar(a);
    }));
}

const ESTADOS = {
  cargando:      { emoji:'🐄', titulo:'Cargando tu hato…', texto:'Un momento.' },
  vacio:         { emoji:'🐄', titulo:'Tu hato está vacío', texto:'Registra tu primer animal y empieza a llevar el control.', cta:true },
  sinResultados: { emoji:'🔍', titulo:'Ningún animal coincide', texto:'Prueba con otro arete o quita el filtro.' },
  anonimo:       { emoji:'🔒', titulo:'Inicia sesión para ver tu hato', texto:'Tu ganado solo lo ves tú.' },
  error:         { emoji:'⚠️', titulo:'No pudimos cargar tu hato', texto:'Hubo un problema al leer tus animales. Intenta de nuevo.', retry:true },
};

function estado(tipo) {
  const e = ESTADOS[tipo] || ESTADOS.error;
  return `
    <div class="h-estado">
      <span class="h-estado-emoji" aria-hidden="true">${e.emoji}</span>
      <h3>${e.titulo}</h3>
      <p>${e.texto}</p>
      ${e.cta ? '<button type="button" class="btn-verde" id="hatoVacioCta">Registrar mi primer animal</button>' : ''}
      ${e.retry ? '<button type="button" class="btn-verde" id="hatoRetry">Intentar de nuevo</button>' : ''}
    </div>`;
}
function enlazarVacio() {
  document.getElementById('hatoVacioCta')?.addEventListener('click', () => abrirAlta());
  document.getElementById('hatoRetry')?.addEventListener('click', () => iniciarHato(usuario, plan));
}

// ═══════════════════════════════════════════════════════════
// ALTA — individual y por lote
// ═══════════════════════════════════════════════════════════
function abrirAlta() {
  if (bloqueadoPorFree('Registrar y gestionar tu hato es exclusivo de Élite Pecuario.')) return;
  avisoDuplicado = false;
  ['altaNombre', 'altaTag', 'altaRaza', 'altaPeso', 'altaEdad'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('altaAlert').className = 'h-alert';
  document.getElementById('modalAlta').classList.add('active');
  tabAlta('individual');
  document.getElementById('altaNombre')?.focus();
}
function cerrarAlta() {
  document.getElementById('modalAlta').classList.remove('active');
}
function tabAlta(cual) {
  const ind = cual === 'individual';
  document.getElementById('altaTabInd').setAttribute('aria-selected', String(ind));
  document.getElementById('altaTabLote').setAttribute('aria-selected', String(!ind));
  document.getElementById('altaIndividual').classList.toggle('active', ind);
  document.getElementById('altaLote').classList.toggle('active', !ind);
  document.getElementById('altaAlert').className = 'h-alert';
}

async function guardarAnimal() {
  if (bloqueadoPorFree('Registrar y gestionar tu hato es exclusivo de Élite Pecuario.')) return;
  if (!usuario) return;

  const nombre = document.getElementById('altaNombre').value.trim();
  const tipo = document.getElementById('altaTipo').value;
  const tag = document.getElementById('altaTag').value.trim();
  const raza = document.getElementById('altaRaza').value.trim();
  const peso = parseFloat(document.getElementById('altaPeso').value) || null;
  const edad = document.getElementById('altaEdad').value.trim();
  const alert = document.getElementById('altaAlert');

  if (!nombre) {
    alert.textContent = 'Ponle un nombre o apodo.';
    alert.className = 'h-alert h-alert--error show';
    return;
  }

  // MEJORA: avisar de arete repetido. No bloquea — hay rancheros que
  // reusan folios y el que decide es el socio. Al segundo clic, guarda.
  if (tag && !avisoDuplicado) {
    const dup = animales.find(a => String(a.tag || '').trim().toLowerCase() === tag.toLowerCase());
    if (dup) {
      alert.innerHTML = `Ya tienes un animal con el arete <b>${esc(tag)}</b> (${esc(dup.nombre || 'sin nombre')}). Si es a propósito, vuelve a darle a Guardar.`;
      alert.className = 'h-alert h-alert--aviso show';
      avisoDuplicado = true;
      document.getElementById('btnGuardarAnimal').querySelector('span').textContent = 'Guardar de todos modos';
      return;
    }
  }

  const btn = document.getElementById('btnGuardarAnimal');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Guardando...';
  try {
    const { addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    await addDoc(collection(db, 'animales'), {
      userId: usuario.uid,
      nombre, tipo, tag, raza, peso, edad,
      emoji: EMOJI_TIPO[tipo] || '🐾',
      fechaRegistro: serverTimestamp()
    });
    toast(`${nombre} registrado en tu hato 🐄`);
    cerrarAlta();
  } catch (e) {
    console.error('[Hato] Error guardando animal:', e);
    alert.textContent = 'No se pudo guardar. Verifica tu conexión.';
    alert.className = 'h-alert h-alert--error show';
  }
  btn.disabled = false;
  btn.querySelector('span').textContent = 'Guardar animal';
  avisoDuplicado = false;
}

// ── Lote: aretes MX-0001-2026, igual que el viejo ──
function parsearAretes(txt) {
  return String(txt || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
}
function generarAretes() {
  const ta = document.getElementById('loteAretes');
  const actual = parsearAretes(ta.value);
  const anio = new Date().getFullYear();
  let inicio = 1;
  if (actual.length) {
    const m = actual[actual.length - 1].match(/(\d+)/);
    if (m) inicio = parseInt(m[1]) + 1;
  }
  const nuevos = [];
  for (let i = 0; i < 10; i++) nuevos.push(`MX-${String(inicio + i).padStart(4, '0')}-${anio}`);
  ta.value = (ta.value || '') + (actual.length ? '\n' : '') + nuevos.join('\n');
  contarLote();
}
function contarLote() {
  const n = parsearAretes(document.getElementById('loteAretes').value).length;
  const el = document.getElementById('loteContador');
  if (el) el.textContent = `${n} ${n === 1 ? 'arete' : 'aretes'}`;
  return n;
}

async function guardarLote() {
  if (bloqueadoPorFree('Registrar y gestionar tu hato es exclusivo de Élite Pecuario.')) return;
  if (!usuario) return;

  const aretes = parsearAretes(document.getElementById('loteAretes').value);
  const alert = document.getElementById('altaAlert');
  if (!aretes.length) {
    alert.textContent = 'Agrega al menos un arete.';
    alert.className = 'h-alert h-alert--error show';
    return;
  }
  loteDatos = {
    aretes,
    tipo: document.getElementById('loteTipo').value,
    raza: document.getElementById('loteRaza').value.trim(),
    peso: parseFloat(document.getElementById('lotePeso').value) || null,
    edad: document.getElementById('loteEdad').value.trim(),
    upp: document.getElementById('loteUpp').value.trim() || null,
    potrero: document.getElementById('lotePotrero').value.trim() || null
  };

  const repetidos = aretes.filter(t =>
    animales.some(a => String(a.tag || '').trim().toLowerCase() === t.toLowerCase()));

  document.getElementById('clResumen').innerHTML =
    `Vas a registrar <b>${aretes.length}</b> ${aretes.length === 1 ? 'animal' : 'animales'} de tipo
     <b>${esc(LABEL_TIPO[loteDatos.tipo] || loteDatos.tipo)}</b>.` +
    (repetidos.length ? `<br><span class="cl-dup">⚠️ ${repetidos.length} ${repetidos.length === 1 ? 'arete ya existe' : 'aretes ya existen'} en tu hato: ${esc(repetidos.slice(0, 3).join(', '))}${repetidos.length > 3 ? '…' : ''}</span>` : '');
  document.getElementById('clProgressBox').style.display = 'none';
  document.getElementById('clBtnCancel').disabled = false;
  const bc = document.getElementById('clBtnConfirm');
  bc.disabled = false;
  bc.textContent = 'Sí, registrar';
  document.getElementById('modalConfirmLote').classList.add('active');
}

async function confirmarLote() {
  if (!loteDatos || !usuario) return;
  const btnC = document.getElementById('clBtnCancel');
  const btnOk = document.getElementById('clBtnConfirm');
  const box = document.getElementById('clProgressBox');
  const fill = document.getElementById('clProgressFill');
  const cnt = document.getElementById('clProgressCounter');
  btnC.disabled = true;
  btnOk.disabled = true;
  btnOk.textContent = 'Guardando...';
  box.style.display = 'block';

  try {
    const { writeBatch, doc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    const emoji = EMOJI_TIPO[loteDatos.tipo] || '🐾';
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const loteId = `lote-${fecha}-${Date.now().toString(36).slice(-4)}`;
    const TANDA = 100;
    const total = loteDatos.aretes.length;
    let creados = 0;

    for (let i = 0; i < total; i += TANDA) {
      const slice = loteDatos.aretes.slice(i, i + TANDA);
      const batch = writeBatch(db);
      slice.forEach(arete => {
        batch.set(doc(collection(db, 'animales')), {
          userId: usuario.uid,
          nombre: arete,
          tipo: loteDatos.tipo,
          tag: arete,
          raza: loteDatos.raza,
          peso: loteDatos.peso,
          edad: loteDatos.edad,
          emoji,
          upp: loteDatos.upp,
          potrero: loteDatos.potrero,
          loteId,
          fechaRegistro: serverTimestamp()
        });
      });
      await batch.commit();
      creados += slice.length;
      const pct = Math.round((creados / total) * 100);
      fill.style.width = pct + '%';
      cnt.textContent = `${creados} / ${total}`;
    }
    cerrarConfirmLote();
    cerrarAlta();
    toast(`Lote de ${total} animales registrado 📋`);
  } catch (e) {
    console.error('[Hato] Error registrando lote:', e);
    cerrarConfirmLote();
    toast('No se pudo guardar el lote. Verifica tu conexión.');
  }
  loteDatos = null;
}
function cerrarConfirmLote() {
  document.getElementById('modalConfirmLote').classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// MEJORA 1 · EDITAR PESO
// updateDoc de `peso` + evento en `eventos`. No toca userId
// (las reglas exigen que el dueño siga siendo el mismo) ni el
// resto del documento: el animal y su historial sobreviven.
// ═══════════════════════════════════════════════════════════
function abrirEditarPeso(a) {
  if (bloqueadoPorFree('Registrar y gestionar tu hato es exclusivo de Élite Pecuario.')) return;
  editando = a;
  const actual = num(a.peso);
  document.getElementById('epAnimal').innerHTML =
    `${esc(a.emoji || '🐾')} <b>${esc(a.nombre || 'Sin nombre')}</b>${a.tag ? ` · ${esc(a.tag)}` : ''}`;
  document.getElementById('epActual').textContent = actual > 0 ? `${actual} kg` : 'sin peso capturado';
  const inp = document.getElementById('epNuevo');
  inp.value = actual > 0 ? actual : '';
  document.getElementById('epAlert').className = 'h-alert';
  document.getElementById('modalPeso').classList.add('active');
  inp.focus();
  inp.select();
}
function cerrarEditarPeso() {
  document.getElementById('modalPeso').classList.remove('active');
  editando = null;
}

async function guardarPeso() {
  if (!editando || !usuario) return;
  const alert = document.getElementById('epAlert');
  const nuevo = parseFloat(document.getElementById('epNuevo').value);

  if (!isFinite(nuevo) || nuevo <= 0) {
    alert.textContent = 'Escribe un peso mayor que cero.';
    alert.className = 'h-alert h-alert--error show';
    return;
  }
  const anterior = num(editando.peso);
  if (anterior === nuevo) { cerrarEditarPeso(); return; }

  const btn = document.getElementById('btnGuardarPeso');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Guardando...';
  try {
    const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    // La pesada queda registrada con la misma forma de evento que usa
    // el portal actual: {tipo, nota, fecha, costo, creado} + un `id`
    // propio (el viejo no lo escribe ni lo necesita, pero lo ignora sin
    // problema — Bitácora lo usa para borrar sin ambigüedad).
    const evento = {
      id: generarIdEvento(),
      tipo: 'peso',
      nota: anterior > 0
        ? `Peso actualizado: ${anterior} kg → ${nuevo} kg`
        : `Peso capturado: ${nuevo} kg`,
      fecha: hoyISO(),
      costo: 0,
      creado: Date.now()
    };
    await updateDoc(doc(db, 'animales', editando.id), {
      peso: nuevo,
      eventos: arrayUnion(evento)
    });
    toast(anterior > 0 ? `Peso actualizado a ${nuevo} kg ⚖️` : `Peso capturado: ${nuevo} kg ⚖️`);
    cerrarEditarPeso();
  } catch (e) {
    console.error('[Hato] Error guardando peso:', e);
    alert.textContent = 'No se pudo guardar el peso. Intenta de nuevo.';
    alert.className = 'h-alert h-alert--error show';
  }
  btn.disabled = false;
  btn.querySelector('span').textContent = 'Guardar peso';
}

// ═══════════════════════════════════════════════════════════
// BORRAR — definitivo, sin papelera. Se dice con todas sus letras.
// ═══════════════════════════════════════════════════════════
function abrirBorrar(a) {
  if (bloqueadoPorFree('Registrar y gestionar tu hato es exclusivo de Élite Pecuario.')) return;
  borrando = a;
  const nEventos = Array.isArray(a.eventos) ? a.eventos.length : 0;
  document.getElementById('cbAnimal').innerHTML =
    `${esc(a.emoji || '🐾')} <b>${esc(a.nombre || 'Sin nombre')}</b>${a.tag ? ` · ${esc(a.tag)}` : ''}`;
  document.getElementById('cbDetalle').innerHTML =
    `Se elimina el animal${nEventos ? ` y sus <b>${nEventos}</b> ${nEventos === 1 ? 'evento de historial' : 'eventos de historial'}` : ''}.
     <b>No hay papelera: esto no se puede deshacer.</b>`;
  const btn = document.getElementById('cbBtnDel');
  btn.disabled = false;
  btn.textContent = 'Sí, eliminar';
  document.getElementById('cbBtnCancel').disabled = false;
  document.getElementById('modalBorrar').classList.add('active');
}
function cerrarBorrar() {
  document.getElementById('modalBorrar').classList.remove('active');
  borrando = null;
}

async function confirmarBorrar() {
  if (!borrando) return;
  const btn = document.getElementById('cbBtnDel');
  const btnC = document.getElementById('cbBtnCancel');
  btn.disabled = true;
  btnC.disabled = true;
  btn.textContent = 'Eliminando...';
  const nombre = borrando.nombre || '';
  try {
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    await deleteDoc(doc(db, 'animales', borrando.id));
    cerrarBorrar();
    toast(`"${nombre}" eliminado del hato 🗑️`);
  } catch (e) {
    console.error('[Hato] Error al eliminar:', e);
    cerrarBorrar();
    toast('No se pudo eliminar. Intenta de nuevo.');
  }
}

// ═══════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════
export function iniciarHato(user, planUsuario) {
  usuario = user || null;
  plan = planUsuario || 'free';
  const cont = document.getElementById('hatoTabla');
  if (!cont) return;

  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }

  if (!usuario) {
    cont.innerHTML = estado('anonimo');
    return;
  }
  cont.innerHTML = estado('cargando');

  // Solo el hato del socio: nunca se leen animales de otros.
  const q = query(collection(db, 'animales'), where('userId', '==', usuario.uid));
  unsub = onSnapshot(q, (snap) => {
    animales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Igual que el portal actual: se comparte para que otras
    // herramientas (Casco, Predicción) reutilicen el hato ya cargado.
    window.__rancho = window.__rancho || {};
    window.__rancho.animales = animales;
    pintarStats();
    pintarFiltros();
    pintarTabla();
  }, (err) => {
    console.warn('[Hato] Error leyendo animales:', err.code || err);
    animales = [];
    cont.innerHTML = estado(err.code === 'permission-denied' ? 'anonimo' : 'error');
    enlazarVacio();
  });
}

// ── Listeners del shell (una sola vez) ──
export function montarHato() {
  document.getElementById('hatoBuscar')?.addEventListener('input', (e) => {
    busqueda = e.target.value;
    pintarTabla();
  });
  document.getElementById('btnAltaAnimal')?.addEventListener('click', () => abrirAlta());
  document.getElementById('altaCerrar')?.addEventListener('click', cerrarAlta);
  document.getElementById('altaTabInd')?.addEventListener('click', () => tabAlta('individual'));
  document.getElementById('altaTabLote')?.addEventListener('click', () => tabAlta('lote'));
  document.getElementById('btnGuardarAnimal')?.addEventListener('click', guardarAnimal);
  document.getElementById('btnGuardarLote')?.addEventListener('click', guardarLote);
  document.getElementById('loteGenerar')?.addEventListener('click', generarAretes);
  document.getElementById('loteAretes')?.addEventListener('input', contarLote);
  document.getElementById('clBtnCancel')?.addEventListener('click', cerrarConfirmLote);
  document.getElementById('clBtnConfirm')?.addEventListener('click', confirmarLote);
  document.getElementById('epCerrar')?.addEventListener('click', cerrarEditarPeso);
  document.getElementById('btnGuardarPeso')?.addEventListener('click', guardarPeso);
  document.getElementById('cbBtnCancel')?.addEventListener('click', cerrarBorrar);
  document.getElementById('cbBtnDel')?.addEventListener('click', confirmarBorrar);

  // Cerrar modales al hacer clic fuera
  ['modalAlta', 'modalPeso', 'modalBorrar'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
    });
  });
  // El arete duplicado vuelve a avisar si el socio lo cambia
  document.getElementById('altaTag')?.addEventListener('input', () => {
    if (!avisoDuplicado) return;
    avisoDuplicado = false;
    document.getElementById('altaAlert').className = 'h-alert';
    document.getElementById('btnGuardarAnimal').querySelector('span').textContent = 'Guardar animal';
  });
}
