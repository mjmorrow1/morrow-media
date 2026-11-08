// ───────── Admin dashboard (/admin) ─────────
// Inlined into cf/worker.js by scripts/build-cf.js. Auth needs three Worker secrets (never in code or KV):
//   ADMIN_EMAIL      login email
//   ADMIN_PASS_HASH  pbkdf2_sha256$<iterations>$<salt b64url>$<hash b64url>   (make with: node scripts/hash-password.js)
//   SESSION_SECRET   random string used to sign the session cookie (HMAC-SHA256)
// Failed logins are counted in D1 table admin_login_fails: 5 fails from one IP (IPv6: same /64) in 15 minutes = that IP is locked out for 15 minutes,
// and 20 fails from all IPs combined in 15 minutes = login paused for everyone for 15 minutes (stops attackers that rotate IPs).
const ADMIN_TABLES = ['brands', 'creators', 'events', 'sponsors'];
const COOKIE = '__Host-mm_admin';
const SESSION_TTL = 7 * 24 * 3600; // seconds
const MAX_FAILS = 5, GLOBAL_MAX_FAILS = 20, LOCK_MIN = 15;
const enc = new TextEncoder();
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
function safeEq(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const DUMMY_HASH = 'pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

async function verifyPassword(password, stored) {
  const [alg, it, salt, hash] = String(stored || DUMMY_HASH).split('$');
  if (alg !== 'pbkdf2_sha256' || !(+it > 0)) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(salt), iterations: +it }, key, 256);
  return safeEq(b64u(bits), hash);
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
// The signature covers the email, expiry and the tail of the password hash, so changing the password signs everyone out.
const sessionMsg = (env, exp) => `v1|${String(env.ADMIN_EMAIL).toLowerCase()}|${exp}|${String(env.ADMIN_PASS_HASH).slice(-12)}`;
async function makeSession(env) { const exp = Math.floor(Date.now() / 1000) + SESSION_TTL; return `${exp}.${await hmac(env.SESSION_SECRET, sessionMsg(env, exp))}`; }
async function hasSession(req, env) {
  if (!env.SESSION_SECRET || !env.ADMIN_PASS_HASH || !env.ADMIN_EMAIL) return false;
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE.replace(/[-]/g, '\\-') + '=([^;]+)'));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!sig || !(+exp > Date.now() / 1000)) return false;
  return safeEq(sig, await hmac(env.SESSION_SECRET, sessionMsg(env, exp)));
}
const cookieSet = (v, maxAge) => `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

function adminHeaders(extra = {}, nonce = '') {
  return { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff',
    'content-security-policy': `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, ...extra };
}
const adminJson = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...extra } });

