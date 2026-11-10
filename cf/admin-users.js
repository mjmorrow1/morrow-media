// Multi-user admin accounts. Concatenated into the Worker. The owner login
// (ADMIN_EMAIL + ADMIN_PASS_HASH) is unchanged. Only matt@sbridgemedia.com,
// when that address is the owner secret, can open Users or Permissions.
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
  const r = await env.DB.prepare('DELETE FROM admin_users WHERE email = ?').bind(email).run();
  return { ok: !!(r.meta && r.meta.changes) };
}
function usersRejectOwnerChange() { return { ok: false, error: 'Only matt@sbridgemedia.com can manage users, and that access cannot be removed.' }; }

function usersNav(who, env, path) {
  const items = [['Home', '/admin', 'subs'], ['Contacts', '/admin/contacts', 'contacts'], ['Calendar', '/admin/calendar', 'calendar'], ['Tickets', '/admin/tickets', 'tickets'], ['KPIs', '/admin/kpis', 'kpis'], ['Signings', '/admin/signings', 'signings']];
  if (usersCanManage(who, env)) items.push(['Site AI', '/admin/ai', 'ai'], ['Users', '/admin/users', 'users'], ['Permissions', '/admin/permissions', 'perms']);
  items.push(['Setup guide', '/admin/setup', 'setup']);
  const on = path.startsWith('/admin/users') ? 'users' : path.startsWith('/admin/permissions') ? 'perms' : path.startsWith('/admin/ai') ? 'ai' : path.startsWith('/admin/contacts') ? 'contacts' : path.startsWith('/admin/calendar') ? 'calendar' : path.startsWith('/admin/tickets') ? 'tickets' : path.startsWith('/admin/kpis') ? 'kpis' : path.startsWith('/admin/signings') ? 'signings' : path.startsWith('/admin/setup') ? 'setup' : 'subs';
  return items.map(([l, h, k]) => `<a href="${h}"${k === on ? ' class="on" aria-current="page"' : ''}>${l}</a>`).join('');
}
function usersDecorateHtml(html, who, env, path) {
  if (!html || html.indexOf('aria-label="Admin"') < 0) return html;
  const nav = usersNav(who, env, path);
  return html.replace(/<nav aria-label="Admin">[\s\S]*?<\/nav>/, `<nav aria-label="Admin">${nav}</nav>`);
}

