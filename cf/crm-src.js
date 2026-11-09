// ───────── CRM: contacts, activity timeline, follow-up calendar, ICS feed (/admin/contacts, /admin/calendar, /cal/<token>.ics) ─────────
// Inlined into cf/worker.js after admin-src.js. Same admin session; every POST passes the Origin/Referer check in admin().
// D1 tables (migration: cf/crm-schema.sql): contacts, contact_activities, followups (+ gcal_event_id), settings. Times are stored as UTC ISO strings and shown in America/New_York.
// Google Workspace Calendar sync: when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set and a refresh token exists (Worker secret GOOGLE_REFRESH_TOKEN or settings.gcal_refresh_token), create/update/delete matching events on sponsors@ (or GOOGLE_CALENDAR_ID).
const CONTACT_TYPES = ['brand', 'creator', 'sponsor', 'event', 'real estate', 'other'];
const STAGES = ['lead', 'contacted', 'in talks', 'proposal', 'won', 'lost'];
const FU_TYPES = ['call', 'email', 'meeting', 'task'];
const FU_STATUS = ['open', 'done', 'snoozed'];
const ACT_KINDS = ['note', 'call', 'email', 'meeting'];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const TZ = 'America/New_York';
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const pad = (n) => String(n).padStart(2, '0');
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const isoOf = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const qy = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
const intOr = (v, d = null) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : d; };
const goTo = (loc) => new Response(null, { status: 303, headers: { location: loc, 'cache-control': 'no-store' } });
const withMsg = (path, msg) => path.replace(/#.*$/, '') + (path.includes('?') ? '&' : '?') + 'msg=' + encodeURIComponent(msg) + (path.match(/#.*$/) || [''])[0];
const safeBack = (b, d) => { const s = String(b || ''); return /^\/admin(?:[/?#]|$)/.test(s) && !/[\\\s]|\/\//.test(s) ? s : d; };

// ── Time zone helpers (no libraries; Intl knows the DST rules)
function etParts(d) {
  const o = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }).formatToParts(d)) o[x.type] = x.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
}
const tzOff = (ms) => { const p = etParts(new Date(ms)); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
function etLocalToUtc(str) { // "2026-11-05T14:00" (Eastern wall time) → Date
  const m = String(str || '').match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/); if (!m) return null;
  const asUtc = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]); let t = asUtc - tzOff(asUtc); t = asUtc - tzOff(t);
  return isNaN(t) ? null : new Date(t);
}
const etLocal = (iso) => { const p = etParts(new Date(iso)); return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`; };
const etDay = (d) => { const p = etParts(d instanceof Date ? d : new Date(d)); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const dayPlus = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const fmtTime = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const fmtDayLong = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
const fmtWhen = (iso) => `${fmtDayLong(iso)} · ${fmtTime(iso)}`;

// ── Page shell with nav (Submissions · Contacts · Calendar)
const CRM_CSS = `.top nav{display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;order:3;width:100%}.top nav a{color:rgba(255,255,255,.7);text-decoration:none;font:500 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;padding:10px 12px;border-radius:999px;white-space:nowrap}.top nav a.on,.top nav a:hover{background:rgba(255,255,255,.14);color:#fff}
@media (min-width:900px){.top nav{order:0;width:auto;margin-left:18px}}@media (max-width:520px){.top .in nav{gap:0;margin:0 -6px;flex-wrap:wrap;row-gap:2px}.top .in nav a{padding:9px 7px;letter-spacing:.06em;font-size:11px}}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 16px}.bar .sp{flex:1}
.b{display:inline-flex;align-items:center;gap:6px;text-decoration:none;font:500 11.5px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;padding:11px 15px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer;white-space:nowrap}.b.dark{background:var(--ink);color:#fff;border-color:var(--ink)}.b.sm{padding:7px 11px;font-size:10.5px}.b.red{color:#a33;border-color:#e3c9c9}.b.on{background:var(--ink);color:#fff}
.inl{display:inline;margin:0}
.badge{display:inline-block;font:500 10px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;padding:5px 8px;border-radius:999px;background:var(--sand);color:var(--ink);vertical-align:middle}.badge.won{background:#e6f2e8}.badge.lost{background:#f3e6e6}.badge.late{background:#a33;color:#fff}.badge.done{background:#e6f2e8}.badge.snoozed{background:#efe9da}.badge.sg-signed{background:#e6f2e8}.badge.sg-declined,.badge.sg-voided{background:#f3e6e6}.badge.sg-sent,.badge.sg-viewed{background:#e8eef7}details>summary{list-style:none;cursor:pointer;display:inline-block;margin:6px 0}details>summary::-webkit-details-marker{display:none}
.filters{display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;margin:0 0 16px}.filters input,.filters select{padding:10px 12px;font-size:15px}
select,textarea{width:100%;font:inherit;font-size:16px;padding:11px 13px;border:1px solid var(--stone);border-radius:10px;background:var(--paper);color:var(--ink)}textarea{min-height:96px;resize:vertical}
.form{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 16px}.form .wide{grid-column:1/-1}.form .acts{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.form .btn{width:auto;padding:0 26px;margin:0}
.crow{display:block;text-decoration:none}.crow h3 a{text-decoration:none}.meta{color:var(--muted);font-size:13.5px;display:flex;gap:6px 14px;flex-wrap:wrap;margin-top:4px}.late{color:#a33}
.sec{margin:28px 0 12px;font:600 13px/1.3 var(--sans);letter-spacing:.16em;text-transform:uppercase}
.tl{list-style:none;margin:0;padding:0;border-left:2px solid var(--stone)}.tl li{position:relative;padding:0 0 16px 18px}.tl li::before{content:"";position:absolute;left:-6px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--ink)}.tl li.system::before{background:var(--stone)}
.tl .when{color:var(--muted);font-size:12.5px}.tl .body{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px}
.fu{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}.fu .main{flex:1 1 220px;min-width:0}.fu .t{font-weight:600;overflow-wrap:anywhere}.fu .acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.fu.done .t{text-decoration:line-through;color:var(--muted)}
.fu select{width:auto;padding:6px 8px;font-size:13px;border-radius:999px}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff}.cal .h{font:500 10.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:10px 6px;background:var(--sand);text-align:center}
.cal .d{min-height:104px;border-top:1px solid var(--line);border-left:1px solid var(--line);padding:6px;min-width:0}.cal .d:nth-child(7n+1){border-left:0}.cal .d.out{background:#faf9f6;color:#b3aea5}.cal .d.today{background:#fff8e8}
.cal .n{font-size:12.5px;font-weight:600;text-decoration:none;display:inline-block;min-width:24px}.cal .today .n{background:var(--ink);color:#fff;border-radius:999px;text-align:center}
.chip{display:block;font-size:11.5px;line-height:1.3;padding:3px 6px;margin-top:3px;border-radius:6px;background:var(--sand);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chip.late{background:#a33;color:#fff}.chip.done{text-decoration:line-through;opacity:.55}
.copy{display:flex;gap:8px}.copy input{font-size:13px}.steps{padding-left:20px}.steps li{margin-bottom:6px}.note{background:var(--sand);border-radius:12px;padding:14px 16px;font-size:14px}
.widget{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:24px}.widget h2{font:600 13px/1.3 var(--sans);letter-spacing:.16em;text-transform:uppercase;margin:0 0 10px}
@media (max-width:720px){.filters{grid-template-columns:1fr 1fr}.filters .q{grid-column:1/-1}.form{grid-template-columns:1fr}.cal .d{min-height:72px;padding:4px}.chip{font-size:10px;padding:2px 4px}.chip .tm{display:none}.cal .h{padding:8px 2px;letter-spacing:.06em}}`;

function adminPage(title, active, body, { msg = '', status = 200, err = false } = {}) {
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const nav = [['Home', '/admin', 'subs'], ['Contacts', '/admin/contacts', 'contacts'], ['Calendar', '/admin/calendar', 'calendar'], ['Tickets', '/admin/tickets', 'tickets'], ['KPIs', '/admin/kpis', 'kpis'], ['Signings', '/admin/signings', 'signings'], ['Site AI', '/admin/ai', 'ai'], ['Setup guide', '/admin/setup', 'setup']]
    .map(([l, h, k]) => `<a href="${h}"${k === active ? ' class="on" aria-current="page"' : ''}>${l}</a>`).join('');
  const html = `<div class="top"><div class="in"><a class="logo" href="/admin">${escH(META.BRAND)}<small>Admin</small></a><nav aria-label="Admin">${nav}</nav><span class="sp"></span><a class="l" href="/" target="_blank" rel="noopener">Site ↗</a>
<form method="post" action="/admin/logout" style="margin:0"><button class="l" type="submit">Log out</button></form></div></div>
<div class="wrap">${msg ? `<p class="msg${err ? ' err' : ''}" role="status">${escH(msg)}</p>` : ''}${body}</div>`;
  return new Response(adminDoc(title, html, nonce), { status, headers: adminHeaders({}, nonce) });
}
const opts = (list, sel, label = cap) => list.map((o) => `<option value="${escH(o)}"${String(o) === String(sel) ? ' selected' : ''}>${escH(label(o))}</option>`).join('');
const field = (label, inner, wide) => `<label${wide ? ' class="wide"' : ''}><span>${escH(label)}</span>${inner}</label>`;
const inp = (name, val, attrs = '') => `<input name="${name}" value="${escH(val ?? '')}" ${attrs}>`;
const delForm = (action, what, back = '', label = 'Delete') => `<form class="inl" method="post" action="${action}" data-confirm="${escH(what)}">${back ? `<input type="hidden" name="back" value="${escH(back)}">` : ''}<button class="b sm red" type="submit">${label}</button></form>`;

// ── Contacts
function contactFromBody(b) {
  const s = (k, n = 500) => String(b[k] ?? '').trim().slice(0, n);
  const c = { name: s('name', 200), company: s('company', 200), email: s('email', 200).toLowerCase(), phone: s('phone', 60), social: s('social', 300),
    type: CONTACT_TYPES.includes(s('type')) ? s('type') : 'other', stage: STAGES.includes(s('stage')) ? s('stage') : 'lead',
    tags: s('tags', 400).split(',').map((t) => t.trim()).filter(Boolean).join(', '), source: s('source', 200), notes: s('notes', 10000) };
  const err = [];
  if (!c.name) err.push('Name is required.');
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) err.push('That email looks invalid.');
  return { c, err };
}
const C_FIELDS = ['name', 'company', 'email', 'phone', 'social', 'type', 'stage', 'tags', 'source', 'notes'];
async function logActivity(env, contactId, kind, body, at = nowIso()) {
  await env.DB.batch([qy(env, 'INSERT INTO contact_activities (contact_id, kind, body, at, created_at) VALUES (?, ?, ?, ?, ?)', contactId, kind, body, at, nowIso()),
    qy(env, 'UPDATE contacts SET updated_at = ? WHERE id = ?', nowIso(), contactId)]);
}
// Prefill a contact from a website submission row
function fromSubmission(t, r) {
  const T = TABLES[t]; const v = (k) => String(r[k] || '').trim();
  const summary = T.columns.filter((c) => v(c.key) && c.key !== 'status').map((c) => `${c.label}: ${v(c.key)}`).join('\n');
  const base = { email: v('email').toLowerCase(), phone: v('phone'), stage: 'lead', source: `Website · ${T.label} form #${r.id}${r.source ? ` (${r.source})` : ''}`, notes: summary };
  if (t === 'brands') return { ...base, name: v('contact_name') || v('company'), company: v('company'), social: v('website'), type: /^legal/i.test(v('interests')) ? 'other' : /real estate|property/i.test(v('industry')) ? 'real estate' : 'brand', tags: [v('industry'), /^legal/i.test(v('interests')) ? 'legal' : ''].filter(Boolean).join(', ') };
  if (t === 'creators') return { ...base, name: v('name'), company: '', social: [v('instagram'), v('tiktok'), v('youtube')].filter(Boolean).join(' · '), type: 'creator', tags: [v('platform'), v('niche')].filter(Boolean).join(', ') };
  if (t === 'events') return { ...base, name: v('organizer') || v('event_name'), company: v('event_name'), social: '', type: 'event', tags: v('event_type') };
  return { ...base, name: v('contact_name') || v('company'), company: v('company'), social: '', type: 'sponsor', tags: [v('campaign'), v('tier')].filter(Boolean).join(', ') };
}
function contactForm(c, { action, title, err = [], src = null, cancel = '/admin/contacts' }) {
  const body = `<p class="eyebrow"><a href="/admin/contacts">Contacts</a></p><h1>${escH(title)}</h1>${err.length ? `<p class="msg err">${err.map(escH).join(' ')}</p>` : ''}
${src ? `<p class="note">Prefilled from <a href="/admin?t=${escH(src.t)}#r${escH(src.id)}">${escH(TABLES[src.t].label)} submission #${escH(src.id)}</a>. Check the details, then save.</p><br>` : ''}
<form class="form" method="post" action="${action}">${src ? `<input type="hidden" name="src_table" value="${escH(src.t)}"><input type="hidden" name="src_id" value="${escH(src.id)}">` : ''}
${field('Name *', inp('name', c.name, 'required maxlength="200" autocomplete="off"'))}${field('Company', inp('company', c.company, 'maxlength="200"'))}
${field('Email', inp('email', c.email, 'type="email" maxlength="200" autocomplete="off"'))}${field('Phone', inp('phone', c.phone, 'type="tel" maxlength="60"'))}
${field('Instagram / social', inp('social', c.social, 'maxlength="300" placeholder="@handle or link"'))}${field('Tags', inp('tags', c.tags, 'maxlength="400" placeholder="comma, separated"'))}
${field('Type', `<select name="type">${opts(CONTACT_TYPES, c.type || 'other')}</select>`)}${field('Stage', `<select name="stage">${opts(STAGES, c.stage || 'lead')}</select>`)}
${field('Source', inp('source', c.source, 'maxlength="200" placeholder="Referral, event, website…"'), true)}${field('Notes', `<textarea name="notes" maxlength="10000">${escH(c.notes || '')}</textarea>`, true)}
<div class="acts"><button class="btn" type="submit">Save contact</button><a class="b" href="${escH(cancel)}">Cancel</a></div></form>`;
  return body;
}
const NEXT_SQL = `(SELECT MIN(due_at) FROM followups f WHERE f.contact_id = c.id AND f.status != 'done') AS next_due,
  (SELECT title FROM followups f WHERE f.contact_id = c.id AND f.status != 'done' ORDER BY due_at LIMIT 1) AS next_title`;
const nextHtml = (c) => c.next_due ? `<span class="${c.next_due < nowIso() ? 'late' : ''}">Next: ${escH(fmtWhen(c.next_due))} · ${escH(c.next_title)}</span>` : '<span>No follow-up scheduled</span>';
async function contactsList(env, url) {
  const sp = url.searchParams; const qs = String(sp.get('q') || '').trim().slice(0, 100);
  const type = CONTACT_TYPES.includes(sp.get('type')) ? sp.get('type') : ''; const stage = STAGES.includes(sp.get('stage')) ? sp.get('stage') : '';
  const SORTS = { updated: 'c.updated_at DESC', name: 'c.name COLLATE NOCASE ASC', created: 'c.created_at DESC', next: 'next_due IS NULL, next_due ASC', stage: `CASE c.stage ${STAGES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} ELSE 9 END, c.name COLLATE NOCASE` };
  const sort = SORTS[sp.get('sort')] ? sp.get('sort') : 'updated';
  const where = [], args = [];
  if (qs) { const like = '%' + qs.replace(/[\\%_]/g, (m) => '\\' + m) + '%'; where.push(`(${['name', 'company', 'email', 'phone', 'social', 'tags', 'notes', 'source'].map((k) => `c.${k} LIKE ? ESCAPE '\\'`).join(' OR ')})`); args.push(...Array(8).fill(like)); }
  if (type) { where.push('c.type = ?'); args.push(type); }
  if (stage) { where.push('c.stage = ?'); args.push(stage); }
  const rows = (await qy(env, `SELECT c.*, ${NEXT_SQL} FROM contacts c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${SORTS[sort]} LIMIT 1000`, ...args).all()).results;
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM contacts').first()).n;
  const list = rows.length ? rows.map((c) => `<article class="card"><header><h3><a href="/admin/contacts/${c.id}">${escH(c.name)}</a></h3>${c.company ? `<span class="id">${escH(c.company)}</span>` : ''}<span class="sp"></span><span class="badge">${escH(c.type)}</span><span class="badge ${escH(c.stage)}">${escH(c.stage)}</span></header>
<div class="meta">${c.email ? `<a href="mailto:${escH(c.email)}">${escH(c.email)}</a>` : ''}${c.phone ? `<a href="tel:${escH(c.phone.replace(/[^\d+]/g, ''))}">${escH(c.phone)}</a>` : ''}${c.tags ? `<span>${escH(c.tags)}</span>` : ''}</div><div class="meta">${nextHtml(c)}</div></article>`).join('')
    : `<p class="empty">${total ? 'No contacts match these filters.' : 'No contacts yet. Add one, or use “Convert to contact” on a website submission.'}</p>`;
  const body = `<p class="eyebrow">CRM · ${total} contact${total === 1 ? '' : 's'}</p><h1>Contacts</h1>
<div class="bar"><a class="b dark" href="/admin/contacts/new">+ New contact</a><a class="b" href="/admin/followups/new">+ Follow-up</a><span class="sp"></span><a class="b" href="/admin/contacts.csv">Export CSV</a></div>
<form class="filters" method="get" action="/admin/contacts" role="search"><input class="q" type="search" name="q" value="${escH(qs)}" placeholder="Search name, company, email, tags…" aria-label="Search">
<select name="type" aria-label="Type"><option value="">All types</option>${opts(CONTACT_TYPES, type)}</select><select name="stage" aria-label="Stage"><option value="">All stages</option>${opts(STAGES, stage)}</select>
<select name="sort" aria-label="Sort">${opts(Object.keys(SORTS), sort, (k) => ({ updated: 'Recently updated', name: 'Name A–Z', created: 'Newest', next: 'Next follow-up', stage: 'Stage' }[k]))}</select><button class="b dark" type="submit">Apply</button></form>
${qs || type || stage ? `<p class="eyebrow">${rows.length} match${rows.length === 1 ? '' : 'es'} · <a href="/admin/contacts">Clear filters</a></p>` : ''}<div class="list">${list}</div>`;
  return adminPage('Contacts', 'contacts', body, { msg: sp.get('msg') || '' });
}
function fuRow(f, back, { showContact = true } = {}) {
  const late = f.status !== 'done' && f.due_at < nowIso();
  return `<div class="fu${f.status === 'done' ? ' done' : ''}"><div class="main"><div class="t"><a href="/admin/followups/${f.id}">${escH(f.title)}</a></div>
<div class="meta"><span class="${late ? 'late' : ''}">${escH(fmtWhen(f.due_at))}${late ? ' · overdue' : ''}</span><span>${escH(cap(f.type))} · ${escH(f.duration_min)} min</span>${f.status !== 'open' ? `<span class="badge ${escH(f.status)}">${escH(f.status)}</span>` : ''}
${showContact && f.contact_id ? `<a href="/admin/contacts/${f.contact_id}">${escH(f.contact_name || 'Contact #' + f.contact_id)}</a>` : ''}${f.location ? `<span>${/^https?:\/\//i.test(f.location) ? `<a href="${escH(f.location)}" target="_blank" rel="noopener noreferrer">Meeting link</a>` : escH(f.location)}</span>` : ''}</div></div>
<div class="acts">${f.status !== 'done' ? `<form class="inl" method="post" action="/admin/followups/${f.id}/done"><input type="hidden" name="back" value="${escH(back)}"><button class="b sm dark" type="submit">Done</button></form>
<form class="inl" method="post" action="/admin/followups/${f.id}/snooze"><input type="hidden" name="back" value="${escH(back)}"><select name="for" aria-label="Snooze for"><option value="1h">1 hour</option><option value="tomorrow" selected>Tomorrow 9am</option><option value="week">Next week</option></select> <button class="b sm" type="submit">Snooze</button></form>`
    : `<form class="inl" method="post" action="/admin/followups/${f.id}/reopen"><input type="hidden" name="back" value="${escH(back)}"><button class="b sm" type="submit">Reopen</button></form>`}
<a class="b sm" href="/admin/followups/${f.id}.ics" title="Add to calendar">+ Calendar</a></div></div>`;
}
async function contactDetail(env, url, id) {
  const c = await qy(env, `SELECT c.*, ${NEXT_SQL} FROM contacts c WHERE c.id = ?`, id).first();
  if (!c) return adminPage('Not found', 'contacts', '<h1>Contact not found</h1><p><a href="/admin/contacts">← All contacts</a></p>', { status: 404 });
  const [acts, fus] = await Promise.all([qy(env, 'SELECT * FROM contact_activities WHERE contact_id = ? ORDER BY at DESC, id DESC LIMIT 500', id).all(), qy(env, "SELECT * FROM followups WHERE contact_id = ? ORDER BY status = 'done', due_at ASC LIMIT 200", id).all()]);
  const back = `/admin/contacts/${id}`;
  const link = (v) => /^https?:\/\/[^\s"'<>]+$/i.test(v) ? `<a href="${escH(v)}" target="_blank" rel="noopener noreferrer nofollow">${escH(v)}</a>` : /^@[\w.]{1,30}$/.test(v) ? `<a href="https://instagram.com/${escH(v.slice(1))}" target="_blank" rel="noopener noreferrer">${escH(v)}</a>` : escH(v);
  const dd = (l, v, wide) => `<div${wide ? ' class="wide"' : ''}><dt>${escH(l)}</dt><dd>${v || '<span style="color:#b3aea5">—</span>'}</dd></div>`;
  const tl = acts.results.length ? `<ul class="tl">${acts.results.map((a) => `<li class="${escH(a.kind)}"><div class="when">${escH(a.kind === 'system' ? 'Update' : cap(a.kind))} · ${escH(fmtET(a.at))} ${a.kind !== 'system' ? delForm(`/admin/activities/${a.id}/delete`, 'Delete this timeline entry?', back, '×') : ''}</div><div class="body">${escH(a.body)}</div></li>`).join('')}</ul>` : '<p class="empty">No activity yet.</p>';
  const body = `<p class="eyebrow"><a href="/admin/contacts">Contacts</a> · ${escH(c.type)}</p><h1>${escH(c.name)}${c.company ? ` <em>${escH(c.company)}</em>` : ''}</h1>
<div class="bar"><span class="badge ${escH(c.stage)}">${escH(c.stage)}</span><span class="sp"></span><a class="b dark" href="/admin/followups/new?contact_id=${c.id}">+ Follow-up</a><a class="b" href="#note">+ Note</a><a class="b" href="/admin/contacts/${c.id}/edit">Edit</a>
${delForm(`/admin/contacts/${c.id}/delete`, `Delete ${c.name}? Their notes, follow-ups and signing records are deleted too; linked tickets are kept (unlinked). This can't be undone.`)}</div>
<article class="card"><dl>${dd('Email', c.email ? `<a href="mailto:${escH(c.email)}">${escH(c.email)}</a>` : '')}${dd('Phone', c.phone ? `<a href="tel:${escH(c.phone.replace(/[^\d+]/g, ''))}">${escH(c.phone)}</a>` : '')}${dd('Instagram / social', c.social ? link(c.social) : '')}
${dd('Tags', escH(c.tags))}${dd('Next follow-up', c.next_due ? nextHtml(c) : '')}${dd('Source', escH(c.source) + (c.src_table && TABLES[c.src_table] ? ` · <a href="/admin?t=${escH(c.src_table)}#r${escH(c.src_id)}">View submission</a>` : ''))}
${dd('Added', escH(fmtET(c.created_at)))}${dd('Updated', escH(fmtET(c.updated_at)))}${dd('Notes', escH(c.notes), true)}</dl></article>
<h2 class="sec">Follow-ups</h2>${fus.results.length ? fus.results.map((f) => fuRow(f, back, { showContact: false })).join('') : '<p class="empty">Nothing scheduled. <a href="/admin/followups/new?contact_id=' + c.id + '">Add a follow-up</a>.</p>'}
${await contactTickets(env, c)}
${await contactSignings(env, c, back)}
<h2 class="sec" id="note">Add note or log activity</h2><form class="form" method="post" action="/admin/contacts/${c.id}/activities">${field('Kind', `<select name="kind">${opts(ACT_KINDS, 'note', (k) => ({ note: 'Note', call: 'Logged call', email: 'Logged email', meeting: 'Logged meeting' }[k]))}</select>`)}
${field('When (Eastern)', `<input type="datetime-local" name="at" value="${escH(etLocal(nowIso()))}">`)}${field('Details *', '<textarea name="body" required maxlength="10000" placeholder="What happened, next steps…"></textarea>', true)}<div class="acts"><button class="btn" type="submit">Add to timeline</button></div></form>
<h2 class="sec">Timeline</h2>${tl}`;
  return adminPage(c.name, 'contacts', body, { msg: url.searchParams.get('msg') || '' });
}
async function saveContact(env, b, id = null) {
  const { c, err } = contactFromBody(b);
  if (c.email) { const dup = await qy(env, 'SELECT id, name FROM contacts WHERE email = ? AND id != ?', c.email, id || 0).first(); if (dup) return { dup, c, err }; }
  if (err.length) return { c, err };
  const now = nowIso();
  if (id) {
    const old = await qy(env, 'SELECT stage FROM contacts WHERE id = ?', id).first(); if (!old) return { missing: true };
    await qy(env, `UPDATE contacts SET ${C_FIELDS.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...C_FIELDS.map((k) => c[k]), now, id).run();
    if (old.stage !== c.stage) await logActivity(env, id, 'system', `Stage changed: ${old.stage} → ${c.stage}`);
    return { id };
  }
  const st = ADMIN_TABLES.includes(b.src_table) ? b.src_table : null, sid = st ? intOr(b.src_id) : null;
  const r = await qy(env, `INSERT INTO contacts (${C_FIELDS.join(', ')}, src_table, src_id, created_at, updated_at) VALUES (${C_FIELDS.map(() => '?').join(', ')}, ?, ?, ?, ?)`, ...C_FIELDS.map((k) => c[k]), st, sid, now, now).run();
  const nid = r.meta.last_row_id;
  await logActivity(env, nid, 'system', st && sid ? `Contact created from ${TABLES[st].label} submission #${sid}` : 'Contact created');
  return { id: nid, created: true };
}
async function contactsCsv(env) {
  const rows = (await env.DB.prepare(`SELECT c.*, ${NEXT_SQL} FROM contacts c ORDER BY c.name COLLATE NOCASE`).all()).results;
  const cols = ['id', ...C_FIELDS, 'next_follow_up_et', 'next_follow_up', 'created_at_et', 'updated_at_et'];
  const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const val = (r, k) => k === 'next_follow_up_et' ? (r.next_due ? fmtET(r.next_due) : '') : k === 'next_follow_up' ? r.next_title : k === 'created_at_et' ? fmtET(r.created_at) : k === 'updated_at_et' ? fmtET(r.updated_at) : r[k];
  const out = [cols.join(','), ...rows.map((r) => cols.map((k) => q(val(r, k))).join(','))].join('\r\n');
  return new Response('\ufeff' + out + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="morrow-media-contacts-${etDay(new Date())}.csv"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}


// ── Google Workspace Calendar (sponsors@ by default). Push-sync on follow-up create/update/delete.
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const gcalCalId = (env) => String(env.GOOGLE_CALENDAR_ID || 'sponsors@morrowmediagroup.com').trim();
async function settingGet(env, key) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r && r.value ? String(r.value) : '';
}
async function settingSet(env, key, value) {
  await qy(env, "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, value, nowIso()).run();
}
async function gcalRefreshToken(env) {
  return String(env.GOOGLE_REFRESH_TOKEN || '').trim() || await settingGet(env, 'gcal_refresh_token');
}
const gcalClientReady = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
async function gcalConfigured(env) {
  return gcalClientReady(env) && !!(await gcalRefreshToken(env));
}
async function gcalAccessToken(env) {
  const refresh = await gcalRefreshToken(env);
  if (!gcalClientReady(env) || !refresh) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  if (!r.ok) { console.log('gcal token', r.status, await r.text().catch(() => '')); return null; }
  const j = await r.json();
  return j.access_token || null;
}
function gcalEventPayload(f, origin) {
  const startMs = Date.parse(f.due_at), endMs = startMs + (f.duration_min || 30) * 60000;
  const who = f.contact_name ? `${f.contact_name}${f.contact_company ? ` (${f.contact_company})` : ''}` : '';
  const desc = [who && `Contact: ${who}`, f.contact_email && `Email: ${f.contact_email}`, f.contact_phone && `Phone: ${f.contact_phone}`, f.notes, `Open in CRM: ${origin}/admin/followups/${f.id}`].filter(Boolean).join('\n');
  const body = {
    summary: `${cap(f.type || 'task')}: ${f.title}${f.contact_name ? ` — ${f.contact_name}` : ''}`,
    description: desc,
    location: f.location || '',
    start: { dateTime: new Date(startMs).toISOString(), timeZone: TZ },
    end: { dateTime: new Date(endMs).toISOString(), timeZone: TZ },
    status: 'confirmed',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }, { method: 'email', minutes: 15 }] },
  };
  const meet = String(f.location || '').match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meet) {
    body.conferenceData = { entryPoints: [{ entryPointType: 'video', uri: meet[0] }], conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' } };
  }
  return body;
}
async function gcalApi(env, method, path, body, query = '') {
  const token = await gcalAccessToken(env); if (!token) return { ok: false, status: 0, error: 'not_configured' };
  const cal = encodeURIComponent(gcalCalId(env));
  const url = `https://www.googleapis.com/calendar/v3/calendars/${cal}${path}${query ? (path.includes('?') ? '&' : '?') + query : ''}`;
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  if (!r.ok) console.log('gcal', method, path, r.status, text.slice(0, 300));
  return { ok: r.ok, status: r.status, json };
}
async function gcalSaveEventId(env, id, eventId) {
  await qy(env, 'UPDATE followups SET gcal_event_id = ?, updated_at = updated_at WHERE id = ?', eventId || null, id).run();
}
/** Upsert or delete the Google event for a follow-up. Never throws — CRM writes always succeed. */
async function gcalSyncFollowup(env, id, origin, { remove = false } = {}) {
  try {
    if (!(await gcalConfigured(env))) return { skipped: true };
    const f = await fuWithContact(env, id); if (!f) return { missing: true };
    if (remove || f.status === 'done') {
      if (f.gcal_event_id) {
        const del = await gcalApi(env, 'DELETE', `/events/${encodeURIComponent(f.gcal_event_id)}`, null, 'sendUpdates=none');
        // 404/410 = already gone
        if (del.ok || del.status === 404 || del.status === 410) await gcalSaveEventId(env, id, null);
        else return { ok: false, status: del.status };
      }
      return { ok: true, deleted: true };
    }
    const payload = gcalEventPayload(f, origin);
    const conf = payload.conferenceData ? 'conferenceDataVersion=1&sendUpdates=none' : 'sendUpdates=none';
    if (f.gcal_event_id) {
      const up = await gcalApi(env, 'PATCH', `/events/${encodeURIComponent(f.gcal_event_id)}`, payload, conf);
      if (up.ok) return { ok: true, eventId: f.gcal_event_id, updated: true };
      if (up.status !== 404 && up.status !== 410) return { ok: false, status: up.status };
      // Event missing — fall through to create
    }
    const cr = await gcalApi(env, 'POST', '/events', payload, conf);
    if (cr.ok && cr.json && cr.json.id) { await gcalSaveEventId(env, id, cr.json.id); return { ok: true, eventId: cr.json.id, created: true }; }
    return { ok: false, status: cr.status };
  } catch (e) {
    console.log('gcalSyncFollowup', String(e && e.message || e).slice(0, 200));
    return { ok: false, error: 'exception' };
  }
}
async function gcalSyncMany(env, ids, origin, opts) {
  for (const id of ids) await gcalSyncFollowup(env, id, origin, opts);
}
function gcalAuthUrl(env, origin, state) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', `${origin}/admin/calendar/google/callback`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', GCAL_SCOPE);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  return u.toString();
}
async function gcalExchangeCode(env, origin, code) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${origin}/admin/calendar/google/callback`, grant_type: 'authorization_code' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token && !j.access_token) return { ok: false, error: j.error || `token_${r.status}`, raw: j };
  if (j.refresh_token) await settingSet(env, 'gcal_refresh_token', j.refresh_token);
  await settingSet(env, 'gcal_connected_at', nowIso());
  return { ok: true, hasRefresh: !!j.refresh_token, j };
}

// ── Follow-ups
function fuFromBody(b) {
  const s = (k, n = 500) => String(b[k] ?? '').trim().slice(0, n);
  const due = etLocalToUtc(s('due'));
  const f = { title: s('title', 200), due_at: due ? isoOf(due) : null, duration_min: DURATIONS.includes(+b.duration) ? +b.duration : 30, type: FU_TYPES.includes(s('type')) ? s('type') : 'call',
    notes: s('notes', 5000), location: s('location', 500), contact_id: intOr(b.contact_id), status: FU_STATUS.includes(s('status')) ? s('status') : 'open' };
  const err = []; if (!f.title) err.push('Title is required.'); if (!f.due_at) err.push('Pick a date and time.');
  return { f, err };
}
async function fuWithContact(env, id) { return qy(env, 'SELECT f.*, c.name AS contact_name, c.company AS contact_company, c.email AS contact_email, c.phone AS contact_phone FROM followups f LEFT JOIN contacts c ON c.id = f.contact_id WHERE f.id = ?', id).first(); }
async function followupForm(env, url, f, { action, title, err = [], back }) {
  const contacts = (await env.DB.prepare('SELECT id, name, company FROM contacts ORDER BY name COLLATE NOCASE LIMIT 3000').all()).results;
  const isEdit = !!f.id;
  const body = `<p class="eyebrow"><a href="/admin/calendar">Calendar</a>${f.contact_id ? ` · <a href="/admin/contacts/${f.contact_id}">Contact</a>` : ''}</p><h1>${escH(title)}</h1>${err.length ? `<p class="msg err">${err.map(escH).join(' ')}</p>` : ''}
${isEdit ? `<div class="bar">${f.status !== 'done' ? `<form class="inl" method="post" action="/admin/followups/${f.id}/done"><input type="hidden" name="back" value="${escH(back)}"><button class="b dark" type="submit">Mark done</button></form>` : `<form class="inl" method="post" action="/admin/followups/${f.id}/reopen"><input type="hidden" name="back" value="/admin/followups/${f.id}"><button class="b" type="submit">Reopen</button></form>`}
<a class="b" href="/admin/followups/${f.id}.ics">Add to calendar (.ics)</a><span class="sp"></span>${delForm(`/admin/followups/${f.id}/delete`, 'Delete this follow-up?', back)}</div>` : ''}
<form class="form" method="post" action="${action}"><input type="hidden" name="back" value="${escH(back)}">
${field('Title *', inp('title', f.title, 'required maxlength="200" placeholder="Call about Q1 sponsorship"'), true)}
${field('Contact', `<select name="contact_id"><option value="">— None —</option>${contacts.map((c) => `<option value="${c.id}"${c.id === f.contact_id ? ' selected' : ''}>${escH(c.name)}${c.company ? ' · ' + escH(c.company) : ''}</option>`).join('')}</select>`)}
${field('Type', `<select name="type">${opts(FU_TYPES, f.type || 'call')}</select>`)}
${field('Date & time (Eastern) *', `<input type="datetime-local" name="due" required value="${escH(f.due_at ? etLocal(f.due_at) : '')}">`)}${field('Duration', `<select name="duration">${opts(DURATIONS, f.duration_min || 30, (d) => d + ' min')}</select>`)}
${field('Location or meeting link', inp('location', f.location, 'maxlength="500" placeholder="Zoom/Meet link, phone, or address"'), true)}${field('Notes', `<textarea name="notes" maxlength="5000">${escH(f.notes || '')}</textarea>`, true)}
${isEdit ? field('Status', `<select name="status">${opts(FU_STATUS, f.status)}</select>`) : ''}
<div class="acts"><button class="btn" type="submit">${isEdit ? 'Save changes' : 'Add follow-up'}</button><a class="b" href="${escH(back)}">Cancel</a></div></form>
<p class="eyebrow" style="margin-top:16px">Google Workspace: open follow-ups sync to the sponsors@ calendar when connected (Calendar → settings). Reminders fire 15 minutes before via Google and the .ics feed.</p>`;
  return adminPage(title, 'calendar', body, { status: err.length ? 400 : 200, msg: url.searchParams.get('msg') || '' });
}
const FU_LIST_SQL = 'SELECT f.*, c.name AS contact_name FROM followups f LEFT JOIN contacts c ON c.id = f.contact_id';
function agendaGroups(rows) {
  const now = nowIso(), today = etDay(new Date()), weekEnd = dayPlus(today, 7);
  const g = { overdue: [], today: [], week: [], later: [] };
  for (const f of rows) { const k = etDay(f.due_at); if (f.due_at < now && k <= today) g[k === today ? 'today' : 'overdue'].push(f); else if (k === today) g.today.push(f); else if (k <= weekEnd) g.week.push(f); else g.later.push(f); }
  return g;
}
async function homeWidget(env) {
  const end = etLocalToUtc(dayPlus(etDay(new Date()), 1) + 'T00:00');
  const rows = (await qy(env, `${FU_LIST_SQL} WHERE f.status != 'done' AND f.due_at < ? ORDER BY f.due_at LIMIT 30`, isoOf(end)).all()).results;
  const g = agendaGroups(rows);
  const sec = (label, list) => list.length ? `<p class="eyebrow" style="margin-top:12px">${label} (${list.length})</p>${list.map((f) => fuRow(f, '/admin')).join('')}` : '';
  return `<section class="widget"><div class="bar" style="margin:0"><h2 style="margin:0">Follow-ups due</h2><span class="sp"></span><a class="b sm" href="/admin/calendar">Calendar</a><a class="b sm dark" href="/admin/followups/new">+ New</a></div>
${rows.length ? sec('<span class="late">Overdue</span>', g.overdue) + sec('Today', g.today) : '<p class="eyebrow" style="margin:12px 0 0">Nothing overdue or due today.</p>'}</section>`;
}
async function calendarPage(env, url) {
  const sp = url.searchParams; const view = sp.get('view') === 'month' ? 'month' : 'agenda';
  const tabs = `<div class="bar"><a class="b${view === 'agenda' ? ' on' : ''}" href="/admin/calendar">Agenda</a><a class="b${view === 'month' ? ' on' : ''}" href="/admin/calendar?view=month">Month</a><a class="b" href="/admin/calendar/settings">iPhone & Google sync</a><span class="sp"></span><a class="b dark" href="/admin/followups/new">+ Follow-up</a></div>`;
  let body;
  if (view === 'agenda') {
    const back = '/admin/calendar';
    const [open, done] = await Promise.all([env.DB.prepare(`${FU_LIST_SQL} WHERE f.status != 'done' ORDER BY f.due_at LIMIT 1000`).all(), env.DB.prepare(`${FU_LIST_SQL} WHERE f.status = 'done' ORDER BY f.completed_at DESC LIMIT 10`).all()]);
    const g = agendaGroups(open.results);
    const sec = (label, list, cls = '') => `<h2 class="sec ${cls}">${label} <span class="badge">${list.length}</span></h2>${list.length ? list.map((f) => fuRow(f, back)).join('') : '<p class="eyebrow">Nothing here.</p>'}`;
    body = `<p class="eyebrow">Follow-up calendar · Eastern time</p><h1>Calendar <em>agenda</em></h1>${tabs}${sec('Overdue', g.overdue, 'late')}${sec('Today', g.today)}${sec('This week', g.week)}${g.later.length ? sec('Later', g.later) : ''}
${done.results.length ? `<h2 class="sec">Recently completed</h2>${done.results.map((f) => fuRow(f, back)).join('')}` : ''}`;
  } else {
    const t = etParts(new Date()); const mm = String(sp.get('m') || '').match(/^(\d{4})-(\d\d)$/);
    const y = mm ? +mm[1] : t.y, m = mm && +mm[2] >= 1 && +mm[2] <= 12 ? +mm[2] : t.m;
    const first = `${y}-${pad(m)}-01`, startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const gridStart = dayPlus(first, -startDow), cells = Math.ceil((startDow + days) / 7) * 7;
    const from = etLocalToUtc(gridStart + 'T00:00'), to = etLocalToUtc(dayPlus(gridStart, cells) + 'T00:00');
    const rows = (await qy(env, `${FU_LIST_SQL} WHERE f.due_at >= ? AND f.due_at < ? ORDER BY f.due_at`, isoOf(from), isoOf(to)).all()).results;
    const byDay = {}; for (const f of rows) (byDay[etDay(f.due_at)] ||= []).push(f);
    const today = etDay(new Date()), now = nowIso();
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`, next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
    const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    let grid = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="h">${d}</div>`).join('');
    for (let i = 0; i < cells; i++) {
      const k = dayPlus(gridStart, i), inMonth = k.slice(0, 7) === `${y}-${pad(m)}`;
      grid += `<div class="d${inMonth ? '' : ' out'}${k === today ? ' today' : ''}"><a class="n" href="/admin/followups/new?date=${k}" title="Add a follow-up on ${k}">${+k.slice(8)}</a>${(byDay[k] || []).map((f) => `<a class="chip${f.status === 'done' ? ' done' : f.due_at < now ? ' late' : ''}" href="/admin/followups/${f.id}" title="${escH(fmtTime(f.due_at) + ' ' + f.title)}"><span class="tm">${escH(fmtTime(f.due_at))} </span>${escH(f.title)}</a>`).join('')}</div>`;
    }
    body = `<p class="eyebrow">Follow-up calendar · Eastern time · tap a date to add</p><h1>${escH(label)}</h1>${tabs}<div class="bar"><a class="b sm" href="/admin/calendar?view=month&m=${prev}">← Prev</a><a class="b sm" href="/admin/calendar?view=month">Today</a><a class="b sm" href="/admin/calendar?view=month&m=${next}">Next →</a></div><div class="cal">${grid}</div>`;
  }
  return adminPage('Calendar', 'calendar', body, { msg: sp.get('msg') || '' });
}
function snoozeTarget(f, kind) {
  const now = Date.now();
  if (kind === '1h') return isoOf(new Date(Math.max(now, Date.parse(f.due_at)) + 3600000));
  if (kind === 'week') return isoOf(new Date(Math.max(now, Date.parse(f.due_at)) + 7 * 86400000));
  return isoOf(etLocalToUtc(dayPlus(etDay(new Date()), 1) + 'T09:00'));
}

// ── ICS (RFC 5545). UTC times, so no VTIMEZONE needed. Stable UIDs + SEQUENCE so edits update the same event.
const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
const icsDate = (iso) => new Date(iso).toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '');
function icsFold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', len = 0;
  for (const ch of line) { const l = enc.encode(ch).length; if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; } cur += ch; len += l; }
  out.push(cur); return out.join('\r\n ');
}
const icsDoc = (lines) => lines.map(icsFold).join('\r\n') + '\r\n';
function vevent(f, origin, { invite = false, organizer = '' } = {}) {
  const start = Date.parse(f.due_at), end = start + (f.duration_min || 30) * 60000;
  const who = f.contact_name ? `${f.contact_name}${f.contact_company ? ` (${f.contact_company})` : ''}` : '';
  const desc = [who && `Contact: ${who}`, f.contact_email && `Email: ${f.contact_email}`, f.contact_phone && `Phone: ${f.contact_phone}`, f.notes, `Open in CRM: ${origin}/admin/followups/${f.id}`].filter(Boolean).join('\n');
  const L = ['BEGIN:VEVENT', `UID:followup-${f.id}${invite ? '-invite' : ''}@${SERVICE_HOST}`, `DTSTAMP:${icsDate(invite ? nowIso() : f.updated_at || f.created_at)}`, `CREATED:${icsDate(f.created_at)}`, `LAST-MODIFIED:${icsDate(f.updated_at || f.created_at)}`,
    `SEQUENCE:${f.seq || 0}`, `DTSTART:${icsDate(new Date(start).toISOString())}`, `DTEND:${icsDate(new Date(end).toISOString())}`,
    `SUMMARY:${icsEsc(`${cap(f.type)}: ${f.title}${f.contact_name ? ` — ${f.contact_name}` : ''}`)}`, `DESCRIPTION:${icsEsc(desc)}`];
  if (f.location) L.push(`LOCATION:${icsEsc(f.location)}`);
  L.push(`URL:${origin}/admin/followups/${f.id}`, `CATEGORIES:${icsEsc('SouthBridge Media')},${icsEsc(cap(f.type))}`, 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'CLASS:PRIVATE');
  if (invite && organizer) L.push(`ORGANIZER;CN="SouthBridge Media CRM":mailto:${organizer}`, `ATTENDEE;CN="Matt Morrow";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${organizer}`);
  L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(f.title)}`, 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT');
  return L;
}
const icsHeader = (method, name) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SouthBridge Media//CRM Follow-ups//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`, ...(name ? [`X-WR-CALNAME:${icsEsc(name)}`, 'X-WR-CALDESC:Follow-ups from the SouthBridge Media admin CRM', `X-WR-TIMEZONE:${TZ}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : [])];
// One follow-up as an invite (.ics). Built by a pure function so it can be emailed later (see DEPLOY.md: "Emailing invites").
function buildInvite(f, origin, organizer) { return icsDoc([...icsHeader('REQUEST'), ...vevent(f, origin, { invite: true, organizer }), 'END:VCALENDAR']); }
async function getFeedToken(env, create = false) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ics_token'").first();
  if (r && r.value) return r.value;
  if (!create) return null;
  return rotateFeedToken(env);
}
async function rotateFeedToken(env) {
  const tok = b64u(crypto.getRandomValues(new Uint8Array(32)));
  await qy(env, "INSERT INTO settings (key, value, updated_at) VALUES ('ics_token', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", tok, nowIso()).run();
  return tok;
}
// Public route: GET /cal/<token>.ics — the only unauthenticated CRM route. Wrong/missing token → 404.
async function icsFeed(req, env, url, p) {
  const m = p.match(/^\/cal\/([A-Za-z0-9_-]{20,100})\.ics$/);
  const nf = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  if (!m || (req.method !== 'GET' && req.method !== 'HEAD')) return nf();
  const tok = await getFeedToken(env);
  if (!tok || !safeEq(m[1], tok)) return nf();
  const rows = (await env.DB.prepare("SELECT f.*, c.name AS contact_name, c.company AS contact_company, c.email AS contact_email, c.phone AS contact_phone FROM followups f LEFT JOIN contacts c ON c.id = f.contact_id WHERE f.status != 'done' ORDER BY f.due_at LIMIT 2000").all()).results;
  const body = icsDoc([...icsHeader('PUBLISH', 'SouthBridge Media Follow-ups'), ...rows.flatMap((f) => vevent(f, url.origin)), 'END:VCALENDAR']);
  return new Response(req.method === 'HEAD' ? null : body, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="morrow-media-followups.ics"', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' } });
}
async function settingsPage(env, url) {
  const tok = await getFeedToken(env, true);
  const https = `${url.origin}/cal/${tok}.ics`, webcal = https.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const clientReady = gcalClientReady(env);
  const connected = await gcalConfigured(env);
  const connectedAt = await settingGet(env, 'gcal_connected_at');
  const calId = gcalCalId(env);
  const wsStatus = connected
    ? `<p class="note"><b>Connected.</b> New, edited, snoozed, reopened, completed, and deleted follow-ups sync to <code>${escH(calId)}</code>${connectedAt ? ` · linked ${escH(fmtET(connectedAt))}` : ''}.</p>
<div class="bar"><form method="post" action="/admin/calendar/google/sync"><button class="b dark" type="submit">Sync all open follow-ups now</button></form>
<form method="post" action="/admin/calendar/google/disconnect" data-confirm="Disconnect Google Calendar? Future follow-ups will not sync until you connect again."><button class="b red" type="submit">Disconnect</button></form></div>`
    : clientReady
      ? `<p class="note">OAuth client is configured. Connect the <b>${escH(calId)}</b> Google account so admin follow-ups appear on that Workspace calendar in real time (not just the slow ICS subscription).</p>
<div class="bar"><a class="b dark" href="/admin/calendar/google/connect">Connect Google Workspace Calendar</a></div>
<details style="margin-top:12px"><summary class="b">Or paste a refresh token ▾</summary>
<form class="form" method="post" action="/admin/calendar/google/token" style="margin-top:10px">
<label class="wide"><span>Refresh token</span><input name="refresh_token" required autocomplete="off" placeholder="1//..."></label>
<div class="acts"><button class="btn" type="submit">Save token</button></div></form></details>`
      : `<p class="note">To enable live sync, add Worker secrets <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (OAuth web client with redirect <code>${escH(url.origin)}/admin/calendar/google/callback</code> and scope <code>https://www.googleapis.com/auth/calendar.events</code>), then return here and tap Connect. Sign in as <b>sponsors@morrowmediagroup.com</b>. Optional secrets: <code>GOOGLE_CALENDAR_ID</code> (defaults to that mailbox) and <code>GOOGLE_REFRESH_TOKEN</code>.</p>`;
  const body = `<p class="eyebrow"><a href="/admin/calendar">Calendar</a> · settings</p><h1>iPhone & Google <em>sync</em></h1>
<h2 class="sec">Google Workspace (live push)</h2>
${wsStatus}
<p class="eyebrow">Creates, updates, and deletes matching events on the Workspace calendar when you use New follow-up / Edit / Done / Snooze / Delete. Title, Eastern time, duration, location or Meet link, and notes are copied over.</p>
<h2 class="sec">Subscribe feed (iPhone &amp; pull sync)</h2>
<p class="note">This private link lists every open follow-up, each with a 15-minute alert. Anyone with the link can see them, so don't share it. If it leaks, regenerate it below; the old link stops working. Prefer <b>Google Workspace (live push)</b> above when you can — Google refreshes subscribed feeds slowly.</p>
<div class="copy"><input id="feed" readonly value="${escH(https)}" aria-label="Feed URL"><button class="b dark" type="button" data-copy="feed">Copy</button></div>
<div class="copy" style="margin-top:8px"><input id="feedw" readonly value="${escH(webcal)}" aria-label="webcal URL"><button class="b" type="button" data-copy="feedw">Copy</button></div>
<div class="bar" style="margin-top:14px"><a class="b dark" href="${escH(webcal)}">Subscribe on iPhone / Mac</a><a class="b" href="${escH(google)}" target="_blank" rel="noopener noreferrer">Add feed to Google Calendar</a></div>
<h2 class="sec">iPhone (iOS Calendar)</h2><ol class="steps"><li>Easiest: open this page in Safari on your iPhone and tap <b>Subscribe on iPhone / Mac</b>, then <b>Subscribe</b> → <b>Add</b>.</li>
<li>Or copy the feed link, then go to <b>Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar</b> (older iOS: Settings → Calendar → Accounts), paste it, tap <b>Next</b>, then <b>Save</b>.</li>
<li>Faster updates: Settings → Apps → Calendar → Calendar Accounts → Fetch New Data → set Subscribed Calendars to fetch every 15 minutes or hourly.</li></ol>
<h2 class="sec">Single invites</h2><p>Each follow-up has <b>+ Calendar</b>, which downloads an invite (.ics) that opens straight in iOS Calendar. Use either the feed or invites for a given follow-up, not both, or it shows up twice.</p>
<p class="eyebrow">Emailed invites aren't set up yet. They need a working mailbox and sending service.</p>
<h2 class="sec">Regenerate feed link</h2><form method="post" action="/admin/calendar/regenerate" data-confirm="Make a new link? The current one stops working, and you'll need to re-subscribe on every device."><button class="b red" type="submit">Regenerate link</button></form>`;
  return adminPage('Calendar sync', 'calendar', body, { msg: url.searchParams.get('msg') || '' });
}

