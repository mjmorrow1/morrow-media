// Cloudflare Worker for morrowmediagroup.com. GENERATED into cf/worker.js by scripts/build-cf.js — edit this file (worker-src.js), not worker.js.
// Mirrors server.js: same routes, redirects and form → CRM behavior. Form rows go to D1 (binding DB) instead of local SQLite.
const META = /*__META__*/null;
const { PAGES, TIER_SLUGS, TABLES, REDIRECTS_301, REDIRECTS_302, CAMPAIGN, CANONICAL_HOST } = META;
const FORM_TABLE = { brand: 'brands', creator: 'creators', event: 'events', sponsor: 'sponsors', legal: 'brands' };
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const redirect = (to, status, url) => new Response(null, { status, headers: { location: to.startsWith('http') ? to : to } });

function clean(table, input) {
  const row = {}; const missing = [];
  for (const c of TABLES[table].columns) {
    let v = input[c.key];
    if (Array.isArray(v)) v = v.join(', ');
    v = v == null ? '' : String(v).trim().slice(0, 5000);
    if (!v && c.default) v = c.default;
    if (c.required && !v) missing.push(c.label);
    row[c.key] = v;
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) missing.push('a valid email');
  return { row, missing };
}
async function insert(env, table, input, source) {
  const { row, missing } = clean(table, input);
  if (missing.length) { const e = new Error('Missing: ' + missing.join(', ')); e.status = 400; throw e; }
  const keys = Object.keys(row);
  const r = await env.DB.prepare(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}, source) VALUES (${keys.map(() => '?').join(',')}, ?)`)
    .bind(...keys.map((k) => row[k]), source).run();
  return r.meta.last_row_id;
}
async function readBody(req) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await req.json()) || {};
  const fd = await req.formData(); const o = {};
  for (const k of new Set(fd.keys())) { const all = fd.getAll(k); o[k] = all.length > 1 ? all : all[0]; }
  return o;
}
async function submit(req, env, type) {
  const table = FORM_TABLE[type];
  const ct = req.headers.get('content-type') || '';
  const wantsJson = ct.includes('application/json') || (req.headers.get('accept') || '').includes('application/json');
  if (!table) return json({ ok: false, error: 'Unknown form' }, 404);
  try {
    let body = await readBody(req), source = 'website';
    if (body.website_url) return wantsJson ? json({ ok: true }) : redirect('/thanks', 303); // honeypot
    if (type === 'sponsor') {
      const missing = ['contact_name', 'email'].filter((k) => !String(body[k] || '').trim());
      if (missing.length) { const e = new Error('Missing: ' + missing.map((k) => (k === 'email' ? 'Email' : 'Contact name')).join(', ')); e.status = 400; throw e; }
      const tiers = CAMPAIGN.tiers.concat('Not sure yet');
      body = { ...body, campaign: CAMPAIGN.client, tier: tiers.includes(body.tier) ? body.tier : '', status: 'Prospect' };
      source = `website · ${CAMPAIGN.client} sponsor form`;
    }
    if (type === 'legal') {
      const matter = String(body.matter || '').trim().slice(0, 120);
      body = { ...body, company: String(body.company || '').trim() || 'Individual', interests: 'Legal / contracts' + (matter ? ` · ${matter}` : ''), goals: body.details };
      source = 'website · legal inquiry';
    }
    const id = await insert(env, table, body, source);
    return wantsJson ? json({ ok: true, id }) : redirect('/thanks', 303);
  } catch (e) {
    return json({ ok: false, error: e.status ? e.message : 'Server error' }, e.status || 500);
  }
}
// Site files (pages, images, css, js, fonts) live in Workers KV (binding SITE), key = path, metadata = { ct, h }.
async function asset(env, req, key, status = 200, ctx) {
  // Live admin AI overrides (D1) win over KV so Site AI edits show without a full redeploy.
  if (env.DB && (key.startsWith('/_pages/') || key === '/css/site.css')) {
    try {
      const ov = await env.DB.prepare('SELECT body, ct, h FROM site_overrides WHERE path = ?').bind(key).first();
      if (ov && ov.body != null) {
        return new Response(ov.body, { status, headers: {
          'content-type': ov.ct || (key.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'),
          'cache-control': 'public, max-age=60',
          ...(ov.h ? { etag: `"${ov.h}"` } : {}),
          'x-mm-override': '1',
        } });
      }
    } catch (_) { /* table may not exist until migration */ }
  }
  const cache = caches.default;
  const ck = new Request(new URL(key, req.url).origin + key + '?v=' + META.VERSION);
  let res = status === 200 ? await cache.match(ck) : null;
  if (!res) {
    const { value, metadata } = await env.SITE.getWithMetadata(key, { type: 'arrayBuffer', cacheTtl: 300 });
    if (value == null) return null;
    const isHtml = key.startsWith('/_pages/');
    res = new Response(value, { status, headers: {
      'content-type': (metadata && metadata.ct) || 'application/octet-stream',
      'cache-control': isHtml ? 'public, max-age=300' : 'public, max-age=86400',
      ...(metadata && metadata.h ? { etag: `"${metadata.h}"` } : {}),
    } });
    if (status === 200 && ctx) ctx.waitUntil(cache.put(ck, res.clone()));
  }
  const inm = req.headers.get('if-none-match'); const et = res.headers.get('etag');
  if (status === 200 && inm && et && inm === et) return new Response(null, { status: 304, headers: { etag: et } });
  return res;
}
const page = async (env, req, key, status = 200, ctx) => (await asset(env, req, key, status, ctx)) || new Response('Not found', { status: 404 });
/*__ADMIN__*/

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname === 'www.' + CANONICAL_HOST) { url.hostname = CANONICAL_HOST; return Response.redirect(url.toString(), 301); }
    let p = url.pathname; if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    const m = p.match(/^\/api\/submit\/([^/]+)$/);
    if (m && req.method === 'POST') return submit(req, env, m[1]);
    if (p === '/admin' || p.startsWith('/admin/')) return admin(req, env, url, p);
    if (p.startsWith('/cal/')) return icsFeed(req, env, url, p);
    if (p === '/api/authentisign/webhook') return authentisignWebhook(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    if (p === '/api/health') return json({ ok: true, brand: META.BRAND });
    if (REDIRECTS_301[p]) return redirect(REDIRECTS_301[p], 301);
    if (REDIRECTS_302[p]) return redirect(REDIRECTS_302[p], 302);
    if (p === '/contact') { const t = url.searchParams.get('type'); if (t === 'creator' || t === 'event') return page(env, req, `/_pages/contact-${t}.html`, 200, ctx); }
    if (p === '/sponsorships') { const s = slugify(url.searchParams.get('tier') || ''); if (TIER_SLUGS.includes(s)) return page(env, req, `/_pages/sponsorships-${s}.html`, 200, ctx); }
    if (PAGES[p]) return page(env, req, PAGES[p], 200, ctx);
    if (!p.startsWith('/_pages/') && !p.startsWith('/__')) { let k = url.pathname; try { k = decodeURIComponent(k); } catch {} const r = await asset(env, req, k, 200, ctx); if (r) return r; }
    return page(env, req, '/_pages/404.html', 404, ctx);
  },
};
