// ═══════════════════════════════════════════════════════════
// PREDICCIÓN DE VENTA ÓPTIMA · calculadora de engorda
// Todo cliente: constantes zootécnicas + lo que captura el socio.
// El hato sale de window.__rancho.animales (lo carga hato.js);
// no se vuelve a consultar Firestore.
//
// Dos cosas del portal actual que NO se replican, a propósito:
//  1. El encabezado "Algoritmo basado en SIAP-SADER" es falso: el
//     algoritmo no consulta SIAP jamás.
//  2. obtenerPrecioMercado() intenta leer window.__rancho.preciosMercado
//     para usar precios "en vivo". Esa variable nunca se asigna, así
//     que la rama está muerta y el viejo siempre usa el precio fijo.
//     Aquí se usa el precio de referencia directo: sin puente latente
//     hacia los precios simulados del Mercado, y con su fecha a la vista.
// ═══════════════════════════════════════════════════════════

// Datos zootécnicos por especie (NRC, FAO, INIFAP) — iguales al portal actual.
// `precioRef` = el `precioFallback` del viejo: MXN/kg (o /litro) en pie.
const ESPECIES = {
  'bovino-engorda': {
    nombre: 'Bovino - Engorda', emoji: '🐄',
    pesoMin: 380, pesoOptimo: 480, pesoMax: 550,
    gananciaDiaria: 1.1, precioRef: 89, unidad: 'kg',
    tipMercado: 'Mejor precio en feb-jun (cuaresma y temporada seca)'
  },
  'bovino-lechero': {
    nombre: 'Bovino - Lechero (lt/día)', emoji: '🐮',
    pesoMin: 450, pesoOptimo: 600, pesoMax: 700,
    gananciaDiaria: 0, precioRef: 11, unidad: 'litro/día',
    tipMercado: 'Vaca productiva da 20-25 lt/día durante lactancia (305 días)'
  },
  'porcino': {
    nombre: 'Porcino', emoji: '🐖',
    pesoMin: 90, pesoOptimo: 110, pesoMax: 130,
    gananciaDiaria: 0.85, precioRef: 56, unidad: 'kg',
    tipMercado: 'Pico de demanda en diciembre (Navidad/posadas)'
  },
  'ovino': {
    nombre: 'Ovino (borrego)', emoji: '🐑',
    pesoMin: 30, pesoOptimo: 42, pesoMax: 55,
    gananciaDiaria: 0.25, precioRef: 72, unidad: 'kg',
    tipMercado: 'Mejor precio en barbacoa (todo el año, picos en festividades)'
  },
  'caprino': {
    nombre: 'Caprino (cabra)', emoji: '🐐',
    pesoMin: 25, pesoOptimo: 35, pesoMax: 45,
    gananciaDiaria: 0.18, precioRef: 68, unidad: 'kg',
    tipMercado: 'Demanda fuerte en regiones del norte para cabrito'
  },
  'aviar-pollo': {
    nombre: 'Aviar - Pollo engorda', emoji: '🐔',
    pesoMin: 1.8, pesoOptimo: 2.5, pesoMax: 3.0,
    gananciaDiaria: 0.055, precioRef: 65, unidad: 'kg',
    tipMercado: 'Ciclos cortos de 42-49 días'
  },
  'aviar-postura': {
    nombre: 'Aviar - Postura', emoji: '🥚',
    pesoMin: 1.5, pesoOptimo: 1.9, pesoMax: 2.2,
    gananciaDiaria: 0, precioRef: 42, unidad: 'kg huevo/mes',
    tipMercado: 'Gallina productiva pone 25-28 huevos/mes durante 1-2 años'
  },
  'equino': {
    nombre: 'Equino', emoji: '🐎',
    pesoMin: 350, pesoOptimo: 450, pesoMax: 600,
    gananciaDiaria: 0.4, precioRef: 45, unidad: 'kg',
    tipMercado: 'Caballos finos pueden valer 10x más que precio de carne'
  }
};

// Los precioRef son un snapshot: hay que decir de cuándo, no darlos por vivos.
const PRECIO_REF_FECHA = 'enero 2026';
const PRECIO_REF_ETIQUETA = 'Estimado promedio nacional';

let plan = 'free';
let seleccionado = null;

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
const mxn = n => '$' + Math.round(n).toLocaleString('es-MX');

