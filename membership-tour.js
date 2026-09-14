/* Accessible welcome tour shared by the membership portals. No dependencies. */
(function (global) {
  'use strict';
  let current;
  function mount(options) {
    if (current) current.destroy();
    const steps = (options.steps || []).filter(step => step && step.title && step.body);
    if (!steps.length) return null;
    const key = 'membership-welcome-v2:' + options.brand + ':' + (options.userId || 'guest');
    let index = 0, opened = false, busy = false, previousFocus, destroyed = false;
    let requestVersion = 0;
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const button = (text, className, handler) => {
      const node = el('button', className, text);
      node.type = 'button';
      node.addEventListener('click', handler);
      return node;
    };
    const launch = button('✦ Recorrido', 'membership-tour-launch', () => start());
    launch.setAttribute('aria-label', 'Repetir recorrido de bienvenida');
    const layer = el('div', 'membership-tour-layer');
    layer.hidden = true;
    const shade = el('div', 'membership-tour-shade');
    const spotlight = el('div', 'membership-tour-spotlight');
    const panel = el('section', 'membership-tour-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'membership-tour-title');
    panel.setAttribute('aria-describedby', 'membership-tour-body');
    const top = el('div', 'membership-tour-top');
    const brand = el('span', 'membership-tour-brand', options.brand || 'Tu comunidad');
    const close = button('×', 'membership-tour-close', () => finish());
    close.setAttribute('aria-label', 'Cerrar recorrido');
    top.append(brand, close);
    const progress = el('p', 'membership-tour-progress');
    progress.setAttribute('aria-live', 'polite');
    const title = el('h2', 'membership-tour-title');
    title.id = 'membership-tour-title';
    title.tabIndex = -1;
    const body = el('p', 'membership-tour-body');
    body.id = 'membership-tour-body';
    const meter = el('div', 'membership-tour-meter');
    meter.setAttribute('aria-hidden', 'true');
    steps.forEach(() => meter.append(el('span')));
    const actions = el('div', 'membership-tour-actions');
    const back = button('Anterior', 'membership-tour-secondary', () => render(index - 1));
    const next = button('Siguiente →', 'membership-tour-primary', () => {
      if (index < steps.length - 1) render(index + 1);
      else {
        finish();
        if (typeof options.onStartCourse === 'function') options.onStartCourse();
      }
    });
    actions.append(back, next);
    const skip = button('Explorar por mi cuenta', 'membership-tour-skip', () => finish());
    panel.append(top, progress, title, body, meter, actions, skip);
    layer.append(shade, spotlight, panel);
    document.body.append(launch, layer);
    function seen() {
      try { return localStorage.getItem(key) === 'done'; } catch (_) { return false; }
    }
    function place() {
      if (!opened) return;
      const step = steps[index];
      let target;
      try { target = step.target && document.querySelector(step.target); } catch (_) { /* invalid target is optional */ }
      const rect = target && target.getBoundingClientRect();
      const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      spotlight.hidden = !visible;
      layer.classList.toggle('membership-tour-has-target', !!visible);
      if (visible) {
        const pad = 7;
        spotlight.style.left = Math.max(4, rect.left - pad) + 'px';
        spotlight.style.top = Math.max(4, rect.top - pad) + 'px';
        spotlight.style.width = Math.min(innerWidth - Math.max(4, rect.left - pad) - 4, rect.width + pad * 2) + 'px';
        spotlight.style.height = Math.min(innerHeight - Math.max(4, rect.top - pad) - 4, rect.height + pad * 2) + 'px';
      }
    }
    async function render(nextIndex) {
      if (busy || !opened || nextIndex < 0 || nextIndex >= steps.length) return;
      busy = true;
      const version = ++requestVersion;
      index = nextIndex;
      const step = steps[index];
      title.textContent = step.title;
      body.textContent = step.body;
      progress.textContent = 'Paso ' + (index + 1) + ' de ' + steps.length;
      back.disabled = index === 0;
      next.disabled = true;
      next.textContent = index === steps.length - 1 ? (options.onStartCourse ? 'Comenzar mi curso →' : '¡Vamos a explorar!') : 'Siguiente →';
      Array.from(meter.children).forEach((node, i) => node.classList.toggle('is-current', i <= index));
      try { if (typeof step.onEnter === 'function') await step.onEnter(); } catch (_) { /* navigation is optional */ }
      if (destroyed || !opened || version !== requestVersion) return;
      try {
        const target = step.target && document.querySelector(step.target);
        if (target) target.scrollIntoView({ behavior: 'instant', block: target.getBoundingClientRect().height > innerHeight * .7 ? 'start' : 'center', inline: 'nearest' });
      } catch (_) { /* still show explanation if no visible target */ }
      place();
      next.disabled = false;
      busy = false;
      title.focus({ preventScroll: true });
    }
    function start() {
      if (opened || destroyed) return;
      previousFocus = document.activeElement;
      opened = true;
      busy = false;
      layer.hidden = false;
      launch.hidden = true;
      render(0);
    }
    function finish() {
      if (!opened) return;
      opened = false;
      busy = false;
      requestVersion++;
      layer.hidden = true;
      launch.hidden = false;
      try { localStorage.setItem(key, 'done'); } catch (_) { /* storage may be unavailable */ }
      if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      else launch.focus({ preventScroll: true });
    }
    function keys(event) {
      if (!opened) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll('button:not(:disabled), [href], [tabindex="0"]')).filter(node => !node.hidden);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', keys, true);
    global.addEventListener('resize', place);
    global.addEventListener('scroll', place, true);
    const timer = global.setTimeout(() => {
      if (options.autoStart !== false && !seen()) start();
    }, 650);
    current = {
      start,
      destroy() {
        destroyed = true;
        requestVersion++;
        global.clearTimeout(timer);
        document.removeEventListener('keydown', keys, true);
        global.removeEventListener('resize', place);
        global.removeEventListener('scroll', place, true);
        launch.remove(); layer.remove();
      }
    };
    return current;
  }
  global.MembershipTour = { mount };
})(window);
