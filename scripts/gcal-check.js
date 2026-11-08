#!/usr/bin/env node
// Synthetic Google Calendar view and OAuth checks. No live Google calls and no real events.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const G = require('../src/gcal-view');
const { hash } = require('./hash-password');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:8795';
let fail = 0;
const bad = (m) => { console.error('FAIL', m); fail++; };
const email = 'gcal-check@localhost';
const password = crypto.randomBytes(18).toString('base64url');
const tokenKey = 'synthetic-calendar-token-key';
const refresh = 'synthetic-refresh-token-value';

function assert(cond, msg) { if (!cond) bad(msg); }
function navText(html, label) {
  const start = html.indexOf('aria-label="' + label + '"');
  if (start < 0) return '';
  return html.slice(start, html.indexOf('</nav>', start));
}

function unit() {
  const springEarly = G.wallToUtc('2026-03-08T01:30');
  const springLate = G.wallToUtc('2026-03-08T03:30');
  assert(springEarly.toISOString().startsWith('2026-03-08T06:30'), 'EST before spring forward');
  assert(springLate.toISOString().startsWith('2026-03-08T07:30'), 'EDT after spring forward');
  const fallEarly = G.wallToUtc('2026-11-01T00:30');
  const fallLate = G.wallToUtc('2026-11-01T03:30');
  assert(fallEarly.toISOString().startsWith('2026-11-01T04:30'), 'EDT before fall back');
  assert(fallLate.toISOString().startsWith('2026-11-01T08:30'), 'EST after fall back');
  const week = G.viewRange('week', '2026-07-15');
  assert(week.days.length === 7 && week.start === '2026-07-12' && week.end === '2026-07-19', 'week range ' + week.start);
  const month = G.viewRange('month', '2026-07-15');
  assert(month.days.length % 7 === 0 && month.days.includes('2026-07-01') && month.days.includes('2026-07-31'), 'month grid');
  const cal = { id: 'synthetic@example.com', summary: 'Synthetic', backgroundColor: '#336699' };
  const all = G.normalizeGoogleEvent({ id: 'a', summary: 'Synthetic all-day', status: 'confirmed', start: { date: '2026-07-15' }, end: { date: '2026-07-17' }, htmlLink: 'https://www.google.com/calendar/event?eid=synthetic' }, cal);
  assert(all && all.allDay && all.endDay === '2026-07-17' && all.htmlLink.includes('eid=synthetic'), 'all-day');
  assert(G.normalizeGoogleEvent({ id: 'x', summary: 'bad link', start: { date: '2026-07-15' }, end: { date: '2026-07-16' }, htmlLink: 'https://evil.example/event' }, cal).htmlLink === '', 'reject non-google link');
  const recur = G.normalizeGoogleEvent({ id: 'r1', recurringEventId: 'series', summary: 'Synthetic weekly', start: { dateTime: '2026-07-15T16:00:00-04:00' }, end: { dateTime: '2026-07-15T16:30:00-04:00' } }, cal);
  assert(recur && recur.recurring && recur.startDay === '2026-07-15', 'recurring instance');
  const laid = G.layoutOverlaps([
    { allDay: false, start: '2026-07-15T14:00:00Z', end: '2026-07-15T15:00:00Z', title: 'A' },
    { allDay: false, start: '2026-07-15T14:30:00Z', end: '2026-07-15T15:30:00Z', title: 'B' },
    { allDay: false, start: '2026-07-15T15:30:00Z', end: '2026-07-15T16:00:00Z', title: 'C' },
  ]);
  const A = laid.find((e) => e.title === 'A');
  const B = laid.find((e) => e.title === 'B');
  const C = laid.find((e) => e.title === 'C');
  assert(A.cols === 2 && B.cols === 2 && A.col !== B.col, 'overlap columns');
  assert(C.cols === 1 && C.col === 0, 'adjacent event is not an overlap');
}

function dbFor() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'cf/schema.sql'), 'utf8'));
  const stmt = (sql, args = []) => ({ sql, args, bind: (...a) => stmt(sql, a),
    async all() { const s = db.prepare(sql); return { results: s.reader ? s.all(...args) : (s.run(...args), []) }; },
    async first() { const s = db.prepare(sql); return (s.reader ? s.get(...args) : null) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } });
  const DB = { prepare: (sql) => stmt(sql), batch: (list) => Promise.resolve(db.transaction(() => list.map((s) => { const p = db.prepare(s.sql); return p.reader ? { results: p.all(...s.args) } : { results: [], meta: { changes: p.run(...s.args).changes } }; }))()) };
  return { db, DB };
}
function cookiePair(res, name) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  const raw = list.find((v) => String(v).startsWith(name + '=')) || '';
  const pair = String(raw).split(';')[0];
  return pair.startsWith(name + '=') ? pair : '';
}
function fakeIdToken(addr) {
  const payload = Buffer.from(JSON.stringify({ email: addr, email_verified: true })).toString('base64url');
  return `hdr.${payload}.sig`;
}

