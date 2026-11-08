const cfg = require('./config');
const C = require('./content');
const { TABLES, all, count } = require('./db');
const { esc } = require('./layout');

function shell(title, active, body) {
  const nav = [['Dashboard', '/admin'], ...Object.entries(TABLES).map(([k, t]) => [t.label, '/admin/' + k]), ['Packages', '/admin/packages']]
    .map(([l, h]) => `<a href="${h}"${h === active ? ' class="on"' : ''}>${l}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(cfg.brand)} CRM</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/css/admin.css"></head>
<body><aside><a class="brand" href="/admin">${esc(cfg.brand)}<small>CRM · local</small></a><nav>${nav}</nav><a class="site" href="/" target="_blank">View site ↗</a><form method="post" action="/admin/logout" style="margin:0"><button class="site" style="background:none;border:0;padding:0;cursor:pointer;font:inherit">Log out</button></form></aside>
<main><h1>${esc(title)}</h1>${body}</main></body></html>`;
}

function dashboard() {
  const cards = Object.entries(TABLES).map(([k, t]) => `<a class="stat" href="/admin/${k}"><span>${count(k)}</span><strong>${t.label}</strong><small>${esc(t.desc)}</small></a>`).join('');
  const recent = ['brands', 'creators', 'events'].flatMap((k) => all(k).slice(0, 5).map((r) => ({ k, r }))).sort((a, b) => (b.r.created_at > a.r.created_at ? 1 : -1)).slice(0, 10);
  const rec = recent.length ? `<table><thead><tr><th>Type</th><th>Name</th><th>Email</th><th>Received (UTC)</th></tr></thead><tbody>${recent.map(({ k, r }) => `<tr><td>${TABLES[k].label}</td><td><a href="/admin/${k}#r${r.id}">${esc(r.company || r.name || r.event_name)}</a></td><td>${esc(r.email)}</td><td>${esc(r.created_at)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No submissions yet. Website forms land here automatically.</p>';
  return shell('Dashboard', '/admin', `<div class="stats">${cards}</div><h2>Latest website submissions</h2>${rec}`);
}

function input(c) {
  if (c.type === 'select') return `<select name="${c.key}">${c.options.map((o) => `<option${o === c.default ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (c.type === 'long') return `<textarea name="${c.key}" rows="2"></textarea>`;
  return `<input name="${c.key}" type="${c.type === 'date' ? 'date' : c.type === 'email' ? 'email' : 'text'}"${c.required ? ' required' : ''}>`;
}

function table(name, msg = '') {
  const t = TABLES[name];
  const rows = all(name);
  const cols = t.columns;
  const head = `<tr><th>#</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Source</th><th>Created (UTC)</th><th></th></tr>`;
  const statusCol = cols.find((c) => c.key === 'status');
  const body = rows.map((r) => `<tr id="r${r.id}"><td>${r.id}</td>${cols.map((c) => {
    if (c.key === 'status') return `<td><form method="post" action="/admin/${name}/${r.id}/status"><select name="status" onchange="this.form.submit()">${statusCol.options.map((o) => `<option${o === r.status ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></form></td>`;
    const v = r[c.key] || '';
    if (c.type === 'email' && v) return `<td><a href="mailto:${esc(v)}">${esc(v)}</a></td>`;
    if (/^https?:\/\//.test(v)) return `<td><a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a></td>`;
    return `<td>${esc(v)}</td>`;
  }).join('')}<td>${esc(r.source)}</td><td class="nowrap">${esc(r.created_at)}</td><td><form method="post" action="/admin/${name}/${r.id}/delete" onsubmit="return confirm('Delete this record?')"><button class="del">Delete</button></form></td></tr>`).join('');
  const add = `<details class="add"><summary>+ Add ${t.label.replace(/s$/, '').toLowerCase()}</summary><form method="post" action="/admin/${name}/new" class="add-form">${cols.map((c) => `<label><span>${esc(c.label)}${c.required ? ' *' : ''}</span>${input(c)}</label>`).join('')}<button>Save</button></form></details>`;
  return shell(t.label, '/admin/' + name, `${msg ? `<p class="msg">${esc(msg)}</p>` : ''}<p class="desc">${esc(t.desc)} · ${rows.length} record${rows.length === 1 ? '' : 's'} · <a href="/admin/${name}.csv">Export CSV</a></p>${add}<div class="scroll"><table>${head}${body || `<tr><td colspan="${cols.length + 4}" class="empty">No records yet.</td></tr>`}</table></div>`);
}

function packages() {
  const pk = C.packages.map((p) => `<div class="pkg"><h3>${esc(p.name)}</h3><p class="sum">${esc(p.summary)}</p><ul>${p.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><p class="price"><span>Pricing</span>${esc(p.pricing)}</p><p class="model"><span>Revenue model</span>${esc(p.model)}</p></div>`).join('');
  const rm = C.revenueModel.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('');
  return shell('Standard packages (internal)', '/admin/packages', `<p class="desc">Internal only — not shown on the public site. Public copy stays: "Every campaign is different. Let's build the right package for your goals." Edit in <code>src/content.js</code>.</p><div class="pkgs">${pk}</div><h2>Revenue model</h2><p class="desc">Goal: move from "I sell my time" to "I manage campaigns and transactions."</p><table class="rm">${rm}</table>`);
}

function csv(name) {
  const cols = ['id', ...TABLES[name].columns.map((c) => c.key), 'source', 'created_at'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...all(name).map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
}

module.exports = { dashboard, table, packages, csv };
