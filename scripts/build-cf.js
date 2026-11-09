// Build the Cloudflare deploy bundle from the same source as the local Express app.
//   node scripts/build-cf.js   → cf/dist (static assets + pre-rendered pages) and cf/worker.js
// Pages are rendered with src/pages.js, so content edits only need a rebuild + redeploy.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CF = path.join(ROOT, 'cf');
const DIST = path.join(CF, 'dist');
const cfg = require('../src/config');
const { lockupSvg } = require('../src/logo');
const pages = require('../src/pages');
const campaign = require('../src/campaign');

// Schema only (do not open the SQLite file): load db.js TABLES without touching the DB by parsing the module source.
const dbSrc = fs.readFileSync(path.join(ROOT, 'src/db.js'), 'utf8');
const tablesSrc = dbSrc.slice(dbSrc.indexOf('const TABLES = '), dbSrc.indexOf('\nfor (const [name, t] of Object.entries(TABLES))'));
const TABLES = new Function(tablesSrc + '; return TABLES;')();

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
const P = path.join(DIST, '_pages');
fs.mkdirSync(P, { recursive: true });
const write = (name, html) => fs.writeFileSync(path.join(P, name + '.html'), html);

// Must match META.VERSION so HTML ?v= busts the same edge-cache key the Worker uses.
const BUILD_VERSION = Date.now().toString(36);
process.env.ASSET_VERSION = BUILD_VERSION;

const routes = {
  '/': 'home', '/services': 'services', '/media': 'media', '/creators': 'creators', '/brands': 'brands',
  '/credits': 'credits', '/legal': 'legal', '/about': 'about', '/thanks': 'thanks', '/contact': 'contact', '/sponsorships': 'sponsorships',
};
const marketingOn = (cfg.pages || {}).marketing !== false;
if (marketingOn) routes['/marketing'] = 'marketing';
const PAGES = {};
for (const [route, fn] of Object.entries(routes)) { write(fn, pages[fn]()); PAGES[route] = `/_pages/${fn}.html`; }
write('404', pages.notFound());
// Query-string variants
for (const t of ['creator', 'event']) write(`contact-${t}`, pages.contact(t));
const c = campaign.load();
const TIER_SLUGS = (c.tiers || []).map((t) => campaign.slugify(t.name));
for (const s of TIER_SLUGS) write(`sponsorships-${s}`, pages.sponsorships(s));

const META = {
  PAGES, TIER_SLUGS, TABLES,
  REDIRECTS_301: { '/creator-network': '/creators', '/events': '/sponsorships', '/events-sponsorships': '/sponsorships', '/work': '/media', '/portfolio': '/media', '/legal-services': '/legal', '/real-estate': '/media#real-estate' },
  REDIRECTS_302: marketingOn ? {} : { '/marketing': '/media' },
  CAMPAIGN: { client: c.client || 'St. Pete Marathon', tiers: (c.tiers || []).map((t) => t.name) },
  BRAND: cfg.brand,
  CANONICAL_HOST: cfg.canonicalHost,
  LEGACY_HOST: cfg.legacyHost,
  SERVICE_HOST: cfg.serviceHost,
  VERSION: BUILD_VERSION,
};
const tpl = fs.readFileSync(path.join(CF, 'worker-src.js'), 'utf8');
const adminSrc = fs.readFileSync(path.join(CF, 'admin-src.js'), 'utf8').replace('/*__LOGO_LOCKUP__*/\'\'', () => JSON.stringify(lockupSvg())) + '\n' + fs.readFileSync(path.join(CF, 'crm-src.js'), 'utf8') + '\n' + fs.readFileSync(path.join(CF, 'tickets-src.js'), 'utf8') + '\n' + fs.readFileSync(path.join(CF, 'ai-src.js'), 'utf8') + '\n' + fs.readFileSync(path.join(CF, 'setup-src.js'), 'utf8');
fs.writeFileSync(path.join(CF, 'worker.js'), tpl.replace('/*__META__*/null', () => JSON.stringify(META)).replace('/*__ADMIN__*/', () => adminSrc));
// D1 schema (same tables/columns as the local SQLite CRM)
const ddl = Object.entries(TABLES).map(([name, t]) => `CREATE TABLE IF NOT EXISTS ${name} (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  ${t.columns.map((col) => `"${col.key}" ${col.type === 'number' ? 'REAL' : 'TEXT'}`).join(',\n  ')},\n  source TEXT,\n  created_at TEXT DEFAULT (datetime('now'))\n);`).join('\n');
fs.copyFileSync(path.join(CF, 'worker.js'), path.join(CF, 'worker.mjs')); // ESM copy for scripts/worker-dev.js
const authDdl = `CREATE TABLE IF NOT EXISTS admin_login_fails (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  ip TEXT,\n  at INTEGER\n);\nCREATE INDEX IF NOT EXISTS admin_login_fails_ip_at ON admin_login_fails (ip, at);`;
fs.writeFileSync(path.join(CF, 'schema.sql'), ddl + '\n' + authDdl + '\n' + fs.readFileSync(path.join(CF, 'crm-schema.sql'), 'utf8') + '\n' + fs.readFileSync(path.join(CF, 'tickets-schema.sql'), 'utf8') + '\n' + fs.readFileSync(path.join(CF, 'ai-schema.sql'), 'utf8'));
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : files.push(p); } })(DIST);
console.log(`Built cf/dist (${files.length} files), cf/worker.js, cf/schema.sql`);
