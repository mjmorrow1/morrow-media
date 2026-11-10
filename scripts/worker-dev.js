#!/usr/bin/env node
// Run the live Worker (cf/worker.js) locally, including the admin CRM + calendar, against a local SQLite "D1".
//   npm run build:cf && node scripts/worker-dev.js      → http://localhost:8787  (admin: /admin, same login as live via .env.admin)
// DB file: data/worker-dev.sqlite (git-ignored). Pass DB=:memory: for a throwaway run; ADMIN_ENV_FILE=<path> to use a different secrets file than .env.admin. Nothing here touches Cloudflare.
const http = require('http'); const fs = require('fs'); const path = require('path');
let Database; try { Database = require('better-sqlite3'); } catch { Database = require('./sqlite-shim'); }
const ROOT = path.join(__dirname, '..'); const PORT = +process.env.PORT || 8787;
const envFile = process.env.ADMIN_ENV_FILE || path.join(ROOT, '.env.admin'); const secrets = {};
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) secrets[m[1]] = m[2]; }
const db = new Database(process.env.DB || path.join(ROOT, 'data/worker-dev.sqlite'));
db.exec(fs.readFileSync(path.join(ROOT, 'cf/schema.sql'), 'utf8'));
// Minimal D1 API: prepare().bind().all/first/run, batch()
const stmt = (sql, args = []) => ({ sql, args, bind: (...a) => stmt(sql, a),
  async all() { const s = db.prepare(sql); return { results: s.reader ? s.all(...args) : (s.run(...args), []) }; },
  async first() { const s = db.prepare(sql); return (s.reader ? s.get(...args) : null) || null; },
  async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } });
const DB = { prepare: (sql) => stmt(sql), batch: (list) => Promise.resolve(db.transaction(() => list.map((s) => { const p = db.prepare(s.sql); return p.reader ? { results: p.all(...s.args) } : { results: [], meta: { changes: p.run(...s.args).changes } }; }))()) };
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const SITE = { async getWithMetadata(key) { const f = path.join(ROOT, 'cf/dist', path.normalize(key).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(path.join(ROOT, 'cf/dist')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return { value: null }; return { value: fs.readFileSync(f), metadata: { ct: MIME[path.extname(f)] } }; } };
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
(async () => {
  const W = (await import(path.join(ROOT, 'cf/worker.mjs'))).default;
  const env = { DB, SITE, ...secrets };
  http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = { ...req.headers, 'cf-connecting-ip': req.socket.remoteAddress };
    const r = await W.fetch(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'manual' }), env, { waitUntil() {} });
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  }).listen(PORT, '127.0.0.1', () => console.log(`Worker dev server on http://localhost:${PORT} (admin: /admin)`));
})();
