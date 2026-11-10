// ───────── Jobs and invoices (/admin/jobs, /admin/invoices, public /invoice/<token>, Stripe webhook)
// Inlined into cf/worker.js after tickets-src.js. Same admin session; POSTs under /admin pass the Origin check in admin().
// D1 tables (migration: cf/invoices-schema.sql): jobs, job_line_items, invoices, invoice_line_items, invoice_payments, invoice_counters.
// Stripe is feature-flagged: Charge shows “Stripe not connected” unless STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are both set. Never log those values.
const INV_STATUSES = ['draft', 'sent', 'paid', 'void'];
const JOB_STATUSES = ['open', 'in_progress', 'completed'];
const JOB_STATUS_LABEL = { open: 'Open', in_progress: 'In progress', completed: 'Completed' };
const INV_STATUS_LABEL = { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' };
const PAY_METHODS = ['stripe', 'check', 'wire', 'ach', 'cash', 'other'];
const PAY_METHOD_LABEL = { stripe: 'Stripe', check: 'Check', wire: 'Wire', ach: 'ACH', cash: 'Cash', other: 'Other' };
const INV_FROM_NAME = 'Splitt LLC dba SouthBridge Media';
const INV_FROM_PLACE = 'St. Petersburg, FL';
const INV_PREFIX = 'SBM';

const INV_CSS = `.inv-money{text-align:right;font-variant-numeric:tabular-nums}
.inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.inv-rows{display:grid;gap:8px;margin:0 0 10px}
.inv-row{display:grid;grid-template-columns:1fr 90px 110px 40px;gap:8px;align-items:end}
.inv-row .rm{width:40px;padding:10px 0;justify-content:center}
.inv-totals{margin:16px 0 0 auto;width:min(320px,100%)}
.inv-totals div{display:flex;justify-content:space-between;gap:16px;padding:4px 0}
.inv-totals .grand{font-weight:600;border-top:1px solid var(--line);margin-top:6px;padding-top:8px}
.badge.inv-draft{background:var(--sand)}.badge.inv-sent{background:#e8eef7}.badge.inv-paid{background:#e6f2e8}.badge.inv-void{background:#f3e6e6}
.badge.job-open{background:var(--sand)}.badge.job-in_progress{background:#e8eef7}.badge.job-completed{background:#e6f2e8}
.inv-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0}
.inv-muted{color:var(--muted);font-size:13.5px}
.inv-sheet{background:#fff;border:1px solid var(--line);border-radius:16px;padding:36px 40px;max-width:860px;margin:0 auto}
.inv-sheet header.brand{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--line)}
.inv-sheet .who{font-size:13.5px;line-height:1.5;color:var(--muted)}
.inv-sheet h1{margin:0 0 6px;font-size:36px}
.inv-sheet table{width:100%;border-collapse:collapse;margin:22px 0}
.inv-sheet th{font:500 10.5px/1.4 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 0;border-bottom:1px solid var(--line)}
.inv-sheet td{padding:10px 0;border-bottom:1px solid var(--line);vertical-align:top}
.inv-sheet th.num,.inv-sheet td.num{text-align:right;white-space:nowrap}
.inv-paywall{margin-top:28px;padding-top:20px;border-top:1px solid var(--line)}
.inv-disabled{opacity:.7;cursor:not-allowed;background:var(--sand);color:var(--muted);border-color:var(--stone)}
.inv-lines{width:100%;border-collapse:collapse;margin:8px 0;background:#fff}
.inv-lines th{font:500 10.5px/1.4 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
.inv-lines td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}
.inv-lines th.num,.inv-lines td.num{text-align:right;white-space:nowrap}
@media (max-width:720px){.inv-grid{grid-template-columns:1fr}.inv-row{grid-template-columns:1fr 1fr 1fr 40px}.inv-sheet{padding:22px}}
@media print{body{background:#fff!important}.top,.inv-noprint,.msg{display:none!important}.wrap{padding:0;max-width:none}.inv-sheet{border:0;border-radius:0;padding:0;max-width:none}}`;

const INV_JS = `(function(){document.querySelectorAll('[data-line-items]').forEach(function(box){var t=box.querySelector('[data-rows]');var tmpl=box.querySelector('template');var add=box.querySelector('[data-add-row]');if(!t||!tmpl||!add)return;add.addEventListener('click',function(){t.appendChild(tmpl.content.cloneNode(true));});t.addEventListener('click',function(e){var b=e.target.closest('[data-remove-row]');if(!b)return;var row=b.closest('.inv-row');var rows=t.querySelectorAll('.inv-row');if(rows.length<2){row.querySelectorAll('input').forEach(function(i){if(i.name&&i.name.indexOf('item_qty')===0)i.value='1';else if(i.type==='number')i.value='0';else i.value='';});return;}row.remove();});});})();`;

const INV_LOGO = `<svg class="logo-lockup" viewBox="0 0 276 64" width="220" height="51" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0 8) scale(0.7)"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.45"><path d="M44 16 L4 51"/><path d="M44 16 L14 49"/><path d="M44 16 L24 47.4"/><path d="M44 16 L34 46.6"/><path d="M44 17 L54 46"/><path d="M44 17 L64 45.8"/><path d="M96 9 L62 45.8"/><path d="M96 9 L74 45.4"/><path d="M96 9 L86 45.2"/><path d="M96 10 L108 47.6"/><path d="M96 10 L120 51"/><path d="M96 10 L134 55"/><path d="M96 10 L148 60"/></g>
    <path d="M41 48 V14 h6 V48" fill="currentColor" stroke="none"/>
    <path d="M93 46.4 V6 h6.6 V46.4" fill="currentColor" stroke="none"/>
    <path d="M2 52.5 C 38 42.5, 98 43, 154 62" stroke-width="3.5"/>
    <g stroke-width="2.05"><path d="M16 51 V66"/><path d="M44 47.6 V66"/><path d="M70 45.6 V66"/><path d="M96 46.2 V66"/><path d="M124 52.4 V66"/></g>
  </g></g>
  <g fill="currentColor" stroke="none" font-family="Inter, Arial, Helvetica, sans-serif">
    <text x="116" y="28" font-size="20" font-weight="600" letter-spacing="0.2">SOUTHBRIDGE</text>
    <text x="116.2" y="50" font-size="18" font-weight="300" letter-spacing="6.4">MEDIA</text>
  </g>
</svg>`;

const invMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;
const invFmt = (n) => invMoney(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
function invTotals(items, taxRate, discount) {
  const lines = (items || []).map((it) => ({ ...it, amount: invMoney((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
  const subtotal = invMoney(lines.reduce((s, it) => s + it.amount, 0));
  const disc = invMoney(Math.min(Math.max(Number(discount) || 0, 0), subtotal));
  const rate = Math.max(Number(taxRate) || 0, 0);
  const tax = invMoney((subtotal - disc) * (rate / 100));
  return { lines, subtotal, discount: disc, tax_rate: invMoney(rate), tax_amount: tax, total: invMoney(subtotal - disc + tax) };
}
function invParseItems(b) {
  const descs = [].concat(b.item_desc == null ? [] : b.item_desc);
  const qtys = [].concat(b.item_qty == null ? [] : b.item_qty);
  const rates = [].concat(b.item_rate == null ? [] : b.item_rate);
  const items = [];
  for (let i = 0; i < Math.max(descs.length, qtys.length, rates.length); i++) {
    const description = String(descs[i] ?? '').trim().slice(0, 500);
    const quantity = invMoney(qtys[i]);
    const rate = invMoney(rates[i]);
    if (!description && !quantity && !rate) continue;
    if (!description) continue;
    items.push({ description, quantity: quantity || 0, rate: rate || 0, sort: items.length });
  }
  return items;
}
function invItemRow(it = {}) {
  return `<div class="inv-row"><input name="item_desc" value="${escH(it.description || '')}" maxlength="500" placeholder="Description" aria-label="Line description">
<input name="item_qty" type="number" step="0.01" min="0" value="${escH(it.quantity == null ? '1' : it.quantity)}" aria-label="Quantity">
<input name="item_rate" type="number" step="0.01" min="0" value="${escH(it.rate == null ? '0' : it.rate)}" aria-label="Rate">
<button class="b sm rm" type="button" data-remove-row aria-label="Remove line">×</button></div>`;
}
function invItemsEditor(items) {
  const rows = (items && items.length ? items : [{ quantity: 1, rate: 0 }]).map(invItemRow).join('');
  return `<div class="wide" data-line-items><span class="eyebrow" style="display:block;margin-bottom:8px">Line items</span>
<div class="inv-row inv-muted" style="margin-bottom:4px"><span>Description</span><span>Qty</span><span>Rate (USD)</span><span></span></div>
<div data-rows>${rows}</div>
<template>${invItemRow({ quantity: 1, rate: 0 })}</template>
<button class="b sm" type="button" data-add-row>+ Add line</button></div>`;
}
const stripeSecretsReady = (env) => !!(String(env && env.STRIPE_SECRET_KEY || '').trim() && String(env && env.STRIPE_WEBHOOK_SECRET || '').trim());
function invPublicOrigin(url) {
  const host = String(url && url.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return url.origin;
  return usersOrigin(url);
}
function invDayInput(isoOrDay) {
  const s = String(isoOrDay || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  if (!s) return '';
  try { return etDay(s); } catch { return ''; }
}
function invFmtDay(s) {
  const day = invDayInput(s);
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d, 17, 0, 0)));
}
function invDueDefault() {
  const t = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  return etDay(t);
}
function invIssuedToday() { return etDay(new Date()); }
async function invNextNumber(env) {
  await env.DB.prepare("INSERT OR IGNORE INTO invoice_counters (key, next) VALUES ('SBM', 1)").run();
  const row = await env.DB.prepare("UPDATE invoice_counters SET next = next + 1 WHERE key = 'SBM' RETURNING next - 1 AS n").first();
  const n = row && row.n ? Number(row.n) : 1;
  return INV_PREFIX + '-' + String(n).padStart(4, '0');
}
function invToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return b64u(bytes).replace(/=+$/, '');
}
async function jobGet(env, id) {
  const job = await qy(env, `SELECT j.*, c.name AS contact_name, c.company AS contact_company, c.email AS contact_email, c.phone AS contact_phone
    FROM jobs j JOIN contacts c ON c.id = j.contact_id WHERE j.id = ?`, id).first();
  if (!job) return null;
  job.items = (await qy(env, 'SELECT * FROM job_line_items WHERE job_id = ? ORDER BY sort, id', id).all()).results || [];
  return job;
}
async function invoiceGet(env, id) {
  const inv = await qy(env, `SELECT i.*, c.name AS contact_name, c.company AS contact_company, c.email AS contact_email, c.phone AS contact_phone,
    j.title AS job_title
    FROM invoices i JOIN contacts c ON c.id = i.contact_id LEFT JOIN jobs j ON j.id = i.job_id WHERE i.id = ?`, id).first();
  if (!inv) return null;
  inv.items = (await qy(env, 'SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort, id', id).all()).results || [];
  inv.payments = (await qy(env, 'SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at, id', id).all()).results || [];
  return inv;
}
async function invoiceByToken(env, token) {
  const row = await qy(env, 'SELECT id FROM invoices WHERE public_token = ?', token).first();
  return row ? invoiceGet(env, row.id) : null;
}
async function invReplaceItems(env, table, fk, id, items) {
  await qy(env, `DELETE FROM ${table} WHERE ${fk} = ?`, id).run();
  for (const it of items) {
    await qy(env, `INSERT INTO ${table} (${fk}, description, quantity, rate, sort) VALUES (?, ?, ?, ?, ?)`, id, it.description, it.quantity, it.rate, it.sort || 0).run();
  }
}
async function invSaveTotals(env, id, totals, extra = {}) {
  const now = nowIso();
  const keys = ['subtotal', 'discount', 'tax_rate', 'tax_amount', 'total', 'updated_at', ...Object.keys(extra)];
  const vals = [totals.subtotal, totals.discount, totals.tax_rate, totals.tax_amount, totals.total, now, ...Object.values(extra)];
  await qy(env, `UPDATE invoices SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...vals, id).run();
}

function jobFromBody(b) {
  const s = (k, n = 2000) => String(b[k] ?? '').trim().slice(0, n);
  const status = JOB_STATUSES.includes(s('status', 40)) ? s('status', 40) : 'open';
  const completed_at = status === 'completed' ? (invDayInput(s('completed_at', 40)) || invIssuedToday()) : null;
  const job = {
    contact_id: intOr(b.contact_id),
    title: s('title', 200),
    description: s('description', 10000),
    status,
    completed_at,
    notes: s('notes', 10000),
    items: invParseItems(b),
  };
  const err = [];
  if (!job.contact_id) err.push('Choose a client contact.');
  if (!job.title) err.push('Title is required.');
  return { job, err };
}
function invoiceFromBody(b, existing) {
  const s = (k, n = 2000) => String(b[k] ?? '').trim().slice(0, n);
  const items = invParseItems(b);
  const totals = invTotals(items, s('tax_rate', 20), s('discount', 20));
  const inv = {
    notes: s('notes', 10000),
    due_at: invDayInput(s('due_at', 40)) || existing && existing.due_at || invDueDefault(),
    issued_at: invDayInput(s('issued_at', 40)) || existing && existing.issued_at || invIssuedToday(),
    tax_rate: totals.tax_rate,
    discount: totals.discount,
    items,
    totals,
  };
  const err = [];
  if (!items.length) err.push('Add at least one line item.');
  return { inv, err };
}

async function contactsOptions(env, selected) {
  const rows = (await env.DB.prepare("SELECT id, name, company FROM contacts ORDER BY name COLLATE NOCASE LIMIT 2000").all()).results || [];
  const optsHtml = rows.map((c) => `<option value="${c.id}"${Number(selected) === c.id ? ' selected' : ''}>${escH(c.name)}${c.company ? escH(' · ' + c.company) : ''}</option>`).join('');
  return `<select name="contact_id" required><option value="">Select a contact…</option>${optsHtml}</select>`;
}

async function jobsList(env, url) {
  const sp = url.searchParams;
  const status = JOB_STATUSES.includes(sp.get('status')) ? sp.get('status') : '';
  const qs = String(sp.get('q') || '').trim().slice(0, 100);
  const where = [], args = [];
  if (status) { where.push('j.status = ?'); args.push(status); }
  if (qs) { const like = '%' + qs.replace(/[\\%_]/g, (m) => '\\' + m) + '%'; where.push("(j.title LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\')"); args.push(like, like, like, like); }
  const rows = (await qy(env, `SELECT j.*, c.name AS contact_name, c.company AS contact_company
    FROM jobs j JOIN contacts c ON c.id = j.contact_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY j.updated_at DESC LIMIT 500`, ...args).all()).results || [];
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM jobs').first() || {}).n || 0;
  const list = rows.length ? rows.map((j) => `<article class="card"><header><h3><a href="/admin/jobs/${j.id}">${escH(j.title)}</a></h3><span class="id">${escH(j.contact_name)}${j.contact_company ? ' · ' + escH(j.contact_company) : ''}</span><span class="sp"></span><span class="badge job-${escH(j.status)}">${escH(JOB_STATUS_LABEL[j.status] || j.status)}</span></header>
<div class="meta">${j.completed_at ? `<span>Completed ${escH(invFmtDay(j.completed_at))}</span>` : `<span>Updated ${escH(fmtET(j.updated_at))}</span>`}${j.status === 'completed' ? `<a href="/admin/invoices/new?job_id=${j.id}">Create invoice</a>` : ''}</div></article>`).join('')
    : `<p class="empty">${total ? 'No jobs match these filters.' : 'No jobs yet. Add a job for a CRM contact, then invoice it when the work is completed.'}</p>`;
  const body = `<p class="eyebrow">Billing · ${total} job${total === 1 ? '' : 's'}</p><h1>Jobs</h1>
<div class="bar"><a class="b dark" href="/admin/jobs/new">+ New job</a><a class="b" href="/admin/invoices">Invoices</a></div>
<form class="filters" method="get" action="/admin/jobs" role="search" style="grid-template-columns:2fr 1fr auto"><input class="q" type="search" name="q" value="${escH(qs)}" placeholder="Search title, client…" aria-label="Search">
<select name="status" aria-label="Status"><option value="">All statuses</option>${opts(JOB_STATUSES, status, (k) => JOB_STATUS_LABEL[k])}</select>
<button class="b dark" type="submit">Apply</button></form>
<div class="list">${list}</div>`;
  return adminPage('Jobs', 'jobs', body, { msg: sp.get('msg') || '' });
}
async function jobFormPage(env, job, { action, title, err = [] }) {
  const items = job.items || [];
  const body = `<p class="eyebrow"><a href="/admin/jobs">Jobs</a></p><h1>${escH(title)}</h1>${err.length ? `<p class="msg err">${err.map(escH).join(' ')}</p>` : ''}
<form class="form" method="post" action="${action}">
${field('Client *', await contactsOptions(env, job.contact_id))}${field('Status', `<select name="status">${opts(JOB_STATUSES, job.status || 'open', (k) => JOB_STATUS_LABEL[k])}</select>`)}
${field('Title *', inp('title', job.title, 'required maxlength="200"'), true)}
${field('Description', `<textarea name="description" maxlength="10000">${escH(job.description || '')}</textarea>`, true)}
${invItemsEditor(items)}
${field('Completed date', `<input type="date" name="completed_at" value="${escH(invDayInput(job.completed_at))}">`)}
${field('Internal notes', `<textarea name="notes" maxlength="10000">${escH(job.notes || '')}</textarea>`)}
<div class="acts"><button class="btn" type="submit">Save job</button><a class="b" href="${job.id ? '/admin/jobs/' + job.id : '/admin/jobs'}">Cancel</a></div></form>`;
  return adminPage(title, 'jobs', body);
}
async function jobDetail(env, url, id) {
  const job = await jobGet(env, id);
  if (!job) return adminPage('Not found', 'jobs', '<h1>Job not found</h1><p><a href="/admin/jobs">← All jobs</a></p>', { status: 404 });
  const invoices = (await qy(env, 'SELECT id, number, status, total, due_at FROM invoices WHERE job_id = ? ORDER BY id DESC', id).all()).results || [];
  const t = invTotals(job.items, 0, 0);
  const invList = invoices.length ? invoices.map((i) => `<article class="card"><header><h3><a href="/admin/invoices/${i.id}">${escH(i.number)}</a></h3><span class="sp"></span><span class="badge inv-${escH(i.status)}">${escH(INV_STATUS_LABEL[i.status] || i.status)}</span></header><div class="meta"><span>${escH(invFmt(i.total))}</span>${i.due_at ? `<span>Due ${escH(invFmtDay(i.due_at))}</span>` : ''}</div></article>`).join('') : '<p class="empty">No invoices from this job yet.</p>';
  const lines = job.items.length ? `<div class="card" style="overflow:auto"><table class="inv-lines"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${t.lines.map((it) => `<tr><td>${escH(it.description)}</td><td class="num">${escH(it.quantity)}</td><td class="num">${escH(invFmt(it.rate))}</td><td class="num">${escH(invFmt(it.amount))}</td></tr>`).join('')}</tbody></table><div class="inv-totals"><div class="grand"><span>Suggested total</span><span>${escH(invFmt(t.total))}</span></div></div></div>` : '<p class="empty">No line items yet. Add them when you edit the job.</p>';
  const canInvoice = job.status === 'completed';
  const body = `<p class="eyebrow"><a href="/admin/jobs">Jobs</a> · ${escH(job.contact_name)}</p><h1>${escH(job.title)}</h1>
<div class="bar"><span class="badge job-${escH(job.status)}">${escH(JOB_STATUS_LABEL[job.status] || job.status)}</span><span class="sp"></span>
${canInvoice ? `<a class="b dark" href="/admin/invoices/new?job_id=${job.id}">Create invoice</a>` : '<span class="inv-muted">Mark the job completed to create an invoice.</span>'}
<a class="b" href="/admin/jobs/${job.id}/edit">Edit</a>
${delForm(`/admin/jobs/${job.id}/delete`, `Delete job “${job.title}”? Linked invoices are kept (unlinked). This can't be undone.`)}</div>
<article class="card"><dl>
<div><dt>Client</dt><dd><a href="/admin/contacts/${job.contact_id}">${escH(job.contact_name)}</a>${job.contact_company ? '<br>' + escH(job.contact_company) : ''}</dd></div>
<div><dt>Completed</dt><dd>${job.completed_at ? escH(invFmtDay(job.completed_at)) : '—'}</dd></div>
<div class="wide"><dt>Description</dt><dd>${escH(job.description) || '—'}</dd></div>
${job.notes ? `<div class="wide"><dt>Internal notes</dt><dd>${escH(job.notes)}</dd></div>` : ''}
</dl></article>
<h2 class="sec">Line items</h2>${lines}
<h2 class="sec">Invoices</h2>${invList}`;
  return adminPage(job.title, 'jobs', body, { msg: url.searchParams.get('msg') || '' });
}
async function saveJob(env, b, id = null) {
  const { job, err } = jobFromBody(b);
  if (err.length) return { job, err };
  const contact = await qy(env, 'SELECT id FROM contacts WHERE id = ?', job.contact_id).first();
  if (!contact) return { job, err: ['That contact was not found.'] };
  const now = nowIso();
  if (id) {
    const old = await qy(env, 'SELECT id FROM jobs WHERE id = ?', id).first();
    if (!old) return { missing: true };
    await qy(env, 'UPDATE jobs SET contact_id = ?, title = ?, description = ?, status = ?, completed_at = ?, notes = ?, updated_at = ? WHERE id = ?',
      job.contact_id, job.title, job.description, job.status, job.completed_at, job.notes, now, id).run();
    await invReplaceItems(env, 'job_line_items', 'job_id', id, job.items);
    return { id };
  }
  const r = await qy(env, 'INSERT INTO jobs (contact_id, title, description, status, completed_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    job.contact_id, job.title, job.description, job.status, job.completed_at, job.notes, now, now).run();
  const nid = r.meta.last_row_id;
  await invReplaceItems(env, 'job_line_items', 'job_id', nid, job.items);
  return { id: nid, created: true };
}

async function invoicesList(env, url) {
  const sp = url.searchParams;
  const status = INV_STATUSES.includes(sp.get('status')) ? sp.get('status') : '';
  const qs = String(sp.get('q') || '').trim().slice(0, 100);
  const where = [], args = [];
  if (status) { where.push('i.status = ?'); args.push(status); }
  if (qs) { const like = '%' + qs.replace(/[\\%_]/g, (m) => '\\' + m) + '%'; where.push("(i.number LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\' OR j.title LIKE ? ESCAPE '\\')"); args.push(like, like, like, like); }
  const rows = (await qy(env, `SELECT i.*, c.name AS contact_name, c.company AS contact_company, j.title AS job_title
    FROM invoices i JOIN contacts c ON c.id = i.contact_id LEFT JOIN jobs j ON j.id = i.job_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.id DESC LIMIT 500`, ...args).all()).results || [];
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM invoices').first() || {}).n || 0;
  const list = rows.length ? rows.map((i) => `<article class="card"><header><h3><a href="/admin/invoices/${i.id}">${escH(i.number)}</a></h3><span class="id">${escH(i.contact_name)}${i.job_title ? ' · ' + escH(i.job_title) : ''}</span><span class="sp"></span><span class="badge inv-${escH(i.status)}">${escH(INV_STATUS_LABEL[i.status] || i.status)}</span></header>
<div class="meta"><span>${escH(invFmt(i.total))}</span>${i.due_at ? `<span>Due ${escH(invFmtDay(i.due_at))}</span>` : ''}${i.paid_at ? `<span>Paid ${escH(invFmtDay(i.paid_at))}</span>` : ''}</div></article>`).join('')
    : `<p class="empty">${total ? 'No invoices match these filters.' : 'No invoices yet. Complete a job, then create an invoice from it.'}</p>`;
  const body = `<p class="eyebrow">Billing · ${total} invoice${total === 1 ? '' : 's'}</p><h1>Invoices</h1>
<div class="bar"><a class="b" href="/admin/jobs">Jobs</a><span class="sp"></span></div>
<form class="filters" method="get" action="/admin/invoices" role="search" style="grid-template-columns:2fr 1fr auto"><input class="q" type="search" name="q" value="${escH(qs)}" placeholder="Search number, client, job…" aria-label="Search">
<select name="status" aria-label="Status"><option value="">All statuses</option>${opts(INV_STATUSES, status, (k) => INV_STATUS_LABEL[k])}</select>
<button class="b dark" type="submit">Apply</button></form>
<div class="list">${list}</div>`;
  return adminPage('Invoices', 'invoices', body, { msg: sp.get('msg') || '', err: sp.get('err') === '1' });
}
async function invoiceFormPage(env, inv, { action, title, err = [], job = null }) {
  const body = `<p class="eyebrow"><a href="/admin/invoices">Invoices</a>${job ? ` · from <a href="/admin/jobs/${job.id}">${escH(job.title)}</a>` : ''}</p><h1>${escH(title)}</h1>${err.length ? `<p class="msg err">${err.map(escH).join(' ')}</p>` : ''}
<form class="form" method="post" action="${action}">
${job ? `<input type="hidden" name="job_id" value="${job.id}">` : ''}
${field('Issue date', `<input type="date" name="issued_at" value="${escH(inv.issued_at || invIssuedToday())}">`)}
${field('Due date', `<input type="date" name="due_at" value="${escH(inv.due_at || invDueDefault())}">`)}
${invItemsEditor(inv.items)}
${field('Discount (USD)', inp('discount', inv.discount || 0, 'type="number" step="0.01" min="0"'))}
${field('Tax rate (%)', inp('tax_rate', inv.tax_rate || 0, 'type="number" step="0.01" min="0"'))}
${field('Notes (shown on the invoice)', `<textarea name="notes" maxlength="10000">${escH(inv.notes || '')}</textarea>`, true)}
<div class="acts"><button class="btn" type="submit">Save invoice</button><a class="b" href="${inv.id ? '/admin/invoices/' + inv.id : '/admin/invoices'}">Cancel</a></div></form>`;
  return adminPage(title, 'invoices', body);
}
function invoiceSheetHtml(inv, { publicView = false, pay = '' } = {}) {
  const t = invTotals(inv.items, inv.tax_rate, inv.discount);
  const billTo = [inv.contact_name, inv.contact_company, inv.contact_email, inv.contact_phone].filter(Boolean).map(escH).join('<br>');
  const rows = t.lines.map((it) => `<tr><td>${escH(it.description)}</td><td class="num">${escH(it.quantity)}</td><td class="num">${escH(invFmt(it.rate))}</td><td class="num">${escH(invFmt(it.amount))}</td></tr>`).join('');
  return `<article class="inv-sheet">
<header class="brand"><div><a href="/" style="color:inherit;text-decoration:none" aria-label="SouthBridge Media">${INV_LOGO}</a>
<p class="who">${escH(INV_FROM_NAME)}<br>${escH(INV_FROM_PLACE)}</p></div>
<div style="text-align:right"><p class="eyebrow" style="margin:0 0 6px">Invoice</p><h1>${escH(inv.number)}</h1>
<p class="who"><span class="badge inv-${escH(inv.status)}">${escH(INV_STATUS_LABEL[inv.status] || inv.status)}</span></p>
<p class="who">Issued ${escH(invFmtDay(inv.issued_at) || '—')}<br>Due ${escH(invFmtDay(inv.due_at) || '—')}</p></div></header>
<div class="inv-grid"><div><p class="eyebrow">Billed to</p><p>${billTo || '—'}</p></div>
${inv.job_title ? `<div><p class="eyebrow">Job</p><p>${escH(inv.job_title)}</p></div>` : ''}</div>
<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
<tbody>${rows || '<tr><td colspan="4">No line items</td></tr>'}</tbody></table>
<div class="inv-totals">
<div><span>Subtotal</span><span>${escH(invFmt(t.subtotal))}</span></div>
${t.discount ? `<div><span>Discount</span><span>− ${escH(invFmt(t.discount))}</span></div>` : ''}
${t.tax_rate ? `<div><span>Tax (${escH(t.tax_rate)}%)</span><span>${escH(invFmt(t.tax_amount))}</span></div>` : ''}
<div class="grand"><span>Total due</span><span>${escH(invFmt(t.total))}</span></div>
</div>
${inv.notes ? `<p style="margin-top:28px;white-space:pre-wrap">${escH(inv.notes)}</p>` : ''}
${inv.status === 'paid' && inv.paid_at ? `<p class="inv-muted" style="margin-top:20px">Paid ${escH(invFmtDay(inv.paid_at))}${inv.paid_method ? ' · ' + escH(PAY_METHOD_LABEL[inv.paid_method] || inv.paid_method) : ''}</p>` : ''}
${pay}</article>`;
}
function publicInvoiceDoc(title, body, msg = '', err = false) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${escH(title)} — SouthBridge Media</title><style>${ADMIN_CSS}${CRM_CSS}${INV_CSS}body{background:var(--sand)}.pub{max-width:900px;margin:0 auto;padding:32px var(--gut) 64px}</style></head>
<body><div class="pub">${msg ? `<p class="msg${err ? ' err' : ''} inv-noprint" role="status">${escH(msg)}</p>` : ''}${body}
<p class="foot inv-noprint">Questions? Contact SouthBridge Media.</p></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

async function invoiceDetail(env, url, id) {
  const inv = await invoiceGet(env, id);
  if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1><p><a href="/admin/invoices">← All invoices</a></p>', { status: 404 });
  const connected = stripeSecretsReady(env);
  const origin = invPublicOrigin(url);
  const publicUrl = `${origin}/invoice/${inv.public_token}`;
  const canEdit = inv.status === 'draft';
  const canPay = inv.status === 'draft' || inv.status === 'sent';
  const payForm = canPay ? `<form class="form" method="post" action="/admin/invoices/${inv.id}/pay" style="margin-top:12px">
${field('Method', `<select name="method">${opts(PAY_METHODS.filter((m) => m !== 'stripe'), inv.paid_method || 'check', (k) => PAY_METHOD_LABEL[k])}</select>`)}
${field('Paid date', `<input type="date" name="paid_at" value="${escH(invIssuedToday())}" required>`)}
${field('Note', inp('note', '', 'maxlength="500"'), true)}
<div class="acts"><button class="btn" type="submit">Mark as paid</button></div></form>` : '';
  const charge = canPay ? (connected
    ? `<form class="inl" method="post" action="/admin/invoices/${inv.id}/charge"><button class="b dark" type="submit">Charge / send payment link</button></form>`
    : `<button class="b inv-disabled" type="button" disabled title="Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on the Worker to enable card charging.">Stripe not connected</button>`) : '';
  const send = inv.status === 'draft' ? `<form class="inl" method="post" action="/admin/invoices/${inv.id}/send"><button class="b" type="submit">Mark as sent</button></form>` : '';
  const voidF = (inv.status === 'draft' || inv.status === 'sent') ? delForm(`/admin/invoices/${inv.id}/void`, `Void invoice ${inv.number}? It will no longer be collectible.`, '', 'Void invoice') : '';
  const payBlock = `<div class="inv-paywall inv-noprint"><h2 class="sec" style="margin-top:0">Collect payment</h2>
<div class="inv-actions">${charge}${send}${canEdit ? `<a class="b" href="/admin/invoices/${inv.id}/edit">Edit draft</a>` : ''}${voidF}
<a class="b" href="/admin/invoices/${inv.id}/print" target="_blank" rel="noopener">Printable view</a></div>
<p class="inv-muted">Client link (tokenized): <a href="${escH(publicUrl)}" target="_blank" rel="noopener">${escH(publicUrl)}</a></p>
${inv.stripe_payment_link_url ? `<p class="inv-muted">Stripe Checkout: <a href="${escH(inv.stripe_payment_link_url)}" target="_blank" rel="noopener">Open payment link</a></p>` : ''}
${!connected && canPay ? '<p class="inv-muted">Card charging stays off until a Stripe account is connected and the two Worker secrets are set. You can still mark an invoice paid after a check, wire, or other payment.</p>' : ''}
${payForm}</div>`;
  const body = `<p class="eyebrow"><a href="/admin/invoices">Invoices</a>${inv.job_id ? ` · <a href="/admin/jobs/${inv.job_id}">${escH(inv.job_title || 'Job')}</a>` : ''}</p>
<h1>${escH(inv.number)}</h1>
${invoiceSheetHtml(inv)}
${payBlock}`;
  const sp = url.searchParams;
  return adminPage(inv.number, 'invoices', body, { msg: sp.get('msg') || '', err: sp.get('err') === '1' });
}
function invoicePrintPage(inv) {
  const body = `<div class="pub inv-print">${invoiceSheetHtml(inv)}<p class="inv-noprint" style="text-align:center;margin-top:24px"><button class="b dark" type="button" onclick="window.print()">Print</button></p></div>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${escH(inv.number)} — SouthBridge Media</title><style>${ADMIN_CSS}${CRM_CSS}${INV_CSS}body{background:#fff}.pub{max-width:900px;margin:0 auto;padding:32px var(--gut) 64px}</style></head>
<body>${body}</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}

async function createInvoiceFromJob(env, job, b) {
  const { inv, err } = invoiceFromBody(b, { due_at: invDueDefault(), issued_at: invIssuedToday() });
  if (err.length) return { err, inv };
  const now = nowIso();
  const number = await invNextNumber(env);
  const token = invToken();
  const r = await qy(env, `INSERT INTO invoices (number, job_id, contact_id, status, issued_at, due_at, notes, tax_rate, discount, subtotal, tax_amount, total, currency, public_token, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)`,
    number, job.id, job.contact_id, inv.issued_at, inv.due_at, inv.notes, inv.totals.tax_rate, inv.totals.discount, inv.totals.subtotal, inv.totals.tax_amount, inv.totals.total, token, now, now).run();
  const id = r.meta.last_row_id;
  await invReplaceItems(env, 'invoice_line_items', 'invoice_id', id, inv.totals.lines);
  return { id, number };
}
async function updateInvoiceDraft(env, existing, b) {
  if (existing.status !== 'draft') return { err: ['Only a draft invoice can be edited.'] };
  const { inv, err } = invoiceFromBody(b, existing);
  if (err.length) return { err, inv };
  await invSaveTotals(env, existing.id, inv.totals, { notes: inv.notes, due_at: inv.due_at, issued_at: inv.issued_at });
  await invReplaceItems(env, 'invoice_line_items', 'invoice_id', existing.id, inv.totals.lines);
  return { id: existing.id };
}
async function markInvoicePaid(env, inv, { method, paid_at, note, stripe_event_id, amount, stripe_payment_intent_id, stripe_checkout_session_id }) {
  if (inv.status === 'paid') return { already: true };
  if (inv.status === 'void') return { err: 'A void invoice cannot be marked paid.' };
  const when = invDayInput(paid_at) || invIssuedToday();
  const payMethod = PAY_METHODS.includes(method) ? method : 'other';
  const now = nowIso();
  const amt = invMoney(amount == null ? inv.total : amount);
  try {
    await qy(env, 'INSERT INTO invoice_payments (invoice_id, amount, method, paid_at, note, stripe_event_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      inv.id, amt, payMethod, when, String(note || '').slice(0, 500), stripe_event_id || null, now).run();
  } catch (e) {
    if (stripe_event_id && /UNIQUE/i.test(String(e && e.message || e))) return { already: true };
    throw e;
  }
  const extra = { status: 'paid', paid_at: when, paid_method: payMethod };
  if (stripe_payment_intent_id) extra.stripe_payment_intent_id = stripe_payment_intent_id;
  if (stripe_checkout_session_id) extra.stripe_checkout_session_id = stripe_checkout_session_id;
  await invSaveTotals(env, inv.id, invTotals(inv.items, inv.tax_rate, inv.discount), extra);
  return { ok: true };
}

async function stripeCreateCheckout(env, inv, origin) {
  const secret = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!secret || !String(env.STRIPE_WEBHOOK_SECRET || '').trim()) return { err: 'Stripe is not connected.' };
  const success = `${origin}/invoice/${inv.public_token}?paid=1`;
  const cancel = `${origin}/invoice/${inv.public_token}?canceled=1`;
  const cents = Math.round(invMoney(inv.total) * 100);
  if (cents < 50) return { err: 'Stripe requires a total of at least $0.50.' };
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', success);
  body.set('cancel_url', cancel);
  body.set('client_reference_id', String(inv.id));
  if (inv.contact_email) body.set('customer_email', inv.contact_email);
  body.set('metadata[invoice_id]', String(inv.id));
  body.set('metadata[invoice_number]', inv.number);
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', 'usd');
  body.set('line_items[0][price_data][unit_amount]', String(cents));
  body.set('line_items[0][price_data][product_data][name]', `Invoice ${inv.number}`);
  body.set('payment_intent_data[metadata][invoice_id]', String(inv.id));
  body.set('payment_intent_data[metadata][invoice_number]', inv.number);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await r.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = {}; }
  if (!r.ok || !json.id || !json.url) {
    const msg = (json && json.error && json.error.message) ? json.error.message : 'Stripe could not create a payment link.';
    return { err: msg };
  }
  const now = nowIso();
  const status = inv.status === 'draft' ? 'sent' : inv.status;
  await qy(env, 'UPDATE invoices SET stripe_checkout_session_id = ?, stripe_payment_link_url = ?, stripe_payment_intent_id = ?, status = ?, updated_at = ? WHERE id = ?',
    json.id, json.url, json.payment_intent || null, status, now, inv.id).run();
  return { url: json.url, id: json.id };
}

async function stripeVerifySig(secret, payload, header) {
  const map = {};
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i > 0) map[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  const t = map.t, v1 = map.v1;
  if (!t || !v1 || !secret) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return safeEq(hex, String(v1).toLowerCase());
}

async function stripeWebhook(req, env) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { 'cache-control': 'no-store' } });
  const secret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) return json({ ok: false, error: 'Stripe is not connected' }, 503);
  const payload = await req.text();
  const header = req.headers.get('stripe-signature') || '';
  if (!(await stripeVerifySig(secret, payload, header))) return json({ ok: false, error: 'Invalid signature' }, 400);
  let event;
  try { event = JSON.parse(payload); } catch { return json({ ok: false, error: 'Invalid payload' }, 400); }
  const type = event && event.type;
  const obj = event && event.data && event.data.object || {};
  let invoiceId = 0, sessionId = '', intentId = '', amount;
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    invoiceId = Number((obj.metadata && obj.metadata.invoice_id) || obj.client_reference_id || 0);
    sessionId = obj.id || '';
    intentId = typeof obj.payment_intent === 'string' ? obj.payment_intent : (obj.payment_intent && obj.payment_intent.id) || '';
    amount = obj.amount_total != null ? obj.amount_total / 100 : undefined;
  } else if (type === 'payment_intent.succeeded') {
    invoiceId = Number(obj.metadata && obj.metadata.invoice_id || 0);
    intentId = obj.id || '';
    amount = obj.amount != null ? obj.amount / 100 : undefined;
  } else {
    return json({ ok: true, ignored: true });
  }
  let inv = invoiceId ? await invoiceGet(env, invoiceId) : null;
  if (!inv && sessionId) {
    const row = await qy(env, 'SELECT id FROM invoices WHERE stripe_checkout_session_id = ?', sessionId).first();
    if (row) inv = await invoiceGet(env, row.id);
  }
  if (!inv) return json({ ok: true, ignored: 'invoice not found' });
  const result = await markInvoicePaid(env, inv, {
    method: 'stripe',
    paid_at: invIssuedToday(),
    note: 'Paid via Stripe',
    stripe_event_id: event.id || null,
    amount,
    stripe_payment_intent_id: intentId || null,
    stripe_checkout_session_id: sessionId || inv.stripe_checkout_session_id || null,
  });
  if (result.err) return json({ ok: false, error: result.err }, 409);
  return json({ ok: true, already: !!result.already });
}

async function publicInvoice(req, env, url, p) {
  const m = p.match(/^\/invoice\/([^/]+)(?:\/(pay))?$/);
  if (!m) return new Response('Not found', { status: 404 });
  const token = decodeURIComponent(m[1]);
  const inv = await invoiceByToken(env, token);
  if (!inv || inv.status === 'void') return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  const origin = url.origin;
  if (m[2] === 'pay' && req.method === 'POST') {
    if (inv.status === 'paid') return goTo(`/invoice/${token}?msg=` + encodeURIComponent('This invoice is already paid.'));
    if (!stripeSecretsReady(env)) return goTo(`/invoice/${token}?err=1&msg=` + encodeURIComponent('Online payment is not available yet. Please contact SouthBridge Media.'));
    const out = await stripeCreateCheckout(env, inv, origin);
    if (out.err) return goTo(`/invoice/${token}?err=1&msg=` + encodeURIComponent(out.err));
    return goTo(out.url);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const paidMsg = url.searchParams.get('paid') ? 'Thank you. If your payment just went through, this invoice will show as paid in a moment. You can refresh this page.' : (url.searchParams.get('canceled') ? 'Payment was canceled. You can try again when you are ready.' : (url.searchParams.get('msg') || ''));
  const err = url.searchParams.get('err') === '1';
  const canPay = (inv.status === 'draft' || inv.status === 'sent') && inv.status !== 'paid';
  const connected = stripeSecretsReady(env);
  const pay = canPay ? `<div class="inv-paywall inv-noprint">${connected
    ? `<form method="post" action="/invoice/${escH(inv.public_token)}/pay"><button class="btn" type="submit" style="width:auto;padding:0 28px">Pay ${escH(invFmt(inv.total))} now</button></form>`
    : '<p class="inv-muted">Online payment is not available on this invoice yet. Please contact SouthBridge Media to arrange payment.</p>'}</div>` : '';
  return publicInvoiceDoc(inv.number, invoiceSheetHtml(inv, { publicView: true, pay }), paidMsg, err);
}

async function contactJobs(env, c) {
  if (!c || !c.id) return '';
  try {
    const jobs = (await qy(env, 'SELECT id, title, status, completed_at FROM jobs WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 20', c.id).all()).results || [];
    const invoices = (await qy(env, 'SELECT id, number, status, total FROM invoices WHERE contact_id = ? ORDER BY id DESC LIMIT 20', c.id).all()).results || [];
    const jList = jobs.length ? jobs.map((j) => `<article class="card"><header><h3><a href="/admin/jobs/${j.id}">${escH(j.title)}</a></h3><span class="sp"></span><span class="badge job-${escH(j.status)}">${escH(JOB_STATUS_LABEL[j.status] || j.status)}</span></header></article>`).join('') : '<p class="empty">No jobs for this contact.</p>';
    const iList = invoices.length ? invoices.map((i) => `<article class="card"><header><h3><a href="/admin/invoices/${i.id}">${escH(i.number)}</a></h3><span class="sp"></span><span class="badge inv-${escH(i.status)}">${escH(INV_STATUS_LABEL[i.status] || i.status)}</span></header><div class="meta">${escH(invFmt(i.total))}</div></article>`).join('') : '';
    return `<h2 class="sec">Jobs &amp; invoices</h2><div class="bar"><a class="b dark" href="/admin/jobs/new?contact_id=${c.id}">+ New job</a></div>${jList}${iList}`;
  } catch {
    return '';
  }
}

async function invoicesRoute(req, env, url, p) {
  const GET = req.method === 'GET', POST = req.method === 'POST';
  const body = () => readBody(req);
  let m;

  if (p === '/admin/jobs' && GET) return jobsList(env, url);
  if (p === '/admin/jobs/new' && GET) {
    const contact_id = intOr(url.searchParams.get('contact_id'));
    return jobFormPage(env, { contact_id, status: 'open', items: [] }, { action: '/admin/jobs', title: 'New job' });
  }
  if (p === '/admin/jobs' && POST) {
    const b = await body(); const saved = await saveJob(env, b);
    if (saved.err) return jobFormPage(env, saved.job, { action: '/admin/jobs', title: 'New job', err: saved.err });
    return goTo(withMsg('/admin/jobs/' + saved.id, 'Job saved.'));
  }
  if ((m = p.match(/^\/admin\/jobs\/(\d+)$/)) && GET) return jobDetail(env, url, Number(m[1]));
  if ((m = p.match(/^\/admin\/jobs\/(\d+)\/edit$/)) && GET) {
    const job = await jobGet(env, Number(m[1]));
    if (!job) return adminPage('Not found', 'jobs', '<h1>Job not found</h1><p><a href="/admin/jobs">← All jobs</a></p>', { status: 404 });
    return jobFormPage(env, job, { action: `/admin/jobs/${job.id}`, title: 'Edit job' });
  }
  if ((m = p.match(/^\/admin\/jobs\/(\d+)$/)) && POST) {
    const id = Number(m[1]); const b = await body(); const saved = await saveJob(env, b, id);
    if (saved.missing) return adminPage('Not found', 'jobs', '<h1>Job not found</h1>', { status: 404 });
    if (saved.err) return jobFormPage(env, { ...saved.job, id }, { action: `/admin/jobs/${id}`, title: 'Edit job', err: saved.err });
    return goTo(withMsg('/admin/jobs/' + id, 'Job updated.'));
  }
  if ((m = p.match(/^\/admin\/jobs\/(\d+)\/delete$/)) && POST) {
    const id = Number(m[1]);
    await qy(env, 'UPDATE invoices SET job_id = NULL, updated_at = ? WHERE job_id = ?', nowIso(), id).run();
    await qy(env, 'DELETE FROM job_line_items WHERE job_id = ?', id).run();
    await qy(env, 'DELETE FROM jobs WHERE id = ?', id).run();
    return goTo(withMsg('/admin/jobs', 'Job deleted.'));
  }

  if (p === '/admin/invoices' && GET) return invoicesList(env, url);
  if (p === '/admin/invoices/new' && GET) {
    const jobId = intOr(url.searchParams.get('job_id'));
    const job = jobId ? await jobGet(env, jobId) : null;
    if (!job) return goTo(withMsg('/admin/jobs', 'Choose a completed job to invoice.'));
    if (job.status !== 'completed') return goTo(withMsg('/admin/jobs/' + job.id, 'Mark the job completed before creating an invoice.'));
    const draft = { items: job.items, notes: job.notes || '', tax_rate: 0, discount: 0, due_at: invDueDefault(), issued_at: invIssuedToday() };
    return invoiceFormPage(env, draft, { action: '/admin/invoices', title: 'New invoice', job });
  }
  if (p === '/admin/invoices' && POST) {
    const b = await body();
    const job = await jobGet(env, intOr(b.job_id));
    if (!job) return goTo(withMsg('/admin/jobs', 'That job was not found.'));
    if (job.status !== 'completed') return goTo(withMsg('/admin/jobs/' + job.id, 'Mark the job completed before creating an invoice.'));
    const saved = await createInvoiceFromJob(env, job, b);
    if (saved.err) return invoiceFormPage(env, saved.inv, { action: '/admin/invoices', title: 'New invoice', job, err: saved.err });
    return goTo(withMsg('/admin/invoices/' + saved.id, `Invoice ${saved.number} created as a draft.`));
  }
  if ((m = p.match(/^\/admin\/invoices\/(\d+)$/)) && GET) return invoiceDetail(env, url, Number(m[1]));
  if ((m = p.match(/^\/admin\/invoices\/(\d+)\/print$/)) && GET) {
    const inv = await invoiceGet(env, Number(m[1]));
    if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1>', { status: 404 });
    return invoicePrintPage(inv);
  }
  if ((m = p.match(/^\/admin\/invoices\/(\d+)\/edit$/)) && GET) {
    const inv = await invoiceGet(env, Number(m[1]));
    if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1>', { status: 404 });
    if (inv.status !== 'draft') return goTo(withMsg('/admin/invoices/' + inv.id, 'Only a draft invoice can be edited.'));
    const job = inv.job_id ? await jobGet(env, inv.job_id) : null;
    return invoiceFormPage(env, inv, { action: `/admin/invoices/${inv.id}`, title: 'Edit ' + inv.number, job });
  }
  if ((m = p.match(/^\/admin\/invoices\/(\d+)$/)) && POST) {
    const id = Number(m[1]); const inv = await invoiceGet(env, id);
    if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1>', { status: 404 });
    const saved = await updateInvoiceDraft(env, inv, await body());
    if (saved.err) return invoiceFormPage(env, saved.inv || inv, { action: `/admin/invoices/${id}`, title: 'Edit ' + inv.number, err: saved.err });
    return goTo(withMsg('/admin/invoices/' + id, 'Invoice updated.'));
  }
  if ((m = p.match(/^\/admin\/invoices\/(\d+)\/send$/)) && POST) {
    const inv = await invoiceGet(env, Number(m[1]));
    if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1>', { status: 404 });
    if (inv.status !== 'draft') return goTo(withMsg('/admin/invoices/' + inv.id, 'Only a draft can be marked sent.'));
    await qy(env, "UPDATE invoices SET status = 'sent', updated_at = ? WHERE id = ?", nowIso(), inv.id).run();
    return goTo(withMsg('/admin/invoices/' + inv.id, 'Invoice marked as sent. Share the client link when you are ready.'));
  }
  if ((m = p.match(/^\/admin\/invoices\/(\d+)\/pay$/)) && POST) {
    const inv = await invoiceGet(env, Number(m[1]));
    if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1>', { status: 404 });
    const b = await body();
    const result = await markInvoicePaid(env, inv, { method: String(b.method || ''), paid_at: String(b.paid_at || ''), note: String(b.note || '') });
    if (result.err) return goTo('/admin/invoices/' + inv.id + '?err=1&msg=' + encodeURIComponent(result.err));
    return goTo(withMsg('/admin/invoices/' + inv.id, result.already ? 'This invoice was already marked paid.' : 'Invoice marked as paid.'));
  }
  if ((m = p.match(/^\/admin\/invoices\/(\d+)\/charge$/)) && POST) {
    const inv = await invoiceGet(env, Number(m[1]));
    if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1>', { status: 404 });
    if (inv.status === 'paid' || inv.status === 'void') return goTo(withMsg('/admin/invoices/' + inv.id, 'This invoice cannot be charged.'));
    if (!stripeSecretsReady(env)) return goTo('/admin/invoices/' + inv.id + '?err=1&msg=' + encodeURIComponent('Stripe is not connected.'));
    const out = await stripeCreateCheckout(env, inv, invPublicOrigin(url));
    if (out.err) return goTo('/admin/invoices/' + inv.id + '?err=1&msg=' + encodeURIComponent(out.err));
    return goTo(withMsg('/admin/invoices/' + inv.id, 'Payment link ready. Share the client invoice page or this Stripe Checkout URL: ' + out.url));
  }
  if ((m = p.match(/^\/admin\/invoices\/(\d+)\/void$/)) && POST) {
    const inv = await invoiceGet(env, Number(m[1]));
    if (!inv) return adminPage('Not found', 'invoices', '<h1>Invoice not found</h1>', { status: 404 });
    if (inv.status === 'paid') return goTo('/admin/invoices/' + inv.id + '?err=1&msg=' + encodeURIComponent('A paid invoice cannot be voided.'));
    if (inv.status === 'void') return goTo(withMsg('/admin/invoices/' + inv.id, 'Already void.'));
    await qy(env, "UPDATE invoices SET status = 'void', updated_at = ? WHERE id = ?", nowIso(), inv.id).run();
    return goTo(withMsg('/admin/invoices/' + inv.id, 'Invoice voided.'));
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    invMoney, invFmt, invTotals, invParseItems, stripeSecretsReady, stripeVerifySig, markInvoicePaid,
    INV_STATUSES, JOB_STATUSES, INV_PREFIX,
  };
}
