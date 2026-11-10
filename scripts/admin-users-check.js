// Exercises provision, account setup, login, reset, disable, and the owner-only gate.
let Database; try { Database = require('better-sqlite3'); } catch { Database = require('./sqlite-shim'); }
const u = require('../cf/admin-users');

function wrap(db) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = db.prepare(sql);
          const done = (info) => ({ meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } });
          return {
            async run() { return done(stmt.run(...args)); },
            async first() { return stmt.get(...args) || null; },
            async all() { return { results: stmt.all(...args) }; },
          };
        },
        async run() { const info = db.prepare(sql).run(); return { meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } }; },
        async first() { return db.prepare(sql).get() || null; },
        async all() { return { results: db.prepare(sql).all() }; },
      };
    },
  };
}
function cookieReq(value) { return { headers: { get: (n) => (n === 'cookie' ? `__Host-mm_admin=${value}` : '') } }; }
let failed = 0;
function check(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } else console.log('ok', msg); }

(async () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE admin_login_fails (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, at INTEGER);`);
  const env = {
    DB: wrap(db),
    ADMIN_EMAIL: 'matt@sbridgemedia.com',
    ADMIN_PASS_HASH: await u.usersHash('owner-secret-pass'),
    SESSION_SECRET: 'session-secret-for-tests',
  };
  const otherEnv = { ...env, ADMIN_EMAIL: 'someone-else@example.com', ADMIN_PASS_HASH: await u.usersHash('other-owner-pass') };

  check(await u.usersHas({ role: 'owner', email: 'matt@sbridgemedia.com' }, env, 'dashboard'), 'owner has dashboard');
  check(await u.usersHas({ role: 'owner', email: 'matt@sbridgemedia.com' }, env, 'permissions'), 'owner has permissions screen');
  check(await u.usersHas({ role: 'owner', email: 'matt@sbridgemedia.com' }, env, 'invoices'), 'owner always has invoices');
  check(!(await u.usersHas({ role: 'user', email: 'sam@example.com' }, env, 'permissions')), 'a user without a grant cannot open permissions');
  check(!(await u.usersHas({ role: 'owner', email: 'someone-else@example.com' }, otherEnv, 'dashboard')), 'a different owner secret is not granted by the owner rule');
  check((await u.usersSetGrants(env, 'matt@sbridgemedia.com', [])).ok === false, 'owner grants cannot be edited down');

  const ownerCookie = await u.usersMakeOwnerSession(env);
  const ownerWho = await u.usersReadSession(cookieReq(ownerCookie), env);
  check(ownerWho && ownerWho.role === 'owner' && ownerWho.email === 'matt@sbridgemedia.com', 'owner session round trip');

  const denied = await u.usersProvision(env, 'matt@sbridgemedia.com');
  check(!denied.ok, 'cannot provision the owner email');
  const made = await u.usersProvision(env, 'Sam@Example.com');
  check(made.ok && made.email === 'sam@example.com' && made.token, 'provision stores a lowercase email and a setup token');
  check(await u.usersHas({ role: 'user', email: 'sam@example.com' }, env, 'dashboard'), 'new users start with the dashboard');
  check(!(await u.usersHas({ role: 'user', email: 'sam@example.com' }, env, 'permissions')), 'new users do not start with the permissions screen');
  check(!(await u.usersHas({ role: 'user', email: 'sam@example.com' }, env, 'invoices')), 'new users do not start with invoices');
  const again = await u.usersProvision(env, 'sam@example.com');
  check(!again.ok, 'cannot provision the same email twice');

  const peeked = await u.usersPeekToken(env, made.token);
  check(peeked && peeked.email === 'sam@example.com' && peeked.purpose === 'setup', 'setup token is readable once');
  const weak = await u.usersSetPassword(env, 'sam@example.com', 'short');
  check(!weak.ok, 'short passwords are rejected and the token stays valid');
  check(await u.usersPeekToken(env, made.token), 'rejected password does not burn the token');
  const set = await u.usersSetPassword(env, 'sam@example.com', 'correct-horse-1');
  check(set.ok && !(await u.usersPeekToken(env, made.token)), 'saving a password consumes the setup token');

  const bad = await u.usersTryLogin(env, 'sam@example.com', 'wrong-password');
  check(!bad, 'wrong password does not sign the user in');
  const hit = await u.usersTryLogin(env, 'sam@example.com', 'correct-horse-1');
  check(hit && hit.session, 'provisioned user can sign in after setting a password');
  const who = await u.usersReadSession(cookieReq(hit.session), env);
  check(who && who.role === 'user' && who.email === 'sam@example.com', 'user session is not an owner session');

  const ownerNav = await u.usersDecorateHtml('<nav aria-label="Admin"><a href="/admin">Home</a></nav>', ownerWho, env, '/admin');
  const userNav = await u.usersDecorateHtml('<nav aria-label="Admin"><a href="/admin">Home</a></nav>', who, env, '/admin');
  check(ownerNav.includes('href="/admin/users"') && ownerNav.includes('href="/admin/permissions"') && ownerNav.includes('href="/admin/ai"') && ownerNav.includes('href="/admin/jobs"') && ownerNav.includes('href="/admin/invoices"'), 'owner nav has Users, Permissions, Site AI, Jobs, and Invoices');
  check(!userNav.includes('/admin/users') && !userNav.includes('/admin/permissions') && !userNav.includes('/admin/ai') && !userNav.includes('/admin/jobs') && !userNav.includes('/admin/invoices') && userNav.includes('href="/admin/contacts"'), 'dashboard-only nav hides user management, Site AI, and invoicing');
  await u.usersSetGrants(env, 'sam@example.com', ['dashboard', 'permissions']);
  const permNav = await u.usersDecorateHtml('<nav aria-label="Admin"><a href="/admin">Home</a></nav>', who, env, '/admin');
  check(permNav.includes('/admin/users') && permNav.includes('/admin/permissions') && !permNav.includes('/admin/ai') && !permNav.includes('/admin/invoices'), 'permissions grant opens Users and Permissions, not Site AI or invoicing');
  await u.usersSetGrants(env, 'sam@example.com', ['dashboard', 'invoices']);
  const invNav = await u.usersDecorateHtml('<nav aria-label="Admin"><a href="/admin">Home</a></nav>', who, env, '/admin');
  check(invNav.includes('/admin/jobs') && invNav.includes('/admin/invoices') && !invNav.includes('/admin/users') && !invNav.includes('/admin/ai'), 'invoices grant opens Jobs and Invoices only');
  await u.usersSetGrants(env, 'sam@example.com', []);
  check(!(await u.usersHas(who, env, 'dashboard')), 'clearing grants blocks the dashboard');
  const added = await u.usersAddPermission(env, 'Edit tickets');
  check(added.ok && (await u.usersCatalog(env)).some((p) => p.key === 'edit-tickets'), 'a new catalog permission appears for every dropdown');
  await u.usersSetGrants(env, 'sam@example.com', ['dashboard']);

  const reset = await u.usersReset(env, 'sam@example.com');
  check(reset.ok && reset.token, 'reset issues a new link');
  check(!(await u.usersReadSession(cookieReq(hit.session), env)), 'reset signs the user out');
  check(!(await u.usersTryLogin(env, 'sam@example.com', 'correct-horse-1')), 'old password stops working after reset');
  const resetSet = await u.usersSetPassword(env, 'sam@example.com', 'brand-new-pass');
  check(resetSet.ok && !(await u.usersPeekToken(env, reset.token)), 'reset link is single use');
  check(await u.usersTryLogin(env, 'sam@example.com', 'brand-new-pass'), 'new password signs the user in');

  await u.usersSetDisabled(env, 'sam@example.com', true);
  check(!(await u.usersTryLogin(env, 'sam@example.com', 'brand-new-pass')), 'disabled user is blocked');
  await u.usersSetDisabled(env, 'sam@example.com', false);
  check(await u.usersTryLogin(env, 'sam@example.com', 'brand-new-pass'), 'enabled user can sign in again');

  const keepOwner = await u.usersRemove(env, 'matt@sbridgemedia.com');
  check(!keepOwner.ok, 'owner cannot be removed');
  const removed = await u.usersRemove(env, 'sam@example.com');
  check(removed.ok && !(await u.usersGet(env, 'sam@example.com')), 'owner can remove a provisioned user');
  check(!(await u.usersTryLogin(env, 'sam@example.com', 'brand-new-pass')), 'removed user cannot sign in');

  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('admin-users-check ok');
})().catch((e) => { console.error(e); process.exit(1); });
