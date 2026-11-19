/* SouthBridge Media  -  CSS 3D partnership lifecycles.
   Lazy: only runs when a .lifecycle-stage is near the viewport.
   Honors prefers-reduced-motion. No network calls, no stats. */
(function () {
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INTERVAL = 2800;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function setStep(stage, index) {
    const cards = $all('.lc-card', stage);
    const buttons = $all('.lc-rail button', stage);
    const n = cards.length;
    if (!n) return;
    const i = ((index % n) + n) % n;
    stage.dataset.step = String(i);
    cards.forEach((card, k) => {
      card.classList.remove('is-active', 'is-prev', 'is-next', 'is-far-prev', 'is-far-next');
      const d = (k - i + n) % n;
      const back = (i - k + n) % n;
      if (k === i) card.classList.add('is-active');
      else if (d === 1) card.classList.add('is-next');
      else if (back === 1) card.classList.add('is-prev');
      else if (d === 2) card.classList.add('is-far-next');
      else if (back === 2) card.classList.add('is-far-prev');
    });
    buttons.forEach((btn, k) => {
      if (k === i) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
    });
    const live = $('.lc-status', stage);
    const active = cards[i];
    if (live && active) {
      const label = active.querySelector('h3');
      const num = active.querySelector('.lc-num');
      live.textContent = (num ? num.textContent + ' ' : '') + (label ? label.textContent : '');
    }
  }

  function bind(stage) {
    if (stage.dataset.bound) return;
    stage.dataset.bound = '1';
    const cards = $all('.lc-card', stage);
    if (!cards.length) return;
    let i = Number(stage.dataset.step || 0) || 0;
    let timer = null;
    let paused = false;

    function go(next) {
      i = ((next % cards.length) + cards.length) % cards.length;
      setStep(stage, i);
    }
    function play() {
      if (REDUCE || paused || document.hidden) return;
      stop();
      timer = setInterval(() => go(i + 1), INTERVAL);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    $all('.lc-rail button', stage).forEach((btn, k) => {
      btn.addEventListener('click', () => { go(k); play(); });
    });
    const prev = stage.querySelector('[data-lc-prev]');
    const next = stage.querySelector('[data-lc-next]');
    if (prev) prev.addEventListener('click', () => { go(i - 1); play(); });
    if (next) next.addEventListener('click', () => { go(i + 1); play(); });

    const scene = $('.lc-scene', stage);
    if (scene) {
      scene.addEventListener('mouseenter', () => { paused = true; stop(); });
      scene.addEventListener('mouseleave', () => { paused = false; play(); });
      scene.addEventListener('focusin', () => { paused = true; stop(); });
      scene.addEventListener('focusout', () => { paused = false; play(); });
      let startX = 0;
      scene.addEventListener('pointerdown', (e) => { startX = e.clientX; });
      scene.addEventListener('pointerup', (e) => {
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 40) { go(dx < 0 ? i + 1 : i - 1); play(); }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else play();
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) play();
        else stop();
      });
    }, { threshold: 0.35 });
    io.observe(stage);

    stage._lc = { go, play, stop, get index() { return i; } };
    setStep(stage, i);
    if (!REDUCE) {
      // Wait until visible to start; IntersectionObserver handles it.
    }
  }

  function init() {
    $all('[data-lifecycle]').forEach(bind);
  }

  window.__lcGoto = function (id, step) {
    const stage = document.querySelector('[data-lifecycle="' + id + '"]');
    if (!stage) return;
    bind(stage);
    if (stage._lc) {
      stage._lc.stop();
      stage._lc.go(step);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Lazy: bind when the first lifecycle section is close to view.
      const sections = $all('.lifecycle');
      if (!sections.length) return;
      if (REDUCE) { init(); return; }
      const io = new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) {
          init();
          obs.disconnect();
        }
      }, { rootMargin: '200px 0px' });
      sections.forEach((s) => io.observe(s));
    });
  } else {
    init();
  }
})();
