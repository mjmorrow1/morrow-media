const cfg = require('./config');
const fs = require('fs');
const path = require('path');

// Cache-bust static assets (build-cf sets ASSET_VERSION = META.VERSION)
function assetV() {
  if (process.env.ASSET_VERSION) return process.env.ASSET_VERSION;
  try { return Math.floor(fs.statSync(path.join(__dirname, '../public/css/site.css')).mtimeMs).toString(36); }
  catch { return Date.now().toString(36); }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NAV = [
  ['Media', '/media'],
  ['Marketing', '/marketing', 'marketing'], // hidden while cfg.pages.marketing is false
  ['Creators', '/creators'],
  ['Sponsorships', '/sponsorships'],
  ['Legal', '/legal'],
  ['About', '/about'],
].filter(([, , key]) => !key || (cfg.pages || {})[key] !== false);

function layout({ title, path = '/', body, description, heroNav = false }) {
  const fullTitle = title ? `${title} — ${cfg.brand}` : `${cfg.brand} — ${cfg.tagline}`;
  const nav = NAV.map(([l, h]) => `<a href="${h}"${path.startsWith(h) ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || cfg.oneLiner)}">
<link rel="preload" href="/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css?v=${assetV()}">
</head>
<body class="${heroNav ? 'has-hero' : ''}">
<header class="site-header${heroNav ? ' on-hero' : ''}" data-header>
  <div class="wrap header-inner">
    <a class="logo" href="/" aria-label="${esc(cfg.brand)} home">${esc(cfg.brand)}</a>
    <nav class="nav" aria-label="Primary">${nav}</nav>
    <a class="btn btn-sm btn-solid header-cta" href="/contact">Work with us</a>
    <button class="menu-toggle" aria-label="Open menu" aria-expanded="false" data-menu-toggle><span></span><span></span></button>
  </div>
</header>
<div class="mobile-menu" data-mobile-menu>
  <nav>${NAV.map(([l, h]) => `<a href="${h}">${l}</a>`).join('')}<a href="/brands">Brands</a><a href="/services">Services</a><a href="/contact" class="mm-cta">Work with us →</a></nav>
</div>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div>
        <p class="footer-brand">${esc(cfg.brand)}</p>
        <p class="footer-tag">${esc(cfg.tagline)}</p>
      </div>
      <a class="footer-big" href="/contact">Let's build something <span>→</span></a>
    </div>
    <div class="footer-cols">
      <div><h4>Services</h4><a href="/media">Media</a>${(cfg.pages || {}).marketing !== false ? '<a href="/marketing">Marketing</a>' : ''}<a href="/creators">Creator Network</a><a href="/sponsorships">Events &amp; Sponsorships</a></div>
      <div><h4>Work with us</h4><a href="/contact?type=brand">I'm a Brand</a><a href="/contact?type=creator">I'm a Creator</a><a href="/contact?type=event">I'm an Event Organizer</a></div>
      <div><h4>Company</h4><a href="/about">About</a><a href="/legal">Legal</a><a href="/brands">Brands</a><a href="/services">All services</a></div>
      <div><h4>Studio</h4><span>${esc(cfg.location)}</span><a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>${cfg.phone ? `<a href="tel:${esc(cfg.phoneTel)}">${esc(cfg.phone)}</a>` : ''}${cfg.social.instagram ? `<a class="footer-social" href="${esc(cfg.social.instagram)}" target="_blank" rel="noopener" aria-label="SouthBridge Media on Instagram"><svg class="ig-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor"/></svg><span>@southbridgemedia</span></a>` : ''}${cfg.social.linkedin ? `<a class="footer-social" href="${esc(cfg.social.linkedin)}" target="_blank" rel="noopener" aria-label="SouthBridge Media on LinkedIn"><svg class="li-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z"/></svg><span>LinkedIn</span></a>` : ''}</div>
    </div>
    <div class="footer-bottom"><span>© ${cfg.year} ${esc(cfg.brand)}</span><span>FAA Part 107 certified drone services · <a href="/credits">Photo credits</a> · <a class="footer-admin" href="/admin" rel="nofollow">Admin login</a></span></div>
  </div>
</footer>
<script src="/js/site.js?v=${assetV()}" defer></script>
</body>
</html>`;
}

module.exports = { layout, esc };