function usersCards(rows, link) {
  const cards = rows.map((u) => {
    const state = u.disabled ? 'Disabled' : (u.pass_hash ? 'Active' : 'Waiting for password');
    return `<article class="card"><header><h3>${usersEsc(u.email)}</h3><span class="id">${usersEsc(state)}</span><span class="sp"></span></header>
<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">
<form method="post" action="/admin/users/reset"><input type="hidden" name="email" value="${usersEsc(u.email)}"><button class="b sm" type="submit">Reset password</button></form>
<form method="post" action="/admin/users/disable"><input type="hidden" name="email" value="${usersEsc(u.email)}"><input type="hidden" name="disabled" value="${u.disabled ? '0' : '1'}"><button class="b sm" type="submit">${u.disabled ? 'Enable' : 'Disable'}</button></form>
<form method="post" action="/admin/users/remove" data-confirm="Remove ${usersEsc(u.email)}? They will not be able to sign in."><input type="hidden" name="email" value="${usersEsc(u.email)}"><button class="b sm red" type="submit">Remove</button></form>
</div></article>`;
  }).join('');
  const banner = link ? `<div class="note" style="margin:0 0 16px"><p style="margin:0 0 8px">Copy this one-time link. It expires in 7 days and works once.</p><div class="copyline" style="display:flex;gap:8px"><input id="invite" readonly value="${usersEsc(link)}"><button class="b sm dark" type="button" data-copy="invite">Copy</button></div></div>` : '';
  return `${banner}<form class="form" method="post" action="/admin/users" style="margin-bottom:22px">${usersField('Email', '<input type="email" name="email" required maxlength="200" autocomplete="off" placeholder="name@company.com">')}<div class="acts"><button class="b dark" type="submit">Add user</button></div></form>${rows.length ? `<div class="list">${cards}</div>` : '<p class="empty">No provisioned users yet. Add an email and send them the setup link.</p>'}`;
}
function usersField(label, inner) { return `<label class="wide"><span>${usersEsc(label)}</span>${inner}</label>`; }
function usersPage(rows, link) {
  return `<p class="eyebrow">Owner only · ${usersEsc(USERS_OWNER)}</p><h1>Users</h1><p class="note">Add an email. That person opens Create account, sets a password, and can then use the rest of the admin. Reset password clears their password and makes a new one-time link.</p><br>${usersCards(rows, link)}`;
}
function usersPermPage(env, rows) {
  const owner = usersOwnerEmail(env);
  const locked = `<article class="card"><header><h3>${usersEsc(owner || USERS_OWNER)}</h3><span class="badge">Owner</span><span class="sp"></span></header><p>User management is on. This cannot be turned off.</p><form method="post" action="/admin/permissions"><input type="hidden" name="email" value="${usersEsc(USERS_OWNER)}"><input type="hidden" name="allow" value="0"><button class="b sm" type="submit" disabled aria-disabled="true">Cannot be removed</button></form></article>`;
  const rest = rows.map((u) => `<article class="card"><header><h3>${usersEsc(u.email)}</h3><span class="id">No user-management access</span></header><form method="post" action="/admin/permissions"><input type="hidden" name="email" value="${usersEsc(u.email)}"><input type="hidden" name="allow" value="1"><button class="b sm" type="submit" disabled aria-disabled="true">Not available</button></form></article>`).join('');
  return `<p class="eyebrow">Owner only</p><h1>Permissions</h1><p class="note">Only ${usersEsc(USERS_OWNER)} can open Users, reset passwords, or change these permissions. Other admins keep the rest of the dashboard. Site AI stays with the owner because it can change the live site.</p><br><div class="list">${locked}${rest}</div>`;
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
  const linkOf = (token) => token ? `${url.origin}/admin/setup-account?token=${encodeURIComponent(token)}` : '';
  if (p === '/admin/permissions' && req.method === 'GET') {
    return adminPage('Permissions', 'perms', usersPermPage(env, await usersList(env)), { msg: url.searchParams.get('msg') || '' });
  }
  if (p === '/admin/permissions' && req.method === 'POST') {
    return new Response(null, { status: 303, headers: { location: '/admin/permissions?msg=' + encodeURIComponent(usersRejectOwnerChange().error), 'cache-control': 'no-store' } });
  }
  if (p === '/admin/users' && req.method === 'GET') {
    const issued = String(url.searchParams.get('issued') || '');
    return adminPage('Users', 'users', usersPage(await usersList(env), issued ? linkOf(issued) : ''), { msg: url.searchParams.get('msg') || '' });
  }
  if (req.method !== 'POST') return new Response('Not found', { status: 404, headers: adminHeaders() });
  let body = {}; try { body = await readBody(req); } catch {}
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  if (p === '/admin/users') {
    const made = await usersProvision(env, email);
    if (!made.ok) return adminPage('Users', 'users', usersPage(await usersList(env), ''), { msg: made.error, err: true, status: 400 });
    return new Response(null, { status: 303, headers: { location: '/admin/users?issued=' + encodeURIComponent(made.token) + '&msg=' + encodeURIComponent('Provisioned ' + email + '.'), 'cache-control': 'no-store' } });
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
    usersList, usersGet, usersIssueToken, usersPeekToken, usersConsumeToken, usersNav, usersDecorateHtml, usersPage, usersPermPage, usersSetupHtml, usersEq,
    usersSetup, usersAdmin,
  };
}
