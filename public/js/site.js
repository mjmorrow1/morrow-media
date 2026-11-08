(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');

  // Header: transparent over hero, solid on scroll, hide on scroll down
  const header = document.querySelector('[data-header]');
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 40);
    header.classList.toggle('hide', y > 400 && y > lastY && !document.body.classList.contains('menu-open'));
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const toggle = document.querySelector('[data-menu-toggle]');
  toggle?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    toggle.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  // Reveal on scroll
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
  document.querySelectorAll('.reveal, .step').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

  // Featured sites Before/After: veil + "Hover to reveal" are CSS-only.
  // On touch (no hover), first tap peeks the After without navigating; second tap follows the link.
  document.querySelectorAll('.ba-after').forEach((a) => {
    a.addEventListener('pointerenter', () => a.classList.add('is-unveiled'), { passive: true });
    a.addEventListener('pointerleave', () => {
      if (!window.matchMedia('(hover: hover)').matches) return;
      a.classList.remove('is-unveiled');
    }, { passive: true });
    a.addEventListener('click', (e) => {
      if (window.matchMedia('(hover: hover)').matches) return;
      if (!a.classList.contains('is-unveiled')) {
        e.preventDefault();
        document.querySelectorAll('.ba-after.is-unveiled').forEach((x) => { if (x !== a) x.classList.remove('is-unveiled'); });
        a.classList.add('is-unveiled');
      }
    });
  });

  // Contact tabs
  const tabs = document.querySelectorAll('[data-tab]');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', t === tab); });
    document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
    history.replaceState(null, '', '?type=' + tab.dataset.tab);
  }));

  // Creator application open/close
  const apply = document.querySelector('.apply');
  const openApply = (e) => {
    if (!apply) return;
    e?.preventDefault?.();
    apply.classList.add('open');
    apply.querySelector('.apply-toggle')?.setAttribute('aria-expanded', 'true');
    apply.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => apply.querySelector('input')?.focus({ preventScroll: true }), 650);
  };
  document.querySelectorAll('[data-open-apply]').forEach((b) => b.addEventListener('click', openApply));
  if (location.hash === '#apply') setTimeout(openApply, 200);

  // Lead forms → JSON POST
  document.querySelectorAll('[data-lead-form]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('.form-msg');
    const btn = form.querySelector('button[type=submit]');
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = data[k] ? [].concat(data[k], v) : v; });
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Sending…';
    try {
      const r = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Something went wrong');
      form.classList.add('done'); msg.classList.add('ok'); msg.textContent = 'Thank you — we\'ll be in touch shortly.';
    } catch (err) {
      msg.classList.add('err'); msg.textContent = err.message; btn.disabled = false;
    }
  }));
})();

// Lightbox for listing galleries
(() => {
  const triggers = () => [...document.querySelectorAll('[data-lb]')];
  if (!triggers().length) return;
  const lb = document.createElement('div');
  lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
  lb.innerHTML = '<button class="lb-btn lb-close" aria-label="Close">✕</button><button class="lb-btn lb-prev" aria-label="Previous">←</button><figure><img alt=""><figcaption><span></span><span></span></figcaption></figure><button class="lb-btn lb-next" aria-label="Next">→</button>';
  document.body.appendChild(lb);
  const imgEl = lb.querySelector('img'), [count, cap] = lb.querySelectorAll('figcaption span');
  let group = [], idx = 0, lastFocus = null;
  const show = (i) => {
    idx = (i + group.length) % group.length;
    const el = group[idx];
    imgEl.classList.add('loading');
    imgEl.onload = () => imgEl.classList.remove('loading');
    imgEl.src = el.dataset.lb; imgEl.alt = el.dataset.alt || '';
    count.textContent = `${idx + 1} / ${group.length}`; cap.textContent = el.dataset.alt || '';
    const nxt = group[(idx + 1) % group.length]; if (nxt) new Image().src = nxt.dataset.lb; // preload
  };
  const open = (el) => {
    const scope = el.closest('[data-gallery]');
    group = (scope ? [...scope.querySelectorAll('[data-lb]')] : triggers().filter((t) => !t.closest('[data-gallery]') && !t.classList.contains('hidden')));
    lastFocus = el; show(group.indexOf(el));
    lb.classList.add('open'); document.body.classList.add('lb-open'); lb.querySelector('.lb-close').focus();
  };
  const close = () => { lb.classList.remove('open'); document.body.classList.remove('lb-open'); lastFocus?.focus(); };
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-lb]'); if (t) { e.preventDefault(); open(t); } });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) { if (e.key === 'Enter' && e.target.matches?.('figure[data-lb]')) open(e.target); return; }
    if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') show(idx + 1); if (e.key === 'ArrowLeft') show(idx - 1);
  });
  lb.querySelector('.lb-close').onclick = close;
  lb.querySelector('.lb-prev').onclick = () => show(idx - 1);
  lb.querySelector('.lb-next').onclick = () => show(idx + 1);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  let x0 = null;
  lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); x0 = null; });
})();

// Sponsor tier CTAs → preselect the tier in the campaign inquiry form (no-JS fallback: ?tier= query preselects server-side)
(() => {
  const sel = document.querySelector('[data-tier-select]');
  if (!sel) return;
  const box = document.getElementById('sponsor-inquiry');
  document.querySelectorAll('[data-tier]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    sel.value = a.dataset.tier;
    history.replaceState(null, '', `?tier=${encodeURIComponent(a.dataset.tier.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}#sponsor-inquiry`);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    setTimeout(() => box.querySelector('input[name=company]')?.focus({ preventScroll: true }), 700);
  }));
})();
