// Smoke test: every page returns 200, every form saves a row, then test rows are deleted.
const base = process.env.BASE || 'http://localhost:3000';
const { db } = require('../src/db');
const pages = ['/', '/services', '/media', '/creators', '/brands', '/sponsorships', '/legal', '/about', '/contact', '/contact?type=creator', '/contact?type=event', '/thanks', '/admin', '/admin/creators', '/admin/brands', '/admin/events', '/admin/campaigns', '/admin/sponsors', '/admin/packages', '/api/health', '/credits', '/sponsorships?tier=founding-partner'];
const forms = {
  brand: ['brands', { company: 'SMOKE TEST Co', contact_name: 'Test', email: 'smoke@test.local', industry: 'Hotel / Hospitality', interests: ['Content', 'Influencers / creators'], goals: 'test', budget: '$5k–$10k' }],
  creator: ['creators', { name: 'SMOKE TEST Creator', email: 'smoke@test.local', location: 'St. Pete, FL', instagram: '@smoke', tiktok: '@smoke', youtube: 'yt', followers: '10k', avg_views: '5k', engagement: '4%', niche: ['Travel', 'Food'], audience: '25-34', portfolio: 'https://example.com', rates: '$300', availability: 'Weekends', travel: 'Florida' }],
  sponsor: ['sponsors', { company: 'SMOKE TEST Sponsor Co', contact_name: 'Test', email: 'smoke@test.local', phone: '555-0100', industry: 'Health & Fitness', tier: 'Founding Partner', budget: '$5K+', notes: 'test', campaign: 'SPOOFED' }],
  legal: ['brands', { contact_name: 'SMOKE TEST Legal', email: 'smoke@test.local', phone: '555-0102', matter: 'Sponsorship / partnership contract', timeline: 'Q1', details: 'test' }],
  event: ['events', { event_name: 'SMOKE TEST Fest', organizer: 'Test', email: 'smoke@test.local', event_type: 'Festival', event_date: '2027-03-01', location: 'St. Pete', attendance: '5000', audience: 'Locals', needs: ['Sponsors'], sponsor_needs: 'test' }],
};
(async () => {
  let fail = 0;
  for (const p of pages) { const r = await fetch(base + p); console.log(r.status, p); if (r.status !== 200) fail++; }
  const ids = [];
  for (const [type, [table, body]] of Object.entries(forms)) {
    const r = await fetch(`${base}/api/submit/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    const row = j.id && db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(j.id);
    console.log(row ? 'SAVED' : 'FAILED', type, '→', table, 'id', j.id, row ? `(${row.niche || row.interests || row.needs || `campaign=${row.campaign}, tier=${row.tier}, status=${row.status}`})` : JSON.stringify(j));
    if (!row) fail++; else ids.push([table, j.id]);
  }
  // removed pages redirect
  for (const [from, to] of [['/portfolio', '/media'], ['/work', '/media']]) {
    const rr = await fetch(base + from, { redirect: 'manual' }); const loc = rr.headers.get('location');
    console.log(rr.status, from, '→', loc); if (rr.status !== 301 || loc !== to) fail++;
  }
  // Marketing is hidden (config.pages.marketing = false) → temporary 302 to /media
  { const rr = await fetch(base + '/marketing', { redirect: 'manual' }); const loc = rr.headers.get('location');
    console.log(rr.status, '/marketing →', loc, '(hidden, temporary)'); if (rr.status !== 302 || loc !== '/media') fail++; }
  // legal inquiry is tagged + nav shows Legal, not Work
  const lg = db.prepare("SELECT company, interests, source FROM brands WHERE email = 'smoke@test.local' AND source LIKE '%legal%'").get();
  console.log('legal inquiry row:', JSON.stringify(lg)); if (!lg || !/^Legal \/ contracts/.test(lg.interests)) fail++;
  const home = await (await fetch(base + '/')).text();
  const navOk = home.includes('href="/legal"') && !home.includes('href="/portfolio"') && !home.includes('href="/marketing"');
  console.log('nav has /legal, no /portfolio or /marketing links:', navOk); if (!navOk) fail++;
  const ab = await (await fetch(base + '/about')).text();
  const abOk = ab.includes('The agent.<br>The creator.<br>The developer.') && ab.includes('REALTORS® membership') && !/Former real estate|e-PRO/.test(ab + home) && !ab.includes('href="/marketing"');
  console.log('about has new copy, no old bio:', abOk); if (!abOk) fail++;
  // urlencoded (no-JS) fallback
  const r = await fetch(`${base}/api/submit/brand`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'company=SMOKE+TEST+NoJS&contact_name=T&email=smoke%40test.local&interests=Content&interests=Events' });
  console.log(r.status, 'no-JS fallback →', r.headers.get('location'));
  // validation
  const bad = await fetch(`${base}/api/submit/creator`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":""}' });
  console.log(bad.status, 'validation rejects empty creator:', (await bad.json()).error);
  const badSp = await fetch(`${base}/api/submit/sponsor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"company":"X"}' });
  console.log(badSp.status, 'validation rejects sponsor without contact:', (await badSp.json()).error);
  const camp = db.prepare("SELECT id, client, type, status, budget FROM campaigns WHERE client = 'St. Pete Marathon'").all();
  console.log('seeded campaign present:', JSON.stringify(camp)); if (camp.length !== 1) fail++;
  for (const t of ['brands', 'creators', 'events', 'sponsors']) db.prepare(`DELETE FROM ${t} WHERE email = 'smoke@test.local'`).run();
  console.log('Test rows deleted. Remaining:', ['brands', 'creators', 'events', 'sponsors'].map((t) => `${t}=${db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n}`).join(' '));
  process.exit(fail ? 1 : 0);
})();
