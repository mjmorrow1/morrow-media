
// ── Tickets (Jira-style board) + KPIs & goals
const T_TYPES = ['task', 'bug', 'content', 'campaign', 'sponsorship deal', 'shoot'];
const T_STATUS = ['backlog', 'to do', 'in progress', 'review', 'done'];
const T_PRI = ['urgent', 'high', 'medium', 'low'];
const PRI_SQL = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";
const G_PERIODS = ['weekly', 'monthly', 'quarterly'];
const T_SORTS = { updated: 't.updated_at DESC', created: 't.created_at DESC', priority: `${PRI_SQL}, t.due_date IS NULL, t.due_date`, due: 't.due_date IS NULL, t.due_date, ' + PRI_SQL, key: 'p.key, t.num', status: "CASE t.status WHEN 'backlog' THEN 0 WHEN 'to do' THEN 1 WHEN 'in progress' THEN 2 WHEN 'review' THEN 3 ELSE 4 END, " + PRI_SQL, title: 't.title COLLATE NOCASE' };
const T_SELECT = 'SELECT t.*, p.key AS pkey, p.name AS project_name, p.color AS pcolor, c.name AS contact_name FROM tickets t JOIN projects p ON p.id = t.project_id LEFT JOIN contacts c ON c.id = t.contact_id';
const tKey = (t) => `${t.pkey}-${t.num}`;
const money = (cents) => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: Number(cents || 0) % 100 ? 2 : 0 });
const numFmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const todayET = () => etDay(new Date());
const etMidnight = (key) => isoOf(etLocalToUtc(key + 'T00:00'));
const normLabels = (v) => [...new Set(String(v || '').split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean))].slice(0, 20).join(',');
const safeColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '#0d0d0c';

