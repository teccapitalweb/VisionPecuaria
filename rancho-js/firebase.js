// ═══════════════════════════════════════════════════════════
// EL RANCHO DIGITAL · Firebase + auth
// Réplica EXACTA de la lógica del portal actual (index.html):
// misma config, mismo anti-bucle, misma detección Élite.
// ═══════════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, signInWithCredential, GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQXkIo-BWPIeLZzHeTMN986WMDn0TrTJU",
  authDomain: "visionpecuaria-vip.firebaseapp.com",
  projectId: "visionpecuaria-vip",
  storageBucket: "visionpecuaria-vip.firebasestorage.app",
  messagingSenderId: "978318807782",
  appId: "1:978318807782:web:626e67bb30795c15b02127"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { doc, getDoc, collection, query, where, getDocs };

export async function cerrarSesion() {
  await signOut(auth);
  window.location.href = 'login.html';
}

// ── Autologin por hash (cross-domain desde la landing) ──
//   #a= → email+password · #g= → credential de Google · #f= → informativo
async function procesarHashAutologin(setBootStatus) {
  const hash = window.location.hash;
  if (!hash) return false;

  const mG = hash.match(/g=([^&]+)/);
  if (mG) {
    try {
      const data = JSON.parse(decodeURIComponent(atob(mG[1])));
      if (!data.g || !data.t) return false;
      if (Date.now() - data.t > 5 * 60 * 1000) return false;
      setBootStatus('Reconociendo tu sesión de Google...');
      await signInWithCredential(auth, GoogleAuthProvider.credential(data.g));
      history.replaceState(null, '', window.location.pathname);
      return true;
    } catch (e) { console.error('[AutoLogin] Hash Google falló:', e.code || e.message); }
  }

  if (hash.includes('a=')) {
    const m = hash.match(/a=([^&]+)/);
    if (m) {
      try {
        const data = JSON.parse(decodeURIComponent(atob(m[1])));
        if (!data.e || !data.p || !data.t) return false;
        if (Date.now() - data.t > 5 * 60 * 1000) return false;
        setBootStatus('Reconociendo tu sesión...');
        await signInWithEmailAndPassword(auth, data.e, data.p);
        history.replaceState(null, '', window.location.pathname);
        return true;
      } catch (e) { console.error('[AutoLogin] Email/pass falló:', e.code || e.message); }
    }
  }

  if (hash.includes('f=')) history.replaceState(null, '', window.location.pathname);
  return false;
}

// ── Detección Élite (idéntica al portal): doc miembros/{uid} ──
async function detectarPlan(user) {
  try {
    const snapM = await getDoc(doc(db, 'miembros', user.uid));
    if (snapM.exists()) {
      const m = snapM.data();
      const activoNormal = m.estado === 'activo';
      let activoCancelado = false;
      if (m.cancelado === true && m.fechaFin) {
        let ff;
        if (m.fechaFin?.toDate) ff = m.fechaFin.toDate();
        else if (typeof m.fechaFin === 'string') ff = new Date(m.fechaFin);
        else if (m.fechaFin?.seconds) ff = new Date(m.fechaFin.seconds * 1000);
        else ff = new Date(m.fechaFin);
        activoCancelado = ff && !isNaN(ff.getTime()) && ff > new Date();
      }
      if (activoNormal || activoCancelado) return { plan: 'vip', miembro: m };
      return { plan: 'free', miembro: m };
    }
  } catch (e) { console.warn('No se pudo verificar VIP:', e.code || e); }
  return { plan: 'free', miembro: null };
}

// ── Arranque de auth con anti-bucle (idéntico al portal):
//    ignora el primer null 4s (8s si llegó hash de autologin);
//    sin sesión → login.html?logout=1
export async function initAuth({ setBootStatus, onUser }) {
  setBootStatus('Verificando sesión...');
  const hashOk = await procesarHashAutologin(setBootStatus);
  let authProcessed = false;

  onAuthStateChanged(auth, async (user) => {
    if (authProcessed && !user) return;

    if (user) {
      authProcessed = true;
      setBootStatus('Cargando tu rancho...');
      const { plan, miembro } = await detectarPlan(user);
      onUser(user, plan, miembro);
      return;
    }

    if (hashOk) return;

    const hashLlego = window.location.hash &&
      (window.location.hash.includes('g=') || window.location.hash.includes('a=') || window.location.hash.includes('f='));
    const tiempoEspera = hashLlego ? 8000 : 4000;

    setTimeout(() => {
      if (!authProcessed && !auth.currentUser) {
        window.location.href = 'login.html?logout=1';
      }
    }, tiempoEspera);
  });
}