const ADMIN_CSS = `*,*::before,*::after{box-sizing:border-box}
@font-face{font-family:Inter;src:url(/fonts/inter-latin-400-normal.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Inter;src:url(/fonts/inter-latin-500-normal.woff2) format("woff2");font-weight:500;font-display:swap}
@font-face{font-family:Inter;src:url(/fonts/inter-latin-600-normal.woff2) format("woff2");font-weight:600;font-display:swap}
@font-face{font-family:Cormorant;src:url(/fonts/cormorant-garamond-latin-400-italic.woff2) format("woff2");font-weight:400;font-style:italic;font-display:swap}
:root{--ink:#0d0d0c;--paper:#fbfaf7;--sand:#f2efe9;--stone:#e4e0d8;--muted:#6d6a64;--line:rgba(13,13,12,.12);--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;--serif:Cormorant,"Cormorant Garamond",Georgia,serif;--gut:clamp(16px,4vw,48px)}
body{margin:0;background:var(--paper);color:var(--ink);font:400 15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
.top{background:var(--ink);color:#f4f2ee}.top .in{max-width:1280px;margin:0 auto;padding:18px var(--gut);display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.logo{font:600 14px/1 var(--sans);letter-spacing:.26em;text-transform:uppercase;text-decoration:none;color:#fff}.logo small{letter-spacing:.14em;color:rgba(255,255,255,.55);font-weight:500;margin-left:10px}
.top .sp{flex:1}.top a.l,.top button.l{color:rgba(255,255,255,.8);text-decoration:none;font:500 11.5px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;background:none;border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:10px 16px;cursor:pointer}
.top a.l:hover,.top button.l:hover{background:#fff;color:var(--ink)}
.wrap{max-width:1280px;margin:0 auto;padding:28px var(--gut) 64px}
.eyebrow{font:500 11px/1.4 var(--sans);letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
h1{font:500 clamp(28px,4.5vw,44px)/1.05 var(--sans);letter-spacing:-.03em;margin:0 0 24px}h1 em{font:italic 400 1.08em var(--serif);letter-spacing:-.01em}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;text-decoration:none;display:block}.stat.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.stat b{display:block;font:500 34px/1.1 var(--sans);letter-spacing:-.03em}.stat span{font:500 11px/1.4 var(--sans);letter-spacing:.18em;text-transform:uppercase;opacity:.7}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 16px;align-items:center}.tabs a{text-decoration:none;font:500 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;padding:10px 14px;border-radius:999px;border:1px solid var(--line);background:#fff}.tabs a.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.tabs .csv{margin-left:auto;background:var(--sand)}
.msg{background:#eef6ef;border:1px solid #cfe5d3;padding:10px 14px;border-radius:10px;margin:0 0 16px}.err{background:#fbeeee;border-color:#f0cccc}
.list{display:grid;gap:12px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.card header{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}.card h3{margin:0;font:600 16px/1.3 var(--sans)}.card time{color:var(--muted);font-size:13px}.card .id{color:var(--muted);font-size:12px}
.card .sp{flex:1}.del{background:none;border:1px solid #e3c9c9;color:#a33;border-radius:999px;padding:6px 12px;font:500 11px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.del:hover{background:#a33;color:#fff}
dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 18px;margin:0}dl div{min-width:0}dt{font:500 10.5px/1.4 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}dd{margin:2px 0 0;overflow-wrap:anywhere;white-space:pre-wrap}dl .wide{grid-column:1/-1}
.empty{color:var(--muted);background:#fff;border:1px dashed var(--stone);border-radius:14px;padding:28px;text-align:center}
.login{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--sand)}.box{width:100%;max-width:400px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:32px}
.box .logo{color:var(--ink);display:block;margin-bottom:28px}.box h1{font-size:30px;margin-bottom:22px}
label{display:block;margin-bottom:14px}label span{display:block;font:500 11px/1.4 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
input{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--stone);border-radius:10px;background:var(--paper)}input:focus{outline:2px solid var(--ink);outline-offset:1px}
.btn{width:100%;height:50px;border:0;border-radius:999px;background:var(--ink);color:#fff;font:500 12.5px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;cursor:pointer;margin-top:8px}
.foot{margin-top:20px;font-size:13px;color:var(--muted);text-align:center}.foot a{color:var(--muted)}
@media (max-width:720px){.stats{grid-template-columns:repeat(2,1fr)}.tabs .csv{margin-left:0}.top .in{padding:14px var(--gut)}.logo small{display:none}}`;