// Minimal, safe markdown: escape everything first, then add **bold**, `code`, "- " lists, "# " headings and https links.
function mdLite(text) {
  const inline = (s) => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (m, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${u}</a>`);
  const out = []; let list = null, para = [];
  const flush = () => { if (para.length) out.push(`<p>${para.join('<br>')}</p>`); para = []; if (list) out.push(`<ul>${list.join('')}</ul>`); list = null; };
  for (const raw of escH(String(text || '')).split(/\r?\n/)) {
    const l = raw.trimEnd();
    if (/^\s*[-*] /.test(l)) { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } (list = list || []).push(`<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (!l.trim()) { flush(); continue; }
    const h = l.match(/^#{1,3} (.+)/); if (h) { flush(); out.push(`<p class="mdh">${inline(h[1])}</p>`); continue; }
    para.push(inline(l));
  }
  flush(); return out.join('');
}

// Period starts in Eastern time
function periodStart(period, now = new Date()) {
  const k = etDay(now); const [y, m, d] = k.split('-').map(Number);
  if (period === 'weekly') { const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return etMidnight(dayPlus(k, -((dow + 6) % 7))); }
  if (period === 'quarterly') return etMidnight(`${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`);
  return etMidnight(`${y}-${pad(m)}-01`);
}
const sqlTs = (iso) => iso.replace('T', ' ').replace('Z', ''); // website-submission tables store "YYYY-MM-DD HH:MM:SS" (UTC)
const one = async (env, sql, ...a) => { const r = await qy(env, sql, ...a).first(); return Number((r && (r.n ?? Object.values(r)[0])) || 0); };
const METRICS = {
  tickets_done: { label: 'Tickets completed', unit: 'count', fn: (env, s) => one(env, "SELECT COUNT(*) n FROM tickets WHERE status = 'done' AND completed_at >= ?", s) },
  points_done: { label: 'Story points completed', unit: 'count', fn: (env, s) => one(env, "SELECT COALESCE(SUM(points), 0) n FROM tickets WHERE status = 'done' AND completed_at >= ?", s) },
  sponsorship_won: { label: 'Sponsorship revenue won ($, done deal tickets)', unit: 'usd', fn: (env, s) => one(env, "SELECT COALESCE(SUM(value_cents), 0) / 100.0 n FROM tickets WHERE type = 'sponsorship deal' AND status = 'done' AND completed_at >= ?", s) },
  pipeline_value: { label: 'Open sponsorship pipeline ($, right now)', unit: 'usd', fn: (env) => one(env, "SELECT COALESCE(SUM(value_cents), 0) / 100.0 n FROM tickets WHERE type = 'sponsorship deal' AND status != 'done'") },
  new_contacts: { label: 'New CRM contacts', unit: 'count', fn: (env, s) => one(env, 'SELECT COUNT(*) n FROM contacts WHERE created_at >= ?', s) },
  new_brand_leads: { label: 'New brand leads (brand form submissions)', unit: 'count', fn: (env, s) => one(env, 'SELECT COUNT(*) n FROM brands WHERE created_at >= ?', sqlTs(s)) },
  submissions: { label: 'Website submissions (all forms)', unit: 'count', fn: async (env, s) => (await Promise.all(ADMIN_TABLES.map((t) => one(env, `SELECT COUNT(*) n FROM ${t} WHERE created_at >= ?`, sqlTs(s))))).reduce((a, b) => a + b, 0) },
  followups_done: { label: 'Follow-ups completed', unit: 'count', fn: (env, s) => one(env, "SELECT COUNT(*) n FROM followups WHERE status = 'done' AND completed_at >= ?", s) },
  contacts_won: { label: 'Contacts moved to Won', unit: 'count', fn: (env, s) => one(env, "SELECT COUNT(*) n FROM contacts WHERE stage = 'won' AND updated_at >= ?", s) },
  signings_signed: { label: 'Documents signed (Authentisign log)', unit: 'count', fn: (env, s) => one(env, "SELECT COUNT(*) n FROM signings WHERE status = 'signed' AND completed_at >= ?", s) },
};

async function computeKpis(env) {
  const now = new Date(), nowS = isoOf(now), today = todayET();
  const week = periodStart('weekly', now), month = periodStart('monthly', now);
  const since90 = isoOf(new Date(now.getTime() - 90 * 864e5));
  const wk0 = dayPlus(etDay(new Date(week)), -49); // Monday 7 weeks before this week → 8 buckets
  const [byStatus, doneW, doneM, overdue, cyc, thr, pipe, won, newC, stages, fuDone, fuLate, subs, overdueList] = await Promise.all([
    env.DB.prepare('SELECT status, COUNT(*) n FROM tickets GROUP BY status').all(),
    one(env, "SELECT COUNT(*) n FROM tickets WHERE status = 'done' AND completed_at >= ?", week),
    one(env, "SELECT COUNT(*) n FROM tickets WHERE status = 'done' AND completed_at >= ?", month),
    one(env, "SELECT COUNT(*) n FROM tickets WHERE status != 'done' AND due_date IS NOT NULL AND due_date != '' AND due_date < ?", today),
    qy(env, `SELECT COUNT(*) n, AVG(julianday(t.completed_at) - julianday(h.first_ip)) d FROM tickets t
      JOIN (SELECT ticket_id, MIN(at) first_ip FROM ticket_history WHERE field = 'status' AND to_value = 'in progress' GROUP BY ticket_id) h ON h.ticket_id = t.id
      WHERE t.status = 'done' AND t.completed_at >= ? AND t.completed_at >= h.first_ip`, since90).first(),
    qy(env, "SELECT completed_at FROM tickets WHERE status = 'done' AND completed_at >= ?", etMidnight(wk0)).all(),
    METRICS.pipeline_value.fn(env), METRICS.sponsorship_won.fn(env, month),
    METRICS.new_contacts.fn(env, month),
    env.DB.prepare('SELECT stage, COUNT(*) n FROM contacts GROUP BY stage').all(),
    METRICS.followups_done.fn(env, month),
    qy(env, "SELECT COUNT(*) n FROM followups WHERE status != 'done' AND due_at < ?", nowS).first(),
    Promise.all(ADMIN_TABLES.map(async (t) => [t, await one(env, `SELECT COUNT(*) n FROM ${t} WHERE created_at >= ?`, sqlTs(month))])),
    qy(env, `${T_SELECT} WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date < ? ORDER BY t.due_date LIMIT 5`, today).all(),
  ]);
  const status = Object.fromEntries(T_STATUS.map((s) => [s, 0])); for (const r of byStatus.results) if (r.status in status) status[r.status] = r.n;
  const weeks = Array.from({ length: 8 }, (_, i) => ({ week: dayPlus(wk0, i * 7), n: 0 }));
  for (const r of thr.results) { const d = etDay(new Date(r.completed_at)); for (let i = 7; i >= 0; i--) if (d >= weeks[i].week) { weeks[i].n++; break; } }
  const st = Object.fromEntries(STAGES.map((s) => [s, 0])); for (const r of stages.results) if (r.stage in st) st[r.stage] = r.n;
  const subsBy = Object.fromEntries(subs);
  return { as_of: nowS, today_et: today, week_start: week, month_start: month,
    tickets: { open_by_status: Object.fromEntries(T_STATUS.filter((s) => s !== 'done').map((s) => [s, status[s]])), open_total: T_STATUS.filter((s) => s !== 'done').reduce((a, s) => a + status[s], 0), done_total: status.done,
      done_this_week: doneW, done_this_month: doneM, overdue, overdue_list: overdueList.results,
      cycle_time_days: cyc && cyc.n ? Math.round(cyc.d * 100) / 100 : null, cycle_time_sample: (cyc && cyc.n) || 0, throughput: weeks },
    pipeline: { open_value_usd: pipe, won_this_month_usd: won },
    crm: { new_contacts_this_month: newC, contacts_by_stage: st, followups_done_this_month: fuDone, followups_overdue: Number((fuLate && fuLate.n) || 0), submissions_this_month: Object.values(subsBy).reduce((a, b) => a + b, 0), submissions_by_form: subsBy } };
}
async function goalsWithProgress(env) {
  const rows = (await env.DB.prepare('SELECT * FROM kpi_goals WHERE archived = 0 ORDER BY id').all()).results;
  return Promise.all(rows.map(async (g) => { const m = METRICS[g.source]; const start = periodStart(g.period);
    const current = m ? await m.fn(env, start) : Number(g.manual_value || 0); const unit = m ? m.unit : g.unit === 'usd' ? 'usd' : 'count';
    return { ...g, unit, current, period_start: start, pct: g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0 }; }));
}
const fmtVal = (v, unit) => unit === 'usd' ? money(Math.round(Number(v || 0) * 100)) : numFmt(v);
const goalBar = (g, { edit = false } = {}) => `<div class="goal"><div class="gh"><b>${escH(g.name)}</b><span>${escH(fmtVal(g.current, g.unit))} / ${escH(fmtVal(g.target, g.unit))} · ${escH(g.period)}${g.source === 'manual' ? ' · manual' : ''}</span></div>
<div class="gbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${g.pct}" aria-label="${escH(g.name)}"><i style="width:${g.pct}%"${g.pct >= 100 ? ' class="hit"' : ''}></i></div>
${edit ? `<div class="gacts">${g.source === 'manual' ? `<form class="inl" method="post" action="/admin/kpis/goals/${g.id}/value"><input name="manual_value" type="number" step="any" value="${escH(g.manual_value)}" aria-label="Current value" style="width:110px;padding:6px 8px;font-size:13px"> <button class="b sm" type="submit">Update</button></form>` : ''}<a class="b sm" href="/admin/kpis/goals/${g.id}/edit">Edit</a>${delForm(`/admin/kpis/goals/${g.id}/delete`, `Delete goal "${g.name}"?`, '/admin/kpis')}</div>` : ''}</div>`;
function barChart(weeks) {
  const W = 640, H = 200, P = 28, max = Math.max(1, ...weeks.map((w) => w.n)), bw = (W - P * 2) / weeks.length;
  const bars = weeks.map((w, i) => { const h = Math.round(((H - 56) * w.n) / max), x = Math.round(P + i * bw + bw * 0.18), y = H - 30 - h, lab = w.week.slice(5).replace('-', '/');
    return `<rect x="${x}" y="${y}" width="${Math.round(bw * 0.64)}" height="${Math.max(h, 1)}" rx="4" fill="${i === weeks.length - 1 ? '#c8a96a' : '#0d0d0c'}"><title>Week of ${escH(w.week)}: ${w.n}</title></rect><text x="${Math.round(x + bw * 0.32)}" y="${y - 6}" text-anchor="middle" font-size="12" fill="#0d0d0c">${w.n}</text><text x="${Math.round(x + bw * 0.32)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#6d6a64">${escH(lab)}</text>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tickets completed per week, last 8 weeks"><line x1="${P}" y1="${H - 30}" x2="${W - P}" y2="${H - 30}" stroke="#e4e0d8"/>${bars}</svg>`;
}
const hbars = (obj) => { const max = Math.max(1, ...Object.values(obj)); return `<div class="hb">${Object.entries(obj).map(([k, v]) => `<div><span>${escH(cap(k))}</span><i style="width:${Math.round((v / max) * 100)}%"></i><b>${v}</b></div>`).join('')}</div>`; };

async function kpiWidget(env) {
  const [k, goals] = await Promise.all([computeKpis(env), goalsWithProgress(env)]); const t = k.tickets;
  return `<section class="widget"><div class="bar" style="margin:0 0 10px"><h2 style="margin:0">Tickets &amp; KPIs</h2><span class="sp"></span><a class="b sm" href="/admin/tickets">Board</a><a class="b sm" href="/admin/kpis">KPIs</a><a class="b sm dark" href="/admin/tickets/new">+ Ticket</a></div>
<div class="kstats"><a href="/admin/tickets"><b>${t.open_total}</b><span>Open</span></a><a href="/admin/tickets?view=list&amp;overdue=1" class="${t.overdue ? 'late' : ''}"><b>${t.overdue}</b><span>Overdue</span></a><a href="/admin/kpis"><b>${t.done_this_week}</b><span>Done this week</span></a><a href="/admin/kpis"><b>${escH(money(Math.round(k.pipeline.open_value_usd * 100)))}</b><span>Pipeline</span></a></div>
${goals.slice(0, 3).map((g) => goalBar(g)).join('')}</section>`;
}
async function kpiPage(env, url) {
  const [k, goals] = await Promise.all([computeKpis(env), goalsWithProgress(env)]); const t = k.tickets;
  const card = (label, val, sub = '', cls = '') => `<div class="kc ${cls}"><span>${escH(label)}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const srcOpts = `<option value="manual">Manual (I'll type the current value)</option>${Object.entries(METRICS).map(([key, m]) => `<option value="${key}">Auto: ${escH(m.label)}</option>`).join('')}`;
  const body = `<p class="eyebrow">Progress &amp; KPIs · Eastern time · weeks start Monday</p><h1>KPIs <em>&amp; goals</em></h1>
<h2 class="sec">Goals</h2>${goals.length ? goals.map((g) => goalBar(g, { edit: true })).join('') : '<p class="empty">No goals yet. Add one below, e.g. "Sponsorship revenue" $5,000 monthly (auto), or "New brand leads" 10 monthly.</p>'}
<details${goals.length ? '' : ' open'}><summary class="b">+ Add goal</summary>${goalForm({ period: 'monthly', source: 'manual', unit: 'count' }, { action: '/admin/kpis/goals', srcOpts })}</details>
<h2 class="sec">Tickets</h2><div class="kgrid">${card('Open tickets', t.open_total)}${card('Overdue', t.overdue, '', t.overdue ? 'late' : '')}${card('Done this week', t.done_this_week)}${card('Done this month', t.done_this_month)}
${card('Avg cycle time', t.cycle_time_days == null ? '—' : t.cycle_time_days < 1 ? `${numFmt(t.cycle_time_days * 24)} h` : `${numFmt(t.cycle_time_days)} d`, `In progress → done · last 90 days · ${t.cycle_time_sample} ticket${t.cycle_time_sample === 1 ? '' : 's'}`)}
${card('Pipeline (open deals)', escH(money(Math.round(k.pipeline.open_value_usd * 100))), 'Sponsorship-deal tickets not done')}${card('Won this month', escH(money(Math.round(k.pipeline.won_this_month_usd * 100))), 'Sponsorship deals moved to done')}</div>
<div class="kpanels"><div class="widget"><h2>Open by status</h2>${hbars(t.open_by_status)}</div><div class="widget"><h2>Throughput · last 8 weeks</h2>${barChart(t.throughput)}</div></div>
${t.overdue_list.length ? `<div class="widget"><h2>Overdue tickets</h2>${t.overdue_list.map((x) => `<p class="ovl"><a href="/admin/tickets/${x.id}">${escH(tKey(x))} · ${escH(x.title)}</a> <span class="late">due ${escH(x.due_date)}</span></p>`).join('')}</div>` : ''}
<h2 class="sec">CRM</h2><div class="kgrid">${card('New contacts this month', k.crm.new_contacts_this_month)}${card('Website submissions this month', k.crm.submissions_this_month, ADMIN_TABLES.map((x) => `${escH(TABLES[x].label)} ${k.crm.submissions_by_form[x]}`).join(' · '))}
${card('Follow-ups done this month', k.crm.followups_done_this_month)}${card('Follow-ups overdue now', k.crm.followups_overdue, '', k.crm.followups_overdue ? 'late' : '')}</div>
<div class="widget"><h2>Contacts by stage</h2>${hbars(k.crm.contacts_by_stage)}</div>
<p class="eyebrow">As of ${escH(fmtET(k.as_of))} · <a href="/admin/api/kpis">JSON</a></p>`;
  return adminPage('KPIs', 'kpis', body, { msg: url.searchParams.get('msg') || '' });
}
function goalForm(g, { action, srcOpts }) {
  const so = srcOpts.replace(`value="${escH(g.source)}"`, `value="${escH(g.source)}" selected`);
  return `<form class="form" method="post" action="${action}">${field('Goal name *', inp('name', g.name, 'required maxlength="120" placeholder="e.g. Sponsorship revenue"'))}${field('Target *', inp('target', g.target, 'required type="number" step="any" min="0"'))}
${field('Period', `<select name="period">${opts(G_PERIODS, g.period)}</select>`)}${field('Measure', `<select name="source">${so}</select>`)}
${field('Unit (manual goals)', `<select name="unit">${opts(['count', 'usd'], g.unit, (u) => (u === 'usd' ? 'Dollars ($)' : 'Number'))}</select>`)}${field('Current value (manual goals)', inp('manual_value', g.manual_value ?? 0, 'type="number" step="any"'))}
<div class="acts"><button class="btn" type="submit">Save goal</button> <a class="b" href="/admin/kpis">Cancel</a></div></form>`;
}
function goalFromBody(b) {
  const target = Number(b.target), mv = Number(b.manual_value || 0);
  const g = { name: String(b.name || '').trim().slice(0, 120), target: isFinite(target) && target >= 0 ? target : NaN, period: G_PERIODS.includes(b.period) ? b.period : 'monthly',
    source: b.source in METRICS ? b.source : 'manual', unit: b.unit === 'usd' ? 'usd' : 'count', manual_value: isFinite(mv) ? mv : 0 };
  return { g, err: !g.name ? 'Goal name is required.' : !isFinite(g.target) ? 'Target must be a number.' : '' };
}

// Tickets: data
async function projectsAll(env, includeArchived = true) { return (await env.DB.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id) AS n, (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.status != 'done') AS open FROM projects p${includeArchived ? '' : ' WHERE p.archived = 0'} ORDER BY p.archived, p.name COLLATE NOCASE`).all()).results; }
function ticketFromBody(b) {
  const s = (k, n) => String(b[k] ?? '').trim().slice(0, n);
  const pts = s('points', 12), val = s('value', 20).replace(/[$,\s]/g, ''), due = s('due_date', 10);
  const t = { title: s('title', 300), description: s('description', 20000), type: T_TYPES.includes(b.type) ? b.type : 'task', status: T_STATUS.includes(b.status) ? b.status : 'to do',
    priority: T_PRI.includes(b.priority) ? b.priority : 'medium', assignee: s('assignee', 80) || 'Matt', labels: normLabels(b.labels), due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    points: pts !== '' && isFinite(Number(pts)) && Number(pts) >= 0 ? Math.min(Number(pts), 10000) : null,
    value_cents: val !== '' && isFinite(Number(val)) && Number(val) >= 0 ? Math.round(Math.min(Number(val), 1e9) * 100) : null,
    contact_id: intOr(b.contact_id), followup_id: intOr(b.followup_id), parent_id: intOr(b.parent_id), project_id: intOr(b.project_id) };
  return { t, err: !t.title ? 'Title is required.' : '' };
}
const T_LOGGED = ['status', 'priority', 'type', 'assignee', 'due_date', 'title', 'points', 'value_cents', 'parent_id', 'contact_id'];
async function setStatusTimes(t, prevStatus, now) {
  if (t.status === 'in progress' && !t.started_at) t.started_at = now;
  if (t.status === 'done') { if (prevStatus !== 'done' || !t.completed_at) t.completed_at = now; } else t.completed_at = null;
  return t;
}
async function createTicket(env, t) {
  const now = nowIso(); const p = await qy(env, 'SELECT id FROM projects WHERE id = ?', t.project_id).first();
  if (!p) return { err: 'Pick a project.' };
  await setStatusTimes(t, null, now);
  const [, ins] = await env.DB.batch([
    qy(env, 'UPDATE projects SET next_num = next_num + 1, updated_at = ? WHERE id = ?', now, p.id),
    qy(env, `INSERT INTO tickets (project_id, num, title, description, type, status, priority, assignee, labels, due_date, points, value_cents, contact_id, followup_id, parent_id, started_at, completed_at, created_at, updated_at)
      VALUES (?, (SELECT next_num - 1 FROM projects WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, p.id, p.id, t.title, t.description, t.type, t.status, t.priority, t.assignee, t.labels, t.due_date, t.points, t.value_cents,
      t.contact_id, t.followup_id, t.parent_id, t.started_at || null, t.completed_at || null, now, now)]);
  const id = ins.results[0].id;
  await qy(env, "INSERT INTO ticket_history (ticket_id, field, from_value, to_value, at) VALUES (?, 'status', NULL, ?, ?)", id, t.status, now).run();
  return { id };
}
// Apply changes to a ticket and log each changed field in ticket_history (status changes drive cycle-time KPIs).
async function updateTicket(env, cur, changes) {
  const now = nowIso(); const t = { ...cur, ...changes }; await setStatusTimes(t, cur.status, now);
  const hist = T_LOGGED.filter((f) => f in changes && String(cur[f] ?? '') !== String(t[f] ?? '')).map((f) => qy(env, 'INSERT INTO ticket_history (ticket_id, field, from_value, to_value, at) VALUES (?, ?, ?, ?, ?)', cur.id, f, cur[f] == null ? null : String(cur[f]), t[f] == null ? null : String(t[f]), now));
  await env.DB.batch([qy(env, `UPDATE tickets SET title = ?, description = ?, type = ?, status = ?, priority = ?, assignee = ?, labels = ?, due_date = ?, points = ?, value_cents = ?, contact_id = ?, followup_id = ?, parent_id = ?, started_at = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    t.title, t.description, t.type, t.status, t.priority, t.assignee, t.labels, t.due_date, t.points, t.value_cents, t.contact_id, t.followup_id, t.parent_id, t.started_at || null, t.completed_at || null, now, cur.id), ...hist]);
  return t;
}
function ticketFilters(url) {
  const g = (k) => String(url.searchParams.get(k) || '').trim();
  return { project: intOr(g('project')), type: T_TYPES.includes(g('type')) ? g('type') : '', priority: T_PRI.includes(g('priority')) ? g('priority') : '', status: T_STATUS.includes(g('status')) ? g('status') : '',
    label: normLabels(g('label')).split(',')[0] || '', assignee: g('assignee').slice(0, 80), q: g('q').slice(0, 200), overdue: g('overdue') === '1', sort: T_SORTS[g('sort')] ? g('sort') : '', contact: intOr(g('contact')), archived: g('archived') === '1' };
}
function ticketWhere(f) {
  const w = [], a = [];
  if (f.project) { w.push('t.project_id = ?'); a.push(f.project); } else if (!f.archived) w.push('p.archived = 0');
  if (f.type) { w.push('t.type = ?'); a.push(f.type); } if (f.priority) { w.push('t.priority = ?'); a.push(f.priority); } if (f.status) { w.push('t.status = ?'); a.push(f.status); }
  if (f.label) { w.push("(',' || COALESCE(t.labels, '') || ',') LIKE ? ESCAPE '\\'"); a.push('%,' + f.label.replace(/[\\%_]/g, (m) => '\\' + m) + ',%'); }
  if (f.assignee) { w.push('t.assignee = ? COLLATE NOCASE'); a.push(f.assignee); } if (f.contact) { w.push('t.contact_id = ?'); a.push(f.contact); }
  if (f.overdue) { w.push("t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date < ?"); a.push(todayET()); }
  if (f.q) { const like = '%' + f.q.replace(/[\\%_]/g, (m) => '\\' + m) + '%'; const km = f.q.match(/^([A-Za-z0-9]+)-(\d+)$/);
    w.push(`(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR t.labels LIKE ? ESCAPE '\\' OR t.assignee LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\'${km ? ' OR (p.key = ? AND t.num = ?)' : ''})`); a.push(like, like, like, like, like); if (km) a.push(km[1].toUpperCase(), +km[2]); }
  return { sql: w.length ? ' WHERE ' + w.join(' AND ') : '', args: a };
}
const ticketsQuery = (env, f, order, limit = 2000) => { const { sql, args } = ticketWhere(f); return qy(env, `${T_SELECT}${sql} ORDER BY ${order} LIMIT ${limit}`, ...args).all(); };
async function assigneesAndLabels(env) {
  const r = (await env.DB.prepare("SELECT DISTINCT assignee, labels FROM tickets").all()).results;
  const as = new Set(['Matt']), ls = new Set(); for (const x of r) { if (x.assignee) as.add(x.assignee); for (const l of String(x.labels || '').split(',')) if (l) ls.add(l); }
  return { assignees: [...as].sort(), labels: [...ls].sort() };
}

// Tickets: views
const priBadge = (p) => `<span class="pri pri-${escH(p)}" title="Priority: ${escH(p)}">${escH(p)}</span>`;
const lateDue = (t) => t.due_date && t.status !== 'done' && t.due_date < todayET();
const labelChips = (labels) => String(labels || '').split(',').filter(Boolean).map((l) => `<a class="lbl" href="/admin/tickets?view=list&amp;label=${encodeURIComponent(l)}">${escH(l)}</a>`).join('');
function ticketCard(t, back) {
  return `<article class="tk" draggable="true" data-id="${t.id}" data-status="${escH(t.status)}" style="--pc:${escH(safeColor(t.pcolor))}">
<div class="tk-top"><a class="tk-key" href="/admin/tickets/${t.id}">${escH(tKey(t))}</a>${priBadge(t.priority)}<span class="tk-type">${escH(t.type)}</span></div>
<a class="tk-t" href="/admin/tickets/${t.id}">${escH(t.title)}</a>
<div class="tk-m">${t.due_date ? `<span class="${lateDue(t) ? 'late' : ''}">Due ${escH(t.due_date)}</span>` : ''}${t.points != null ? `<span>${escH(numFmt(t.points))} pt</span>` : ''}${t.value_cents != null ? `<span>${escH(money(t.value_cents))}</span>` : ''}${t.contact_name ? `<span>${escH(t.contact_name)}</span>` : ''}<span class="who" title="Assignee">${escH(t.assignee || '')}</span></div>
${t.labels ? `<div class="tk-l">${labelChips(t.labels)}</div>` : ''}
<form class="mv" method="post" action="/admin/tickets/${t.id}/move"><input type="hidden" name="back" value="${escH(back)}"><select name="status" aria-label="Move ${escH(tKey(t))} to">${opts(T_STATUS, t.status)}</select><button class="b sm" type="submit">Move</button></form></article>`;
}
async function filterBar(env, f, view) {
  const [ps, al] = await Promise.all([projectsAll(env), assigneesAndLabels(env)]);
  return `<form class="filters tf" method="get" action="/admin/tickets"><input type="hidden" name="view" value="${view}">
${view === 'list' ? `<input class="q" type="search" name="q" value="${escH(f.q)}" placeholder="Search title, description, MM-12…" aria-label="Search">` : ''}
<select name="project" aria-label="Project"><option value="">All projects</option>${ps.map((p) => `<option value="${p.id}"${p.id === f.project ? ' selected' : ''}>${escH(p.key)} · ${escH(p.name)}${p.archived ? ' (archived)' : ''}</option>`).join('')}</select>
<select name="type" aria-label="Type"><option value="">All types</option>${opts(T_TYPES, f.type)}</select><select name="priority" aria-label="Priority"><option value="">Any priority</option>${opts(T_PRI, f.priority)}</select>
${view === 'list' ? `<select name="status" aria-label="Status"><option value="">Any status</option>${opts(T_STATUS, f.status)}</select>` : ''}
<select name="label" aria-label="Label"><option value="">Any label</option>${opts(al.labels, f.label, (x) => x)}</select><select name="assignee" aria-label="Assignee"><option value="">Anyone</option>${opts(al.assignees, f.assignee, (x) => x)}</select>
${view === 'list' ? `<select name="sort" aria-label="Sort">${opts(Object.keys(T_SORTS), f.sort || 'updated', (s) => 'Sort: ' + s)}</select><label class="chk"><input type="checkbox" name="overdue" value="1"${f.overdue ? ' checked' : ''}> Overdue</label>` : ''}
<button class="b" type="submit">Filter</button></form>`;
}
const qsOf = (url) => { const u = new URLSearchParams(url.searchParams); u.delete('msg'); return u.toString(); };
async function boardPage(env, url) {
  const f = ticketFilters(url); const back = '/admin/tickets' + (qsOf(url) ? '?' + qsOf(url) : '');
  const since = isoOf(new Date(Date.now() - 30 * 864e5));
  const rows = (await ticketsQuery(env, f, `${PRI_SQL}, t.due_date IS NULL, t.due_date, t.updated_at DESC`)).results.filter((t) => t.status !== 'done' || (t.completed_at || '') >= since);
  const cols = T_STATUS.map((s) => { const list = rows.filter((t) => t.status === s);
    return `<section class="col" data-status="${escH(s)}"><h3>${escH(cap(s))} <span class="cnt">${list.length}</span></h3><div class="drop" data-status="${escH(s)}">${list.map((t) => ticketCard(t, back)).join('')}</div></section>`; }).join('');
  const body = `<p class="eyebrow">Tickets · drag cards between columns (desktop) or use Move (phone) · Done shows the last 30 days</p><h1>Board</h1>
<div class="bar"><a class="b dark" href="/admin/tickets/new${f.project ? `?project_id=${f.project}` : ''}">+ Ticket</a><a class="b" href="/admin/tickets?view=list">List</a><a class="b" href="/admin/tickets/projects">Projects</a><a class="b" href="/admin/kpis">KPIs</a><span class="sp"></span><a class="b" href="/admin/tickets.csv${qsOf(url) ? '?' + escH(qsOf(url)) : ''}">CSV</a></div>
${await filterBar(env, f, 'board')}<div class="board" data-board>${cols}</div>`;
  return adminPage('Board', 'tickets', body, { msg: url.searchParams.get('msg') || '' });
}
async function listPage(env, url) {
  const f = ticketFilters(url); const back = '/admin/tickets' + (qsOf(url) ? '?' + qsOf(url) : '');
  const rows = (await ticketsQuery(env, f, T_SORTS[f.sort || 'updated'], 1000)).results;
  const tr = (t) => `<tr><td><a href="/admin/tickets/${t.id}">${escH(tKey(t))}</a></td><td class="tt"><a href="/admin/tickets/${t.id}">${escH(t.title)}</a>${t.labels ? `<div class="tk-l">${labelChips(t.labels)}</div>` : ''}</td><td>${escH(t.type)}</td><td><span class="badge st-${escH(t.status.replace(' ', '-'))}">${escH(t.status)}</span></td><td>${priBadge(t.priority)}</td><td>${escH(t.assignee || '')}</td><td class="${lateDue(t) ? 'late' : ''}">${escH(t.due_date || '')}</td><td>${t.points != null ? escH(numFmt(t.points)) : ''}</td><td>${t.value_cents != null ? escH(money(t.value_cents)) : ''}</td></tr>`;
  const body = `<p class="eyebrow">Tickets · backlog &amp; list · ${rows.length} shown</p><h1>Tickets <em>list</em></h1>
<div class="bar"><a class="b dark" href="/admin/tickets/new">+ Ticket</a><a class="b" href="/admin/tickets">Board</a><a class="b" href="/admin/tickets/projects">Projects</a><span class="sp"></span><a class="b" href="/admin/tickets.csv${qsOf(url) ? '?' + escH(qsOf(url)) : ''}">CSV</a></div>
${await filterBar(env, f, 'list')}${rows.length ? `<div class="tw"><table class="tl2"><thead><tr><th>Key</th><th>Title</th><th>Type</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th><th>Pts</th><th>Value</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>` : '<p class="empty">No tickets match.</p>'}`;
  return adminPage('Tickets', 'tickets', body, { msg: url.searchParams.get('msg') || '' });
}
async function ticketForm(env, t, { action, title, back, err = '' }) {
  const ps = await projectsAll(env, false);
  const cs = (await env.DB.prepare('SELECT id, name, company FROM contacts ORDER BY name COLLATE NOCASE LIMIT 1000').all()).results;
  const fus = (await env.DB.prepare(`${FU_LIST_SQL} WHERE f.status != 'done' OR f.id = ${intOr(t.followup_id, 0)} ORDER BY f.due_at LIMIT 300`).all()).results;
  const par = (await qy(env, "SELECT t.id, t.num, t.title, p.key AS pkey FROM tickets t JOIN projects p ON p.id = t.project_id WHERE t.id != ? AND (t.status != 'done' OR t.id = ?) ORDER BY t.updated_at DESC LIMIT 300", t.id || 0, intOr(t.parent_id, 0)).all()).results;
  const sel = (name, rows, cur, lab, none) => `<select name="${name}"><option value="">${none}</option>${rows.map((r) => `<option value="${r.id}"${r.id === intOr(cur) ? ' selected' : ''}>${escH(lab(r))}</option>`).join('')}</select>`;
  return `${err ? `<p class="msg err" role="alert">${escH(err)}</p>` : ''}<form class="form" method="post" action="${action}"><input type="hidden" name="back" value="${escH(back)}">
${title ? `<h2 class="sec wide">${escH(title)}</h2>` : ''}
${field('Title *', inp('title', t.title, 'required maxlength="300"'), true)}
${t.id ? field('Project', `<input value="${escH(`${t.pkey} · ${t.project_name}`)}" disabled>`) : field('Project', `<select name="project_id">${ps.map((p) => `<option value="${p.id}"${p.id === intOr(t.project_id) ? ' selected' : ''}>${escH(p.key)} · ${escH(p.name)}</option>`).join('')}</select>`)}
${field('Type', `<select name="type">${opts(T_TYPES, t.type || 'task')}</select>`)}${field('Status', `<select name="status">${opts(T_STATUS, t.status || 'to do')}</select>`)}${field('Priority', `<select name="priority">${opts(T_PRI, t.priority || 'medium')}</select>`)}
${field('Assignee', inp('assignee', t.assignee ?? 'Matt', 'maxlength="80"'))}${field('Labels', inp('labels', String(t.labels || '').split(',').join(', '), 'maxlength="400" placeholder="comma, separated"'))}
${field('Due date', inp('due_date', t.due_date, 'type="date"'))}${field('Story points / estimate', inp('points', t.points, 'type="number" step="any" min="0"'))}${field('Value ($, for deals)', inp('value', t.value_cents != null ? t.value_cents / 100 : '', 'type="number" step="0.01" min="0" placeholder="e.g. 5000"'))}
${field('Contact', sel('contact_id', cs, t.contact_id, (c) => c.name + (c.company ? ` · ${c.company}` : ''), '— none —'))}${field('Follow-up', sel('followup_id', fus, t.followup_id, (f) => `${fmtWhen(f.due_at)} · ${f.title}${f.contact_name ? ` (${f.contact_name})` : ''}`, '— none —'))}
${field('Parent ticket (makes this a subtask)', sel('parent_id', par, t.parent_id, (x) => `${x.pkey}-${x.num} · ${x.title}`, '— none —'))}
${field('Description (line breaks, **bold**, `code`, "- " lists, links)', `<textarea name="description" maxlength="20000" rows="8">${escH(t.description || '')}</textarea>`, true)}
<div class="acts"><button class="btn" type="submit">Save ticket</button> <a class="b" href="${escH(back)}">Cancel</a></div></form>`;
}
const HIST_LABEL = { status: 'Status', priority: 'Priority', type: 'Type', assignee: 'Assignee', due_date: 'Due date', title: 'Title', points: 'Points', value_cents: 'Value', parent_id: 'Parent', contact_id: 'Contact' };
const histVal = (f, v) => v == null || v === '' ? '—' : f === 'value_cents' ? money(v) : (f === 'parent_id' || f === 'contact_id') ? '#' + v : v;
async function ticketDetail(env, url, id) {
  const t = await qy(env, `${T_SELECT} WHERE t.id = ?`, id).first();
  if (!t) return adminPage('Not found', 'tickets', '<h1>Ticket not found</h1><p><a href="/admin/tickets">← Board</a></p>', { status: 404 });
  const [cm, hi, subs, par, fu] = await Promise.all([qy(env, 'SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at, id', id).all(), qy(env, 'SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY at DESC, id DESC LIMIT 300', id).all(),
    qy(env, `${T_SELECT} WHERE t.parent_id = ? ORDER BY t.status = 'done', ${PRI_SQL}`, id).all(), t.parent_id ? qy(env, `${T_SELECT} WHERE t.id = ?`, t.parent_id).first() : null, t.followup_id ? qy(env, 'SELECT * FROM followups WHERE id = ?', t.followup_id).first() : null]);
  const back = `/admin/tickets/${id}`; const dd = (l, v) => `<div><dt>${escH(l)}</dt><dd>${v || '<span style="color:#b3aea5">—</span>'}</dd></div>`;
  const body = `<p class="eyebrow"><a href="/admin/tickets">Board</a> · <a href="/admin/tickets?view=list&amp;project=${t.project_id}">${escH(t.project_name)}</a>${par ? ` · subtask of <a href="/admin/tickets/${par.id}">${escH(tKey(par))}</a>` : ''}</p>
<h1><span class="tk-key big">${escH(tKey(t))}</span> ${escH(t.title)}</h1>
<div class="bar">${priBadge(t.priority)}<span class="badge st-${escH(t.status.replace(' ', '-'))}">${escH(t.status)}</span><span class="tk-type">${escH(t.type)}</span><span class="sp"></span>
<form class="inl mvd" method="post" action="/admin/tickets/${id}/move"><input type="hidden" name="back" value="${back}"><select name="status" aria-label="Status">${opts(T_STATUS, t.status)}</select> <button class="b sm dark" type="submit">Set status</button></form>
<a class="b" href="/admin/tickets/${id}/edit">Edit</a><a class="b" href="/admin/tickets/new?parent_id=${id}">+ Subtask</a>${delForm(`/admin/tickets/${id}/delete`, `Delete ${tKey(t)} "${t.title}"? Comments and history go too; subtasks are kept (unlinked).`)}</div>
<article class="card"><dl>${dd('Assignee', escH(t.assignee))}${dd('Due', t.due_date ? `<span class="${lateDue(t) ? 'late' : ''}">${escH(t.due_date)}</span>` : '')}${dd('Story points', t.points != null ? escH(numFmt(t.points)) : '')}${dd('Value', t.value_cents != null ? escH(money(t.value_cents)) : '')}
${dd('Labels', labelChips(t.labels))}${dd('Contact', t.contact_id ? `<a href="/admin/contacts/${t.contact_id}">${escH(t.contact_name || 'Contact #' + t.contact_id)}</a>` : '')}${dd('Follow-up', fu ? `<a href="/admin/followups/${fu.id}">${escH(fu.title)}</a> · ${escH(fmtWhen(fu.due_at))}${fu.status === 'done' ? ' · done' : ''}` : '')}
${dd('Created', escH(fmtET(t.created_at)))}${dd('Started', escH(fmtET(t.started_at)))}${dd('Completed', escH(fmtET(t.completed_at)))}${dd('Updated', escH(fmtET(t.updated_at)))}</dl>
${t.description ? `<div class="md">${mdLite(t.description)}</div>` : ''}</article>
<h2 class="sec">Subtasks (${subs.results.length})</h2>${subs.results.length ? subs.results.map((s) => `<p class="sub"><a href="/admin/tickets/${s.id}">${escH(tKey(s))} · ${escH(s.title)}</a> <span class="badge st-${escH(s.status.replace(' ', '-'))}">${escH(s.status)}</span></p>`).join('') : '<p class="empty">No subtasks.</p>'}
<h2 class="sec">Comments (${cm.results.length})</h2>${cm.results.map((c) => `<div class="cmt"><div class="when">${escH(c.author || 'Matt')} · ${escH(fmtET(c.created_at))} ${delForm(`/admin/tickets/${id}/comments/${c.id}/delete`, 'Delete this comment?', back, '×')}</div><div class="md">${mdLite(c.body)}</div></div>`).join('')}
<form class="form" method="post" action="/admin/tickets/${id}/comments">${field('Add a comment', '<textarea name="body" required maxlength="10000" placeholder="Update, decision, link…"></textarea>', true)}<div class="acts"><button class="btn" type="submit">Comment</button></div></form>
<h2 class="sec">History</h2>${hi.results.length ? `<ul class="tl">${hi.results.map((h) => `<li class="system"><div class="when">${escH(fmtET(h.at))}</div><div class="body">${h.from_value == null && h.field === 'status' ? `Created in ${escH(h.to_value)}` : `${escH(HIST_LABEL[h.field] || h.field)}: ${escH(histVal(h.field, h.from_value))} → ${escH(histVal(h.field, h.to_value))}`}</div></li>`).join('')}</ul>` : '<p class="empty">No history.</p>'}`;
  return adminPage(tKey(t), 'tickets', body, { msg: url.searchParams.get('msg') || '' });
}
async function contactTickets(env, c) {
  const rows = (await qy(env, `${T_SELECT} WHERE t.contact_id = ? ORDER BY t.status = 'done', ${PRI_SQL}, t.updated_at DESC LIMIT 100`, c.id).all()).results;
  return `<h2 class="sec" id="tickets">Tickets (${rows.length})</h2><div class="bar"><a class="b dark" href="/admin/tickets/new?contact_id=${c.id}">+ Create ticket</a><span class="sp"></span></div>
${rows.length ? rows.map((t) => `<p class="sub"><a href="/admin/tickets/${t.id}">${escH(tKey(t))} · ${escH(t.title)}</a> ${priBadge(t.priority)} <span class="badge st-${escH(t.status.replace(' ', '-'))}">${escH(t.status)}</span>${t.value_cents != null ? ` <span class="meta" style="display:inline">${escH(money(t.value_cents))}</span>` : ''}</p>`).join('') : '<p class="empty">No tickets linked to this contact.</p>'}`;
}
async function projectsPage(env, url) {
  const ps = await projectsAll(env);
  const body = `<p class="eyebrow"><a href="/admin/tickets">Board</a> · projects</p><h1>Projects</h1>
${ps.map((p) => `<article class="card fu"><div class="fu-main"><h3><span class="dot" style="background:${escH(safeColor(p.color))}"></span> ${escH(p.name)} <span class="tk-key">${escH(p.key)}</span>${p.archived ? ' <span class="badge">archived</span>' : ''}</h3><p class="meta">${p.n} ticket${p.n === 1 ? '' : 's'} · ${p.open} open · <a href="/admin/tickets?project=${p.id}">Board</a></p></div>
<div class="fu-acts"><form class="inl pform" method="post" action="/admin/tickets/projects/${p.id}"><input name="name" value="${escH(p.name)}" maxlength="80" aria-label="Name" required><input type="color" name="color" value="${escH(safeColor(p.color))}" aria-label="Color"><label class="chk"><input type="checkbox" name="archived" value="1"${p.archived ? ' checked' : ''}> Archived</label><button class="b sm" type="submit">Save</button></form>
${p.n ? '' : delForm(`/admin/tickets/projects/${p.id}/delete`, `Delete project ${p.key}?`, '/admin/tickets/projects')}</div></article>`).join('')}
<h2 class="sec">New project</h2><form class="form" method="post" action="/admin/tickets/projects">${field('Name *', inp('name', '', 'required maxlength="80" placeholder="e.g. St. Pete Marathon"'))}${field('Key * (2–6 letters/numbers, used in ticket IDs, can\'t change later)', inp('key', '', 'required maxlength="6" pattern="[A-Za-z][A-Za-z0-9]{1,5}" placeholder="SPM" style="text-transform:uppercase"'))}
${field('Color', '<input type="color" name="color" value="#0d0d0c">')}<div class="acts"><button class="btn" type="submit">Create project</button></div></form>`;
  return adminPage('Projects', 'tickets', body, { msg: url.searchParams.get('msg') || '', err: /exists|must|required/i.test(url.searchParams.get('msg') || '') });
}
async function ticketsCsv(env, url) {
  const rows = (await ticketsQuery(env, ticketFilters(url), 'p.key, t.num', 20000)).results;
  const cols = ['key', 'title', 'project', 'type', 'status', 'priority', 'assignee', 'labels', 'due_date', 'points', 'value_usd', 'contact', 'parent_id', 'description', 'created_at_et', 'started_at_et', 'completed_at_et', 'updated_at_et'];
  const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const val = (t, k) => ({ key: tKey(t), project: t.project_name, value_usd: t.value_cents != null ? (t.value_cents / 100).toFixed(2) : '', contact: t.contact_name, created_at_et: fmtET(t.created_at), started_at_et: fmtET(t.started_at), completed_at_et: fmtET(t.completed_at), updated_at_et: fmtET(t.updated_at) }[k] ?? t[k]);
  const out = [cols.join(','), ...rows.map((t) => cols.map((k) => q(val(t, k))).join(','))].join('\r\n');
  return new Response('\ufeff' + out + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="morrow-media-tickets-${todayET()}.csv"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

// Tickets: JSON API (GET, session required)
async function ticketsApi(env, url, p) {
  if (p === '/admin/api/projects') return adminJson({ ok: true, rows: await projectsAll(env) });
  if (p === '/admin/api/tickets') return adminJson({ ok: true, rows: (await ticketsQuery(env, { ...ticketFilters(url), archived: true }, 'p.key, t.num', 5000)).results.map((t) => ({ ...t, key: tKey(t) })) });
  let m = p.match(/^\/admin\/api\/tickets\/(\d+)$/);
  if (m) { const t = await qy(env, `${T_SELECT} WHERE t.id = ?`, +m[1]).first(); if (!t) return adminJson({ ok: false, error: 'Not found' }, 404);
    const [c, h, s] = await Promise.all([qy(env, 'SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY id', t.id).all(), qy(env, 'SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY id', t.id).all(), qy(env, 'SELECT id FROM tickets WHERE parent_id = ?', t.id).all()]);
    return adminJson({ ok: true, ticket: { ...t, key: tKey(t) }, comments: c.results, history: h.results, subtasks: s.results.map((x) => x.id) }); }
  if (p === '/admin/api/kpis') return adminJson({ ok: true, kpis: await computeKpis(env), goals: await goalsWithProgress(env) });
  if (p === '/admin/api/goals') return adminJson({ ok: true, rows: await goalsWithProgress(env), metrics: Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, { label: m.label, unit: m.unit }])) });
  return null;
}
// Tickets: pages + actions (session already verified; cross-site POSTs already rejected in admin())
async function ticketsRoute(req, env, url, p) {
  const GET = req.method === 'GET' || req.method === 'HEAD', POST = req.method === 'POST';
  const body = async () => { try { return await readBody(req); } catch { return {}; } };
  const wantsJson = (req.headers.get('accept') || '').includes('application/json');
  let m;
  if (p === '/admin/kpis' && GET) return kpiPage(env, url);
  if (p === '/admin/kpis/goals' && POST) { const { g, err } = goalFromBody(await body()); if (err) return goTo(withMsg('/admin/kpis', err)); const now = nowIso();
    await qy(env, 'INSERT INTO kpi_goals (name, target, period, source, manual_value, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', g.name, g.target, g.period, g.source, g.manual_value, g.unit, now, now).run(); return goTo(withMsg('/admin/kpis', 'Goal added.')); }
  if ((m = p.match(/^\/admin\/kpis\/goals\/(\d+)(?:\/(edit|value|delete))?$/))) {
    const id = +m[1], act = m[2] || ''; const g = await qy(env, 'SELECT * FROM kpi_goals WHERE id = ?', id).first();
    if (!g) return GET ? adminPage('Not found', 'kpis', '<h1>Goal not found</h1><p><a href="/admin/kpis">← KPIs</a></p>', { status: 404 }) : goTo(withMsg('/admin/kpis', 'That goal no longer exists.'));
    if (act === 'edit' && GET) return adminPage('Edit goal', 'kpis', `<p class="eyebrow"><a href="/admin/kpis">KPIs</a> · edit goal</p><h1>${escH(g.name)}</h1>${goalForm(g, { action: `/admin/kpis/goals/${id}`, srcOpts: `<option value="manual">Manual (I'll type the current value)</option>${Object.entries(METRICS).map(([key, x]) => `<option value="${key}">Auto: ${escH(x.label)}</option>`).join('')}` })}`);
    if (!POST) return null; const b = await body();
    if (act === 'delete') { await qy(env, 'DELETE FROM kpi_goals WHERE id = ?', id).run(); return goTo(withMsg('/admin/kpis', 'Goal deleted.')); }
    if (act === 'value') { const v = Number(b.manual_value); if (!isFinite(v)) return goTo(withMsg('/admin/kpis', 'Enter a number.')); await qy(env, 'UPDATE kpi_goals SET manual_value = ?, updated_at = ? WHERE id = ?', v, nowIso(), id).run(); return goTo(withMsg('/admin/kpis', 'Progress updated.')); }
    if (act === '') { const { g: n, err } = goalFromBody(b); if (err) return goTo(withMsg(`/admin/kpis/goals/${id}/edit`, err));
      await qy(env, 'UPDATE kpi_goals SET name = ?, target = ?, period = ?, source = ?, manual_value = ?, unit = ?, updated_at = ? WHERE id = ?', n.name, n.target, n.period, n.source, n.manual_value, n.unit, nowIso(), id).run(); return goTo(withMsg('/admin/kpis', 'Goal saved.')); }
    return null;
  }
  if (!p.startsWith('/admin/tickets')) return null;
  if (p === '/admin/tickets' && GET) return url.searchParams.get('view') === 'list' ? listPage(env, url) : boardPage(env, url);
  if (p === '/admin/tickets.csv' && GET) return ticketsCsv(env, url);
  if (p === '/admin/tickets/projects' && GET) return projectsPage(env, url);
  if (p === '/admin/tickets/projects' && POST) { const b = await body(); const name = String(b.name || '').trim().slice(0, 80), key = String(b.key || '').trim().toUpperCase();
    if (!name || !/^[A-Z][A-Z0-9]{1,5}$/.test(key)) return goTo(withMsg('/admin/tickets/projects', 'Name is required and the key must be 2–6 letters/numbers, starting with a letter.'));
    if (await qy(env, 'SELECT id FROM projects WHERE key = ?', key).first()) return goTo(withMsg('/admin/tickets/projects', `A project with key ${key} already exists.`));
    const now = nowIso(); await qy(env, 'INSERT INTO projects (name, key, color, archived, next_num, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)', name, key, safeColor(b.color), now, now).run();
    return goTo(withMsg('/admin/tickets/projects', `Project ${key} created.`)); }
  if ((m = p.match(/^\/admin\/tickets\/projects\/(\d+)(\/delete)?$/)) && POST) { const id = +m[1], b = await body(); const pr = await qy(env, 'SELECT p.*, (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id) n FROM projects p WHERE p.id = ?', id).first();
    if (!pr) return goTo(withMsg('/admin/tickets/projects', 'That project no longer exists.'));
    if (m[2]) { if (pr.n) return goTo(withMsg('/admin/tickets/projects', 'Projects with tickets can\'t be deleted. Archive it instead.')); await qy(env, 'DELETE FROM projects WHERE id = ?', id).run(); return goTo(withMsg('/admin/tickets/projects', `Project ${pr.key} deleted.`)); }
    const name = String(b.name || '').trim().slice(0, 80) || pr.name; await qy(env, 'UPDATE projects SET name = ?, color = ?, archived = ?, updated_at = ? WHERE id = ?', name, safeColor(b.color || pr.color), b.archived ? 1 : 0, nowIso(), id).run();
    return goTo(withMsg('/admin/tickets/projects', `Project ${pr.key} saved.`)); }
  if (p === '/admin/tickets/new' && GET) {
    const q = (k) => url.searchParams.get(k); const par = intOr(q('parent_id')) ? await qy(env, 'SELECT * FROM tickets WHERE id = ?', intOr(q('parent_id'))).first() : null;
    const def = await env.DB.prepare("SELECT id FROM projects WHERE archived = 0 ORDER BY key = 'MM' DESC, id LIMIT 1").first();
    const t = { project_id: par ? par.project_id : intOr(q('project_id')) || (def && def.id), contact_id: intOr(q('contact_id')) || (par && par.contact_id), parent_id: par && par.id, status: T_STATUS.includes(q('status')) ? q('status') : 'to do', type: T_TYPES.includes(q('type')) ? q('type') : 'task', assignee: 'Matt' };
    const back = safeBack(q('back'), t.contact_id && !par ? `/admin/contacts/${t.contact_id}#tickets` : par ? `/admin/tickets/${par.id}` : '/admin/tickets');
    return adminPage('New ticket', 'tickets', `<p class="eyebrow"><a href="/admin/tickets">Board</a> · new ticket</p><h1>New <em>ticket</em></h1>${await ticketForm(env, t, { action: '/admin/tickets', title: '', back })}`);
  }
  if (p === '/admin/tickets' && POST) { const b = await body(); const { t, err } = ticketFromBody(b);
    if (err) return adminPage('New ticket', 'tickets', `<h1>New <em>ticket</em></h1>${await ticketForm(env, t, { action: '/admin/tickets', back: safeBack(b.back, '/admin/tickets'), err })}`, { status: 400 });
    const r = await createTicket(env, t); if (r.err) return goTo(withMsg('/admin/tickets', r.err));
    if (t.contact_id) await logActivity(env, t.contact_id, 'system', `Ticket created: ${t.title}`);
    return goTo(withMsg(`/admin/tickets/${r.id}`, 'Ticket created.')); }
  if (!(m = p.match(/^\/admin\/tickets\/(\d+)(?:\/(edit|move|delete|comments)(?:\/(\d+)\/delete)?)?$/))) return null;
  const id = +m[1], act = m[2] || '', cid = m[3] ? +m[3] : null;
  if (!act && GET) return ticketDetail(env, url, id);
  const cur = await qy(env, `${T_SELECT} WHERE t.id = ?`, id).first();
  if (act === 'edit' && GET) { if (!cur) return goTo(withMsg('/admin/tickets', 'That ticket no longer exists.'));
    return adminPage('Edit ' + tKey(cur), 'tickets', `<p class="eyebrow"><a href="/admin/tickets/${id}">${escH(tKey(cur))}</a> · edit</p><h1>Edit <em>ticket</em></h1>${await ticketForm(env, cur, { action: `/admin/tickets/${id}`, back: `/admin/tickets/${id}` })}`); }
  if (!POST) return null;
  if (!cur) return wantsJson ? adminJson({ ok: false, error: 'Not found' }, 404) : goTo(withMsg('/admin/tickets', 'That ticket no longer exists.'));
  const b = await body(); const back = safeBack(b.back, `/admin/tickets/${id}`);
  if (act === 'move') { if (!T_STATUS.includes(b.status)) return wantsJson ? adminJson({ ok: false, error: 'Bad status' }, 400) : goTo(withMsg(back, 'Pick a valid status.'));
    const t = await updateTicket(env, cur, { status: b.status });
    return wantsJson ? adminJson({ ok: true, id, status: t.status, completed_at: t.completed_at }) : goTo(withMsg(back, cur.status === t.status ? 'No change.' : `${tKey(cur)} moved to ${t.status}.`)); }
  if (act === 'comments') {
    if (cid) { await qy(env, 'DELETE FROM ticket_comments WHERE id = ? AND ticket_id = ?', cid, id).run(); return goTo(withMsg(back, 'Comment deleted.')); }
    const text = String(b.body || '').trim().slice(0, 10000); if (!text) return goTo(withMsg(back, 'Write something first.'));
    await env.DB.batch([qy(env, 'INSERT INTO ticket_comments (ticket_id, body, author, created_at) VALUES (?, ?, ?, ?)', id, text, 'Matt', nowIso()), qy(env, 'UPDATE tickets SET updated_at = ? WHERE id = ?', nowIso(), id)]);
    return goTo(withMsg(back, 'Comment added.')); }
  if (act === 'delete') { await env.DB.batch([qy(env, 'UPDATE tickets SET parent_id = NULL WHERE parent_id = ?', id), qy(env, 'DELETE FROM ticket_comments WHERE ticket_id = ?', id), qy(env, 'DELETE FROM ticket_history WHERE ticket_id = ?', id), qy(env, 'DELETE FROM tickets WHERE id = ?', id)]);
    return goTo(withMsg(safeBack(b.back, '/admin/tickets'), `${tKey(cur)} deleted.`)); }
  if (!act) { const { t, err } = ticketFromBody(b); if (err) return goTo(withMsg(`/admin/tickets/${id}/edit`, err));
    delete t.project_id; if (t.parent_id === id) t.parent_id = null;
    if (t.parent_id) { let x = t.parent_id, hops = 0; while (x && hops++ < 20) { if (x === id) { t.parent_id = null; break; } const r = await qy(env, 'SELECT parent_id FROM tickets WHERE id = ?', x).first(); x = r && r.parent_id; } }
    await updateTicket(env, cur, t); return goTo(withMsg(`/admin/tickets/${id}`, 'Saved.')); }
  return null;
}
const TICKETS_CSS = `.board{display:grid;grid-template-columns:repeat(5,minmax(220px,1fr));gap:12px;overflow-x:auto;padding-bottom:12px;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory}
.col{background:var(--sand);border-radius:14px;padding:10px;min-width:0;scroll-snap-align:start;display:flex;flex-direction:column}.col h3{font:600 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;margin:4px 4px 10px;display:flex;justify-content:space-between}.col .cnt{color:var(--muted)}
.drop{flex:1;min-height:80px;border-radius:10px;transition:background .15s}.drop.over{background:#e9e3d6;outline:2px dashed var(--stone)}
.tk{background:#fff;border:1px solid var(--line);border-left:4px solid var(--pc,#0d0d0c);border-radius:10px;padding:10px 11px;margin-bottom:8px;cursor:grab}.tk.dragging{opacity:.45}
.tk-top{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px}.tk-key{font:600 11px/1 var(--sans);letter-spacing:.06em;color:var(--muted);text-decoration:none}.tk-key.big{font-size:.5em;vertical-align:middle;margin-right:6px}
.tk-type{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.tk-t{display:block;font-weight:600;text-decoration:none;overflow-wrap:anywhere;line-height:1.35}
.tk-m{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px;color:var(--muted);margin-top:6px}.tk-m .who{margin-left:auto}.tk-l{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.lbl{font-size:10.5px;background:var(--sand);border-radius:999px;padding:3px 8px;text-decoration:none}.tk .lbl{background:#f6f3ec}
.pri{font:600 9.5px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;padding:4px 6px;border-radius:999px;background:#eceae5}.pri-urgent{background:#a33;color:#fff}.pri-high{background:#f3dcc8}.pri-low{background:#f2f2f0;color:var(--muted)}
.mv{display:none;gap:6px;margin-top:8px}.mv select{width:auto;flex:1;padding:6px 8px;font-size:13px;border-radius:999px}.mvd select{width:auto;padding:7px 10px;font-size:13px;border-radius:999px}
.badge.st-done{background:#e6f2e8}.badge.st-in-progress{background:#e8eef7}.badge.st-review{background:#f1e8f7}.badge.st-backlog{background:#eceae5}
.tf{grid-template-columns:repeat(6,minmax(0,1fr)) auto}.tf .q{grid-column:1/-1}.chk{display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap}.chk input{width:auto}
.tw{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px}.tl2{width:100%;border-collapse:collapse;font-size:14px}.tl2 th{font:500 10.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);text-align:left;padding:12px 10px;background:var(--sand);white-space:nowrap}
.tl2 td{padding:10px;border-top:1px solid var(--line);vertical-align:top;white-space:nowrap}.tl2 td.tt{white-space:normal;min-width:220px}.tl2 a{text-decoration:none}.tl2 td.tt a{font-weight:600}
.md{margin-top:12px;overflow-wrap:anywhere;line-height:1.55}.md p{margin:0 0 10px}.md ul{margin:0 0 10px;padding-left:20px}.md code{background:var(--sand);padding:1px 5px;border-radius:4px;font-size:.92em}.md .mdh{font-weight:700}
.cmt{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:8px}.cmt .when{color:var(--muted);font-size:12.5px}.cmt .md{margin-top:4px}.sub{margin:0 0 8px}.sub a{font-weight:600}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle}.pform{display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center}.pform input[name=name]{width:180px;padding:7px 10px;font-size:14px}.pform input[type=color]{width:40px;height:34px;padding:2px}
.kstats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.kstats a{background:var(--sand);border-radius:12px;padding:12px;text-decoration:none}.kstats b{display:block;font-size:22px}.kstats span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.kstats .late b{color:#a33}
.kgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-bottom:14px}.kc{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px}.kc span{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.kc b{display:block;font-size:28px;margin-top:6px}.kc small{display:block;color:var(--muted);font-size:12px;margin-top:4px}.kc.late b{color:#a33}
.kpanels{display:grid;grid-template-columns:1fr 1.4fr;gap:12px}.chart{width:100%;height:auto;display:block}
.hb div{display:grid;grid-template-columns:110px 1fr 36px;gap:8px;align-items:center;margin:6px 0;font-size:13.5px}.hb i{display:block;height:10px;border-radius:999px;background:var(--ink);min-width:2px}.hb b{text-align:right}
.goal{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}.gh{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}.gh span{color:var(--muted)}
.gbar{height:10px;border-radius:999px;background:var(--sand);margin-top:8px;overflow:hidden}.gbar i{display:block;height:100%;background:var(--ink);border-radius:999px}.gbar i.hit{background:#2e7d4f}.gacts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}.ovl{margin:0 0 6px}
@media (max-width:899px){.board{grid-template-columns:repeat(5,86%)}.mv{display:flex}.tk{cursor:default}.kpanels{grid-template-columns:1fr}}
@media (max-width:720px){.tf{grid-template-columns:1fr 1fr}.kstats{grid-template-columns:repeat(2,1fr)}.hb div{grid-template-columns:90px 1fr 30px}}`;
const BOARD_JS = `var bd=document.querySelector('[data-board]');if(bd){var drag=null;var cnt=function(){bd.querySelectorAll('.col').forEach(function(c){c.querySelector('.cnt').textContent=c.querySelectorAll('.tk').length;});};
bd.addEventListener('dragstart',function(e){var c=e.target.closest&&e.target.closest('.tk');if(!c)return;drag=c;c.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.getAttribute('data-id'));});
bd.addEventListener('dragend',function(){if(drag)drag.classList.remove('dragging');drag=null;bd.querySelectorAll('.drop.over').forEach(function(d){d.classList.remove('over');});});
bd.querySelectorAll('.drop').forEach(function(d){d.addEventListener('dragover',function(e){if(drag){e.preventDefault();d.classList.add('over');}});d.addEventListener('dragleave',function(e){if(!d.contains(e.relatedTarget))d.classList.remove('over');});
d.addEventListener('drop',function(e){e.preventDefault();d.classList.remove('over');var c=drag;if(!c)return;var st=d.getAttribute('data-status');if(c.getAttribute('data-status')===st)return;var from=c.parentNode,next=c.nextSibling;d.insertBefore(c,d.firstChild);c.setAttribute('data-status',st);var s=c.querySelector('select[name=status]');if(s)s.value=st;cnt();
fetch('/admin/tickets/'+c.getAttribute('data-id')+'/move',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:'status='+encodeURIComponent(st)}).then(function(r){if(!r.ok)throw new Error(r.status);}).catch(function(){from.insertBefore(c,next);alert('Could not move the ticket. Reloading.');location.reload();});});});}`;