// ── JSON API (session required; checked in admin())
async function crmApi(env, p, url) {
  if (p.startsWith('/admin/api/ai')) { const ai = await aiApi(env, { method: 'GET', headers: { get: () => null } }, p, url); if (ai) return ai; }
  const tk = await ticketsApi(env, url, p); if (tk) return tk;
  const sg = await signingsApi(env, p); if (sg) return sg;
  if (p === '/admin/api/contacts') return adminJson({ ok: true, rows: (await env.DB.prepare(`SELECT c.*, ${NEXT_SQL} FROM contacts c ORDER BY c.id DESC LIMIT 1000`).all()).results });
  let m = p.match(/^\/admin\/api\/contacts\/(\d+)$/);
  if (m) { const c = await qy(env, 'SELECT * FROM contacts WHERE id = ?', +m[1]).first(); if (!c) return adminJson({ ok: false, error: 'Not found' }, 404);
    const [a, f] = await Promise.all([qy(env, 'SELECT * FROM contact_activities WHERE contact_id = ? ORDER BY at DESC, id DESC', c.id).all(), qy(env, 'SELECT * FROM followups WHERE contact_id = ? ORDER BY due_at', c.id).all()]);
    return adminJson({ ok: true, contact: c, activities: a.results, followups: f.results }); }
  if (p === '/admin/api/followups') return adminJson({ ok: true, rows: (await env.DB.prepare(`${FU_LIST_SQL} ORDER BY f.due_at LIMIT 2000`).all()).results });
  m = p.match(/^\/admin\/api\/followups\/(\d+)$/);
  if (m) { const f = await qy(env, 'SELECT * FROM followups WHERE id = ?', +m[1]).first(); return f ? adminJson({ ok: true, followup: f }) : adminJson({ ok: false, error: 'Not found' }, 404); }
  return null;
}

