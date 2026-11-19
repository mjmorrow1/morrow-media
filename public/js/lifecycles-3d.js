/* SouthBridge Media - CSS 3D partnership lifecycles.
   Lazy init, prefers-reduced-motion, influencer/sponsor chooser. */
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
    if (!stage || stage.dataset.bound) return;
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
      if (stage.hidden || stage.closest('[hidden]')) return;
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
  }

  function bindChooser(root) {
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    const buttons = $all('[data-lc-choice]', root);
    const hint = $('.lc-choice-hint', root);

    function choose(which, opts) {
      const focusBtn = !opts || opts.focus !== false;
      buttons.forEach((btn) => {
        const on = btn.getAttribute('data-lc-choice') === which;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on && focusBtn) btn.focus({ preventScroll: true });
      });
      $all('.lc-panel', root).forEach((panel) => {
        const on = panel.getAttribute('data-panel') === which;
        if (on) {
          panel.removeAttribute('hidden');
          const stage = $('[data-lifecycle]', panel) || panel;
          bind(stage);
          if (stage._lc) stage._lc.play();
        } else {
          panel.setAttribute('hidden', '');
          const stage = $('[data-lifecycle]', panel) || panel;
          if (stage && stage._lc) stage._lc.stop();
        }
      });
      if (hint) {
        if (which) hint.setAttribute('hidden', '');
        else hint.removeAttribute('hidden');
      }
    }

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => choose(btn.getAttribute('data-lc-choice')));
      btn.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = buttons.indexOf(btn);
        const next = e.key === 'ArrowRight' ? buttons[(i + 1) % buttons.length] : buttons[(i - 1 + buttons.length) % buttons.length];
        choose(next.getAttribute('data-lc-choice'));
      });
    });

    root._lcChoose = (which, opts) => choose(which, opts || { focus: false });
  }

  function init() {
    $all('[data-lifecycle]').forEach((stage) => {
      // Chooser panels stay unbound until a choice is made, except those not in a chooser.
      if (stage.closest('[data-lc-chooser]')) return;
      bind(stage);
    });
    $all('[data-lc-chooser]').forEach(bindChooser);
  }

  window.__lcGoto = function (id, step) {
    const stage = document.querySelector('[data-lifecycle="' + id + '"]');
    if (!stage) return;
    const chooser = stage.closest('[data-lc-chooser]');
    if (chooser && chooser._lcChoose) chooser._lcChoose(id, { focus: false });
    bind(stage);
    if (stage._lc) {
      stage._lc.stop();
      stage._lc.go(step);
    }
  };

  window.__lcChoice = function (which) {
    const chooser = document.querySelector('[data-lc-chooser]');
    if (!chooser) return;
    bindChooser(chooser);
    if (chooser._lcChoose) chooser._lcChoose(which || null, { focus: false });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
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
