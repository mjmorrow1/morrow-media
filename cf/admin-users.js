// Multi-user admin accounts. Concatenated into the Worker. The owner login
// (ADMIN_EMAIL + ADMIN_PASS_HASH) is unchanged. matt@sbridgemedia.com, when
// that address is the owner secret, always has every permission. Other users
// receive only the catalog grants stored for them.
const USERS_OWNER = 'matt@sbridgemedia.com';
const USERS_ITER = 100000;
const usersEnc = new TextEncoder();
const usersB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const usersUnb64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
function usersEq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const USERS_DUMMY = 'pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function usersEsc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function usersOwnerEmail(env) { return String(env.ADMIN_EMAIL || '').trim().toLowerCase(); }
function usersIsOwnerAccount(env, email) { return usersEq(String(email || '').trim().toLowerCase(), USERS_OWNER) && usersEq(usersOwnerEmail(env), USERS_OWNER); }
function usersCanManage(who, env) { return !!(who && who.role === 'owner' && usersIsOwnerAccount(env, who.email)); }

async function usersVerify(password, stored) {
  const [alg, it, salt, hash] = String(stored || USERS_DUMMY).split('$');
  if (alg !== 'pbkdf2_sha256' || !(+it > 0)) return false;
  const key = await crypto.subtle.importKey('raw', usersEnc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: usersUnb64(salt), iterations: +it }, key, 256);
  return usersEq(usersB64(bits), hash);
}
async function usersHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', usersEnc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: USERS_ITER }, key, 256);
  return `pbkdf2_sha256$${USERS_ITER}$${usersB64(salt)}$${usersB64(bits)}`;
}
async function usersHmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', usersEnc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return usersB64(await crypto.subtle.sign('HMAC', key, usersEnc.encode(msg)));
}
async function usersSha(s) {
  const buf = await crypto.subtle.digest('SHA-256', usersEnc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function usersEmailOk(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200; }
function usersPassOk(pw) { return typeof pw === 'string' && pw.length >= 10 && pw.length <= 200; }

async function usersEnsure(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    pass_hash TEXT,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_permissions (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_user_permissions (
    email TEXT NOT NULL,
    perm TEXT NOT NULL,
    PRIMARY KEY (email, perm)
  )`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO admin_permissions (key, label, sort) VALUES ('dashboard', 'View admin dashboard', 1), ('permissions', 'Access permissions screen', 2)`).run();
}
async function usersCatalog(env) {
  await usersEnsure(env);
  return (await env.DB.prepare('SELECT key, label, sort FROM admin_permissions ORDER BY sort, label COLLATE NOCASE').all()).results || [];
}
async function usersGrantMap(env) {
  await usersEnsure(env);
  const rows = (await env.DB.prepare('SELECT email, perm FROM admin_user_permissions').all()).results || [];
  const map = {};
  for (const r of rows) (map[r.email] || (map[r.email] = {}))[r.perm] = true;
  return map;
}
async function usersHas(who, env, key) {
  if (!who) return false;
  if (who.role === 'owner' && usersIsOwnerAccount(env, who.email)) return true;
  await usersEnsure(env);
  const row = await env.DB.prepare('SELECT 1 AS n FROM admin_user_permissions WHERE email = ? AND perm = ?').bind(who.email, key).first();
  return !!row;
}
function usersSlug(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
async function usersAddPermission(env, label) {
  await usersEnsure(env);
  label = String(label || '').trim().slice(0, 80);
  const key = usersSlug(label);
  if (label.length < 2 || !key) return { ok: false, error: 'Name the permission with letters or numbers.' };
  if (await env.DB.prepare('SELECT key FROM admin_permissions WHERE key = ?').bind(key).first()) return { ok: false, error: 'That permission already exists.' };
  const n = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS n FROM admin_permissions').first();
  await env.DB.prepare('INSERT INTO admin_permissions (key, label, sort) VALUES (?, ?, ?)').bind(key, label, (n && n.n || 0) + 1).run();
  return { ok: true, key, label };
}
async function usersSetGrants(env, email, keys) {
  await usersEnsure(env);
  email = String(email || '').trim().toLowerCase();
  if (usersEq(email, USERS_OWNER) || usersEq(email, usersOwnerEmail(env))) return { ok: false, error: 'The owner always has every permission. That cannot be changed.' };
  const row = await usersGet(env, email);
  if (!row) return { ok: false, error: 'No such user.' };
  const catalog = await usersCatalog(env);
  const allowed = {};
  for (const p of catalog) allowed[p.key] = true;
  const chosen = [...new Set((keys || []).map((k) => String(k)))].filter((k) => allowed[k]);
  await env.DB.prepare('DELETE FROM admin_user_permissions WHERE email = ?').bind(email).run();
  for (const key of chosen) await env.DB.prepare('INSERT INTO admin_user_permissions (email, perm) VALUES (?, ?)').bind(email, key).run();
  return { ok: true, keys: chosen };
}
async function usersGet(env, email) {
  return env.DB.prepare('SELECT id, email, pass_hash, disabled, created_at FROM admin_users WHERE email = ?').bind(email).first();
}
async function usersList(env) {
  return (await env.DB.prepare('SELECT id, email, pass_hash, disabled, created_at FROM admin_users ORDER BY email COLLATE NOCASE').all()).results || [];
}
function usersToken() { return usersB64(crypto.getRandomValues(new Uint8Array(32))); }
async function usersIssueToken(env, email, purpose, ttlSec) {
  const token = usersToken();
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  await env.DB.prepare('DELETE FROM admin_tokens WHERE email = ? AND purpose = ?').bind(email, purpose).run();
  await env.DB.prepare('INSERT INTO admin_tokens (email, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(email, purpose, await usersSha(token), exp).run();
  return token;
}
async function usersPeekToken(env, token) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await env.DB.prepare('SELECT id, email, purpose, expires_at, used_at FROM admin_tokens WHERE token_hash = ?').bind(await usersSha(token)).first();
  if (!row || row.used_at || row.expires_at < Math.floor(Date.now() / 1000)) return null;
  return row;
}
async function usersConsumeToken(env, token) {
  const row = await usersPeekToken(env, token);
  if (!row) return null;
  await env.DB.prepare('UPDATE admin_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(Math.floor(Date.now() / 1000), row.id).run();
  return row;
}

async function usersMakeOwnerSession(env) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const msg = `v1|${usersOwnerEmail(env)}|${exp}|${String(env.ADMIN_PASS_HASH).slice(-12)}`;
  return `${exp}.${await usersHmac(env.SESSION_SECRET, msg)}`;
}
async function usersMakeUserSession(env, email, passHash) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const msg = `v2|user|${email}|${exp}|${String(passHash).slice(-12)}`;
  return `v2.user.${usersB64(usersEnc.encode(email))}.${exp}.${await usersHmac(env.SESSION_SECRET, msg)}`;
}
function usersCookieValue(req) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)__Host-mm_admin=([^;]+)/);
  return m ? m[1] : '';
}
async function usersReadSession(req, env) {
  if (!env.SESSION_SECRET || !env.ADMIN_PASS_HASH || !env.ADMIN_EMAIL) return null;
  const raw = usersCookieValue(req);
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length === 5 && parts[0] === 'v2' && parts[1] === 'user') {
    let email = '';
    try { email = new TextDecoder().decode(usersUnb64(parts[2])); } catch { return null; }
    email = email.trim().toLowerCase();
    const exp = parts[3], sig = parts[4];
    if (!sig || !(+exp > Date.now() / 1000) || usersEq(email, usersOwnerEmail(env))) return null;
    await usersEnsure(env);
    const row = await usersGet(env, email);
    const tail = row && row.pass_hash ? String(row.pass_hash).slice(-12) : '000000000000';
    const expect = await usersHmac(env.SESSION_SECRET, `v2|user|${email}|${exp}|${tail}`);
    if (!usersEq(sig, expect)) return null;
    if (!row || row.disabled || !row.pass_hash) return null;
    return { role: 'user', email };
  }
  if (parts.length !== 2) return null;
  const [exp, sig] = parts;
  if (!sig || !(+exp > Date.now() / 1000)) return null;
  const msg = `v1|${String(env.ADMIN_EMAIL).toLowerCase()}|${exp}|${String(env.ADMIN_PASS_HASH).slice(-12)}`;
  if (!usersEq(sig, await usersHmac(env.SESSION_SECRET, msg))) return null;
  return { role: 'owner', email: usersOwnerEmail(env) };
}

