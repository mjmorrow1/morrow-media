// Read-only Google Workspace calendar for /admin/calendar.
// Requires Worker secrets GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and CALENDAR_TOKEN_KEY.
// Refresh tokens are AES-GCM encrypted with CALENDAR_TOKEN_KEY. Event bodies are not stored.
const GCAL_READ_SCOPE = 'openid email https://www.googleapis.com/auth/calendar.readonly';
const GCAL_STATE_COOKIE = '__Host-mm_gcal';
const GCAL_CSS = `.gcal-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.gcal-nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}.gcal-status{margin:0 0 12px}.gcal-calpick{display:flex;gap:8px 14px;flex-wrap:wrap;margin:0 0 14px}.gcal-calpick label{display:flex;gap:6px;align-items:center;font-size:13px;margin:0}.gcal-swatch{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}.gcal-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.gcal-col{background:#fff;border:1px solid var(--line);border-radius:12px;min-width:0;padding:8px}.gcal-col h3{margin:0 0 6px;font:600 13px/1.3 var(--sans)}.gcal-all{display:flex;flex-direction:column;gap:4px;margin-bottom:6px}.gcal-ev{display:block;border-left:4px solid var(--ink);background:var(--sand);border-radius:8px;padding:4px 6px;margin-top:4px;text-decoration:none;font-size:12.5px;line-height:1.35;overflow-wrap:anywhere}.gcal-ev small{display:block;color:var(--muted);font-size:11px}.gcal-ev.followup{border-left-style:dashed;background:#fff}.gcal-ev .src{display:block;margin:0 0 2px;font:500 10px/1.3 var(--sans);letter-spacing:.08em;text-transform:uppercase}.gcal-ev .ttl{display:block;font-weight:600}.gcal-board{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;align-items:start}.gcal-hours{position:relative;margin-top:34px;color:var(--muted);font:500 10px/1 var(--sans)}.gcal-hours span{position:absolute;right:0;transform:translateY(-50%)}.gcal-time{position:relative;border-top:1px solid var(--line);background:repeating-linear-gradient(to bottom,transparent,transparent calc(100% / var(--gcal-hours) - 1px),var(--line) calc(100% / var(--gcal-hours) - 1px),var(--line) calc(100% / var(--gcal-hours)))}.gcal-slot{position:absolute;padding:0 1px;box-sizing:border-box;min-height:56px;overflow:visible;z-index:1}.gcal-time .gcal-ev{height:auto;min-height:100%;margin:0;overflow:visible}.gcal-setup{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0 0 16px}.gcal-setup code{overflow-wrap:anywhere}.gcal-agenda .dayhead{margin:18px 0 8px;font:600 14px/1.3 var(--sans)}@media (max-width:800px){.gcal-board{grid-template-columns:1fr}.gcal-hours{display:none}.gcal-week{grid-template-columns:1fr}.gcal-time{height:auto !important;background:none}.gcal-slot{position:static;height:auto !important;width:auto !important;left:auto !important;margin-top:4px}.gcal-time .gcal-ev{height:auto;overflow:visible}}`;

