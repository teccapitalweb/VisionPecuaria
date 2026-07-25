// ═══════════════════════════════════════════════════════════
// EL CASCO · pantalla de inicio
// Datos reales: conteo del hato, certificados y cursos (Firestore).
// El precio de referencia (#statPrecioRef) ya no es placeholder:
// lo llena rancho-js/mercado.js con el estimado del becerro engorda.
// ═══════════════════════════════════════════════════════════
import { db, collection, query, where, getDocs } from './firebase.js';

// Saludo según hora — misma lógica que el portal actual
export function pintarSaludo(user) {
  const nombre = user.displayName || (user.email || '').split('@')[0];
  const h = new Date().getHours();
  let saludo = 'Buenos días', emoji = '☀️', subtitle = 'Empieza el día revisando tu hato';
  if (h >= 12 && h < 19) {
    saludo = 'Buenas tardes'; emoji = '🌤️';
    subtitle = 'Buen momento para checar precios del mercado';
  } else if (h >= 19 || h < 5) {
    saludo = 'Buenas noches'; emoji = '🌙';
    subtitle = 'Cierra el día con un curso de la Biblioteca';
  }
  const primerNombre = nombre.split(' ')[0];
  document.getElementById('greeting').innerHTML =
    `${saludo}, <span class="greet-name"></span> ${emoji}`;
  document.querySelector('#greeting .greet-name').textContent = primerNombre;
  document.getElementById('greetingSub').textContent = subtitle;
}

async function contar(colName, filtrarPorUser, uid) {
  try {
    const ref = filtrarPorUser
      ? query(collection(db, colName), where('userId', '==', uid))
      : collection(db, colName);
    const snap = await getDocs(ref);
    return snap.size;
  } catch (e) {
    console.warn(`No se pudo contar ${colName}:`, e.code || e);
    return null;
  }
}

export async function pintarStats(user) {
  // Reales
  const [hato, certs, cursos] = await Promise.all([
    contar('animales', true, user.uid),
    contar('certificados', true, user.uid),
    contar('cursos', false)
  ]);
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val === null ? '—' : val);
  };
  set('statHato', hato);
  set('statCerts', certs);
  set('statCursos', cursos);
  // #statPrecioRef lo pinta mercado.js cuando llega el snapshot de `mercado`.
}
