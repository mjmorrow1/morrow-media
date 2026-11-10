#!/usr/bin/env node
// Local HTTP checks for jobs, invoices, permissions, the public invoice page, and the Stripe webhook.
// Uses a throwaway admin login in a temp env file. Does not read or print production secrets.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hash } = require('./hash-password');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8794);
const BASE = `http://localhost:${PORT}`;
const email = 'matt@sbridgemedia.com';
const password = crypto.randomBytes(18).toString('base64url');
const envFile = path.join(os.tmpdir(), `mm-invoices-${process.pid}.env`);
const hookSecret = 'whsec_' + crypto.randomBytes(16).toString('hex');

function fail(msg) { console.error('FAIL', msg); process.exitCode = 1; }
function ok(msg) { if (!process.exitCode) console.log('ok', msg); else console.log('..', msg); }
function cookiePair(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  const raw = list.find((v) => String(v).startsWith('__Host-mm_admin=')) || '';
  const pair = String(raw).split(';')[0];
  return pair.startsWith('__Host-mm_admin=') ? pair : '';
}
function form(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((item) => p.append(k, item));
    else if (v != null) p.append(k, String(v));
  }
  return p;
}
async function startWorker(extraEnv) {
  fs.writeFileSync(envFile, `ADMIN_EMAIL=${email}\nADMIN_PASS_HASH=${hash(password)}\nSESSION_SECRET=${crypto.randomBytes(32).toString('base64url')}\n${extraEnv || ''}`, { mode: 0o600 });
  const child = spawn(process.execPath, ['scripts/worker-dev.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB: ':memory:', ADMIN_ENV_FILE: envFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('worker-dev did not start\n' + log)), 20000);
    child.stdout.on('data', () => { if (log.includes('Worker dev server')) { clearTimeout(t); resolve(); } });
    child.on('exit', (code) => { clearTimeout(t); reject(new Error('worker-dev exited ' + code + '\n' + log)); });
  });
  return { child, log };
}
async function sign(secret, payload) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return { header: `t=${t},v1=${v1}`, t, v1 };
}