function gcalReadReady(env) { return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.CALENDAR_TOKEN_KEY); }
function gcalOauthCookie(value, maxAge) { return `${GCAL_STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function gcalStateFromCookie(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + GCAL_STATE_COOKIE.replace(/[-]/g, '\\-') + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
async function gcalReadToken(env) {
  if (!env.CALENDAR_TOKEN_KEY) return '';
  const packed = await settingGet(env, 'gcal_refresh_enc');
  if (!packed) return '';
  return GCalView.decryptText(env.CALENDAR_TOKEN_KEY, packed);
}
async function gcalReadAccount(env) { return settingGet(env, 'gcal_account_email'); }
function jwtEmail(idToken) {
  const p = String(idToken || '').split('.')[1]; if (!p) return '';
  try {
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((p.length + 3) % 4)), (c) => c.charCodeAt(0))));
    const email = String(json.email || '');
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  } catch { return ''; }
}
async function gcalReadAccess(env) {
  const refresh = await gcalReadToken(env);
  if (!gcalReadReady(env) || !refresh) return { ok: false, code: refresh ? 'setup' : (gcalReadReady(env) ? 'connect' : 'setup') };
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === 'invalid_grant') { await settingSet(env, 'gcal_status', 'revoked'); return { ok: false, code: 'revoked' }; }
    return { ok: false, code: 'error', status: r.status };
  }
  if (!j.access_token) return { ok: false, code: 'error' };
  await settingSet(env, 'gcal_status', 'ok');
  return { ok: true, access: j.access_token };
}
async function gcalGoogleGet(access, path, query) {
  const u = new URL('https://www.googleapis.com/calendar/v3' + path);
  for (const [k, v] of Object.entries(query || {})) if (v) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { authorization: `Bearer ${access}` } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}
function gcalCalIdOk(id) { return /^[A-Za-z0-9@._+-]{3,200}$/.test(String(id || '')); }
async function gcalSaveList(env, items) {
  const slim = items.filter((c) => c && gcalCalIdOk(c.id) && c.accessRole !== 'freeBusyReader').slice(0, 20).map((c) => ({ id: c.id, summary: String(c.summary || c.id).slice(0, 120), color: GCalView.safeColor(c.backgroundColor), primary: !!c.primary }));
  await settingSet(env, 'gcal_calendar_list', JSON.stringify(slim));
  return slim;
}
async function gcalStoredList(env) {
  try { const list = JSON.parse(await settingGet(env, 'gcal_calendar_list') || '[]'); return Array.isArray(list) ? list.filter((c) => c && gcalCalIdOk(c.id)) : []; } catch { return []; }
}
async function gcalVisibleIds(env, list) {
  const raw = await settingGet(env, 'gcal_visible');
  if (!raw) return list.map((c) => c.id);
  let picked = [];
  try { picked = JSON.parse(raw); } catch { picked = []; }
  const ids = new Set(list.map((c) => c.id));
  return (Array.isArray(picked) ? picked : []).filter((id) => ids.has(id));
}
async function gcalLoadEvents(env, range) {
  const gate = await gcalReadAccess(env);
  if (!gate.ok) return { ...gate, events: [], calendars: [], truncated: false };
  const bounds = GCalView.rangeInstants(range);
  if (!bounds.start || !bounds.end) return { ok: false, code: 'error', events: [], calendars: [], truncated: false };
  const listRes = await gcalGoogleGet(gate.access, '/users/me/calendarList', { maxResults: '20' });
  if (listRes.status === 401) { await settingSet(env, 'gcal_status', 'revoked'); return { ok: false, code: 'revoked', events: [], calendars: [], truncated: false }; }
  if (!listRes.ok) return { ok: false, code: 'error', status: listRes.status, events: [], calendars: await gcalStoredList(env), truncated: false };
  const calendars = await gcalSaveList(env, (listRes.json.items || []));
  const visible = new Set(await gcalVisibleIds(env, calendars));
  const events = [];
  let truncated = false;
  for (const cal of calendars.filter((c) => visible.has(c.id))) {
    const collected = await GCalView.collectPages(async (pageToken) => {
      const res = await gcalGoogleGet(gate.access, `/calendars/${encodeURIComponent(cal.id)}/events`, {
        timeMin: bounds.start.toISOString(), timeMax: bounds.end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', pageToken,
      });
      if (!res.ok) { const e = new Error('google'); e.status = res.status; throw e; }
      return { items: res.json.items || [], nextPageToken: res.json.nextPageToken || '' };
    }).catch((e) => ({ error: e.status || 502 }));
    if (collected.error) return { ok: false, code: collected.error === 401 ? 'revoked' : 'error', status: collected.error, events, calendars, truncated };
    if (collected.truncated) truncated = true;
    for (const raw of collected.items) {
      const ev = GCalView.normalizeGoogleEvent(raw, cal);
      if (ev) events.push(ev);
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { ok: true, code: 'ok', events, calendars, truncated, email: await gcalReadAccount(env) };
}
function gcalEventHtml(ev) {
  const when = ev.allDay ? 'All day' : escH(fmtTime(ev.start));
  const link = ev.htmlLink ? `<a href="${escH(ev.htmlLink)}" target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>` : '';
  return `<div class="gcal-ev" style="border-left-color:${escH(ev.color)}"><span class="src">${escH(ev.calendarName)}${ev.recurring ? ' · repeating' : ''}</span><span class="ttl">${escH(ev.title)}</span><small>${when}${ev.location ? ' · ' + escH(ev.location) : ''}${link ? ' · ' + link : ''}</small></div>`;
}
function gcalFollowHtml(f) {
  return `<a class="gcal-ev followup" href="/admin/followups/${f.id}"><span class="src">Follow-up · ${escH(cap(f.type || 'task'))}</span><span class="ttl">${escH(f.title)}</span><small>${escH(fmtTime(f.due_at))} · ${escH(String(f.duration_min || 30))} min</small></a>`;
}
function gcalMinutes(iso) { const p = etParts(new Date(iso)); return p.h * 60 + p.mi; }
function gcalHourLabel(min) { const h = Math.floor(min / 60) % 24; return `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`; }
function gcalHref(view, anchor) {
  const q = new URLSearchParams();
  if (view && view !== 'agenda') q.set('view', view);
  if (anchor) q.set('d', anchor);
  const s = q.toString();
  return '/admin/calendar' + (s ? '?' + s : '');
}
async function workspaceCalendarPage(env, url) {
  const sp = url.searchParams;
  const view = ['month', 'week', 'day', 'agenda'].includes(sp.get('view')) ? sp.get('view') : 'agenda';
  const range = GCalView.viewRange(view, sp.get('d') || '');
  const bounds = GCalView.rangeInstants(range);
  const followups = bounds.start && bounds.end ? (await qy(env, `${FU_LIST_SQL} WHERE f.status != 'done' AND f.due_at >= ? AND f.due_at < ? ORDER BY f.due_at LIMIT 500`, bounds.start.toISOString().replace(/\.\d+Z$/, 'Z'), bounds.end.toISOString().replace(/\.\d+Z$/, 'Z')).all()).results : [];
  const overdue = view === 'agenda' ? (await qy(env, `${FU_LIST_SQL} WHERE f.status != 'done' AND f.due_at < ? ORDER BY f.due_at LIMIT 50`, bounds.start.toISOString().replace(/\.\d+Z$/, 'Z')).all()).results : [];
  const google = await gcalLoadEvents(env, range);
  const tabs = ['agenda', 'week', 'day', 'month'].map((v) => `<a class="b${v === view ? ' on' : ''}" href="${gcalHref(v, range.anchor)}"${v === view ? ' aria-current="page"' : ''}>${v === 'agenda' ? 'Agenda' : v[0].toUpperCase() + v.slice(1)}</a>`).join('');
  const lastDay = GCalView.addDays(range.end, -1);
  const label = view === 'month' ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(range.anchor + 'T00:00:00Z')) : (range.start === lastDay ? range.start : `${range.start} – ${lastDay}`);
  const status = google.code === 'setup' ? 'Google Calendar is not configured yet. Add the Worker secrets named on Calendar settings, then connect.'
    : google.code === 'connect' ? 'Google Calendar is not connected. Follow-ups below are from this CRM only.'
    : google.code === 'revoked' ? 'Google access expired or was revoked. Connect again from Calendar settings. No Workspace events are shown.'
    : google.ok ? `Loaded ${google.events.length} Workspace event${google.events.length === 1 ? '' : 's'}${google.truncated ? ' (this range has more; narrow the view)' : ''}${google.email ? ' · ' + google.email : ''}.` : 'Workspace calendars could not be loaded. Follow-ups are still shown.';
  const byDay = {};
  for (const f of followups) (byDay[etDay(f.due_at)] ||= { fu: [], ev: [] }).fu.push(f);
  for (const ev of google.events || []) {
    let k = ev.startDay;
    const last = ev.allDay ? GCalView.addDays(ev.endDay, -1) : ev.startDay;
    while (k <= last && k < range.end) { (byDay[k] ||= { fu: [], ev: [] }).ev.push(ev); if (!ev.allDay) break; k = GCalView.addDays(k, 1); }
  }
  const timedFor = (k) => {
    const bag = byDay[k] || { fu: [], ev: [] };
    const fus = bag.fu.map((f) => ({ followup: f, allDay: false, start: f.due_at, end: new Date(Date.parse(f.due_at) + (f.duration_min || 30) * 60000).toISOString() }));
    return GCalView.layoutOverlaps([...bag.ev.filter((e) => !e.allDay), ...fus]);
  };
  let gridStart = 8 * 60, gridEnd = 19 * 60;
  if (view === 'week' || view === 'day') {
    for (const k of range.days) for (const e of timedFor(k)) {
      if (etDay(e.start) === k) gridStart = Math.min(gridStart, Math.floor(gcalMinutes(e.start) / 60) * 60);
      const endMin = etDay(e.end) === k ? gcalMinutes(e.end) : 24 * 60;
      gridEnd = Math.max(gridEnd, Math.ceil(endMin / 60) * 60);
    }
    gridStart = Math.max(0, gridStart); gridEnd = Math.min(24 * 60, Math.max(gridEnd, gridStart + 60));
  }
  const span = gridEnd - gridStart;
  const hours = Math.round(span / 60);
  const hourMarks = Array.from({ length: hours + 1 }, (_, i) => `<span style="top:${(i / hours) * 100}%">${gcalHourLabel(gridStart + i * 60)}</span>`).join('');
  const dayBlock = (k) => {
    const bag = byDay[k] || { fu: [], ev: [] };
    const slots = timedFor(k).map((e) => {
      const startMin = etDay(e.start) === k ? gcalMinutes(e.start) : gridStart;
      const endMin = etDay(e.end) === k ? gcalMinutes(e.end) : gridEnd;
      const top = ((Math.max(gridStart, startMin) - gridStart) / span) * 100;
      const height = Math.max(4, ((Math.min(gridEnd, Math.max(endMin, startMin + 15)) - Math.max(gridStart, startMin)) / span) * 100);
      const width = 100 / e.cols;
      return `<div class="gcal-slot" style="top:${top}%;height:${height}%;left:${e.col * width}%;width:${width}%">${e.followup ? gcalFollowHtml(e.followup) : gcalEventHtml(e)}</div>`;
    }).join('');
    return `<section class="gcal-col"><h3><a href="${gcalHref('day', k)}">${escH(k === etDay(new Date()) ? 'Today · ' : '')}${escH(new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(k + 'T00:00:00Z')))}</a></h3><div class="gcal-all">${bag.ev.filter((e) => e.allDay).map(gcalEventHtml).join('')}</div><div class="gcal-time" style="height:${Math.max(420, hours * 48)}px;--gcal-hours:${hours}">${slots}</div></section>`;
  };
  let grid;
  if (view === 'month') {
    let cells = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="h">${d}</div>`).join('');
    for (const k of range.days) {
      const bag = byDay[k] || { fu: [], ev: [] };
      const inMonth = k.slice(0, 7) === range.month;
      cells += `<div class="d${inMonth ? '' : ' out'}${k === etDay(new Date()) ? ' today' : ''}"><a class="n" href="${gcalHref('day', k)}">${+k.slice(8)}</a>${bag.ev.slice(0, 4).map((e) => `<a class="chip" href="${escH(e.htmlLink || gcalHref('day', k))}" ${e.htmlLink ? 'target="_blank" rel="noopener noreferrer"' : ''}><span class="gcal-swatch" style="background:${escH(e.color)}"></span> ${escH(e.title)}</a>`).join('')}${bag.fu.map((f) => `<a class="chip followup" href="/admin/followups/${f.id}">Follow-up · ${escH(f.title)}</a>`).join('')}</div>`;
    }
    grid = `<div class="cal">${cells}</div>`;
  } else if (view === 'agenda') {
    const days = range.days.map((k) => {
      const bag = byDay[k] || { fu: [], ev: [] };
      const rows = bag.ev.map(gcalEventHtml).join('') + bag.fu.map((f) => fuRow(f, gcalHref('agenda', range.anchor))).join('');
      return `<h3 class="dayhead">${escH(k)}</h3>${rows || '<p class="eyebrow">Nothing here.</p>'}`;
    }).join('');
    const late = overdue.length ? `<h2 class="sec late">Overdue follow-ups <span class="badge">${overdue.length}</span></h2>${overdue.map((f) => fuRow(f, gcalHref('agenda', range.anchor))).join('')}` : '';
    grid = `<div class="gcal-agenda">${late}${days}</div>`;
  } else grid = `<div class="gcal-board"><div class="gcal-hours" style="height:${Math.max(420, hours * 48)}px">${hourMarks}</div><div class="gcal-week">${range.days.map(dayBlock).join('')}</div></div>`;
  const visibleIds = new Set(await gcalVisibleIds(env, google.calendars || []));
  const picker = (google.calendars || []).length ? `<form class="gcal-calpick" method="post" action="/admin/calendar/google/visible"><input type="hidden" name="posted" value="1"><span class="eyebrow">Calendars</span>${google.calendars.map((c) => `<label><input type="checkbox" name="cal" value="${escH(c.id)}"${visibleIds.has(c.id) ? ' checked' : ''}><span class="gcal-swatch" style="background:${escH(c.color)}"></span>${escH(c.summary)}</label>`).join('')}<button class="b sm" type="submit">Update</button></form>` : '';
  const ident = google.email ? `<p class="note">Connected as <b>${escH(google.email)}</b>. Google events are read-only. <a href="/admin/calendar/settings">Refresh, disconnect, or choose calendars</a>.</p>` : '';
  const body = `<p class="eyebrow">Eastern time · America/New_York</p><h1>Calendar <em>${escH(view)}</em></h1>
<div class="gcal-nav"><div class="gcal-tabs" role="tablist">${tabs}</div><span class="sp"></span><a class="b sm" href="${gcalHref(view, range.prev)}">← Prev</a><a class="b sm" href="${gcalHref(view, '')}">Today</a><a class="b sm" href="${gcalHref(view, range.next)}">Next →</a><a class="b dark" href="/admin/followups/new">+ Follow-up</a></div>
<p class="gcal-status" role="status">${escH(status)}</p>${ident}${picker}<h2 class="sec">${escH(label)}</h2>${grid}
<p class="eyebrow">Follow-ups stay in this CRM and keep Done, Snooze, and .ics. Workspace events open in Google and are not edited here.</p>`;
  return adminPage('Calendar', 'calendar', body, { msg: sp.get('msg') || '' });
}
async function gcalReadSettingsSection(env, url) {
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CALENDAR_TOKEN_KEY'].filter((n) => !env[n]);
  const email = await gcalReadAccount(env);
  const status = await settingGet(env, 'gcal_status');
  const connected = !!(await gcalReadToken(env));
  if (missing.length) return `<div class="gcal-setup"><h2 class="sec">Workspace calendar</h2><p>View-only Google Calendar needs these Worker secret names before anyone can connect. Values are not shown here.</p><ul>${missing.map((n) => `<li><code>${escH(n)}</code></li>`).join('')}</ul><p class="note">In Google Cloud, create an OAuth web client whose redirect URI is <code>${escH(url.origin)}/admin/calendar/google/callback</code>. Request scope <code>https://www.googleapis.com/auth/calendar.readonly</code> plus <code>openid</code> and <code>email</code>. Do not paste a refresh token into this page.</p></div>`;
  if (!connected || status === 'revoked') return `<div class="gcal-setup"><h2 class="sec">Workspace calendar</h2><p>${status === 'revoked' ? 'The saved Google access expired or was revoked.' : 'The OAuth client is configured. Nobody has connected a Google account from this admin yet.'}</p><p><a class="b dark" href="/admin/calendar/google/connect">Connect Google Calendar</a></p><p class="note">This connection is read-only. It does not create, edit, or delete Google events. Follow-up write sync stays off unless a separate write scope is granted later.</p></div>`;
  const list = await gcalStoredList(env);
  const visible = new Set(await gcalVisibleIds(env, list));
  return `<div class="gcal-setup"><h2 class="sec">Workspace calendar</h2><p>Connected${email ? ` as <b>${escH(email)}</b>` : ''}. Events are read when you open the calendar. They are not copied into the CRM database.</p>
<form class="gcal-calpick" method="post" action="/admin/calendar/google/visible">${list.map((c) => `<label><input type="checkbox" name="cal" value="${escH(c.id)}"${visible.has(c.id) ? ' checked' : ''}><span class="gcal-swatch" style="background:${escH(c.color)}"></span>${escH(c.summary)}${c.primary ? ' · primary' : ''}</label>`).join('')}<button class="b sm" type="submit">Save calendars</button></form>
<div class="bar"><a class="b" href="/admin/calendar">Refresh calendar</a><form method="post" action="/admin/calendar/google/disconnect" data-confirm="Disconnect Google Calendar? The saved access is deleted from this site."><button class="b red" type="submit">Disconnect</button></form></div></div>`;
}
async function gcalReadConnect(env, url) {
  if (!gcalReadReady(env)) return goTo(withMsg('/admin/calendar/settings', 'Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and CALENDAR_TOKEN_KEY first.'));
  const verifier = GCalView.b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = GCalView.b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = GCalView.b64url(crypto.getRandomValues(new Uint8Array(24)));
  const encV = await GCalView.encryptText(env.CALENDAR_TOKEN_KEY, verifier);
  try { await qy(env, 'INSERT INTO gcal_oauth_states (state, verifier_enc, admin_email, created_at) VALUES (?, ?, ?, ?)', state, encV, String(env.ADMIN_EMAIL || ''), nowIso()).run(); }
  catch { return goTo(withMsg('/admin/calendar/settings', 'Apply the additive gcal_oauth_states table from cf/crm-schema.sql, then try Connect again.')); }
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  auth.searchParams.set('redirect_uri', `${url.origin}/admin/calendar/google/callback`);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', GCAL_READ_SCOPE);
  auth.searchParams.set('state', state);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('include_granted_scopes', 'false');
  return new Response(null, { status: 302, headers: { location: auth.toString(), 'cache-control': 'no-store', 'set-cookie': gcalOauthCookie(state, 600) } });
}
function gcalContinue(title, text) {
  const body = `<div class="login"><div class="box"><p class="eyebrow">Calendar</p><h1>${escH(title)}</h1><p>${escH(text)}</p><p class="foot"><a href="/admin/calendar">Continue to the calendar</a></p></div></div>`;
  return new Response(adminDoc(title, body), { status: 200, headers: { ...adminHeaders(), 'set-cookie': gcalOauthCookie('', 0) } });
}
async function gcalReadCallback(req, env, url) {
  const fail = (text) => gcalContinue('Google connection failed', text);
  if (!gcalReadReady(env)) return fail('Google OAuth is not configured on this Worker.');
  const sent = url.searchParams.get('state') || '';
  const cookie = gcalStateFromCookie(req);
  const code = url.searchParams.get('code') || '';
  if (url.searchParams.get('error')) return fail('Google cancelled the connection. Sign in and try Connect again.');
  if (!sent || sent !== cookie || !code) return fail('The connection check did not match. Sign in and try Connect again.');
  const row = await qy(env, 'SELECT verifier_enc, created_at FROM gcal_oauth_states WHERE state = ?', sent).first();
  await qy(env, 'DELETE FROM gcal_oauth_states WHERE state = ?', sent).run();
  if (!row) return fail('That connection attempt expired. Sign in and try Connect again.');
  if (Date.now() - Date.parse(row.created_at) > 10 * 60 * 1000) return fail('That connection attempt expired. Sign in and try Connect again.');
  const verifier = await GCalView.decryptText(env.CALENDAR_TOKEN_KEY, row.verifier_enc);
  if (!verifier) return fail('The connection secret could not be read. Check CALENDAR_TOKEN_KEY and try again.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/admin/calendar/google/callback`, grant_type: 'authorization_code', code_verifier: verifier }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) return fail(j.error === 'invalid_grant' ? 'Google rejected the connection. Try Connect again.' : 'Google did not return a refresh token. Remove the app at myaccount.google.com/permissions, then Connect again.');
  await settingSet(env, 'gcal_refresh_enc', await GCalView.encryptText(env.CALENDAR_TOKEN_KEY, j.refresh_token));
  await settingSet(env, 'gcal_scopes', String(j.scope || GCAL_READ_SCOPE).slice(0, 500));
  await settingSet(env, 'gcal_account_email', jwtEmail(j.id_token));
  await settingSet(env, 'gcal_status', 'ok');
  await settingSet(env, 'gcal_connected_at', nowIso());
  return gcalContinue('Google Calendar connected', 'Read-only access is saved on this site. Continue to the calendar and sign in if asked. No Google events were changed.');
}
async function gcalReadDisconnect(env) {
  await settingSet(env, 'gcal_refresh_enc', '');
  await settingSet(env, 'gcal_account_email', '');
  await settingSet(env, 'gcal_scopes', '');
  await settingSet(env, 'gcal_status', '');
  await settingSet(env, 'gcal_calendar_list', '');
  await settingSet(env, 'gcal_visible', '');
  await settingSet(env, 'gcal_refresh_token', '');
  await settingSet(env, 'gcal_connected_at', '');
}
async function gcalEventsApi(env, url) {
  const range = GCalView.viewRange(url.searchParams.get('view') || 'agenda', url.searchParams.get('d') || url.searchParams.get('start') || '');
  const google = await gcalLoadEvents(env, range);
  if (!google.ok) return adminJson({ ok: false, code: google.code || 'error', events: [] }, google.code === 'error' ? 502 : 200);
  return adminJson({ ok: true, code: 'ok', truncated: !!google.truncated, email: google.email || '', range: { start: range.start, end: range.end, view: range.view }, events: google.events });
}