function adminDoc(title, body, nonce = '', bodyClass = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${escH(title)} — ${escH(META.BRAND)}</title><style>${ADMIN_CSS}${CRM_CSS}${TICKETS_CSS}${typeof AI_CSS!=='undefined'?AI_CSS:''}</style></head><body class="${bodyClass}">${body}${nonce ? `<script nonce="${nonce}">document.querySelectorAll('form[data-confirm]').forEach(function(f){f.addEventListener('submit',function(e){if(!confirm(f.getAttribute('data-confirm')))e.preventDefault();});});${BOARD_JS}${typeof AI_JS!=='undefined'?AI_JS:''}document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var i=document.getElementById(b.getAttribute('data-copy'));i.select();(navigator.clipboard?navigator.clipboard.writeText(i.value):Promise.reject()).catch(function(){document.execCommand('copy');}).finally(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy';},1800);});});});</script>` : ''}</body></html>`;
}
function loginPage(msg = '', email = '', status = 200) {
  const body = `<div class="login"><div class="box"><a class="logo" href="/">${escH(META.BRAND)}</a><p class="eyebrow">Admin</p><h1>Sign <em>in</em></h1>
${msg ? `<p class="msg err" role="alert">${escH(msg)}</p>` : ''}<form method="post" action="/admin/login" autocomplete="on">
<label><span>Email</span><input type="email" name="email" value="${escH(email)}" autocomplete="username" required autofocus></label>
<label><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
<button class="btn" type="submit">Sign in</button></form><p class="foot"><a href="/">← Back to site</a></p></div></div>`;
  return new Response(adminDoc('Sign in', body), { status, headers: adminHeaders() });
}

const fmtET = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); if (isNaN(d)) return String(s);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d); };
const titleOf = (t, r) => r.company || r.name || r.event_name || r.contact_name || r.organizer || r.email || `#${r.id}`;
async function counts(env) {
  const rs = await env.DB.batch(ADMIN_TABLES.map((t) => env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`)));
  return Object.fromEntries(ADMIN_TABLES.map((t, i) => [t, rs[i].results[0].n]));
}
const rowsOf = async (env, t, limit = 1000) => (await env.DB.prepare(`SELECT * FROM ${t} ORDER BY id DESC LIMIT ?`).bind(limit).all()).results;

function fieldHtml(c, v) {
  v = v == null ? '' : String(v);
  let inner = escH(v);
  if (v && c.type === 'email') inner = `<a href="mailto:${escH(v)}">${escH(v)}</a>`;
  else if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) inner = `<a href="${escH(v)}" target="_blank" rel="noopener noreferrer nofollow">${escH(v)}</a>`;
  return `<div${c.type === 'long' ? ' class="wide"' : ''}><dt>${escH(c.label)}</dt><dd>${inner || '<span style="color:#b3aea5">—</span>'}</dd></div>`;
}
async function dashboard(env, url) {
  const t = ADMIN_TABLES.includes(url.searchParams.get('t')) ? url.searchParams.get('t') : 'brands';
  const [n, rows, widget, kw, sgw, cs] = await Promise.all([counts(env), rowsOf(env, t), homeWidget(env), kpiWidget(env), signingsWidget(env), env.DB.prepare('SELECT id, email, src_table, src_id FROM contacts').all()]);
  const byEmail = {}, bySrc = {}; for (const c of cs.results) { if (c.email) byEmail[c.email] = c.id; if (c.src_table) bySrc[c.src_table + ':' + c.src_id] = c.id; }
  const T = TABLES[t];
  const stats = ADMIN_TABLES.map((k) => `<a class="stat${k === t ? ' on' : ''}" href="/admin?t=${k}"><b>${n[k]}</b><span>${escH(TABLES[k].label)}</span></a>`).join('');
  const tabs = ADMIN_TABLES.map((k) => `<a href="/admin?t=${k}"${k === t ? ' class="on" aria-current="page"' : ''}>${escH(TABLES[k].label)} (${n[k]})</a>`).join('') + `<a class="csv" href="/admin/export/${t}.csv">Export ${escH(T.label)} CSV</a>`;
  const cards = rows.length ? rows.map((r) => { const cid = bySrc[t + ':' + r.id] || (r.email && byEmail[String(r.email).trim().toLowerCase()]);
    return `<article class="card" id="r${r.id}"><header><h3>${escH(titleOf(t, r))}</h3><span class="id">#${r.id}</span><time datetime="${escH(r.created_at)}">${escH(fmtET(r.created_at))}</time><span class="sp"></span>
${cid ? `<a class="b sm" href="/admin/contacts/${cid}">View contact</a>` : `<a class="b sm dark" href="/admin/contacts/new?from=${t}:${r.id}">Convert to contact</a>`}
<form method="post" action="/admin/delete" data-confirm="Delete this ${escH(T.label.replace(/s$/, '').toLowerCase())} submission (#${r.id})? This can't be undone."><input type="hidden" name="table" value="${t}"><input type="hidden" name="id" value="${r.id}"><button class="del" type="submit">Delete</button></form></header>
<dl>${T.columns.map((c) => fieldHtml(c, r[c.key])).join('')}${fieldHtml({ label: 'Source' }, r.source)}</dl></article>`; }).join('')
    : `<p class="empty">No ${escH(T.label.toLowerCase())} submissions yet. Website forms land here automatically.</p>`;
  const body = `<p class="eyebrow">Website submissions · times in Eastern (America/New_York)</p><h1>Dashboard <em>&amp; inbox</em></h1>
${widget}${kw}${sgw}<div class="stats">${stats}</div><nav class="tabs" aria-label="Tables">${tabs}</nav>
<p class="eyebrow">${escH(T.desc)} · newest first${rows.length >= 1000 ? ' · showing latest 1,000 (CSV has all)' : ''}</p><div class="list">${cards}</div>`;
  return adminPage('Dashboard', 'subs', body, { msg: url.searchParams.get('msg') || '' });
}
async function csvExport(env, t) {
  const cols = ['id', ...TABLES[t].columns.map((c) => c.key), 'source', 'created_at_et', 'created_at_utc'];
  const rows = (await env.DB.prepare(`SELECT * FROM ${t} ORDER BY id DESC`).all()).results;
  const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const out = [cols.join(','), ...rows.map((r) => cols.map((c) => q(c === 'created_at_et' ? fmtET(r.created_at) : c === 'created_at_utc' ? r.created_at : r[c])).join(','))].join('\r\n');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  return new Response('\ufeff' + out + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="morrow-media-${t}-${day}.csv"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
// IPv6 users often rotate addresses inside their /64, so group by that prefix.
function ipKey(ip) {
  if (!ip.includes(':')) return ip;
  let [head, tail = ''] = ip.split('::'); const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return full.slice(0, 4).map((x) => (x || '0').toLowerCase()).join(':') + '::/64';
}
async function locked(env, key) {
  const since = Date.now() - LOCK_MIN * 60000;
  const r = await env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END) AS mine FROM admin_login_fails WHERE at > ?').bind(key, since).first();
  return !!r && ((r.mine || 0) >= MAX_FAILS || (r.total || 0) >= GLOBAL_MAX_FAILS);
}
async function login(req, env) {
  const ip = ipKey(req.headers.get('cf-connecting-ip') || 'unknown');
  const lockMsg = `Too many failed attempts. Try again in ${LOCK_MIN} minutes.`;
  if (!env.ADMIN_PASS_HASH || !env.SESSION_SECRET || !env.ADMIN_EMAIL) return loginPage('Admin login is not configured yet.', '', 503);
  if (await locked(env, ip)) return loginPage(lockMsg, '', 429);
  let body = {}; try { body = await readBody(req); } catch {}
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200), password = String(body.password || '').slice(0, 200);
  const passOk = await verifyPassword(password, env.ADMIN_PASS_HASH); // always run, so timing doesn't reveal the email
  if (passOk && safeEq(email, String(env.ADMIN_EMAIL).toLowerCase())) {
    await env.DB.prepare('DELETE FROM admin_login_fails WHERE ip = ? OR at < ?').bind(ip, Date.now() - 86400000).run();
    return new Response(null, { status: 303, headers: { location: '/admin', 'set-cookie': cookieSet(await makeSession(env), SESSION_TTL), 'cache-control': 'no-store' } });
  }
  await env.DB.prepare('INSERT INTO admin_login_fails (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run();
  const now = await locked(env, ip);
  return loginPage(now ? lockMsg : 'Wrong email or password.', email, now ? 429 : 401);
}
async function admin(req, env, url, p) {
  const isApi = p === '/admin/api' || p.startsWith('/admin/api/');
  // Cross-site POSTs are rejected (on top of the SameSite=Strict cookie).
  // Cross-site requests are rejected (on top of the SameSite=Strict cookie): every non-GET must carry a same-origin Origin, or Referer if Origin is absent.
  if (req.method !== 'GET' && req.method !== 'HEAD') { const o = req.headers.get('origin'), r = req.headers.get('referer') || '';
    if (o ? o !== url.origin : !(r === url.origin || r.startsWith(url.origin + '/'))) return new Response('Forbidden: cross-site request', { status: 403, headers: { 'cache-control': 'no-store' } }); }
  if (p === '/admin/login') {
    if (req.method === 'POST') return login(req, env);
    return (await hasSession(req, env)) ? new Response(null, { status: 302, headers: { location: '/admin' } }) : loginPage();
  }
  if (p === '/admin/logout') return new Response(null, { status: 303, headers: { location: '/admin/login', 'set-cookie': cookieSet('', 0), 'cache-control': 'no-store' } });
  if (!(await hasSession(req, env))) {
    if (isApi) return adminJson({ ok: false, error: 'Unauthorized' }, 401, { 'www-authenticate': 'Cookie' });
    if (p === '/admin' && req.method === 'GET') return loginPage('', '', 200);
    return new Response(null, { status: 302, headers: { location: '/admin/login', 'cache-control': 'no-store' } });
  }
  // ── Signed in
  if (isApi) {
    if (p === '/admin/api' || p === '/admin/api/summary') return adminJson({ ok: true, counts: await counts(env) });
    const t = p.slice('/admin/api/'.length);
    if (ADMIN_TABLES.includes(t) && req.method === 'GET') return adminJson({ ok: true, table: t, rows: await rowsOf(env, t) });
    // Site AI chat/apply are POSTs under /admin/api/ai/*
    if (p.startsWith('/admin/api/ai')) { const ai = await aiApi(env, req, p, url); if (ai) return ai; }
    const crm = req.method === 'GET' ? await crmApi(env, p, url) : null; if (crm) return crm;
    return adminJson({ ok: false, error: 'Not found' }, 404);
  }
  if (p === '/admin' && req.method === 'GET') return dashboard(env, url);
  const crm = await crmRoute(req, env, url, p); if (crm) return crm;
  const ex = p.match(/^\/admin\/export\/([a-z]+)\.csv$/);
  if (ex && ADMIN_TABLES.includes(ex[1]) && req.method === 'GET') return csvExport(env, ex[1]);
  if (p === '/admin/delete' && req.method === 'POST') {
    const b = await readBody(req); const t = String(b.table || ''), id = Number(b.id);
    if (!ADMIN_TABLES.includes(t) || !Number.isInteger(id) || id < 1) return new Response('Bad request', { status: 400 });
    const r = await env.DB.prepare(`DELETE FROM ${t} WHERE id = ?`).bind(id).run();
    const msg = r.meta.changes ? `Deleted ${TABLES[t].label.replace(/s$/, '').toLowerCase()} submission #${id}.` : `Submission #${id} was already gone.`;
    return new Response(null, { status: 303, headers: { location: `/admin?t=${t}&msg=${encodeURIComponent(msg)}`, 'cache-control': 'no-store' } });
  }
  return new Response('Not found', { status: 404, headers: adminHeaders() });
}
