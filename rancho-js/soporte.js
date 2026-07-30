// ═══════════════════════════════════════════════════════════
// SOPORTE · centro de ayuda — sin Firestore, contenido estático
// Última herramienta migrada del portal actual.
//
// Tres correcciones de honestidad sobre el portal viejo (aprobadas):
//  1. Se quita el bloque "Estado del sistema": eran 4 lucecitas
//     verdes y porcentajes de uptime 100% hardcodeados en el HTML,
//     sin ningún monitoreo real detrás. Mejor no mostrarlo que fingir.
//  2. Se quita la promesa "Respuesta en menos de 2 horas" — no hay
//     forma de verificar/medir ese SLA desde aquí.
//  3. Las guías rápidas solo enlazan a secciones que YA viven en este
//     portal nuevo (se quita "Mercado", que sigue en construcción).
// ═══════════════════════════════════════════════════════════
import { cerrarSesion } from './firebase.js';

const WHATSAPP = '522361049715'; // número oficial de ventas de Visión Pecuaria
const EMAIL = 'visionpecuaria12@gmail.com';

const CONTACTOS = [
  {
    clase: 'wa', emoji: '💬', titulo: 'WhatsApp directo',
    sub: 'Para dudas rápidas y soporte personalizado',
    meta: '+52 1 236 104 9715',
    href: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola, necesito ayuda con Visión Pecuaria')}`
  },
  {
    clase: 'mail', emoji: '✉️', titulo: 'Correo electrónico',
    sub: 'Para consultas detalladas o adjuntar archivos',
    meta: EMAIL,
    href: `mailto:${EMAIL}?subject=${encodeURIComponent('Soporte Visión Pecuaria')}`
  },
  {
    clase: 'bug', emoji: '🐛', titulo: 'Reportar un error',
    sub: '¿Encontraste algo roto? Avísanos y lo arreglamos',
    meta: 'Plantilla incluida',
    href: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola, quiero reportar un bug/error en la plataforma:\n\nDescripción: \nDónde pasó: \nQué esperaba: ')}`
  }
];

const GUIAS = [
  { emoji: '🐄', titulo: 'Registra tu primer animal', paso: '3 pasos · 1 min', ir: 'hato' },
  { emoji: '🧮', titulo: 'Calcula la rentabilidad de tu hato', paso: 'Con tus propios números', ir: 'calculadora' },
  { emoji: '🩺', titulo: 'Diagnostica enfermedades', paso: '22 enfermedades · síntomas', ir: 'diagnostico' },
  { emoji: '📓', titulo: 'Lleva la bitácora de tu hato', paso: 'Vacunas, pesos y eventos', ir: 'bitacora' },
  { emoji: '🌐', titulo: 'Publica avisos en Comunidad', paso: 'Solo miembros Élite', ir: 'comunidad' },
  { emoji: '🏛️', titulo: 'Solicita apoyos del gobierno', paso: 'Programas vigentes', ir: 'apoyos' }
];

const FAQ = [
  {
    q: '¿Qué incluye la suscripción Élite Pecuario?',
    a: 'Acceso completo a la Biblioteca de cursos, Diagnóstico veterinario, Calculadora de rentabilidad, Mi Hato sin límite, Bitácora de eventos, Comunidad de ranchos, Webinars exclusivos y grupo VIP de WhatsApp con otros productores.'
  },
  {
    q: '¿Cómo cambio mi método de pago o cancelo la suscripción?',
    a: 'Escríbenos por WhatsApp al <strong>+52 1 236 104 9715</strong> con tu correo registrado y te atendemos directo. La cancelación aplica al final del periodo ya pagado — no se corta el acceso a la mitad.'
  },
  {
    q: '¿Mis animales registrados son privados?',
    a: 'Solo tú los ves en tu Hato. Nadie más —ni otros miembros Élite ni el equipo de Visión Pecuaria— puede verlos, a menos que tú mismo publiques un aviso en Comunidad.'
  },
  {
    q: '¿Quién puede publicar en Comunidad?',
    a: 'Solo los miembros <strong>Élite Pecuario</strong> pueden publicar avisos. Cualquiera (incluso modo Explorador FREE) puede ver los avisos ya publicados.'
  },
  {
    q: '¿El diagnóstico veterinario reemplaza a un MVZ?',
    a: '<strong>No.</strong> Es una herramienta orientativa basada en SENASICA/INIFAP/SADER. Ante sospecha real de enfermedad, contacta a un Médico Veterinario Zootecnista certificado o a SENASICA al <strong>01 800 751 2100</strong>.'
  },
  {
    q: '¿Puedo descargar mis certificados de los cursos?',
    a: 'Sí. Al completar un curso recibes un certificado con folio y QR de verificación, descargable en PDF desde <strong>Certificados</strong>. Es verificable públicamente en cualquier momento.'
  },
  {
    q: 'Olvidé mi contraseña, ¿cómo la recupero?',
    a: 'En la pantalla de acceso, usa "¿Olvidaste tu contraseña?". Te llega un correo con instrucciones — si no aparece, revisa spam o escríbenos por WhatsApp.'
  },
  {
    q: '¿La app funciona sin internet?',
    a: 'Es una web app: necesita conexión para sincronizar tu hato, cursos y datos. Ya cargada la página, puedes seguir navegando entre secciones con conexión intermitente.'
  },
  {
    q: '¿Puedo usarla en mi celular?',
    a: 'Sí, está pensada primero para celular. Te recomendamos agregarla a tu pantalla de inicio desde Chrome/Safari para que abra como una app.'
  }
];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function pintarContactos() {
  const cont = document.getElementById('sopContactos');
  if (!cont) return;
  cont.innerHTML = CONTACTOS.map(c => `
    <a class="sop-contacto sop-contacto--${c.clase}" href="${c.href}" target="_blank" rel="noopener">
      <span class="sop-ico">${c.emoji}</span>
      <span class="sop-txt">
        <span class="sop-titulo">${esc(c.titulo)}</span>
        <span class="sop-sub">${esc(c.sub)}</span>
        <span class="sop-meta">${esc(c.meta)}</span>
      </span>
      <span class="sop-flecha" aria-hidden="true">→</span>
    </a>`).join('');
}

function pintarGuias() {
  const cont = document.getElementById('sopGuias');
  if (!cont) return;
  cont.innerHTML = GUIAS.map(g => `
    <button class="sop-guia" type="button" data-ir="${g.ir}">
      <span class="sop-guia-ico" aria-hidden="true">${g.emoji}</span>
      <span class="sop-guia-titulo">${esc(g.titulo)}</span>
      <span class="sop-guia-paso">${esc(g.paso)}</span>
    </button>`).join('');
  cont.querySelectorAll('[data-ir]').forEach(b =>
    b.addEventListener('click', () => { location.hash = b.dataset.ir; }));
}

function pintarFaq() {
  const cont = document.getElementById('sopFaqList');
  if (!cont) return;
  cont.innerHTML = FAQ.map(f => `
    <details class="sop-faq">
      <summary>${esc(f.q)}</summary>
      <div class="sop-faq-body">${f.a}</div>
    </details>`).join('');
}

export function iniciarSoporte() {
  pintarContactos();
  pintarGuias();
  pintarFaq();
}

export function montarSoporte() {
  document.getElementById('sopBtnSalir')?.addEventListener('click', cerrarSesion);
}
