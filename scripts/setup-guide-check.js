#!/usr/bin/env node
// Auth and content checks for the read-only /admin/setup guide.
// Uses a throwaway admin login in a temp env file. Does not read or print production secrets.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hash } = require('./hash-password');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8791);
const BASE = `http://localhost:${PORT}`;
const email = 'setup-guide-check@localhost';
const password = crypto.randomBytes(18).toString('base64url');
const envFile = path.join(os.tmpdir(), `mm-setup-guide-${process.pid}.env`);
const titles = [
  'Define the business, brand, and site content',
  'Register and retain control of the domain',
  'Create a private GitHub source repository',
  'Establish secret hygiene and account security',
  'Prepare the development and build workflow',
  'Set up Cloudflare ownership and DNS',
  'Provision the Worker, assets, and database',
  'Attach bindings and deploy safely',
  'Connect the domain, HTTPS, and redirects',
  'Secure the admin area',
  'Test contact forms and CRM workflows',
  'Configure Google Workspace business mail',
  'Review analytics, scheduling links, and public integrations',
  'Calendar sync: ICS subscription or Google OAuth',
  'xAI-powered Site AI',
  'Cursor coding integration',
  'Authentisign signing service',
  'Jobs, invoices, and Stripe charging',
  'Payments and outbound notifications',
  'Backups, monitoring, and launch approval',
  'Maintain ownership, renewals, and costs',
];

function fail(msg) { console.error('FAIL', msg); process.exitCode = 1; }
function cookiePair(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  const raw = list.find((v) => String(v).startsWith('__Host-mm_admin=')) || '';
  const pair = String(raw).split(';')[0];
  return pair.startsWith('__Host-mm_admin=') ? pair : '';
}

async function main() {
  fs.writeFileSync(envFile, `ADMIN_EMAIL=${email}\nADMIN_PASS_HASH=${hash(password)}\nSESSION_SECRET=${crypto.randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  const child = spawn(process.execPath, ['scripts/worker-dev.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB: ':memory:', ADMIN_ENV_FILE: envFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('worker-dev did not start\n' + log)), 20000);
    child.stdout.on('data', () => { if (log.includes('Worker dev server')) { clearTimeout(t); resolve(); } });
    child.on('exit', (code) => { clearTimeout(t); reject(new Error('worker-dev exited ' + code + '\n' + log)); });
  });
  try {
    await ready;
    const off = await fetch(BASE + '/admin/setup', { redirect: 'manual' });
    const offBody = await off.text();
    if (off.status !== 302 || !(off.headers.get('location') || '').includes('/admin/login')) fail('signed-out /admin/setup should redirect to login, got ' + off.status);
    if (offBody.includes('Recommended setup order') || offBody.includes('Setup guide')) fail('signed-out response leaked the guide');

    const loginPage = await fetch(BASE + '/admin/login');
    const loginHtml = await loginPage.text();
    if (loginPage.status !== 200 || loginHtml.includes('Recommended setup order')) fail('login page should not render the guide');

    const api = await fetch(BASE + '/admin/api/summary');
    if (api.status !== 401) fail('signed-out admin API should be 401, got ' + api.status);

    const home = await fetch(BASE + '/');
    const homeHtml = await home.text();
    if (home.status !== 200) fail('home status ' + home.status);
    if (homeHtml.includes('/admin/setup') || homeHtml.includes('Recommended setup order')) fail('public home links to the setup guide');

    const posted = await fetch(BASE + '/admin/login', {
      method: 'POST',
      redirect: 'manual',
      headers: { origin: BASE, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, password }),
    });
    const cookie = cookiePair(posted);
    if (posted.status !== 303 || !cookie) fail('login did not set an admin session (' + posted.status + ')');

    const authed = { cookie, origin: BASE };
    const page = await fetch(BASE + '/admin/setup', { headers: authed });
    const html = await page.text();
    if (page.status !== 200) fail('signed-in /admin/setup status ' + page.status);
    const headers = page.headers;
    if (!(headers.get('cache-control') || '').includes('no-store')) fail('missing no-store');
    if (!(headers.get('x-robots-tag') || '').includes('noindex')) fail('missing noindex');
    const csp = headers.get('content-security-policy') || '';
    if (!csp.includes("default-src 'self'") || !csp.includes("frame-ancestors 'none'")) fail('admin CSP missing');
    for (const title of titles) if (!html.includes(title)) fail('missing step: ' + title);
    for (const phrase of [
      'Recommended setup order',
      'not a claim that Morrow Media historically followed',
      'GitHub reported the repository as public',
      'Why',
      'Needs verification',
      'Pending',
      'Optional',
      'XAI_API_KEY',
      'Google Workspace',
      'not claimed live',
      'no Cursor UI',
      'build:cf',
      'How to update this page',
      'href="/admin/setup"',
      'aria-current="page"',
    ]) if (!html.includes(phrase)) fail('missing phrase: ' + phrase);
    if ((html.match(/<button/g) || []).length !== 1) fail('guide should only keep the existing logout button');
    if (/<input\b/i.test(html)) fail('guide should not contain inputs');
    if (/type="checkbox"/i.test(html)) fail('guide should not contain checkboxes');
    const withoutDocLinks = html.replace(/https:\/\/developers\.google\.com\/workspace\/[^\s"'<>]*/g, '');
    for (const secret of ['/workspace/', 'pbkdf2_sha256$', 'xai-', 'sk-', 'ghp_', 'BEGIN PRIVATE', '.env.admin', '1//']) {
      if (withoutDocLinks.includes(secret)) fail('rendered guide contains ' + secret);
    }

    const dash = await fetch(BASE + '/admin', { headers: authed });
    const dashHtml = await dash.text();
    if (dash.status !== 200 || !dashHtml.includes('href="/admin/setup"')) fail('signed-in dashboard should link to the setup guide');
    const contacts = await fetch(BASE + '/admin/contacts', { headers: authed });
    if (contacts.status !== 200) fail('signed-in contacts regression status ' + contacts.status);
    const cross = await fetch(BASE + '/admin/setup', { method: 'POST', redirect: 'manual', headers: { cookie, origin: 'https://evil.example' } });
    if (cross.status !== 403) fail('cross-site POST should stay forbidden, got ' + cross.status);

    if (!process.exitCode) console.log('setup guide checks passed');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(envFile, { force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
