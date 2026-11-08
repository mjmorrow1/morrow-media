// Login for the local Express /admin — same credentials and hash format as the live Worker (cf/admin-src.js).
// Reads ADMIN_EMAIL, ADMIN_PASS_HASH, SESSION_SECRET from the environment or from .env.admin (git-ignored, hash only — never the password).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { esc } = require('./layout');

const envFile = path.join(__dirname, '..', '.env.admin');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const E = () => ({ email: String(process.env.ADMIN_EMAIL || '').toLowerCase(), hash: process.env.ADMIN_PASS_HASH || '', secret: process.env.SESSION_SECRET || '' });
const COOKIE = 'mm_admin', TTL = 7 * 24 * 3600, MAX_FAILS = 5, LOCK_MS = 15 * 60000;
const fails = new Map(); // ip → [timestamps]

const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function verify(pw, stored) {
  const [alg, it, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2_sha256' || !(+it > 0)) return false;
  return eq(crypto.pbkdf2Sync(String(pw), Buffer.from(salt, 'base64url'), +it, 32, 'sha256').toString('base64url'), hash);
}
const sign = (exp) => { const e = E(); return crypto.createHmac('sha256', e.secret).update(`v1|${e.email}|${exp}|${e.hash.slice(-12)}`).digest('base64url'); };
function hasSession(req) {
  const e = E(); if (!e.hash || !e.secret || !e.email) return false;
  const m = (req.get('cookie') || '').match(/(?:^|;\s*)mm_admin=([^;]+)/); if (!m) return false;
  const [exp, sig] = m[1].split('.'); return !!sig && +exp > Date.now() / 1000 && eq(sig, sign(exp));
}
const cookie = (v, age, secure) => `${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;

function loginPage(msg = '', email = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Sign in — ${esc(cfg.brand)}</title><link rel="stylesheet" href="/css/admin.css"><style>body{display:grid;place-items:center;background:#f2efe9}.box{background:#fff;border:1px solid #e5e2dc;border-radius:18px;padding:32px;width:min(400px,92vw)}label{display:block;margin:0 0 14px;font-size:12px;color:#666}input{display:block;width:100%;margin-top:6px;font:inherit;font-size:16px;padding:11px 13px;border:1px solid #ddd;border-radius:10px}button{width:100%;height:48px;border:0;border-radius:999px;background:#0d0d0c;color:#fff;font:600 12px/1 Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}.err{background:#fbeeee;border:1px solid #f0cccc;padding:8px 12px;border-radius:8px}</style></head>
<body><form class="box" method="post" action="/admin/login"><p class="brand" style="color:#111">${esc(cfg.brand)}<small>Admin sign in</small></p>${msg ? `<p class="err">${esc(msg)}</p>` : ''}
<label>Email<input type="email" name="email" value="${esc(email)}" autocomplete="username" required autofocus></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button>Sign in</button></form></body></html>`;
}

// Mount before the /admin routes.
function mount(app) {
  app.use('/admin', (req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); });
  app.get('/admin/login', (req, res) => (hasSession(req) ? res.redirect('/admin') : res.send(loginPage(E().hash ? '' : 'Set ADMIN_PASS_HASH in .env.admin (see DEPLOY.md).'))));
  app.post('/admin/login', (req, res) => {
    const ip = req.socket.remoteAddress || '', now = Date.now();
    const list = (fails.get(ip) || []).filter((t) => t > now - LOCK_MS);
    if (list.length >= MAX_FAILS) return res.status(429).send(loginPage('Too many failed attempts. Try again in 15 minutes.'));
    const e = E(), email = String(req.body.email || '').trim().toLowerCase();
    const ok = !!e.hash && verify(String(req.body.password || ''), e.hash) && eq(email, e.email);
    if (ok && e.secret) { fails.delete(ip); const exp = Math.floor(now / 1000) + TTL; res.set('Set-Cookie', cookie(`${exp}.${sign(exp)}`, TTL, req.secure)); return res.redirect(303, '/admin'); }
    list.push(now); fails.set(ip, list);
    res.status(list.length >= MAX_FAILS ? 429 : 401).send(loginPage(list.length >= MAX_FAILS ? 'Too many failed attempts. Try again in 15 minutes.' : 'Wrong email or password.', email));
  });
  app.all('/admin/logout', (req, res) => { res.set('Set-Cookie', cookie('', 0, req.secure)); res.redirect(303, '/admin/login'); });
  app.use('/admin', (req, res, next) => {
    if (hasSession(req)) return next();
    if (req.path.startsWith('/api')) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    return req.method === 'GET' ? res.redirect(302, '/admin/login') : res.sendStatus(401);
  });
}
module.exports = { mount, verify };
