/* Efecto carrusel · Visión Pecuaria
   Desplaza automáticamente los carruseles de cursos (.row-cine-scroll)
   de forma suave (ida y vuelta). Se pausa al tocar/pasar el mouse,
   y se reanuda al soltar. No interfiere con el scroll manual. */
(function () {
  'use strict';
  function initAuto(el) {
    if (!el || el.__autoCarousel) return;
    el.__autoCarousel = true;
    var dir = 1, paused = false, idleTicks = 0;
    var SPEED = 0.45; // px por frame (suave)
    function step() {
      if (!paused && el.scrollWidth > el.clientWidth + 4) {
        el.scrollLeft += SPEED * dir;
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) dir = -1;
        else if (el.scrollLeft <= 0) dir = 1;
      }
      requestAnimationFrame(step);
    }
    function pause() { paused = true; idleTicks = 0; }
    function resumeSoon() { idleTicks = 0; clearTimeout(el.__rt); el.__rt = setTimeout(function () { paused = false; }, 2500); }
    ['mouseenter', 'touchstart', 'pointerdown', 'wheel'].forEach(function (ev) { el.addEventListener(ev, pause, { passive: true }); });
    ['mouseleave', 'touchend', 'pointerup'].forEach(function (ev) { el.addEventListener(ev, resumeSoon, { passive: true }); });
    requestAnimationFrame(step);
  }
  function scan() { document.querySelectorAll('.row-cine-scroll').forEach(initAuto); }
  window.addEventListener('load', function () {
    setTimeout(scan, 1800);      // primer escaneo cuando ya cargó el contenido
    setInterval(scan, 3000);     // re-escanea (los carruseles se llenan al navegar entre vistas)
  });
})();