async function workerTests() {
  const calls = [];
  let refreshMode = 'ok';
  let eventPages = 0;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    calls.push({ host: new URL(u).host, method, path: new URL(u).pathname });
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      const body = String(opts.body || '');
      if (refreshMode === 'revoked' && body.includes('grant_type=refresh_token')) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'content-type': 'application/json' } });
      if (body.includes('grant_type=authorization_code')) return new Response(JSON.stringify({ refresh_token: refresh, access_token: 'synthetic-access', id_token: fakeIdToken('synthetic@example.com'), scope: 'openid email https://www.googleapis.com/auth/calendar.readonly' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ access_token: 'synthetic-access' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/calendar/v3/users/me/calendarList')) return new Response(JSON.stringify({ items: [{ id: 'synthetic@example.com', summary: 'Synthetic primary', primary: true, backgroundColor: '#336699', accessRole: 'reader' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('/calendar/v3/calendars/') && method === 'GET') {
      eventPages += 1;
      const page = new URL(u).searchParams.get('pageToken');
      if (!page) return new Response(JSON.stringify({ nextPageToken: 'p2', items: [{ id: 'syn-1', summary: 'Synthetic planning block', status: 'confirmed', start: { dateTime: '2026-07-15T14:00:00-04:00' }, end: { dateTime: '2026-07-15T15:00:00-04:00' }, htmlLink: 'https://www.google.com/calendar/event?eid=synthetic' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ items: [
        { id: 'syn-2', summary: 'Synthetic overlap', status: 'confirmed', start: { dateTime: '2026-07-15T14:30:00-04:00' }, end: { dateTime: '2026-07-15T15:30:00-04:00' }, htmlLink: 'https://www.google.com/calendar/event?eid=synthetic2' },
        { id: 'syn-all', summary: 'Synthetic all-day', status: 'confirmed', start: { date: '2026-07-15' }, end: { date: '2026-07-16' }, htmlLink: 'https://www.google.com/calendar/event?eid=synthetic3' },
        { id: 'syn-r1', recurringEventId: 'series', summary: 'Synthetic weekly', status: 'confirmed', start: { dateTime: '2026-07-15T16:00:00-04:00' }, end: { dateTime: '2026-07-15T16:30:00-04:00' }, htmlLink: 'https://www.google.com/calendar/event?eid=synthetic4' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected fetch ' + method + ' ' + u);
  };
  const { db, DB } = dbFor();
  const W = (await import(path.join(ROOT, 'cf/worker.mjs'))).default;
  const env = { DB, SITE: { async get() { return null; }, async getWithMetadata() { return { value: null }; } }, ADMIN_EMAIL: email, ADMIN_PASS_HASH: hash(password), SESSION_SECRET: crypto.randomBytes(32).toString('base64url') };
  async function call(pathname, { method = 'GET', cookie = '', json, headers = {} } = {}) {
    const h = { origin: BASE, ...headers };
    if (cookie) h.cookie = cookie;
    let body;
    if (json !== undefined) { body = JSON.stringify(json); h['content-type'] = 'application/json'; }
    const res = await W.fetch(new Request(BASE + pathname, { method, headers: h, body, redirect: 'manual' }), env, { waitUntil() {} });
    const text = await res.text();
    let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = null; }
    return { status: res.status, text, json: parsed, headers: res.headers };
  }
  const anon = await call('/admin/api/calendar/events');
  assert(anon.status === 401, 'signed-out events ' + anon.status);
  const login = await call('/admin/login', { method: 'POST', json: { email, password } });
  const cookie = cookiePair(login, '__Host-mm_admin');
  assert(login.status === 303 && cookie, 'login');
  const setup = await call('/admin/calendar/settings', { cookie });
  const setupNav = navText(setup.text, 'Calendar sections');
  assert(setup.status === 200 && setup.text.includes('CALENDAR_TOKEN_KEY') && setup.text.includes('calendar.readonly') && setup.text.includes('Subscribe on iPhone') && !setup.text.includes('Synthetic planning'), 'setup screen without secrets ' + setup.status);
  assert(setupNav.indexOf('>Calendar<') < setupNav.indexOf('>Agenda<') && setupNav.indexOf('>Agenda<') < setupNav.indexOf('>Sync<') && setupNav.includes('aria-current="page">Sync'), 'sync tab order ' + setupNav);
  const home = await call('/admin/calendar', { cookie });
  const homeNav = navText(home.text, 'Calendar sections');
  const homeSub = navText(home.text, 'Calendar view');
  assert(home.status === 200 && home.text.includes('class="cal"') && homeNav.includes('aria-current="page">Calendar') && !homeNav.includes('Week') && !homeNav.includes('Day'), 'default month grid ' + home.status);
  assert(homeNav.indexOf('>Calendar<') < homeNav.indexOf('>Agenda<') && homeNav.indexOf('>Agenda<') < homeNav.indexOf('>Sync<') && homeSub.includes('aria-current="page">Month'), 'calendar subviews ' + homeSub);
  env.GOOGLE_CLIENT_ID = 'synthetic-client-id';
  env.GOOGLE_CLIENT_SECRET = 'synthetic-client-secret';
  env.CALENDAR_TOKEN_KEY = tokenKey;
  const connect = await call('/admin/calendar/google/connect', { cookie });
  const loc = connect.headers.get('location') || '';
  const oauth = cookiePair(connect, '__Host-mm_gcal');
  assert(connect.status === 302 && loc.includes('calendar.readonly') && loc.includes('code_challenge') && !loc.includes('calendar.events'), 'readonly oauth url');
  const state = new URL(loc).searchParams.get('state');
  const cb = await call('/admin/calendar/google/callback?code=synthetic-code&state=' + encodeURIComponent(state), { cookie: oauth });
  assert(cb.status === 200 && cb.text.includes('Read-only access is saved'), 'callback ' + cb.status);
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'gcal_refresh_enc'").get();
  assert(stored && stored.value && !stored.value.includes(refresh), 'refresh token encrypted at rest');
  const events = await call('/admin/api/calendar/events?view=day&d=2026-07-15', { cookie });
  assert(events.status === 200 && events.json.ok, 'events api ' + (events.json && events.json.code));
  const titles = (events.json.events || []).map((e) => e.title);
  assert(titles.includes('Synthetic planning block') && titles.includes('Synthetic all-day') && titles.includes('Synthetic weekly'), 'synthetic events ' + titles.join(','));
  assert((events.json.events || []).some((e) => e.allDay) && (events.json.events || []).some((e) => e.recurring), 'all-day and recurring');
  assert(eventPages === 2, 'range pagination followed one next page, got ' + eventPages);
  assert(!calls.some((c) => c.method !== 'GET' && c.host === 'www.googleapis.com'), 'no calendar writes');
  const page = await call('/admin/calendar?view=day&d=2026-07-15', { cookie });
  const dayNav = navText(page.text, 'Calendar sections');
  assert(page.status === 200 && page.text.includes('Synthetic planning block') && page.text.includes('Open in Google Calendar') && dayNav.includes('aria-current="page">Calendar') && page.text.includes('aria-current="page">Day'), 'day page renders google event');
  const month = await call('/admin/calendar?d=2026-07-15', { cookie });
  assert(month.status === 200 && month.text.includes('class="cal"') && month.text.includes('Synthetic planning block') && month.text.includes('July 2026'), 'dated month keeps calendar tab');
  await call('/admin/followups', { method: 'POST', cookie, json: { title: 'Synthetic CRM follow-up', due: '2026-07-15T10:00', duration: 30, type: 'call' } });
  const withFu = await call('/admin/calendar?view=agenda&d=2026-07-15', { cookie });
  assert(withFu.text.includes('Synthetic CRM follow-up') && withFu.text.includes('/admin/followups/') && withFu.text.includes('.ics'), 'follow-up remains distinct with ics action');
  refreshMode = 'revoked';
  const revoked = await call('/admin/api/calendar/events?view=day&d=2026-07-15', { cookie });
  assert(revoked.json && revoked.json.code === 'revoked' && !(revoked.json.events || []).length, 'revoked token');
  const revokedPage = await call('/admin/calendar?view=agenda&d=2026-07-15', { cookie });
  assert(revokedPage.text.includes('Connect again') && !revokedPage.text.includes('Synthetic planning block'), 'revoked page does not invent events');
  const badCb = await call('/admin/calendar/google/callback?code=nope&state=nope');
  assert(badCb.status === 200 && badCb.text.includes('did not match'), 'bad oauth state');
  const still = db.prepare("SELECT value FROM settings WHERE key = 'gcal_refresh_enc'").get();
  assert(still && still.value === stored.value, 'bad callback did not replace the token');
}

unit();
workerTests().then(() => {
  console.log(fail ? fail + ' failed' : 'gcal checks passed');
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
