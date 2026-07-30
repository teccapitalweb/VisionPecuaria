/* PWA install · Visión Pecuaria — El Rancho Digital
   Hay dos entradas al flujo:
   1) aviso automático una vez al día;
   2) botones permanentes "Instalar app", que siempre explican qué hacer.
   En Android se usa el diálogo nativo cuando el navegador lo permite. */
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
    });
  }

  var K_LAST = 'vp_pwa_last_prompt_v2';
  var COOLDOWN = 24 * 60 * 60 * 1000;
  var deferred = null;
  var shown = false;
  var installedNow = false;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  function standalone() {
    return installedNow ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
  }
  function lg(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function ls(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function canShow() {
    if (standalone()) return false;
    var last = parseInt(lg(K_LAST) || '0', 10);
    return !last || (Date.now() - last) >= COOLDOWN;
  }
  function snooze() {
    ls(K_LAST, String(Date.now()));
  }
  function syncTriggers() {
    document.querySelectorAll('[data-pwa-install]').forEach(function (button) {
      button.hidden = standalone();
      if (button.dataset.pwaBound === '1') return;
      button.dataset.pwaBound = '1';
      button.addEventListener('click', function () { show(true); });
    });
  }
  function markInstalled() {
    installedNow = true;
    hide();
    syncTriggers();
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferred = event;
    syncTriggers();
  });
  window.addEventListener('appinstalled', markInstalled);

  function injectStyles() {
    if (document.getElementById('vp-pwa-style')) return;
    var style = document.createElement('style');
    style.id = 'vp-pwa-style';
    style.textContent =
      '#vp-pwa-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;' +
      'background:rgba(5,15,9,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .25s;padding:0 14px calc(16px + env(safe-area-inset-bottom))}' +
      '#vp-pwa-ov.on{opacity:1}' +
      '#vp-pwa-card{width:100%;max-width:420px;max-height:calc(100dvh - 32px - env(safe-area-inset-top));overflow-y:auto;overscroll-behavior:contain;background:#0a1f12;border:1px solid rgba(212,160,23,.32);border-radius:22px;padding:20px 20px max(18px,env(safe-area-inset-bottom));' +
      'box-shadow:0 -10px 44px rgba(0,0,0,.5);transform:translateY(24px);transition:transform .3s cubic-bezier(.2,.8,.2,1);' +
      'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f7f3ea}' +
      '#vp-pwa-ov.on #vp-pwa-card{transform:translateY(0)}' +
      '.vp-pwa-top{display:flex;align-items:center;gap:13px;margin-bottom:13px}' +
      '.vp-pwa-ic{width:54px;height:54px;border-radius:14px;flex:none;box-shadow:0 4px 14px rgba(0,0,0,.4)}' +
      '.vp-pwa-tt{font-size:16.5px;font-weight:800;color:#f7f3ea;line-height:1.15;letter-spacing:-.2px}' +
      '.vp-pwa-sub{font-size:12.5px;color:#cbb88a;margin-top:3px}' +
      '.vp-pwa-body{font-size:13px;color:#d8e4d4;line-height:1.55;margin:2px 0 16px}' +
      '.vp-pwa-body b{color:#e8c465}' +
      '.vp-pwa-btns{display:flex;gap:10px}' +
      '.vp-pwa-btn{flex:1;min-height:48px;border:none;border-radius:13px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .12s;touch-action:manipulation}' +
      '.vp-pwa-btn:active{transform:scale(.97)}' +
      '.vp-pwa-btn:focus-visible{outline:3px solid #f3c95f;outline-offset:2px}' +
      '.vp-pwa-later{background:rgba(255,255,255,.08);color:#cbb88a}' +
      '.vp-pwa-go{background:linear-gradient(135deg,#e8c465,#d4a017);color:#0a1f12;box-shadow:0 6px 16px rgba(212,160,23,.3)}' +
      '.vp-pwa-steps{margin:4px 0 16px;padding:0;list-style:none;font-size:13px;color:#d8e4d4;line-height:1.5}' +
      '.vp-pwa-steps li{display:flex;gap:9px;align-items:flex-start;margin-bottom:8px}' +
      '.vp-pwa-steps .n{width:21px;height:21px;border-radius:50%;background:rgba(212,160,23,.18);color:#e8c465;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;flex:none}' +
      '.vp-pwa-steps b{color:#e8c465}' +
      '.vp-pwa-note{font-size:11.5px;color:#9fb39d;margin:-7px 0 14px;line-height:1.45}';
    document.head.appendChild(style);
  }

  function hide() {
    var overlay = document.getElementById('vp-pwa-ov');
    shown = false;
    if (!overlay) return;
    overlay.classList.remove('on');
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 300);
  }

  function show(force) {
    if (standalone() || document.getElementById('vp-pwa-ov')) return;
    if ((!force && (shown || !canShow()))) return;
    shown = true;
    injectStyles();
    var overlay = document.createElement('div');
    overlay.id = 'vp-pwa-ov';
    overlay.innerHTML =
      '<div id="vp-pwa-card" role="dialog" aria-modal="true" aria-labelledby="vp-pwa-title">' +
        '<div class="vp-pwa-top">' +
          '<img class="vp-pwa-ic" src="pwa-192.png" alt="">' +
          '<div><div class="vp-pwa-tt" id="vp-pwa-title">Instala Visión Pecuaria</div>' +
          '<div class="vp-pwa-sub">Tu rancho digital, directo en tu pantalla</div></div>' +
        '</div>' +
        '<div id="vp-pwa-content"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    renderDefault();
    requestAnimationFrame(function () {
      overlay.classList.add('on');
      var primary = document.getElementById('vp-pwa-go');
      if (primary) primary.focus({ preventScroll: true });
    });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        snooze();
        hide();
      }
    });
    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        snooze();
        hide();
      }
    });
  }

  function renderDefault() {
    var content = document.getElementById('vp-pwa-content');
    if (!content) return;
    content.innerHTML =
      '<p class="vp-pwa-body">Instala la app para entrar más rápido a tu rancho, sin buscar el enlace, y usarla <b>como una aplicación</b>.</p>' +
      '<div class="vp-pwa-btns">' +
        '<button class="vp-pwa-btn vp-pwa-later" id="vp-pwa-later" type="button">Más tarde</button>' +
        '<button class="vp-pwa-btn vp-pwa-go" id="vp-pwa-go" type="button">Instalar app</button>' +
      '</div>';
    document.getElementById('vp-pwa-later').onclick = function () {
      snooze();
      hide();
    };
    document.getElementById('vp-pwa-go').onclick = onInstall;
  }

  function renderIOS() {
    var content = document.getElementById('vp-pwa-content');
    if (!content) return;
    content.innerHTML =
      '<ol class="vp-pwa-steps">' +
        '<li><span class="n">1</span><span>Toca el botón <b>Compartir</b> (el cuadrito con la flecha hacia arriba).</span></li>' +
        '<li><span class="n">2</span><span>Elige <b>Agregar a pantalla de inicio</b>.</span></li>' +
        '<li><span class="n">3</span><span>Confirma con <b>Agregar</b>. ¡Listo!</span></li>' +
      '</ol>' +
      '<p class="vp-pwa-note">En iPhone esta opción aparece en Safari.</p>' +
      '<div class="vp-pwa-btns"><button class="vp-pwa-btn vp-pwa-later" id="vp-pwa-close" type="button">Entendido</button></div>';
    document.getElementById('vp-pwa-close').onclick = function () {
      snooze();
      hide();
    };
  }

  function renderManual() {
    var content = document.getElementById('vp-pwa-content');
    if (!content) return;
    content.innerHTML =
      '<ol class="vp-pwa-steps">' +
        '<li><span class="n">1</span><span>Abre el menú del navegador <b>⋮</b>.</span></li>' +
        '<li><span class="n">2</span><span>Elige <b>Instalar aplicación</b> o <b>Agregar a pantalla de inicio</b>.</span></li>' +
        '<li><span class="n">3</span><span>Confirma la instalación y abre Visión Pecuaria desde su icono.</span></li>' +
      '</ol>' +
      '<p class="vp-pwa-note">Si no aparece, abre esta página directamente en Chrome o Edge y vuelve a intentarlo.</p>' +
      '<div class="vp-pwa-btns"><button class="vp-pwa-btn vp-pwa-later" id="vp-pwa-close" type="button">Entendido</button></div>';
    document.getElementById('vp-pwa-close').onclick = function () {
      snooze();
      hide();
    };
  }

  function onInstall() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (result) {
        if (result && result.outcome === 'accepted') markInstalled();
        else {
          snooze();
          hide();
        }
        deferred = null;
      });
    } else if (isIOS) {
      renderIOS();
    } else {
      renderManual();
    }
  }

  syncTriggers();
  window.addEventListener('load', function () {
    syncTriggers();
    if (standalone()) return;
    var forceInstall = new URLSearchParams(window.location.search).get('install') === '1';
    if (forceInstall) {
      setTimeout(function () { show(true); }, 650);
      return;
    }
    setTimeout(function autoPrompt(attempt) {
      var active = document.activeElement;
      var typing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      if (typing && attempt < 3) {
        setTimeout(function () { autoPrompt(attempt + 1); }, 1800);
        return;
      }
      show(false);
    }, 3000, 0);
  });
})();