// Gate Élite del cliente, igual que el portal actual (bloquearAccionVIP).
// Las reglas solo piden autenticado(); esto no es seguridad, es producto. Ver BL01.
function bloqueadoPorFree() {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') {
    window.abrirModalVIP('La Predicción de Venta Óptima es exclusiva de Élite Pecuario.');
  }
  return true;
}

// Adivina la especie desde los datos del animal.
//
// CAMBIO vs el portal actual (index.html:17831), el único de comportamiento.
// El viejo encadena `especie || tipo || raza`: en cuanto hay `tipo`, la raza
// NUNCA se mira. Una Holstein registrada como tipo:'vaca' caía en engorda y
// se le calculaba una engorda que esa vaca no va a hacer.
//
// Aquí el `tipo` manda para la FAMILIA (es un selector controlado en Mi Hato,
// el dato más confiable) y la raza/nombre solo REFINAN dentro de la familia:
// bovino → lechero vs engorda, ave → postura vs pollo de engorda.
// Concatenar los cuatro campos a secas no servía: como 'lechero' se evalúa
// primero, un cerdo llamado "La Lechera" habría caído en bovino-lechero.
// Sin `tipo` se cae a la heurística por texto del viejo.
const RE_LECHERA = /leche|lechera|holstein|jersey|suiz|pardo|gyr|girolando/;
const RE_POSTURA = /postura|ponedora|gallina|huevo/;

function detectarEspecie(animal) {
  const tipo = String(animal.tipo || '').toLowerCase().trim();
  const texto = [animal.especie, animal.tipo, animal.raza, animal.nombre]
    .filter(Boolean).join(' ').toLowerCase();

  if (tipo) {
    // La vaca puede ser lechera; el toro y el becerro son de engorda
    // aunque sean de una raza lechera.
    if (tipo === 'vaca') return RE_LECHERA.test(texto) ? 'bovino-lechero' : 'bovino-engorda';
    if (tipo === 'toro' || tipo === 'becerro') return 'bovino-engorda';
    if (tipo === 'cerdo') return 'porcino';
    if (tipo === 'oveja') return 'ovino';
    if (tipo === 'cabra') return 'caprino';
    if (tipo === 'caballo') return 'equino';
    if (tipo === 'pollo') return RE_POSTURA.test(texto) ? 'aviar-postura' : 'aviar-pollo';
  }

  // Sin tipo: heurística por texto, igual que el viejo.
  if (RE_LECHERA.test(texto)) return 'bovino-lechero';
  if (/porcin|cerdo|puerco|marrano|cochi/.test(texto)) return 'porcino';
  if (/ovino|borrego|oveja|cordero/.test(texto)) return 'ovino';
  if (/caprino|cabra|chivo|cabrito/.test(texto)) return 'caprino';
  if (RE_POSTURA.test(texto)) return 'aviar-postura';
  if (/pollo|ave|aviar/.test(texto)) return 'aviar-pollo';
  if (/equino|caballo|yegua|potro/.test(texto)) return 'equino';
  return 'bovino-engorda';
}

