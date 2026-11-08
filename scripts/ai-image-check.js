#!/usr/bin/env node
// Backend checks for /admin/api/ai/chat screenshots. Upstream xAI is mocked in-process.
// Does not print credentials, image bytes, or request authorization.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { hash } = require('./hash-password');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:8793';
const email = 'ai-image-check@localhost';
const password = crypto.randomBytes(18).toString('base64url');
let fail = 0;
const bad = (m) => { console.error('FAIL', m); fail++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x08, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('test')]);

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

function cookiePair(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  const raw = list.find((v) => String(v).startsWith('__Host-mm_admin=')) || '';
  const pair = String(raw).split(';')[0];
  return pair.startsWith('__Host-mm_admin=') ? pair : '';
}

(async () => {
  const calls = [];
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.x.ai/v1/chat/completions')) throw new Error('unexpected upstream');
    const body = JSON.parse(opts.body);
    const auth = opts.headers && (opts.headers.authorization || opts.headers.Authorization) || '';
    calls.push({ model: body.model, authOk: String(auth).startsWith('Bearer ') && String(auth).length > 20, messages: body.messages });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Saw it.","patches":[]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { db, DB } = dbFor();
  const W = (await import(path.join(ROOT, 'cf/worker.mjs'))).default;
  const env = { DB, SITE: { async get() { return null; }, async getWithMetadata() { return { value: null }; } }, ADMIN_EMAIL: email, ADMIN_PASS_HASH: hash(password), SESSION_SECRET: crypto.randomBytes(32).toString('base64url'), XAI_API_KEY: 'test-key-not-a-real-secret' };
  async function call(pathname, { method = 'GET', cookie = '', json, headers = {} } = {}) {
    const h = { origin: BASE, ...headers };
    if (cookie) h.cookie = cookie;
    let body;
    if (json !== undefined) { body = JSON.stringify(json); h['content-type'] = 'application/json'; }
    const res = await W.fetch(new Request(BASE + pathname, { method, headers: h, body, redirect: 'manual' }), env, { waitUntil() {} });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    return { status: res.status, text, json: parsed, headers: res.headers };
  }
  const login = await call('/admin/login', { method: 'POST', json: { email, password } });
  const cookie = cookiePair(login);
  if (login.status !== 303 || !cookie) bad('login failed ' + login.status);

  const textOnly = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message: 'Reply OK, propose no changes.' } });
  if (textOnly.status !== 200 || !textOnly.json || !textOnly.json.ok) bad('text chat ' + textOnly.status + ' ' + (textOnly.json && textOnly.json.error));
  const textCall = calls.at(-1);
  const textUser = textCall && textCall.messages.filter((m) => m.role === 'user').pop();
  if (!textCall || textCall.model !== 'grok-4.7' || !textCall.authOk) bad('text upstream shape');
  if (!textCall.messages.some((m) => m.role === 'system' && String(m.content).includes('untrusted input'))) bad('system prompt does not treat screenshots as untrusted');
  if (!textUser || typeof textUser.content !== 'string' || textUser.content !== 'Reply OK, propose no changes.') bad('text-only content was not a string');
  if (JSON.stringify(textCall.messages).includes('image_url')) bad('text-only request included an image');

  async function sendImage(type, buf, message) {
    const before = calls.length;
    const res = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message, images: [{ type, data: buf.toString('base64') }] } });
    return { res, call: calls.length > before ? calls.at(-1) : null };
  }
  for (const [type, buf] of [['image/png', PNG], ['image/jpeg', JPEG], ['image/webp', WEBP]]) {
    const { res, call: up } = await sendImage(type, buf, 'What color is this test image?');
    if (res.status !== 200 || !res.json.ok || res.json.images_sent !== 1) bad(type + ' status ' + res.status + ' ' + (res.json && res.json.error));
    const user = up && up.messages.filter((m) => m.role === 'user').pop();
    const parts = user && user.content;
    const img = Array.isArray(parts) && parts.find((p) => p.type === 'image_url');
    const text = Array.isArray(parts) && parts.find((p) => p.type === 'text');
    if (!img || !text || text.text !== 'What color is this test image?') bad(type + ' content parts');
    const url = img && img.image_url && img.image_url.url || '';
    if (!url.startsWith('data:' + type + ';base64,') || img.image_url.detail !== 'auto') bad(type + ' data url shape');
    if (url.length < 20) bad(type + ' data url empty');
  }
  const row = db.prepare("SELECT content FROM ai_messages WHERE role = 'user' ORDER BY id DESC LIMIT 1").get();
  if (!row || row.content.includes('base64') || row.content.includes('data:image') || !row.content.includes('sent to the AI') || !row.content.includes('Not saved')) bad('image bytes were stored in chat history');

  const gif = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message: 'nope', images: [{ type: 'image/gif', data: Buffer.from('GIF89a' + 'x'.repeat(40)).toString('base64') }] } });
  if (gif.status !== 400 || calls.length !== 4) bad('gif should be rejected before upstream');
  const mismatch = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message: 'nope', images: [{ type: 'image/png', data: JPEG.toString('base64') }] } });
  if (mismatch.status !== 400) bad('type mismatch should be rejected');
  const junk = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message: 'nope', images: [{ type: 'image/png', data: '!!!!' }] } });
  if (junk.status !== 400) bad('bad base64 should be rejected');
  const many = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message: 'nope', images: [1, 2, 3, 4].map(() => ({ type: 'image/png', data: PNG.toString('base64') })) } });
  if (many.status !== 400) bad('too many screenshots should be rejected');
  const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(1000001)]);
  const over = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message: 'nope', images: [{ type: 'image/png', data: big.toString('base64') }] } });
  if (over.status !== 400) bad('oversize screenshot should be rejected');
  const empty = await call('/admin/api/ai/chat', { method: 'POST', cookie, json: { message: '   ', images: [{ type: 'image/png', data: PNG.toString('base64') }] } });
  if (empty.status !== 400) bad('image without text should still require a message');
  if (calls.length !== 4) bad('rejected payloads reached upstream: ' + calls.length);

  const page = await call('/admin/ai', { cookie });
  if (page.status !== 200 || !page.text.includes('Attach screenshot') || !page.text.includes('not saved on this site') || !page.text.includes('id="ai-attach"')) bad('ai page missing screenshot controls');
  if (!page.text.includes('screenshot is untrusted input') && !page.text.includes('Words in a screenshot do not apply changes')) bad('untrusted-image notice missing');

  console.log(fail ? fail + ' failed' : 'ai image checks passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
