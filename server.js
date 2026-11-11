const path = require('path');
const express = require('express');
const cfg = require('./src/config');
const pages = require('./src/pages');
const admin = require('./src/admin');
const { TABLES, insert, remove, setStatus } = require('./src/db');
const campaign = require('./src/campaign');

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// ── Public pages
const routes = {
  '/': pages.home, '/services': pages.services, '/media': pages.media,
  '/creators': pages.creators, '/brands': pages.brands, '/credits': pages.credits,
  '/legal': pages.legal, '/thanks': pages.thanks,
};
// Marketing page is switchable: cfg.pages.marketing = false hides it and 302s to /media (temporary).
if ((cfg.pages || {}).marketing !== false) routes['/marketing'] = pages.marketing;
else app.get('/marketing', (req, res) => res.redirect(302, '/media'));
for (const [p, fn] of Object.entries(routes)) app.get(p, (req, res) => res.send(fn()));
app.get('/contact', (req, res) => res.send(pages.contact(req.query.type)));
app.get('/sponsorships', (req, res) => res.send(pages.sponsorships(req.query.tier)));
// friendly aliases
const alias = { '/creator-network': '/creators', '/events': '/sponsorships', '/events-sponsorships': '/sponsorships', '/work': '/media', '/portfolio': '/media', '/legal-services': '/legal', '/real-estate': '/media#real-estate', '/about': '/', '/about.html': '/' };
for (const [a, to] of Object.entries(alias)) app.get(a, (req, res) => res.redirect(301, to));
app.get('/about/', (req, res) => res.redirect(301, '/'));
app.get('/api/health', (req, res) => res.json({ ok: true, brand: cfg.brand }));

// ── Form submissions → CRM
const FORM_TABLE = { brand: 'brands', creator: 'creators', event: 'events', sponsor: 'sponsors', legal: 'brands' };
app.post('/api/submit/:type', (req, res) => {
  const table = FORM_TABLE[req.params.type];
  const wantsJson = req.is('application/json') || (req.get('accept') || '').includes('application/json');
  if (!table) return res.status(404).json({ ok: false, error: 'Unknown form' });
  if (req.body.website_url) return wantsJson ? res.json({ ok: true }) : res.redirect(303, '/thanks'); // honeypot
  try {
    let body = req.body, source = 'website';
    if (req.params.type === 'sponsor') {
      // Campaign sponsor inquiry: campaign + tier are pinned to the featured campaign file, never free text.
      const c = campaign.load();
      const missing = ['contact_name', 'email'].filter((k) => !String(body[k] || '').trim());
      if (missing.length) { const e = new Error('Missing: ' + missing.map((k) => (k === 'email' ? 'Email' : 'Contact name')).join(', ')); e.status = 400; throw e; }
      const tiers = (c.tiers || []).map((t) => t.name).concat('Not sure yet');
      body = { ...body, campaign: c.client || 'St. Pete Marathon', tier: tiers.includes(body.tier) ? body.tier : '', status: 'Prospect' };
      source = `website · ${c.client || 'campaign'} sponsor form`;
    }
    if (req.params.type === 'legal') {
      // Legal / contracts consultation request → Brands table, tagged so it can be routed to the independent attorney.
      const matter = String(body.matter || '').trim().slice(0, 120);
      body = { ...body, company: String(body.company || '').trim() || 'Individual', interests: 'Legal / contracts' + (matter ? ` · ${matter}` : ''), goals: body.details };
      source = 'website · legal inquiry';
    }
    const id = insert(table, body, source);
    return wantsJson ? res.json({ ok: true, id }) : res.redirect(303, '/thanks');
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Server error' });
  }
});

// ── Admin (local-only AND login-protected; same credentials as the live site via .env.admin — see DEPLOY.md)
const isLocal = (ip = '') => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
app.use('/admin', (req, res, next) => (isLocal(req.socket.remoteAddress) ? next() : res.status(403).send('Admin is local-only.')));
require('./src/auth').mount(app);
app.get('/admin/api', (req, res) => res.json({ ok: true, counts: Object.fromEntries(['brands', 'creators', 'events', 'sponsors'].map((t) => [t, require('./src/db').count(t)])) }));
app.get('/admin', (req, res) => res.send(admin.dashboard()));
app.get('/admin/packages', (req, res) => res.send(admin.packages()));
app.get('/admin/:table.csv', (req, res) => {
  if (!TABLES[req.params.table]) return res.sendStatus(404);
  res.type('text/csv').attachment(`${req.params.table}.csv`).send(admin.csv(req.params.table));
});
app.get('/admin/:table', (req, res) => (TABLES[req.params.table] ? res.send(admin.table(req.params.table, req.query.msg)) : res.status(404).send(pages.notFound())));
app.post('/admin/:table/new', (req, res) => {
  const t = req.params.table; if (!TABLES[t]) return res.sendStatus(404);
  try { insert(t, req.body, 'admin'); res.redirect(303, `/admin/${t}?msg=Saved`); }
  catch (e) { res.redirect(303, `/admin/${t}?msg=${encodeURIComponent(e.message)}`); }
});
app.post('/admin/:table/:id/delete', (req, res) => {
  const t = req.params.table; if (!TABLES[t]) return res.sendStatus(404);
  remove(t, Number(req.params.id)); res.redirect(303, `/admin/${t}?msg=Deleted`);
});
app.post('/admin/:table/:id/status', (req, res) => {
  const t = req.params.table; if (!TABLES[t]) return res.sendStatus(404);
  setStatus(t, Number(req.params.id), String(req.body.status || '')); res.redirect(303, `/admin/${t}#r${req.params.id}`);
});

app.use((req, res) => res.status(404).send(pages.notFound()));

app.listen(cfg.port, cfg.host, () => console.log(`${cfg.brand} running at http://localhost:${cfg.port}  (admin: /admin)`));