// ═══════════════════════════════════════════════════════════
// EL ALGORITMO — misma aritmética que index.html:17944
// ═══════════════════════════════════════════════════════════
function calcular(especie, pesoActual, costoDia) {
  const cfg = ESPECIES[especie];
  const precio = cfg.precioRef;

  // Lechero y postura no engordan: viven de producción continua.
  if (especie === 'bovino-lechero' || especie === 'aviar-postura') {
    return {
      cfg, precio, productivo: true,
      diasParaOptimo: 0, ingresoActual: 0, ingresoOptimo: 0, ganancia: 0, gastoAlimento: 0,
      tipo: 'vender', tag: '💡 USO PRODUCTIVO',
      titulo: 'Animal productivo (no engorda)',
      desc: `Este tipo de animal genera ingresos por producción continua, no por venta única. ${cfg.tipMercado}`
    };
  }

  const ingresoActual = pesoActual * precio;

  if (pesoActual >= cfg.pesoOptimo) {
    const sobrepasado = pesoActual > cfg.pesoMax;
    return {
      cfg, precio, productivo: false,
      diasParaOptimo: 0, ingresoActual, ingresoOptimo: ingresoActual,
      ganancia: 0, gastoAlimento: 0,
      tipo: sobrepasado ? 'alerta' : 'vender',
      tag: sobrepasado ? '⚠️ VENDE YA' : '🎯 VENTA RECOMENDADA',
      titulo: sobrepasado ? '¡Animal sobrepasado!' : '¡Listo para vender!',
      desc: sobrepasado
        ? `Tu animal ya rebasó el peso máximo óptimo (${cfg.pesoMax}${cfg.unidad}). Cada día extra son pérdidas por costo de alimento sin ganancia significativa. Véndelo cuanto antes.`
        : `Tu animal alcanzó el peso óptimo de venta. ${cfg.tipMercado}`
    };
  }

  // Falta engorda
  const diasParaOptimo = Math.ceil((cfg.pesoOptimo - pesoActual) / cfg.gananciaDiaria);
  const ingresoOptimo = cfg.pesoOptimo * precio;
  const gastoAlimento = costoDia * diasParaOptimo;
  const ganancia = ingresoOptimo - ingresoActual - gastoAlimento;

  if (diasParaOptimo > 365) {
    return {
      cfg, precio, productivo: false, diasParaOptimo, ingresoActual, ingresoOptimo, ganancia, gastoAlimento,
      tipo: 'alerta', tag: '⚠️ TARDARÁ MUCHO',
      titulo: 'Engorda lenta detectada',
      desc: `Para llegar al peso óptimo te faltarían ${diasParaOptimo} días (${Math.round(diasParaOptimo / 30)} meses). Considera revisar nutrición o vender antes.`
    };
  }
  if (ganancia <= 0) {
    return {
      cfg, precio, productivo: false, diasParaOptimo, ingresoActual, ingresoOptimo, ganancia, gastoAlimento,
      tipo: 'alerta', tag: '⚠️ NO ES RENTABLE',
      titulo: 'Mejor vende ahora',
      desc: `Si engordas más, el costo de alimento (${mxn(gastoAlimento)}) supera la ganancia esperada. Véndelo en su peso actual.`
    };
  }
  const fecha = new Date(Date.now() + diasParaOptimo * 86400000)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    cfg, precio, productivo: false, diasParaOptimo, ingresoActual, ingresoOptimo, ganancia, gastoAlimento,
    tipo: 'esperar', tag: '✅ ESPERA Y GANA',
    titulo: `Vende en ${diasParaOptimo} días`,
    desc: `Si engordas hasta ${cfg.pesoOptimo}${cfg.unidad} (estimado: ${fecha}), tu ganancia neta será de ${mxn(ganancia)} MXN.`
  };
}

// ═══════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════
function pintarEspecies() {
  const sel = document.getElementById('predEspecie');
  if (!sel || sel.options.length) return;
  sel.innerHTML = Object.entries(ESPECIES)
    .map(([id, c]) => `<option value="${id}">${c.emoji} ${esc(c.nombre)}</option>`).join('');
}

function actualizarRangos() {
  const cfg = ESPECIES[document.getElementById('predEspecie').value];
  if (!cfg) return;
  const hint = document.getElementById('predRangoHint');
  if (hint) {
    hint.textContent = cfg.gananciaDiaria > 0
      ? `Óptimo de venta: ${cfg.pesoOptimo}${cfg.unidad} · máximo ${cfg.pesoMax}${cfg.unidad} · engorda ${cfg.gananciaDiaria} kg/día`
      : `${cfg.tipMercado}`;
  }
  const inp = document.getElementById('predPeso');
  if (inp && !inp.value) inp.placeholder = String(cfg.pesoMin);
}

// Los animales salen del hato ya cargado en memoria por hato.js.
export function pintarAnimalesPrediccion() {
  const cont = document.getElementById('predAnimales');
  if (!cont) return;
  const animales = (window.__rancho && window.__rancho.animales) || [];

  if (!animales.length) {
    cont.innerHTML = `<p class="pr-vacio">Aún no tienes animales en tu hato.
      <button type="button" class="h-link" id="predIrHato">Ir a Mi Hato →</button></p>`;
    document.getElementById('predIrHato')?.addEventListener('click', () => { location.hash = 'hato'; });
    return;
  }

  cont.innerHTML = animales.map(a => {
    const peso = num(a.peso);
    return `
      <button type="button" class="pr-animal${seleccionado === a.id ? ' active' : ''}" data-id="${esc(a.id)}">
        <span class="pr-a-emoji">${esc(a.emoji || '🐾')}</span>
        <span class="pr-a-txt">
          <strong>${esc(a.nombre || 'Sin nombre')}</strong>
          <small>${peso > 0 ? peso + ' kg' : 'sin peso'}${a.tag ? ' · ' + esc(a.tag) : ''}</small>
        </span>
      </button>`;
  }).join('');

  cont.querySelectorAll('[data-id]').forEach(b =>
    b.addEventListener('click', () => seleccionarAnimal(b.dataset.id)));
}

