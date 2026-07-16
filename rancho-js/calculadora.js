// ═══════════════════════════════════════════════════════════
// CALCULADORA DE RENTABILIDAD · todo del formulario, sin Firestore
// Misma aritmética que el portal actual (index.html:15369).
//
// Dos cosas del viejo que NO se replican, a propósito:
//  1. precioOficialPorTipo() intenta leer window.MERCADO para usar
//     precios "en vivo". Esa variable es un `let` dentro de un <script>
//     clásico, así que nunca es propiedad de window: la rama está muerta
//     y el viejo siempre usa el precio fijo. Aquí se usa el precio de
//     referencia directo — sin puente latente hacia los simulados.
//  2. El prellenado se etiquetaba "(SIAP: $X/kg)". Es falso: ese número
//     no viene del SIAP, es una constante. Ahora se dice lo que es.
//
// El precio es solo un prellenado: el socio lo sobrescribe y el cálculo
// usa lo que él teclee.
// ═══════════════════════════════════════════════════════════

// MXN/kg en pie por tipo. Mismos valores que TIPO_ANIMAL_INFO del viejo:
// snapshot de ene-2026, no cotización viva.
const PRECIO_REF = {
  vaca: 41, toro: 88, becerro: 78, cerdo: 51,
  oveja: 78, cabra: 65, caballo: 88, pollo: 47
};
const PRECIO_REF_FECHA = 'enero 2026';
const PRECIO_REF_ETIQUETA = 'Estimado promedio nacional';

const LABEL_TIPO = {
  vaca: '🐄 Vaca', toro: '🐂 Toro', becerro: '🐃 Becerro', cerdo: '🐖 Cerdo',
  oveja: '🐑 Oveja', cabra: '🐐 Cabra', caballo: '🐎 Caballo', pollo: '🐔 Pollo'
};

let plan = 'free';
const mxn = n => '$' + Math.round(n).toLocaleString('es-MX');

function bloqueadoPorFree() {
  if (plan === 'vip') return false;
  if (typeof window.abrirModalVIP === 'function') {
    window.abrirModalVIP('La Calculadora de Rentabilidad es exclusiva de Élite Pecuario.');
  }
  return true;
}
function avisar(txt) {
  const el = document.getElementById('calcAlert');
  if (!el) return;
  el.textContent = txt;
  el.className = 'h-alert h-alert--aviso show';
}
function limpiarAviso() {
  const el = document.getElementById('calcAlert');
  if (el) el.className = 'h-alert';
}

function pintarTipos() {
  const sel = document.getElementById('calcTipo');
  if (!sel || sel.options.length) return;
  sel.innerHTML = Object.entries(LABEL_TIPO)
    .map(([id, l]) => `<option value="${id}">${l}</option>`).join('');
}

// Prellena el precio del tipo elegido, sin pisar lo que el socio ya escribió.
function sugerirPrecio(forzar = false) {
  const tipo = document.getElementById('calcTipo').value;
  const precio = PRECIO_REF[tipo] || 0;
  const inp = document.getElementById('calcPrecio');
  if (inp && (forzar || !inp.value)) inp.value = precio;
  const hint = document.getElementById('calcPrecioHint');
  if (hint) {
    hint.innerHTML = `Referencia: <b>${mxn(precio)}/kg</b> · ${PRECIO_REF_ETIQUETA}, ${PRECIO_REF_FECHA}. Cámbialo por tu precio real.`;
  }
}

function calcular() {
  if (bloqueadoPorFree()) return;
  limpiarAviso();

  const val = id => parseFloat(document.getElementById(id).value) || 0;
  const pesoVenta = val('calcPeso');
  const precioVenta = val('calcPrecio');
  const dias = val('calcDias');
  const costoCompra = val('calcCompra');
  const costoDia = val('calcCostoDia');
  const costoSanidad = val('calcSanidad');
  const costoOtros = val('calcOtros');

  if (!pesoVenta || !precioVenta || !dias) {
    avisar('Completa al menos peso de venta, precio y días.');
    return;
  }

  // Misma aritmética que index.html:15385
  const ingreso = pesoVenta * precioVenta;
  const costoAlim = costoDia * dias;
  const costoTotal = costoCompra + costoAlim + costoSanidad + costoOtros;
  const utilidad = ingreso - costoTotal;
  const margen = ingreso ? (utilidad / ingreso) * 100 : 0;
  const roi = costoTotal ? (utilidad / costoTotal) * 100 : 0;
  const utilidadDia = dias ? utilidad / dias : 0;
  const precioMinimo = pesoVenta ? costoTotal / pesoVenta : 0;
  const gana = utilidad >= 0;

  const cont = document.getElementById('calcResultado');
  cont.style.display = 'block';
  cont.innerHTML = `
    <div class="calc-hero calc-hero--${gana ? 'gana' : 'pierde'}">
      <span class="calc-hero-lbl">${gana ? '✅ GANANCIA NETA' : '❌ PÉRDIDA'}</span>
      <b>${mxn(utilidad)}</b>
      <span class="calc-hero-sub">${gana ? 'Ganas' : 'Pierdes'} <b>$${Math.abs(utilidadDia).toFixed(2)}</b> por día</span>
    </div>
    <div class="pr-stats">
      <div class="pr-stat"><span class="pr-s-ico">💵</span><span class="pr-s-lbl">Ingreso</span><b>${mxn(ingreso)}</b></div>
      <div class="pr-stat"><span class="pr-s-ico">💸</span><span class="pr-s-lbl">Costo total</span><b>${mxn(costoTotal)}</b></div>
      <div class="pr-stat"><span class="pr-s-ico">📊</span><span class="pr-s-lbl">Margen</span><b>${margen.toFixed(1)}%</b></div>
      <div class="pr-stat"><span class="pr-s-ico">📈</span><span class="pr-s-lbl">ROI</span><b>${roi.toFixed(1)}%</b></div>
      <div class="pr-stat"><span class="pr-s-ico">⚖️</span><span class="pr-s-lbl">Costo por kg</span><b>${mxn(precioMinimo)}</b></div>
      <div class="pr-stat"><span class="pr-s-ico">🎯</span><span class="pr-s-lbl">Precio mínimo para no perder</span><b>${mxn(precioMinimo)}<small>/kg</small></b></div>
    </div>
    <p class="pr-fuente">
      Cálculo hecho con <b>tus</b> números. El precio prellenado es un ${PRECIO_REF_ETIQUETA.toLowerCase()}
      de ${PRECIO_REF_FECHA}, no una cotización: confirma con tu comprador o rastro.
    </p>`;
  cont.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function iniciarCalculadora(planUsuario) {
  plan = planUsuario || 'free';
  pintarTipos();
  sugerirPrecio();
}

export function montarCalculadora() {
  document.getElementById('calcTipo')?.addEventListener('change', () => sugerirPrecio(true));
  document.getElementById('btnCalcular')?.addEventListener('click', calcular);
}