async function usersTryLogin(env, email, password) {
  await usersEnsure(env);
  if (!email || usersEq(email, usersOwnerEmail(env))) {
    await usersVerify(password, USERS_DUMMY);
    return null;
  }
  const row = await usersGet(env, email);
  const ok = await usersVerify(password, row && row.pass_hash ? row.pass_hash : USERS_DUMMY);
  if (!ok || !row || row.disabled || !row.pass_hash) return null;
  return { email: row.email, session: await usersMakeUserSession(env, row.email, row.pass_hash) };
}

async function usersProvision(env, email) {
  await usersEnsure(env);
  email = String(email || '').trim().toLowerCase();
  if (!usersEmailOk(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (usersEq(email, usersOwnerEmail(env)) || usersEq(email, USERS_OWNER)) return { ok: false, error: 'That address is the owner account. It already signs in with the admin password.' };
  const existing = await usersGet(env, email);
  if (existing) return { ok: false, error: 'That email is already provisioned.', user: existing };
  await env.DB.prepare('INSERT INTO admin_users (email, disabled, created_at, updated_at) VALUES (?, 0, datetime(\'now\'), datetime(\'now\'))').bind(email).run();
  await env.DB.prepare('INSERT OR IGNORE INTO admin_user_permissions (email, perm) VALUES (?, \'dashboard\')').bind(email).run();
  const token = await usersIssueToken(env, email, 'setup', 7 * 24 * 3600);
  return { ok: true, email, token };
}
async function usersSetPassword(env, email, password) {
  if (!usersPassOk(password)) return { ok: false, error: 'Use at least 10 characters.' };
  const row = await usersGet(env, email);
  if (!row || row.disabled) return { ok: false, error: 'This account cannot set a password.' };
  const hash = await usersHash(password);
  await env.DB.prepare('UPDATE admin_users SET pass_hash = ?, updated_at = datetime(\'now\') WHERE email = ?').bind(hash, email).run();
  await env.DB.prepare('DELETE FROM admin_tokens WHERE email = ?').bind(email).run();
  return { ok: true };
}
async function usersReset(env, email) {
  const row = await usersGet(env, email);
  if (!row) return { ok: false, error: 'No such user.' };
  await env.DB.prepare('UPDATE admin_users SET pass_hash = NULL, updated_at = datetime(\'now\') WHERE email = ?').bind(email).run();
  const token = await usersIssueToken(env, email, 'reset', 7 * 24 * 3600);
  return { ok: true, token, email };
}
async function usersSetDisabled(env, email, disabled) {
  if (usersEq(email, USERS_OWNER) || usersEq(email, usersOwnerEmail(env))) return { ok: false, error: 'The owner account cannot be disabled here.' };
  const row = await usersGet(env, email);
  if (!row) return { ok: false, error: 'No such user.' };
  await env.DB.prepare('UPDATE admin_users SET disabled = ?, updated_at = datetime(\'now\') WHERE email = ?').bind(disabled ? 1 : 0, email).run();
  if (disabled) await env.DB.prepare('DELETE FROM admin_tokens WHERE email = ?').bind(email).run();
  return { ok: true };
}
async function usersRemove(env, email) {
  if (usersEq(email, USERS_OWNER) || usersEq(email, usersOwnerEmail(env))) return { ok: false, error: 'The owner account cannot be removed.' };
  await env.DB.prepare('DELETE FROM admin_tokens WHERE email = ?').bind(email).run();
  await env.DB.prepare('DELETE FROM admin_user_permissions WHERE email = ?').bind(email).run();
  const r = await env.DB.prepare('DELETE FROM admin_users WHERE email = ?').bind(email).run();
  return { ok: !!(r.meta && r.meta.changes) };
}
function usersRejectOwnerChange() { return { ok: false, error: 'Only matt@sbridgemedia.com can manage users, and that access cannot be removed.' }; }

function usersNavItems(canPerms, isOwner, path) {
  const items = [['Home', '/admin', 'subs'], ['Contacts', '/admin/contacts', 'contacts'], ['Calendar', '/admin/calendar', 'calendar'], ['Tickets', '/admin/tickets', 'tickets'], ['KPIs', '/admin/kpis', 'kpis'], ['Signings', '/admin/signings', 'signings']];
  if (isOwner) items.push(['Site AI', '/admin/ai', 'ai']);
  if (canPerms) items.push(['Users', '/admin/users', 'users'], ['Permissions', '/admin/permissions', 'perms']);
  items.push(['Setup guide', '/admin/setup', 'setup']);
  const on = path.startsWith('/admin/users') ? 'users' : path.startsWith('/admin/permissions') ? 'perms' : path.startsWith('/admin/ai') ? 'ai' : path.startsWith('/admin/contacts') ? 'contacts' : path.startsWith('/admin/calendar') ? 'calendar' : path.startsWith('/admin/tickets') ? 'tickets' : path.startsWith('/admin/kpis') ? 'kpis' : path.startsWith('/admin/signings') ? 'signings' : path.startsWith('/admin/setup') ? 'setup' : 'subs';
  return items.map(([l, h, k]) => `<a href="${h}"${k === on ? ' class="on" aria-current="page"' : ''}>${l}</a>`).join('');
}
async function usersDecorateHtml(html, who, env, path) {
  if (!html || html.indexOf('aria-label="Admin"') < 0) return html;
  const isOwner = !!(who && who.role === 'owner' && usersIsOwnerAccount(env, who.email));
  const canPerms = isOwner || await usersHas(who, env, 'permissions');
  return html.replace(/<nav aria-label="Admin">[\s\S]*?<\/nav>/, `<nav aria-label="Admin">${usersNavItems(canPerms, isOwner, path)}</nav>`);
}
function usersOrigin(url) {
  const host = String(url && url.hostname || '').toLowerCase();
  if (host === 'sbridgemedia.com' || host === 'www.sbridgemedia.com' || host === 'morrowmediagroup.com' || host === 'www.morrowmediagroup.com') return url.origin;
  return 'https://sbridgemedia.com';
}

function usersDrop(user, catalog, grants, open) {
  const have = grants[user.email] || {};
  const boxes = catalog.map((p) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;white-space:nowrap"><input type="checkbox" name="perm" value="${usersEsc(p.key)}"${have[p.key] ? ' checked' : ''}> ${usersEsc(p.label)}</label>`).join('');
  return `<details class="perm-drop"${open ? ' open' : ''} style="position:relative"><summary style="cursor:pointer;font:500 11.5px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase">Permissions</summary>
<form method="post" action="/admin/users/permissions" style="position:absolute;z-index:5;right:0;margin-top:8px;background:#fff;border:1px solid rgba(13,13,12,.12);border-radius:12px;padding:12px 14px;min-width:280px;box-shadow:0 12px 30px rgba(0,0,0,.12)">
<input type="hidden" name="email" value="${usersEsc(user.email)}">${boxes}<button class="b sm dark" type="submit" style="margin-top:8px">Save</button></form></details>`;
}
function usersCards(rows, catalog, grants, link, openEmail) {
  const cards = rows.map((u) => {
    const state = u.disabled ? 'Disabled' : (u.pass_hash ? 'Active' : 'Waiting for password');
    return `<article class="card"><header><h3>${usersEsc(u.email)}</h3><span class="id">${usersEsc(state)}</span><span class="sp"></span>${usersDrop(u, catalog, grants, openEmail === u.email)}</header>
<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
<form method="post" action="/admin/users/reset"><input type="hidden" name="email" value="${usersEsc(u.email)}"><button class="b sm" type="submit">Reset password</button></form>
<form method="post" action="/admin/users/disable"><input type="hidden" name="email" value="${usersEsc(u.email)}"><input type="hidden" name="disabled" value="${u.disabled ? '0' : '1'}"><button class="b sm" type="submit">${u.disabled ? 'Enable' : 'Disable'}</button></form>
<form method="post" action="/admin/users/remove" data-confirm="Remove ${usersEsc(u.email)}? They will not be able to sign in."><input type="hidden" name="email" value="${usersEsc(u.email)}"><button class="b sm red" type="submit">Remove</button></form>
</div></article>`;
  }).join('');
  const banner = link ? `<div class="note" style="margin:0 0 16px"><p style="margin:0 0 8px">Copy this one-time link. It expires in 7 days and works once.</p><div style="display:flex;gap:8px"><input id="invite" readonly value="${usersEsc(link)}"><button class="b sm dark" type="button" data-copy="invite">Copy</button></div></div>` : '';
  return `${banner}<form class="form" method="post" action="/admin/users" style="margin-bottom:22px">${usersField('Email', '<input type="email" name="email" required maxlength="200" autocomplete="off" placeholder="name@company.com">')}<div class="acts"><button class="b dark" type="submit">Add user</button></div></form>${rows.length ? `<div class="list">${cards}</div>` : '<p class="empty">No provisioned users yet. Add an email and send them the setup link.</p>'}`;
}
function usersField(label, inner) { return `<label class="wide"><span>${usersEsc(label)}</span>${inner}</label>`; }
function usersPage(rows, catalog, grants, link, openEmail) {
  return `<p class="eyebrow">${usersEsc(USERS_OWNER)}</p><h1>Users</h1><p class="note">Add an email, then set that person's permissions in the dropdown. New accounts start with View admin dashboard. Access permissions screen also opens this Users page. The owner always has every permission.</p><br>${usersCards(rows, catalog, grants, link, openEmail)}`;
}
function usersPermPage(env, catalog, rows, grants) {
  const owner = usersOwnerEmail(env) || USERS_OWNER;
  const cards = catalog.map((p) => {
    const who = [owner, ...rows.filter((u) => grants[u.email] && grants[u.email][p.key]).map((u) => u.email)];
    return `<article class="card"><header><h3>${usersEsc(p.label)}</h3><span class="id">${usersEsc(p.key)}</span></header><p style="margin:0">${who.map(usersEsc).join(', ')}</p></article>`;
  }).join('');
  return `<p class="eyebrow">Catalog</p><h1>Permissions</h1><p class="note">${usersEsc(owner)} has every permission and cannot be edited down. Add a permission here and it shows up in each user's dropdown. Users and this screen both require Access permissions screen. Site AI stays with the owner.</p><br>
<form class="form" method="post" action="/admin/permissions" style="margin-bottom:22px">${usersField('New permission', '<input name="label" required maxlength="80" placeholder="Example: Edit tickets">')}<div class="acts"><button class="b dark" type="submit">Add permission</button></div></form>
<div class="list">${cards}</div>`;
}
function usersBlockedHtml() {
  return `<div class="login"><div class="box"><p class="eyebrow">Admin</p><h1>No <em>access</em></h1><p>Your account does not include View admin dashboard.</p><form method="post" action="/admin/logout"><button class="btn" type="submit">Log out</button></form></div></div>`;
}
function usersSetupHtml({ msg, email, token, err }) {
  const alert = msg ? `<p class="msg${err ? ' err' : ''}" role="alert">${usersEsc(msg)}</p>` : '';
  const form = token
    ? `<form method="post" action="/admin/setup-account"><input type="hidden" name="token" value="${usersEsc(token)}"><label><span>New password</span><input type="password" name="password" required minlength="10" maxlength="200" autocomplete="new-password"></label><label><span>Confirm password</span><input type="password" name="confirm" required minlength="10" maxlength="200" autocomplete="new-password"></label><button class="btn" type="submit">Save password</button></form>`
    : `<form method="post" action="/admin/setup-account"><label><span>Email</span><input type="email" name="email" value="${usersEsc(email || '')}" required maxlength="200" autocomplete="username"></label><button class="btn" type="submit">Continue</button></form>`;
  return `<div class="login"><div class="box"><p class="eyebrow">Admin</p><h1>${token ? 'Set your <em>password</em>' : 'Create <em>account</em>'}</h1>${alert}${form}<p class="foot"><a href="/admin/login">← Sign in</a></p></div></div>`;
}

async function usersSetup(req, env, url) {
  await usersEnsure(env);
  const ip = ipKey(req.headers.get('cf-connecting-ip') || 'unknown');
  if (req.method === 'GET') {
    const token = String(url.searchParams.get('token') || '');
    if (token) {
      const row = await usersPeekToken(env, token);
      if (!row) return new Response(adminDoc('Create account', usersSetupHtml({ msg: 'This link is invalid or expired. Enter your email to start again.', err: true })), { status: 400, headers: adminHeaders() });
      return new Response(adminDoc('Create account', usersSetupHtml({ token, email: row.email })), { headers: adminHeaders() });
    }
    return new Response(adminDoc('Create account', usersSetupHtml({})), { headers: adminHeaders() });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (await locked(env, ip)) return new Response(adminDoc('Create account', usersSetupHtml({ msg: 'Too many attempts. Try again in 15 minutes.', err: true })), { status: 429, headers: adminHeaders() });
  let body = {}; try { body = await readBody(req); } catch {}
  const token = String(body.token || '');
  if (token) {
    const row = await usersPeekToken(env, token);
    if (!row) {
      await env.DB.prepare('INSERT INTO admin_login_fails (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run();
      return new Response(adminDoc('Create account', usersSetupHtml({ msg: 'This link is invalid or expired.', err: true })), { status: 400, headers: adminHeaders() });
    }
    const password = String(body.password || ''), confirm = String(body.confirm || '');
    if (!usersEq(password, confirm)) return new Response(adminDoc('Create account', usersSetupHtml({ token, email: row.email, msg: 'Those passwords do not match.', err: true })), { status: 400, headers: adminHeaders() });
    const set = await usersSetPassword(env, row.email, password);
    if (!set.ok) return new Response(adminDoc('Create account', usersSetupHtml({ token, email: row.email, msg: set.error, err: true })), { status: 400, headers: adminHeaders() });
    return new Response(null, { status: 303, headers: { location: '/admin/login', 'cache-control': 'no-store' } });
  }
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const row = usersEmailOk(email) ? await usersGet(env, email) : null;
  if (!row || row.disabled || row.pass_hash || usersEq(email, usersOwnerEmail(env))) {
    await env.DB.prepare('INSERT INTO admin_login_fails (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run();
    return new Response(adminDoc('Create account', usersSetupHtml({ email, msg: 'If that email was provisioned and has no password yet, check it and try again. Otherwise ask the owner.', err: true })), { status: 400, headers: adminHeaders() });
  }
  const issued = await usersIssueToken(env, email, 'setup', 2 * 3600);
  return new Response(null, { status: 303, headers: { location: '/admin/setup-account?token=' + encodeURIComponent(issued), 'cache-control': 'no-store' } });
}

async function usersAdmin(req, env, url, p) {
  await usersEnsure(env);
  const linkOf = (token) => token ? `${usersOrigin(url)}/admin/setup-account?token=${encodeURIComponent(token)}` : '';
  const pageData = async () => ({ rows: await usersList(env), catalog: await usersCatalog(env), grants: await usersGrantMap(env) });
  if (p === '/admin/permissions' && req.method === 'GET') {
    const d = await pageData();
    return adminPage('Permissions', 'perms', usersPermPage(env, d.catalog, d.rows, d.grants), { msg: url.searchParams.get('msg') || '' });
  }
  if (p === '/admin/permissions' && req.method === 'POST') {
    let body = {}; try { body = await readBody(req); } catch {}
    if (body.email) return new Response(null, { status: 303, headers: { location: '/admin/permissions?msg=' + encodeURIComponent(usersRejectOwnerChange().error), 'cache-control': 'no-store' } });
    const added = await usersAddPermission(env, body.label);
    const msg = added.ok ? 'Added ' + added.label + '. It now appears on every user.' : added.error;
    return new Response(null, { status: 303, headers: { location: '/admin/permissions?msg=' + encodeURIComponent(msg), 'cache-control': 'no-store' } });
  }
  if (p === '/admin/users' && req.method === 'GET') {
    const d = await pageData();
    const issued = String(url.searchParams.get('issued') || '');
    const open = String(url.searchParams.get('open') || '');
    return adminPage('Users', 'users', usersPage(d.rows, d.catalog, d.grants, issued ? linkOf(issued) : '', open), { msg: url.searchParams.get('msg') || '' });
  }
  if (req.method !== 'POST') return new Response('Not found', { status: 404, headers: adminHeaders() });
  let body = {}; try { body = await readBody(req); } catch {}
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  if (p === '/admin/users/permissions') {
    let keys = body.perm;
    if (keys == null) keys = [];
    else if (!Array.isArray(keys)) keys = [keys];
    const saved = await usersSetGrants(env, email, keys);
    const msg = saved.ok ? 'Saved permissions for ' + email + '.' : saved.error;
    return new Response(null, { status: 303, headers: { location: '/admin/users?open=' + encodeURIComponent(email) + '&msg=' + encodeURIComponent(msg), 'cache-control': 'no-store' } });
  }
  if (p === '/admin/users') {
    const made = await usersProvision(env, email);
    if (!made.ok) {
      const d = await pageData();
      return adminPage('Users', 'users', usersPage(d.rows, d.catalog, d.grants, '', ''), { msg: made.error, err: true, status: 400 });
    }
    return new Response(null, { status: 303, headers: { location: '/admin/users?issued=' + encodeURIComponent(made.token) + '&open=' + encodeURIComponent(made.email) + '&msg=' + encodeURIComponent('Provisioned ' + email + '.'), 'cache-control': 'no-store' } });
  }
  if (p === '/admin/users/reset') {
    const reset = await usersReset(env, email);
    if (!reset.ok) return new Response(null, { status: 303, headers: { location: '/admin/users?msg=' + encodeURIComponent(reset.error), 'cache-control': 'no-store' } });
    return new Response(null, { status: 303, headers: { location: '/admin/users?issued=' + encodeURIComponent(reset.token) + '&msg=' + encodeURIComponent('Password cleared for ' + email + '. Send them this new link.'), 'cache-control': 'no-store' } });
  }
  if (p === '/admin/users/disable') {
    const r = await usersSetDisabled(env, email, String(body.disabled) === '1');
    const msg = r.ok ? (String(body.disabled) === '1' ? 'Disabled ' + email + '.' : 'Enabled ' + email + '.') : r.error;
    return new Response(null, { status: 303, headers: { location: '/admin/users?msg=' + encodeURIComponent(msg), 'cache-control': 'no-store' } });
  }
  if (p === '/admin/users/remove') {
    const r = await usersRemove(env, email);
    return new Response(null, { status: 303, headers: { location: '/admin/users?msg=' + encodeURIComponent(r.ok ? 'Removed ' + email + '.' : r.error), 'cache-control': 'no-store' } });
  }
  return new Response('Not found', { status: 404, headers: adminHeaders() });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    USERS_OWNER, usersEnsure, usersVerify, usersHash, usersProvision, usersSetPassword, usersReset, usersSetDisabled, usersRemove,
    usersRejectOwnerChange, usersTryLogin, usersReadSession, usersMakeOwnerSession, usersCanManage, usersIsOwnerAccount, usersOwnerEmail,
    usersList, usersGet, usersIssueToken, usersPeekToken, usersConsumeToken, usersNavItems, usersDecorateHtml, usersPage, usersPermPage, usersSetupHtml, usersEq,
    usersHas, usersCatalog, usersGrantMap, usersSetGrants, usersAddPermission, usersOrigin, usersBlockedHtml,
    usersSetup, usersAdmin,
  };
}