function seleccionarAnimal(id) {
  const animales = (window.__rancho && window.__rancho.animales) || [];
  const a = animales.find(x => x.id === id);
  if (!a) return;

  if (bloqueadoPorFree()) return;

  seleccionado = id;
  const especie = detectarEspecie(a);
  document.getElementById('predEspecie').value = especie;
  actualizarRangos();

  const peso = num(a.peso);
  const inpPeso = document.getElementById('predPeso');
  if (peso > 0) inpPeso.value = peso;
  else inpPeso.value = '';

  const edad = num(a.edad);
  if (edad > 0) document.getElementById('predEdad').value = edad;

  pintarAnimalesPrediccion();

  if (peso > 0) analizar();
  else {
    avisar(`${a.nombre || 'Ese animal'} no tiene peso capturado. Escríbelo aquí o captúralo en Mi Hato.`);
    inpPeso.focus();
  }
}

function avisar(txt) {
  const el = document.getElementById('predAlert');
  if (!el) return;
  el.textContent = txt;
  el.className = 'h-alert h-alert--aviso show';
}
function limpiarAviso() {
  const el = document.getElementById('predAlert');
  if (el) el.className = 'h-alert';
}

function analizar() {
  if (bloqueadoPorFree()) return;
  limpiarAviso();

  const especie = document.getElementById('predEspecie').value;
  const pesoActual = parseFloat(document.getElementById('predPeso').value) || 0;
  const costoDia = parseFloat(document.getElementById('predCosto').value) || 0;

  if (!pesoActual) { avisar('Escribe el peso actual del animal.'); return; }

  const r = calcular(especie, pesoActual, costoDia);
  const cont = document.getElementById('predResultado');

  // Las tarjetas del viejo: peso, días, precio y ganancia/ingreso.
  const tarjetas = r.productivo ? '' : `
    <div class="pr-stats">
      <div class="pr-stat">
        <span class="pr-s-ico">⚖️</span>
        <span class="pr-s-lbl">Peso actual</span>
        <b>${pesoActual}${r.cfg.unidad}</b>
      </div>
      <div class="pr-stat">
        <span class="pr-s-ico">📅</span>
        <span class="pr-s-lbl">Días para óptimo</span>
        <b>${r.diasParaOptimo > 0 ? r.diasParaOptimo : 'Hoy'}</b>
      </div>
      <div class="pr-stat">
        <span class="pr-s-ico">💵</span>
        <span class="pr-s-lbl">Precio de referencia</span>
        <b>${mxn(r.precio)}<small>/${r.cfg.unidad.replace('/día', '')}</small></b>
      </div>
      <div class="pr-stat">
        <span class="pr-s-ico">💰</span>
        <span class="pr-s-lbl">${r.ganancia > 0 ? 'Ganancia esperada' : 'Ingreso actual'}</span>
        <b>${mxn(r.ganancia > 0 ? r.ganancia : r.ingresoActual)}</b>
      </div>
    </div>`;

  cont.style.display = 'block';
  cont.innerHTML = `
    <div class="pr-veredicto pr-veredicto--${r.tipo}">
      <span class="pr-tag">${r.tag}</span>
      <h2>${esc(r.titulo)}</h2>
      <p>${esc(r.desc)}</p>
    </div>
    ${tarjetas}
    <p class="pr-fuente">
      Fuente del precio: <b>${PRECIO_REF_ETIQUETA}</b> · referencia de ${PRECIO_REF_FECHA}.
      No es una cotización de venta: confirma el precio del día con tu comprador o rastro.
    </p>
    ${r.cfg.tipMercado && !r.productivo ? `<p class="pr-tip">💡 ${esc(r.cfg.tipMercado)}</p>` : ''}`;
  cont.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ═══════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════
export function iniciarPrediccion(planUsuario) {
  plan = planUsuario || 'free';
  pintarEspecies();
  actualizarRangos();
  pintarAnimalesPrediccion();
  const nota = document.getElementById('predNotaPrecio');
  if (nota) {
    nota.textContent = `Los precios de referencia son un estimado promedio nacional de ${PRECIO_REF_FECHA}, no una cotización viva.`;
  }
}

export function montarPrediccion() {
  document.getElementById('predEspecie')?.addEventListener('change', () => {
    seleccionado = null;
    actualizarRangos();
    pintarAnimalesPrediccion();
  });
  document.getElementById('btnAnalizar')?.addEventListener('click', analizar);
}
