/* Efecto carrusel · Visión Pecuaria
   Avanza automáticamente los carruseles de cursos (.row-cine-scroll)
   de tarjeta en tarjeta. Compatible con scroll-snap. Se pausa al
   interactuar y se reanuda solo. Vuelve al inicio al llegar al final. */
(function () {
  'use strict';

  function initAuto(el) {
    if (!el || el.__autoCar) return;
    // aún no hay tarjetas suficientes para desplazar: reintentar en el próximo escaneo
    if (el.scrollWidth <= el.clientWidth + 8) return;
    el.__autoCar = true;

    var paused = false;

    function stepPx() {
      var card = el.querySelector('.curso-card');
      if (card) {
        var w = card.getBoundingClientRect().width;
        return w + 16; // ancho de tarjeta + gap
      }
      return Math.min(300, Math.round(el.clientWidth * 0.85));
    }

    function tick() {
      if (paused) return;
      var max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 6) {
        el.scrollTo({ left: 0, behavior: 'smooth' });   // volver al inicio
      } else {
        el.scrollBy({ left: stepPx(), behavior: 'smooth' }); // siguiente tarjeta
      }
    }

    el.__timer = setInterval(tick, 3200);

    function pause() { paused = true; clearTimeout(el.__rt); }
    function resume() { clearTimeout(el.__rt); el.__rt = setTimeout(function () { paused = false; }, 4000); }
    ['mouseenter', 'touchstart', 'pointerdown', 'wheel'].forEach(function (ev) { el.addEventListener(ev, pause, { passive: true }); });
    ['mouseleave', 'touchend', 'pointerup'].forEach(function (ev) { el.addEventListener(ev, resume, { passive: true }); });
  }

  function scan() { document.querySelectorAll('.row-cine-scroll').forEach(initAuto); }

  window.addEventListener('load', function () {
    setTimeout(scan, 1500);
    setInterval(scan, 2500); // re-escanea: los carruseles se llenan al navegar entre vistas
  });
})();
