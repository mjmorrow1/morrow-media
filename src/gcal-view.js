// Pure calendar view helpers. No tokens, no network. Safe to unit test.
const GCalView = (() => {
  const TZ = 'America/New_York';
  const pad = (n) => String(n).padStart(2, '0');
  const enc = new TextEncoder();
  function parts(d) {
    const o = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }).formatToParts(d)) o[x.type] = x.value;
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
  }
  const dayKey = (d) => { const p = parts(d instanceof Date ? d : new Date(d)); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  const weekday = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const tzOff = (ms) => { const p = parts(new Date(ms)); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000; };
  function wallToUtc(str) {
    const m = String(str || '').match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/); if (!m) return null;
    const asUtc = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]); let t = asUtc - tzOff(asUtc); t = asUtc - tzOff(t);
    return Number.isNaN(t) ? null : new Date(t);
  }
  function parseAnchor(s, now = new Date()) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : dayKey(now);
  }
  function shiftMonth(key, delta) {
    const [y, m] = key.slice(0, 7).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
  }
  function viewRange(view, anchor, now = new Date()) {
    const day = parseAnchor(anchor, now);
    const name = ['agenda', 'week', 'day', 'month'].includes(view) ? view : 'agenda';
    if (name === 'day') return { view: name, anchor: day, start: day, end: addDays(day, 1), days: [day], prev: addDays(day, -1), next: addDays(day, 1) };
    if (name === 'week') {
      const start = addDays(day, -weekday(day));
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      return { view: name, anchor: day, start, end: addDays(start, 7), days, prev: addDays(start, -7), next: addDays(start, 7) };
    }
    if (name === 'month') {
      const first = day.slice(0, 7) + '-01';
      const [y, m] = first.split('-').map(Number);
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const lead = weekday(first);
      const cells = Math.ceil((lead + dim) / 7) * 7;
      const start = addDays(first, -lead);
      const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
      const prev = shiftMonth(first, -1);
      const next = shiftMonth(first, 1);
      return { view: name, anchor: first, start, end: addDays(start, cells), days, prev, next, month: `${y}-${pad(m)}` };
    }
    const days = Array.from({ length: 14 }, (_, i) => addDays(day, i));
    return { view: 'agenda', anchor: day, start: day, end: addDays(day, 14), days, prev: addDays(day, -14), next: addDays(day, 14) };
  }
  function rangeInstants(range) {
    const start = wallToUtc(range.start + 'T00:00');
    const end = wallToUtc(range.end + 'T00:00');
    return { start, end };
  }
  function safeColor(v) {
    return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : '#6d6a64';
  }
  function safeGoogleLink(v) {
    try {
      const u = new URL(String(v || ''));
      if (u.protocol !== 'https:') return '';
      if (u.hostname !== 'www.google.com' && u.hostname !== 'calendar.google.com') return '';
      return u.toString();
    } catch { return ''; }
  }
  function normalizeGoogleEvent(raw, cal) {
    if (!raw || !raw.start) return null;
    if (raw.status === 'cancelled') return null;
    const allDay = !!(raw.start.date && !raw.start.dateTime);
    let start; let end; let startDay;
    if (allDay) {
      startDay = raw.start.date;
      const endDay = raw.end && raw.end.date ? raw.end.date : addDays(startDay, 1);
      start = wallToUtc(startDay + 'T00:00');
      end = wallToUtc(endDay + 'T00:00');
      if (!start || !end) return null;
      return { id: String(raw.id || ''), calendarId: cal.id, calendarName: String(cal.summary || cal.id), color: safeColor(cal.backgroundColor), title: String(raw.summary || '(No title)').slice(0, 300), location: String(raw.location || '').slice(0, 300), htmlLink: safeGoogleLink(raw.htmlLink), allDay: true, start: start.toISOString(), end: end.toISOString(), startDay, endDay, recurring: !!raw.recurringEventId, status: raw.status || 'confirmed' };
    }
    start = new Date(raw.start.dateTime);
    end = new Date(raw.end && raw.end.dateTime ? raw.end.dateTime : raw.start.dateTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { id: String(raw.id || ''), calendarId: cal.id, calendarName: String(cal.summary || cal.id), color: safeColor(cal.backgroundColor), title: String(raw.summary || '(No title)').slice(0, 300), location: String(raw.location || '').slice(0, 300), htmlLink: safeGoogleLink(raw.htmlLink), allDay: false, start: start.toISOString(), end: end.toISOString(), startDay: dayKey(start), endDay: dayKey(end), recurring: !!raw.recurringEventId, status: raw.status || 'confirmed' };
  }
  function layoutOverlaps(events) {
    const items = events.filter((e) => !e.allDay).map((e) => ({ ...e, startMs: Date.parse(e.start), endMs: Date.parse(e.end), col: 0, cols: 1 })).filter((e) => !Number.isNaN(e.startMs) && e.endMs > e.startMs).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    const clusters = [];
    let cluster = [];
    let clusterEnd = -1;
    for (const e of items) {
      if (!cluster.length || e.startMs < clusterEnd) { cluster.push(e); clusterEnd = Math.max(clusterEnd, e.endMs); }
      else { clusters.push(cluster); cluster = [e]; clusterEnd = e.endMs; }
    }
    if (cluster.length) clusters.push(cluster);
    for (const group of clusters) {
      const cols = [];
      for (const e of group) {
        let c = cols.findIndex((end) => end <= e.startMs);
        if (c < 0) { c = cols.length; cols.push(e.endMs); } else cols[c] = e.endMs;
        e.col = c;
      }
      const n = Math.max(1, cols.length);
      for (const e of group) e.cols = n;
    }
    return items;
  }
  async function collectPages(fetchPage, limit = 8) {
    const items = [];
    let token = '';
    for (let i = 0; i < limit; i++) {
      const page = await fetchPage(token);
      items.push(...((page && page.items) || []));
      if (!page || !page.nextPageToken) return { items, truncated: false };
      token = page.nextPageToken;
    }
    return { items, truncated: true };
  }
  function b64url(bytes) {
    let s = '';
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function fromB64url(s) {
    const p = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(p + '==='.slice((p.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function deriveKey(secret) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(secret || '')));
    return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function encryptText(secret, text) {
    if (!secret) throw new Error('missing key');
    const key = await deriveKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(text))));
    return b64url(iv) + '.' + b64url(ct);
  }
  async function decryptText(secret, packed) {
    const [iv, ct] = String(packed || '').split('.');
    if (!secret || !iv || !ct) return '';
    try {
      const key = await deriveKey(secret);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(ct));
      return new TextDecoder().decode(plain);
    } catch { return ''; }
  }
  return { TZ, dayKey, addDays, weekday, wallToUtc, viewRange, rangeInstants, safeColor, safeGoogleLink, normalizeGoogleEvent, layoutOverlaps, collectPages, encryptText, decryptText, b64url };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GCalView;