async function main() {
  const first = await startWorker('');
  try {
    const off = await fetch(BASE + '/admin/invoices', { redirect: 'manual' });
    if (off.status !== 302 || !(off.headers.get('location') || '').includes('/admin/login')) fail('signed-out /admin/invoices should redirect to login, got ' + off.status);
    else ok('signed-out invoices redirects');

    const pub404 = await fetch(BASE + '/invoice/not-a-real-token');
    if (pub404.status !== 404) fail('unknown public token should 404, got ' + pub404.status);
    else ok('unknown public invoice is 404');

    const hookOff = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', body: '{}' });
    if (hookOff.status !== 503) fail('webhook without secret should be 503, got ' + hookOff.status);
    else ok('webhook without secret is 503');

    const posted = await fetch(BASE + '/admin/login', {
      method: 'POST', redirect: 'manual',
      headers: { origin: BASE, 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ email, password }),
    });
    const cookie = cookiePair(posted);
    if (posted.status !== 303 || !cookie) fail('login did not set an admin session (' + posted.status + ')');
    const h = { cookie, origin: BASE };
    const postH = { cookie, origin: BASE, 'content-type': 'application/x-www-form-urlencoded' };

    const jobs = await fetch(BASE + '/admin/jobs', { headers: h });
    const jobsHtml = await jobs.text();
    if (jobs.status !== 200 || !jobsHtml.includes('No jobs yet') || !jobsHtml.includes('href="/admin/invoices"')) fail('jobs list missing empty state or invoices link');
    else ok('jobs list loads');
    if (!jobsHtml.includes('href="/admin/jobs"') || !jobsHtml.includes('aria-current="page"')) fail('jobs nav not current');
    if (!jobsHtml.includes('Stripe') && jobsHtml.includes('Jobs')) ok('jobs list is up');

    const invEmpty = await fetch(BASE + '/admin/invoices', { headers: h });
    const invEmptyHtml = await invEmpty.text();
    if (invEmpty.status !== 200 || !invEmptyHtml.includes('No invoices yet')) fail('invoices list missing empty state');
    else ok('invoices list loads');

    const contactPost = await fetch(BASE + '/admin/contacts', {
      method: 'POST', redirect: 'manual', headers: postH,
      body: form({ name: 'Harbor Lights Cafe', company: 'Harbor Lights', email: 'billing@harborlights.example', phone: '727-555-0100', type: 'brand', stage: 'won' }),
    });
    const contactLoc = contactPost.headers.get('location') || '';
    const contactId = (contactLoc.match(/\/admin\/contacts\/(\d+)/) || [])[1];
    if (contactPost.status !== 303 || !contactId) fail('could not create a contact (' + contactPost.status + ' ' + contactLoc + ')');
    else ok('contact created');

    const openJob = await fetch(BASE + '/admin/jobs', {
      method: 'POST', redirect: 'manual', headers: postH,
      body: form({
        contact_id: contactId, title: 'March content package', description: 'Social clips and stills', status: 'open',
        item_desc: 'Vertical clips', item_qty: '4', item_rate: '250',
      }),
    });
    const openLoc = openJob.headers.get('location') || '';
    const jobId = (openLoc.match(/\/admin\/jobs\/(\d+)/) || [])[1];
    if (openJob.status !== 303 || !jobId) fail('could not create a job (' + openJob.status + ' ' + openLoc + ')');
    else ok('open job created');

    const early = await fetch(BASE + '/admin/invoices/new?job_id=' + jobId, { headers: h, redirect: 'manual' });
    const earlyLoc = early.headers.get('location') || '';
    if (early.status !== 303 || !/completed/i.test(decodeURIComponent(earlyLoc))) fail('open job should not start an invoice, got ' + early.status + ' ' + earlyLoc);
    else ok('incomplete job cannot be invoiced');

    const complete = await fetch(BASE + '/admin/jobs/' + jobId, {
      method: 'POST', redirect: 'manual', headers: postH,
      body: form({
        contact_id: contactId, title: 'March content package', description: 'Social clips and stills', status: 'completed', completed_at: '2026-11-08',
        item_desc: ['Vertical clips', 'Still photos'], item_qty: ['4', '12'], item_rate: ['250', '75'],
      }),
    });
    if (complete.status !== 303) fail('could not complete job (' + complete.status + ')');
    else ok('job marked completed');

    const formPage = await fetch(BASE + '/admin/invoices/new?job_id=' + jobId, { headers: h });
    const formHtml = await formPage.text();
    if (formPage.status !== 200 || !formHtml.includes('Vertical clips') || !formHtml.includes('250')) fail('invoice form did not copy job line items');
    else ok('job line items copied to invoice form');

    const created = await fetch(BASE + '/admin/invoices', {
      method: 'POST', redirect: 'manual', headers: postH,
      body: form({
        job_id: jobId, issued_at: '2026-11-10', due_at: '2026-11-24', notes: 'Net 14. Thank you.',
        tax_rate: '7', discount: '50',
        item_desc: ['Vertical clips', 'Still photos'], item_qty: ['4', '12'], item_rate: ['250', '75'],
      }),
    });
    const invLoc = created.headers.get('location') || '';
    const invId = (invLoc.match(/\/admin\/invoices\/(\d+)/) || [])[1];
    if (created.status !== 303 || !invId) fail('could not create invoice (' + created.status + ' ' + invLoc + ')');
    else ok('invoice created from completed job');

    const detail = await fetch(BASE + '/admin/invoices/' + invId, { headers: h });
    const detailHtml = await detail.text();
    // 4*250 + 12*75 = 1000 + 900 = 1900; discount 50; tax 7% of 1850 = 129.50; total 1979.50
    if (detail.status !== 200 || !detailHtml.includes('SBM-0001')) fail('invoice detail missing SBM-0001');
    else ok('invoice number is SBM-0001');
    if (!detailHtml.includes('$1,979.50') && !detailHtml.includes('$1979.50')) fail('invoice total should be $1,979.50, got a page without that amount');
    else ok('tax and discount totals are correct');
    if (!detailHtml.includes('Splitt LLC dba SouthBridge Media') || !detailHtml.includes('St. Petersburg, FL')) fail('printable branding missing on detail');
    else ok('billed-from branding is present');
    if (!detailHtml.includes('Stripe not connected')) fail('Charge button should show Stripe not connected without secrets');
    else ok('Stripe not connected state shown');
    if (!/\/invoice\/[A-Za-z0-9_-]+/.test(detailHtml)) fail('client invoice link missing');
    const token = (detailHtml.match(/\/invoice\/([A-Za-z0-9_-]+)/) || [])[1];
    if (!token) fail('could not read public token');
    else ok('public token present');

    const list = await fetch(BASE + '/admin/invoices', { headers: h });
    const listHtml = await list.text();
    if (!listHtml.includes('SBM-0001') || !listHtml.includes('Harbor Lights')) fail('invoice list missing the new invoice');
    else ok('invoice list shows SBM-0001');

    const print = await fetch(BASE + '/admin/invoices/' + invId + '/print', { headers: h });
    const printHtml = await print.text();
    if (print.status !== 200 || !printHtml.includes('SBM-0001') || !printHtml.includes('Splitt LLC dba SouthBridge Media') || !printHtml.includes('$1,979.50') && !printHtml.includes('$1979.50')) fail('printable invoice missing branding or total');
    else ok('printable invoice view loads');
    if (printHtml.includes('aria-label="Admin"')) fail('printable view should not include admin nav');

    const pub = await fetch(BASE + '/invoice/' + token);
    const pubHtml = await pub.text();
    if (pub.status !== 200 || !pubHtml.includes('SBM-0001') || !pubHtml.includes('Harbor Lights')) fail('public invoice page missing');
    else ok('public invoice page loads');
    if (pubHtml.includes('Pay $') && pubHtml.includes('/pay')) fail('public Pay button should stay hidden when Stripe is not connected');
    if (!pubHtml.includes('Online payment is not available')) fail('public page should explain that online payment is unavailable');
    else ok('public page has no live Pay button without Stripe');

    const setup = await fetch(BASE + '/admin/setup', { headers: h });
    const setupHtml = await setup.text();
    if (setup.status !== 200 || !setupHtml.includes('Jobs, invoices, and Stripe charging') || !setupHtml.includes('STRIPE_SECRET_KEY') || !setupHtml.includes('STRIPE_WEBHOOK_SECRET')) fail('setup guide missing invoicing step');
    else ok('setup guide includes invoicing step');
    if (setupHtml.includes(password) || setupHtml.includes('sk_') || setupHtml.includes(hookSecret)) fail('setup guide leaked a secret value');

    const paid = await fetch(BASE + '/admin/invoices/' + invId + '/pay', {
      method: 'POST', redirect: 'manual', headers: postH,
      body: form({ method: 'check', paid_at: '2026-11-10', note: 'Check 1044' }),
    });
    const paidLoc = paid.headers.get('location') || '';
    if (paid.status !== 303 || !/paid/i.test(decodeURIComponent(paidLoc))) fail('mark as paid failed: ' + paid.status + ' ' + paidLoc);
    else ok('mark as paid succeeded');
    const paidPage = await (await fetch(BASE + '/admin/invoices/' + invId, { headers: h })).text();
    if (!paidPage.includes('Paid') || !/check/i.test(paidPage)) fail('paid invoice does not show method');
    else ok('paid invoice shows method and date');

    const second = await fetch(BASE + '/admin/invoices', {
      method: 'POST', redirect: 'manual', headers: postH,
      body: form({
        job_id: jobId, issued_at: '2026-11-10', due_at: '2026-12-01',
        item_desc: 'Additional stills', item_qty: '2', item_rate: '75',
      }),
    });
    const secondLoc = second.headers.get('location') || '';
    if (!secondLoc.includes('SBM-0002') && !(await (await fetch(BASE + (secondLoc.startsWith('http') ? new URL(secondLoc).pathname : secondLoc), { headers: h })).text()).includes('SBM-0002')) fail('second invoice was not numbered SBM-0002 (' + secondLoc + ')');
    else ok('next invoice number is SBM-0002');
  } finally {
    first.child.kill('SIGTERM');
  }

  const second = await startWorker(`STRIPE_SECRET_KEY=test_not_a_real_key\nSTRIPE_WEBHOOK_SECRET=${hookSecret}\n`);
  try {
    const payloadObj = {
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', metadata: { invoice_id: '1' }, client_reference_id: '1', amount_total: 15000, payment_intent: 'pi_test_1' } },
    };
    // Recreate a paid path: need an invoice in this new in-memory DB. Just verify signature rejection/acceptance against empty DB.
    const payload = JSON.stringify(payloadObj);
    const bad = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=deadbeef' }, body: payload });
    if (bad.status !== 400) fail('webhook with bad signature should be 400, got ' + bad.status);
    else ok('webhook rejects a bad signature');
    const { header } = await sign(hookSecret, payload);
    const good = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': header }, body: payload });
    const goodJson = await good.text();
    if (good.status !== 200) fail('signed webhook should be 200 even if the invoice is missing, got ' + good.status + ' ' + goodJson);
    else ok('signed webhook accepted (invoice absent is ignored)');

    // Build a real invoice and mark it paid via webhook
    const posted = await fetch(BASE + '/admin/login', {
      method: 'POST', redirect: 'manual',
      headers: { origin: BASE, 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ email, password }),
    });
    const cookie = cookiePair(posted);
    const postH = { cookie, origin: BASE, 'content-type': 'application/x-www-form-urlencoded' };
    const h = { cookie, origin: BASE };
    await fetch(BASE + '/admin/contacts', { method: 'POST', redirect: 'manual', headers: postH, body: form({ name: 'Webhook Client', email: 'pay@example.com', type: 'brand', stage: 'won' }) });
    // find contact id from list
    const cl = await (await fetch(BASE + '/admin/contacts', { headers: h })).text();
    const cid = (cl.match(/href="\/admin\/contacts\/(\d+)"/) || [])[1];
    const jobRes = await fetch(BASE + '/admin/jobs', { method: 'POST', redirect: 'manual', headers: postH, body: form({ contact_id: cid, title: 'Webhook job', status: 'completed', completed_at: '2026-11-10', item_desc: 'Work', item_qty: '1', item_rate: '150' }) });
    const jobId = ((jobRes.headers.get('location') || '').match(/\/admin\/jobs\/(\d+)/) || [])[1];
    const invRes = await fetch(BASE + '/admin/invoices', { method: 'POST', redirect: 'manual', headers: postH, body: form({ job_id: jobId, item_desc: 'Work', item_qty: '1', item_rate: '150' }) });
    const invId = ((invRes.headers.get('location') || '').match(/\/admin\/invoices\/(\d+)/) || [])[1];
    const detailHtml = await (await fetch(BASE + '/admin/invoices/' + invId, { headers: h })).text();
    if (detailHtml.includes('Stripe not connected')) fail('Charge button should be enabled when both secrets are set');
    else if (!detailHtml.includes('Charge / send payment link')) fail('Charge / send payment link button missing when secrets are set');
    else ok('Charge button appears when Stripe secrets are set');

    const paidPayload = JSON.stringify({
      id: 'evt_test_paid',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_paid', metadata: { invoice_id: String(invId) }, client_reference_id: String(invId), amount_total: 15000, payment_intent: 'pi_test_paid' } },
    });
    const signed = await sign(hookSecret, paidPayload);
    const paidHook = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': signed.header }, body: paidPayload });
    const paidHookBody = await paidHook.text();
    if (paidHook.status !== 200 || !paidHookBody.includes('"ok":true')) fail('webhook did not mark paid: ' + paidHook.status + ' ' + paidHookBody);
    else ok('webhook marked the invoice paid');
    const after = await (await fetch(BASE + '/admin/invoices/' + invId, { headers: h })).text();
    if (!after.includes('Paid') || !/stripe/i.test(after)) fail('invoice was not shown as paid via Stripe after webhook');
    else ok('invoice detail shows Stripe payment');

    const again = await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': (await sign(hookSecret, paidPayload)).header }, body: paidPayload });
    const againBody = await again.text();
    if (again.status !== 200 || !againBody.includes('already')) fail('replayed webhook should be idempotent, got ' + again.status + ' ' + againBody);
    else ok('replayed webhook is idempotent');
  } finally {
    second.child.kill('SIGTERM');
    fs.rmSync(envFile, { force: true });
  }

  if (!process.exitCode) console.log('invoices-check ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
