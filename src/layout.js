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
      <div><h4>Company</h4><a href="/legal">Legal</a><a href="/brands">Brands</a><a href="/services">All services</a></div>
      <div><h4>Studio</h4><span>${esc(cfg.location)}</span><a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>${cfg.phone ? `<a href="tel:${esc(cfg.phoneTel)}">${esc(cfg.phone)}</a>` : ''}${cfg.social.instagram ? `<a href="${esc(cfg.social.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}</div>
    </div>
    <div class="footer-bottom"><span>© ${cfg.year} ${esc(cfg.brand)}</span><span>FAA Part 107 certified drone services · <a href="/credits">Photo credits</a> · <a class="footer-admin" href="/admin" rel="nofollow">Admin login</a></span></div>
  </div>
</footer>
<script src="/js/site.js?v=${assetV()}" defer></script>
</body>
</html>`;
}

module.exports = { layout, esc };
