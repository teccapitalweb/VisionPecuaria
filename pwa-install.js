/* PWA install · Visión Pecuaria — El Rancho Digital
   Popup para instalar la app (al entrar al rancho y en el login).
   "Más tarde" => reaparece a los 3 días. Si ya está instalada => nunca más. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  var K_INSTALLED = 'vp_pwa_installed', K_LAST = 'vp_pwa_last_prompt';
  var COOLDOWN = 3 * 24 * 60 * 60 * 1000; // 3 días
  var deferred = null, shown = false;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function lg(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function ls(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function installed(){return lg(K_INSTALLED)==='1'||isStandalone;}
  function canShow(){ if(installed())return false; var l=parseInt(lg(K_LAST)||'0',10); return !l||(Date.now()-l)>=COOLDOWN; }
  function snooze(){ls(K_LAST,String(Date.now()));}
  function markInstalled(){ls(K_INSTALLED,'1');hide();}
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;});
  window.addEventListener('appinstalled',function(){markInstalled();});

  function injectStyles(){
    if(document.getElementById('vp-pwa-style'))return;
    var s=document.createElement('style');s.id='vp-pwa-style';
    s.textContent=
      '#vp-pwa-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;'+
      'background:rgba(5,15,9,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .25s;padding:0 14px calc(16px + env(safe-area-inset-bottom))}'+
      '#vp-pwa-ov.on{opacity:1}'+
      '#vp-pwa-card{width:100%;max-width:420px;background:#0a1f12;border:1px solid rgba(212,160,23,.32);border-radius:22px;padding:20px 20px 18px;'+
      'box-shadow:0 -10px 44px rgba(0,0,0,.5);transform:translateY(24px);transition:transform .3s cubic-bezier(.2,.8,.2,1);'+
      'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f7f3ea}'+
      '#vp-pwa-ov.on #vp-pwa-card{transform:translateY(0)}'+
      '.vp-pwa-top{display:flex;align-items:center;gap:13px;margin-bottom:13px}'+
      '.vp-pwa-ic{width:54px;height:54px;border-radius:14px;flex:none;box-shadow:0 4px 14px rgba(0,0,0,.4)}'+
      '.vp-pwa-tt{font-size:16.5px;font-weight:800;color:#f7f3ea;line-height:1.15;letter-spacing:-.2px}'+
      '.vp-pwa-sub{font-size:12.5px;color:#cbb88a;margin-top:3px}'+
      '.vp-pwa-body{font-size:13px;color:#d8e4d4;line-height:1.55;margin:2px 0 16px}'+
      '.vp-pwa-body b{color:#e8c465}'+
      '.vp-pwa-btns{display:flex;gap:10px}'+
      '.vp-pwa-btn{flex:1;border:none;border-radius:13px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .12s}'+
      '.vp-pwa-btn:active{transform:scale(.97)}'+
      '.vp-pwa-later{background:rgba(255,255,255,.08);color:#cbb88a}'+
      '.vp-pwa-go{background:linear-gradient(135deg,#e8c465,#d4a017);color:#0a1f12;box-shadow:0 6px 16px rgba(212,160,23,.3)}'+
      '.vp-pwa-steps{margin:4px 0 16px;padding:0;list-style:none;font-size:13px;color:#d8e4d4;line-height:1.5}'+
      '.vp-pwa-steps li{display:flex;gap:9px;align-items:flex-start;margin-bottom:8px}'+
      '.vp-pwa-steps .n{width:21px;height:21px;border-radius:50%;background:rgba(212,160,23,.18);color:#e8c465;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;flex:none}'+
      '.vp-pwa-steps b{color:#e8c465}';
    document.head.appendChild(s);
  }
  function hide(){var o=document.getElementById('vp-pwa-ov');if(o){o.classList.remove('on');setTimeout(function(){if(o&&o.parentNode)o.parentNode.removeChild(o);},300);}}
  function show(){
    if(shown||!canShow()||document.getElementById('vp-pwa-ov'))return; shown=true; injectStyles();
    var o=document.createElement('div');o.id='vp-pwa-ov';
    o.innerHTML='<div id="vp-pwa-card" role="dialog" aria-label="Instalar app">'+
      '<div class="vp-pwa-top"><img class="vp-pwa-ic" src="pwa-192.png" alt="Visión Pecuaria">'+
      '<div><div class="vp-pwa-tt">Instala Visión Pecuaria</div>'+
      '<div class="vp-pwa-sub">Tu rancho digital, directo en tu pantalla</div></div></div>'+
      '<div id="vp-pwa-content"></div></div>';
    document.body.appendChild(o); renderDefault();
    requestAnimationFrame(function(){o.classList.add('on');});
    o.addEventListener('click',function(e){if(e.target===o){snooze();hide();}});
  }
  function renderDefault(){
    var c=document.getElementById('vp-pwa-content');if(!c)return;
    c.innerHTML='<p class="vp-pwa-body">Instala la app para entrar más rápido a tu rancho, sin buscar el enlace, y usarla <b>como una aplicación</b>.</p>'+
      '<div class="vp-pwa-btns"><button class="vp-pwa-btn vp-pwa-later" id="vp-pwa-later">Más tarde</button>'+
      '<button class="vp-pwa-btn vp-pwa-go" id="vp-pwa-go">Instalar app</button></div>';
    document.getElementById('vp-pwa-later').onclick=function(){snooze();hide();};
    document.getElementById('vp-pwa-go').onclick=onInstall;
  }
  function renderIOS(){
    var c=document.getElementById('vp-pwa-content');if(!c)return;
    c.innerHTML='<ol class="vp-pwa-steps">'+
      '<li><span class="n">1</span><span>Toca el botón <b>Compartir</b> (el cuadrito con la flecha hacia arriba).</span></li>'+
      '<li><span class="n">2</span><span>Elige <b>"Agregar a inicio"</b>.</span></li>'+
      '<li><span class="n">3</span><span>Confirma con <b>Agregar</b>. ¡Listo!</span></li></ol>'+
      '<div class="vp-pwa-btns"><button class="vp-pwa-btn vp-pwa-later" id="vp-pwa-later">Más tarde</button>'+
      '<button class="vp-pwa-btn vp-pwa-go" id="vp-pwa-ok">Entendido</button></div>';
    document.getElementById('vp-pwa-later').onclick=function(){snooze();hide();};
    document.getElementById('vp-pwa-ok').onclick=function(){snooze();hide();};
  }
  function onInstall(){
    if(deferred){deferred.prompt();deferred.userChoice.then(function(r){if(r&&r.outcome==='accepted'){markInstalled();}else{snooze();hide();}deferred=null;});}
    else if(isIOS){renderIOS();}
    else{snooze();hide();}
  }
  window.addEventListener('load',function(){ if(installed())return; setTimeout(function(){if(canShow())show();},1400); });
})();