// ── Router for CRM pages and actions (session already verified). Returns null if the path isn't a CRM route.
async function crmRoute(req, env, url, p) {
  const GET = req.method === 'GET' || req.method === 'HEAD', POST = req.method === 'POST';
  const body = async () => { try { return await readBody(req); } catch { return {}; } };
  let m;
  const ai = await aiRoute(req, env, url, p); if (ai) return ai;
  const tk = await ticketsRoute(req, env, url, p); if (tk) return tk;
  const sg = await signingsRoute(req, env, url, p); if (sg) return sg;
  // Contacts
  if (p === '/admin/contacts' && GET) return contactsList(env, url);
  if (p === '/admin/contacts.csv' && GET) return contactsCsv(env);
  if (p === '/admin/contacts/new' && GET) {
    const from = String(url.searchParams.get('from') || '').match(/^([a-z]+):(\d+)$/);
    if (from && ADMIN_TABLES.includes(from[1])) {
      const r = await qy(env, `SELECT * FROM ${from[1]} WHERE id = ?`, +from[2]).first();
      if (!r) return goTo(withMsg(`/admin?t=${from[1]}`, 'That submission no longer exists.'));
      const pre = fromSubmission(from[1], r);
      const dup = (pre.email && await qy(env, 'SELECT id FROM contacts WHERE email = ?', pre.email).first()) || await qy(env, 'SELECT id FROM contacts WHERE src_table = ? AND src_id = ?', from[1], r.id).first();
      if (dup) return goTo(withMsg(`/admin/contacts/${dup.id}`, 'This person is already a contact, so I opened their record.'));
      return adminPage('Convert to contact', 'contacts', contactForm(pre, { action: '/admin/contacts', title: 'Convert to contact', src: { t: from[1], id: r.id }, cancel: `/admin?t=${from[1]}#r${r.id}` }));
    }
    return adminPage('New contact', 'contacts', contactForm({ type: 'brand', stage: 'lead' }, { action: '/admin/contacts', title: 'New contact' }));
  }
  if (p === '/admin/contacts' && POST) {
    const b = await body(); const r = await saveContact(env, b);
    if (r.dup) { if (ADMIN_TABLES.includes(b.src_table) && intOr(b.src_id)) await logActivity(env, r.dup.id, 'system', `Linked ${TABLES[b.src_table].label} submission #${intOr(b.src_id)} (same email)`);
      return goTo(withMsg(`/admin/contacts/${r.dup.id}`, `A contact with ${r.c.email} already exists, so nothing was duplicated. Opened it.`)); }
    if (r.err && r.err.length) { const src = ADMIN_TABLES.includes(b.src_table) && intOr(b.src_id) ? { t: b.src_table, id: intOr(b.src_id) } : null;
      const resp = adminPage('New contact', 'contacts', contactForm(r.c, { action: '/admin/contacts', title: src ? 'Convert to contact' : 'New contact', err: r.err, src })); return new Response(resp.body, { status: 400, headers: resp.headers }); }
    return goTo(withMsg(`/admin/contacts/${r.id}`, 'Contact saved.'));
  }
  if ((m = p.match(/^\/admin\/contacts\/(\d+)$/))) {
    const id = +m[1];
    if (GET) return contactDetail(env, url, id);
    if (POST) { const b = await body(); const r = await saveContact(env, b, id);
      if (r.missing) return goTo(withMsg('/admin/contacts', 'That contact no longer exists.'));
      if (r.dup) { const resp = adminPage('Edit contact', 'contacts', contactForm(r.c, { action: `/admin/contacts/${id}`, title: 'Edit contact', err: [`${r.dup.name} already uses that email.`], cancel: `/admin/contacts/${id}` })); return new Response(resp.body, { status: 409, headers: resp.headers }); }
      if (r.err && r.err.length) { const resp = adminPage('Edit contact', 'contacts', contactForm(r.c, { action: `/admin/contacts/${id}`, title: 'Edit contact', err: r.err, cancel: `/admin/contacts/${id}` })); return new Response(resp.body, { status: 400, headers: resp.headers }); }
      return goTo(withMsg(`/admin/contacts/${id}`, 'Saved.')); }
  }
  if ((m = p.match(/^\/admin\/contacts\/(\d+)\/edit$/)) && GET) {
    const c = await qy(env, 'SELECT * FROM contacts WHERE id = ?', +m[1]).first(); if (!c) return goTo('/admin/contacts');
    return adminPage('Edit contact', 'contacts', contactForm(c, { action: `/admin/contacts/${c.id}`, title: 'Edit contact', cancel: `/admin/contacts/${c.id}` }));
  }
  if ((m = p.match(/^\/admin\/contacts\/(\d+)\/delete$/)) && POST) {
    const id = +m[1]; const c = await qy(env, 'SELECT name FROM contacts WHERE id = ?', id).first();
    const fus = (await qy(env, 'SELECT id, gcal_event_id FROM followups WHERE contact_id = ?', id).all()).results;
    for (const fu of fus) { if (fu.gcal_event_id) await gcalSyncFollowup(env, fu.id, url.origin, { remove: true }); }
    await env.DB.batch([qy(env, 'DELETE FROM contact_activities WHERE contact_id = ?', id), qy(env, 'UPDATE tickets SET contact_id = NULL WHERE contact_id = ?', id), qy(env, 'UPDATE tickets SET followup_id = NULL WHERE followup_id IN (SELECT id FROM followups WHERE contact_id = ?)', id), qy(env, 'DELETE FROM followups WHERE contact_id = ?', id), qy(env, 'DELETE FROM signings WHERE contact_id = ?', id), qy(env, 'DELETE FROM contacts WHERE id = ?', id)]);
    return goTo(withMsg('/admin/contacts', c ? `Deleted ${c.name}.` : 'Already deleted.'));
  }
  if ((m = p.match(/^\/admin\/contacts\/(\d+)\/activities$/)) && POST) {
    const id = +m[1], b = await body(); const text = String(b.body || '').trim().slice(0, 10000), kind = ACT_KINDS.includes(b.kind) ? b.kind : 'note';
    if (!(await qy(env, 'SELECT id FROM contacts WHERE id = ?', id).first())) return goTo('/admin/contacts');
    if (!text) return goTo(withMsg(`/admin/contacts/${id}#note`, 'Write something first.'));
    const at = etLocalToUtc(b.at); await logActivity(env, id, kind, text, at ? isoOf(at) : nowIso());
    return goTo(withMsg(`/admin/contacts/${id}`, 'Added to the timeline.'));
  }
  if ((m = p.match(/^\/admin\/activities\/(\d+)\/delete$/)) && POST) {
    const a = await qy(env, 'SELECT contact_id FROM contact_activities WHERE id = ?', +m[1]).first();
    await qy(env, "DELETE FROM contact_activities WHERE id = ? AND kind != 'system'", +m[1]).run();
    return goTo(withMsg(a ? `/admin/contacts/${a.contact_id}` : '/admin/contacts', 'Timeline entry deleted.'));
  }
  // Calendar + follow-ups
  if (p === '/admin/calendar' && GET) return calendarPage(env, url);
  if (p === '/admin/calendar/settings' && GET) return settingsPage(env, url);
  if (p === '/admin/calendar/regenerate' && POST) { await rotateFeedToken(env); return goTo(withMsg('/admin/calendar/settings', 'New link created. The old one no longer works. Re-subscribe on your devices.')); }
  if (p === '/admin/calendar/google/connect' && GET) {
    if (!gcalClientReady(env)) return goTo(withMsg('/admin/calendar/settings', 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET Worker secrets first.'));
    const state = b64u(crypto.getRandomValues(new Uint8Array(16)));
    await settingSet(env, 'gcal_oauth_state', state);
    return Response.redirect(gcalAuthUrl(env, url.origin, state), 302);
  }
  if (p === '/admin/calendar/google/callback' && GET) {
    if (!gcalClientReady(env)) return goTo(withMsg('/admin/calendar/settings', 'Google OAuth client is not configured.'));
    const err = url.searchParams.get('error'); if (err) return goTo(withMsg('/admin/calendar/settings', `Google auth cancelled (${err}).`));
    const code = url.searchParams.get('code') || ''; const state = url.searchParams.get('state') || '';
    const expect = await settingGet(env, 'gcal_oauth_state');
    await settingSet(env, 'gcal_oauth_state', '');
    if (!code || !expect || state !== expect) return goTo(withMsg('/admin/calendar/settings', 'Google auth failed (bad state). Try Connect again.'));
    const ex = await gcalExchangeCode(env, url.origin, code);
    if (!ex.ok) return goTo(withMsg('/admin/calendar/settings', `Google token exchange failed (${ex.error || 'error'}).`));
    if (!ex.hasRefresh && !(await gcalRefreshToken(env))) return goTo(withMsg('/admin/calendar/settings', 'Google did not return a refresh token. Disconnect any prior grant at myaccount.google.com/permissions, then Connect again.'));
    return goTo(withMsg('/admin/calendar/settings', 'Google Workspace Calendar connected. New follow-ups will sync automatically.'));
  }
  if (p === '/admin/calendar/google/token' && POST) {
    if (!gcalClientReady(env)) return goTo(withMsg('/admin/calendar/settings', 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.'));
    const b = await body(); const tok = String(b.refresh_token || '').trim();
    if (tok.length < 20) return goTo(withMsg('/admin/calendar/settings', 'That refresh token looks too short.'));
    await settingSet(env, 'gcal_refresh_token', tok);
    await settingSet(env, 'gcal_connected_at', nowIso());
    const probe = await gcalAccessToken(env);
    if (!probe) return goTo(withMsg('/admin/calendar/settings', 'Saved, but Google rejected the token. Check client id/secret and that the token was issued for this OAuth client.'));
    return goTo(withMsg('/admin/calendar/settings', 'Google refresh token saved. Follow-ups will sync to Workspace Calendar.'));
  }
  if (p === '/admin/calendar/google/disconnect' && POST) {
    await settingSet(env, 'gcal_refresh_token', '');
    await settingSet(env, 'gcal_connected_at', '');
    return goTo(withMsg('/admin/calendar/settings', 'Disconnected Google Calendar sync.'));
  }
  if (p === '/admin/calendar/google/sync' && POST) {
    if (!(await gcalConfigured(env))) return goTo(withMsg('/admin/calendar/settings', 'Connect Google Calendar first.'));
    const rows = (await env.DB.prepare("SELECT id FROM followups WHERE status != 'done' ORDER BY due_at LIMIT 500").all()).results;
    let ok = 0, fail = 0;
    for (const row of rows) { const r = await gcalSyncFollowup(env, row.id, url.origin); if (r && r.ok) ok++; else if (!(r && r.skipped)) fail++; }
    return goTo(withMsg('/admin/calendar/settings', `Synced ${ok} open follow-up${ok === 1 ? '' : 's'}${fail ? ` (${fail} failed)` : ''}.`));
  }
  if (p === '/admin/followups/new' && GET) {
    const cid = intOr(url.searchParams.get('contact_id')); const d = String(url.searchParams.get('date') || '').match(/^\d{4}-\d\d-\d\d$/);
    const due = etLocalToUtc((d ? d[0] : dayPlus(etDay(new Date()), 1)) + 'T09:00');
    const c = cid ? await qy(env, 'SELECT id, name FROM contacts WHERE id = ?', cid).first() : null;
    return followupForm(env, url, { contact_id: c ? c.id : null, due_at: isoOf(due), duration_min: 30, type: 'call', title: c ? `Follow up with ${c.name}` : '' }, { action: '/admin/followups', title: 'New follow-up', back: c ? `/admin/contacts/${c.id}` : '/admin/calendar' });
  }
  if (p === '/admin/followups' && POST) {
    const b = await body(); const { f, err } = fuFromBody(b); const back = safeBack(b.back, '/admin/calendar');
    if (f.contact_id && !(await qy(env, 'SELECT id FROM contacts WHERE id = ?', f.contact_id).first())) f.contact_id = null;
    if (err.length) return followupForm(env, url, f, { action: '/admin/followups', title: 'New follow-up', err, back });
    const now = nowIso();
    const r = await qy(env, 'INSERT INTO followups (contact_id, title, due_at, duration_min, type, notes, status, location, seq, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', f.contact_id, f.title, f.due_at, f.duration_min, f.type, f.notes, 'open', f.location, now, now).run();
    const nid = r.meta.last_row_id;
    if (f.contact_id) await logActivity(env, f.contact_id, 'system', `Follow-up scheduled: ${f.title} (${fmtWhen(f.due_at)})`);
    const sync = await gcalSyncFollowup(env, nid, url.origin);
    const extra = sync && sync.ok ? ' Synced to Google Calendar.' : (sync && sync.skipped ? '' : (await gcalConfigured(env) ? ' (Google Calendar sync failed — check Calendar settings.)' : ''));
    return goTo(withMsg(back, `Follow-up added for ${fmtWhen(f.due_at)}.${extra}`));
  }
  if ((m = p.match(/^\/admin\/followups\/(\d+)\.ics$/)) && GET) {
    const f = await fuWithContact(env, +m[1]); if (!f) return new Response('Not found', { status: 404 });
    return new Response(buildInvite(f, url.origin, String(env.ADMIN_EMAIL || 'admin@' + SERVICE_HOST)), { headers: { 'content-type': 'text/calendar; charset=utf-8; method=REQUEST', 'content-disposition': `attachment; filename="followup-${f.id}.ics"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  }
  if ((m = p.match(/^\/admin\/followups\/(\d+)$/))) {
    const id = +m[1]; const cur = await fuWithContact(env, id);
    if (!cur) return GET ? adminPage('Not found', 'calendar', '<h1>Follow-up not found</h1><p><a href="/admin/calendar">← Calendar</a></p>', { status: 404 }) : goTo('/admin/calendar');
    if (GET) return followupForm(env, url, cur, { action: `/admin/followups/${id}`, title: 'Edit follow-up', back: cur.contact_id ? `/admin/contacts/${cur.contact_id}` : '/admin/calendar' });
    if (POST) { const b = await body(); const { f, err } = fuFromBody(b); const back = safeBack(b.back, '/admin/calendar');
      if (f.contact_id && !(await qy(env, 'SELECT id FROM contacts WHERE id = ?', f.contact_id).first())) f.contact_id = null;
      if (err.length) return followupForm(env, url, { ...f, id }, { action: `/admin/followups/${id}`, title: 'Edit follow-up', err, back });
      await qy(env, `UPDATE followups SET contact_id = ?, title = ?, due_at = ?, duration_min = ?, type = ?, notes = ?, status = ?, location = ?, seq = seq + 1, updated_at = ?, completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END WHERE id = ?`,
        f.contact_id, f.title, f.due_at, f.duration_min, f.type, f.notes, f.status, f.location, nowIso(), f.status, nowIso(), id).run();
      const sync = await gcalSyncFollowup(env, id, url.origin);
      const extra = sync && sync.ok ? ' Synced to Google Calendar.' : (sync && sync.skipped ? '' : (await gcalConfigured(env) ? ' (Google Calendar sync failed.)' : ''));
      return goTo(withMsg(back, 'Follow-up saved.' + extra)); }
  }
  if ((m = p.match(/^\/admin\/followups\/(\d+)\/(done|reopen|snooze|delete)$/)) && POST) {
    const id = +m[1], act = m[2], b = await body(); const f = await qy(env, 'SELECT * FROM followups WHERE id = ?', id).first();
    const back = safeBack(b.back, '/admin/calendar'); if (!f) return goTo(withMsg(back, 'That follow-up no longer exists.'));
    const now = nowIso(); let msg;
    if (act === 'done') { await qy(env, "UPDATE followups SET status = 'done', completed_at = ?, seq = seq + 1, updated_at = ? WHERE id = ?", now, now, id).run(); if (f.contact_id) await logActivity(env, f.contact_id, 'system', `Follow-up done: ${f.title}`); await gcalSyncFollowup(env, id, url.origin); msg = 'Marked done.'; }
    if (act === 'reopen') { await qy(env, "UPDATE followups SET status = 'open', completed_at = NULL, seq = seq + 1, updated_at = ? WHERE id = ?", now, id).run(); await gcalSyncFollowup(env, id, url.origin); msg = 'Reopened.'; }
    if (act === 'snooze') { const due = snoozeTarget(f, b.for); await qy(env, "UPDATE followups SET status = 'snoozed', due_at = ?, seq = seq + 1, updated_at = ? WHERE id = ?", due, now, id).run(); await gcalSyncFollowup(env, id, url.origin); msg = `Snoozed to ${fmtWhen(due)}.`; }
    if (act === 'delete') {
      if (f.gcal_event_id) await gcalSyncFollowup(env, id, url.origin, { remove: true });
      await env.DB.batch([qy(env, 'UPDATE tickets SET followup_id = NULL WHERE followup_id = ?', id), qy(env, 'DELETE FROM followups WHERE id = ?', id)]);
      msg = 'Follow-up deleted.'; return goTo(withMsg(/^\/admin\/followups\/\d+$/.test(back) ? '/admin/calendar' : back, msg));
    }
    return goTo(withMsg(back, msg));
  }
  return null;
}

// ── Authentisign (Lone Wolf) e-signatures
// Today: a quick-launch to Authentisign plus a manual signing log on each contact.
// Later (once Lone Wolf grants API access), set Worker secrets LW_USER_ID, LW_ACCESS_TOKEN, LW_SUBSCRIPTION_KEY and LW_WEBHOOK_SECRET,
// call authentisign.createSigning() from a "Send via API" action, store the returned id in signings.external_signing_id,
// and implement authentisignWebhook() to update status/last_webhook_at by external_signing_id. No credentials live in code.
const AUTHENTISIGN_URL = 'https://authentisign.com/';
const SIGN_STATUS = ['draft', 'sent', 'viewed', 'signed', 'declined', 'voided'];
const SIGN_DONE = ['signed', 'declined', 'voided'];
const authentisign = {
  base: 'https://api.lwolf.com/authentisign/v3',
  configured: (env) => !!(env.LW_USER_ID && env.LW_ACCESS_TOKEN && env.LW_SUBSCRIPTION_KEY),
  // POST /authentisign/v3/users/{userId}/signings?api-version=3 (multipart: Name, Files[], optional CallbackUrl, ExpirationDate, isOrdered, TransactionId)
  async createSigning(env, { name, files = [], callbackUrl = '', expiration = '' }) {
    if (!this.configured(env)) { const e = new Error('Authentisign API not configured'); e.status = 501; throw e; }
    const fd = new FormData(); fd.append('Name', name);
    for (const f of files) fd.append('Files', f.blob, f.filename);
    if (callbackUrl) fd.append('CallbackUrl', callbackUrl);
    if (expiration) fd.append('ExpirationDate', expiration);
    const r = await fetch(`${this.base}/users/${encodeURIComponent(env.LW_USER_ID)}/signings?api-version=3`, { method: 'POST', body: fd,
      headers: { authorization: `Bearer ${env.LW_ACCESS_TOKEN}`, 'lw-subscription-key': env.LW_SUBSCRIPTION_KEY } });
    if (!r.ok) { const e = new Error(`Authentisign ${r.status}`); e.status = 502; throw e; }
    return r.json();
  },
  callbackUrl: (env) => `https://${SERVICE_HOST}/api/authentisign/webhook`, // stays on the existing host until that registration is changed
};
// Public stub. Returns 501 until the API is connected. Never reads or echoes the request body.
async function authentisignWebhook(req) {
  const h = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: { ...h, allow: 'POST' } });
  return new Response(JSON.stringify({ ok: false, error: 'Authentisign webhook not implemented yet' }), { status: 501, headers: h });
}
function signingFromBody(b) {
  const s = (k, n) => String(b[k] ?? '').trim().slice(0, n);
  const link = s('link', 1000), dt = (k) => { const d = etLocalToUtc(b[k]); return d ? isoOf(d) : null; };
  const g = { document: s('document', 300), status: SIGN_STATUS.includes(b.status) ? b.status : 'draft', link: /^https:\/\/[^\s"'<>]+$/i.test(link) ? link : '',
    ref_id: s('ref_id', 200) || (link && !/^https:\/\//i.test(link) ? link.slice(0, 200) : ''), notes: s('notes', 5000), sent_at: dt('sent_at'), completed_at: dt('completed_at') };
  const err = !g.document ? 'Document name is required.' : '';
  return { g, err };
}
const fixDates = (g) => { const now = nowIso();
  if (g.status !== 'draft' && !g.sent_at) g.sent_at = now;
  if (SIGN_DONE.includes(g.status) && !g.completed_at) g.completed_at = now;
  if (!SIGN_DONE.includes(g.status)) g.completed_at = null; return g; };
const signBadge = (st) => `<span class="badge sg-${escH(st)}">${escH(st)}</span>`;
function signingRow(g, back, { showContact = false } = {}) {
  const ref = g.link ? `<a href="${escH(g.link)}" target="_blank" rel="noopener noreferrer nofollow">Open in Authentisign ↗</a>` : '';
  return `<article class="card fu" id="sg${g.id}"><div class="fu-main"><h3>${escH(g.document)} ${signBadge(g.status)}</h3>
<p class="meta">${showContact && g.contact_id ? `<a href="/admin/contacts/${g.contact_id}">${escH(g.contact_name || 'Contact')}</a> · ` : ''}${g.sent_at ? `Sent ${escH(fmtET(g.sent_at))}` : 'Not sent'}${g.completed_at ? ` · ${escH(cap(g.status))} ${escH(fmtET(g.completed_at))}` : ''}${g.ref_id ? ` · Ref ${escH(g.ref_id)}` : ''}${ref ? ` · ${ref}` : ''}</p>
${g.notes ? `<p class="notes">${escH(g.notes)}</p>` : ''}</div>
<div class="fu-acts"><form class="inl" method="post" action="/admin/signings/${g.id}/status"><input type="hidden" name="back" value="${escH(back)}"><select name="status" aria-label="Signing status">${opts(SIGN_STATUS, g.status)}</select> <button class="b sm" type="submit">Update</button></form>
<a class="b sm" href="/admin/signings/${g.id}/edit?back=${encodeURIComponent(back)}">Edit</a>${delForm(`/admin/signings/${g.id}/delete`, `Delete the signing record "${g.document}"? (It stays in Authentisign.)`, back)}</div></article>`;
}
function signingForm(g, { action, title, back, contactName = '' }) {
  return `<form class="form" method="post" action="${action}"><input type="hidden" name="back" value="${escH(back)}">
${title ? `<h2 class="sec">${escH(title)}${contactName ? ` · ${escH(contactName)}` : ''}</h2>` : ''}
${field('Document name *', inp('document', g.document, 'required maxlength="300" placeholder="e.g. Sponsorship agreement 2027"'))}${field('Status', `<select name="status">${opts(SIGN_STATUS, g.status || 'sent')}</select>`)}
${field('Authentisign link (https)', inp('link', g.link, 'type="url" maxlength="1000" placeholder="https://…"'))}${field('Reference / signing ID', inp('ref_id', g.ref_id, 'maxlength="200"'))}
${field('Sent (Eastern)', `<input type="datetime-local" name="sent_at" value="${escH(g.sent_at ? etLocal(g.sent_at) : '')}">`)}${field('Completed (Eastern)', `<input type="datetime-local" name="completed_at" value="${escH(g.completed_at ? etLocal(g.completed_at) : '')}">`)}
${field('Notes', `<textarea name="notes" maxlength="5000">${escH(g.notes || '')}</textarea>`, true)}<div class="acts"><button class="btn" type="submit">Save signing</button> <a class="b" href="${escH(back)}">Cancel</a></div></form>`;
}
const SIGN_LIST_SQL = 'SELECT g.*, c.name AS contact_name FROM signings g LEFT JOIN contacts c ON c.id = g.contact_id';
async function contactSignings(env, c, back) {
  const rows = (await qy(env, 'SELECT * FROM signings WHERE contact_id = ? ORDER BY created_at DESC, id DESC LIMIT 200', c.id).all()).results;
  return `<h2 class="sec" id="sign">Signings</h2><div class="bar"><a class="b dark" href="${AUTHENTISIGN_URL}" target="_blank" rel="noopener noreferrer">Send for signature ↗</a><a class="b" href="#logsign">+ Log signing</a><span class="sp"></span></div>
<p class="eyebrow">Opens Authentisign (Lone Wolf) in a new tab. After you send, log it below to track status here.</p>
${rows.length ? rows.map((g) => signingRow(g, back + '#sign')).join('') : '<p class="empty">No signings yet.</p>'}
<details id="logsign"${rows.length ? '' : ' open'}><summary class="b">Log signing form ▾</summary>${signingForm({ status: 'sent', sent_at: nowIso() }, { action: `/admin/contacts/${c.id}/signings`, title: '', back: back + '#sign' })}</details>`;
}
async function signingsCounts(env) {
  const r = (await env.DB.prepare('SELECT status, COUNT(*) n FROM signings GROUP BY status').all()).results; const n = Object.fromEntries(SIGN_STATUS.map((s) => [s, 0]));
  for (const x of r) if (x.status in n) n[x.status] = x.n; return n;
}
async function signingsWidget(env) {
  const n = await signingsCounts(env); const total = Object.values(n).reduce((a, b) => a + b, 0); if (!total) return '';
  return `<section class="widget"><div class="bar" style="margin:0"><h2 style="margin:0">Signings</h2><span class="sp"></span><a class="b sm" href="/admin/signings">All signings</a></div>
<nav class="tabs" aria-label="Signings by status">${SIGN_STATUS.map((s) => `<a href="/admin/signings?status=${s}">${escH(cap(s))} (${n[s]})</a>`).join('')}</nav></section>`;
}
async function signingsPage(env, url) {
  const st = SIGN_STATUS.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : url.searchParams.get('status') === 'open' ? 'open' : '';
  const n = await signingsCounts(env), all = Object.values(n).reduce((a, b) => a + b, 0), open = n.draft + n.sent + n.viewed;
  const where = st === 'open' ? " WHERE g.status IN ('draft','sent','viewed')" : st ? ' WHERE g.status = ?' : '';
  const rows = (await (st && st !== 'open' ? qy(env, `${SIGN_LIST_SQL}${where} ORDER BY g.updated_at DESC LIMIT 1000`, st) : env.DB.prepare(`${SIGN_LIST_SQL}${where} ORDER BY g.updated_at DESC LIMIT 1000`)).all()).results;
  const back = '/admin/signings' + (st ? `?status=${st}` : '');
  const tab = (k, l, c) => `<a href="/admin/signings${k ? `?status=${k}` : ''}"${k === st ? ' class="on" aria-current="page"' : ''}>${escH(l)} (${c})</a>`;
  const body = `<p class="eyebrow">Authentisign (Lone Wolf) · logged manually until the API is connected</p><h1>Signings <em>&amp; e-signatures</em></h1>
<div class="bar"><a class="b dark" href="${AUTHENTISIGN_URL}" target="_blank" rel="noopener noreferrer">Open Authentisign ↗</a><span class="sp"></span></div>
<nav class="tabs" aria-label="Filter by status">${tab('', 'All', all)}${tab('open', 'Awaiting', open)}${SIGN_STATUS.map((s) => tab(s, cap(s), n[s])).join('')}</nav>
${rows.length ? rows.map((g) => signingRow(g, back, { showContact: true })).join('') : `<p class="empty">No signings${st ? ' with this status' : ''} yet. Log one from a contact's page.</p>`}`;
  return adminPage('Signings', 'signings', body, { msg: url.searchParams.get('msg') || '' });
}
async function signingsApi(env, p) {
  if (p === '/admin/api/signings') return adminJson({ ok: true, rows: (await env.DB.prepare(`${SIGN_LIST_SQL} ORDER BY g.updated_at DESC LIMIT 2000`).all()).results });
  const m = p.match(/^\/admin\/api\/signings\/(\d+)$/);
  if (m) { const g = await qy(env, 'SELECT * FROM signings WHERE id = ?', +m[1]).first(); return g ? adminJson({ ok: true, signing: g }) : adminJson({ ok: false, error: 'Not found' }, 404); }
  return null;
}
async function signingsRoute(req, env, url, p) {
  const GET = req.method === 'GET' || req.method === 'HEAD', POST = req.method === 'POST';
  const body = async () => { try { return await readBody(req); } catch { return {}; } };
  let m;
  if (p === '/admin/signings' && GET) return signingsPage(env, url);
  if ((m = p.match(/^\/admin\/contacts\/(\d+)\/signings$/)) && POST) {
    const id = +m[1], b = await body(), back = safeBack(b.back, `/admin/contacts/${id}#sign`);
    if (!(await qy(env, 'SELECT id FROM contacts WHERE id = ?', id).first())) return goTo('/admin/contacts');
    const { g, err } = signingFromBody(b); if (err) return goTo(withMsg(back, err)); fixDates(g); const now = nowIso();
    await qy(env, 'INSERT INTO signings (contact_id, document, status, sent_at, completed_at, link, ref_id, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, g.document, g.status, g.sent_at, g.completed_at, g.link, g.ref_id, g.notes, now, now).run();
    await logActivity(env, id, 'system', `Signing logged: ${g.document} (${g.status})`);
    return goTo(withMsg(back, 'Signing logged.'));
  }
  if (!(m = p.match(/^\/admin\/signings\/(\d+)(?:\/(edit|status|delete))?$/))) return null;
  const sid = +m[1], act = m[2] || ''; const cur = await qy(env, 'SELECT * FROM signings WHERE id = ?', sid).first();
  const dflt = cur && cur.contact_id ? `/admin/contacts/${cur.contact_id}#sign` : '/admin/signings';
  if (act === 'edit' && GET) {
    if (!cur) return adminPage('Not found', 'signings', '<h1>Signing not found</h1><p><a href="/admin/signings">← Signings</a></p>', { status: 404 });
    const c = cur.contact_id ? await qy(env, 'SELECT name FROM contacts WHERE id = ?', cur.contact_id).first() : null;
    return adminPage('Edit signing', 'signings', signingForm(cur, { action: `/admin/signings/${sid}`, title: 'Edit signing', back: safeBack(url.searchParams.get('back'), dflt), contactName: c && c.name }));
  }
  if (!POST) return null;
  const b = await body(), back = safeBack(b.back, dflt);
  if (!cur) return goTo(withMsg('/admin/signings', 'That signing no longer exists.'));
  if (act === 'delete') { await qy(env, 'DELETE FROM signings WHERE id = ?', sid).run(); return goTo(withMsg(back, 'Signing record deleted.')); }
  let g;
  if (act === 'status') { if (!SIGN_STATUS.includes(b.status)) return goTo(withMsg(back, 'Pick a valid status.')); g = fixDates({ ...cur, status: b.status, completed_at: SIGN_DONE.includes(b.status) && SIGN_DONE.includes(cur.status) && b.status === cur.status ? cur.completed_at : null }); }
  else { const r = signingFromBody(b); if (r.err) return goTo(withMsg(back, r.err)); g = fixDates(r.g); }
  await qy(env, 'UPDATE signings SET document = ?, status = ?, sent_at = ?, completed_at = ?, link = ?, ref_id = ?, notes = ?, updated_at = ? WHERE id = ?', g.document, g.status, g.sent_at, g.completed_at, g.link, g.ref_id, g.notes, nowIso(), sid).run();
  if (cur.contact_id && g.status !== cur.status) await logActivity(env, cur.contact_id, 'system', `Signing "${g.document}": ${cur.status} → ${g.status}`);
  return goTo(withMsg(back, g.status !== cur.status ? `Signing marked ${g.status}.` : 'Signing saved.'));
}
