// SQLite CRM. Schema is defined once here and drives both the DB and the /admin views.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'crm.sqlite'));
db.pragma('journal_mode = WAL');

// type: text | long | number | date | select | email | url
const TABLES = {
  creators: {
    label: 'Creators',
    desc: 'Creator Network applications and roster.',
    columns: [
      { key: 'name', label: 'Name', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone' },
      { key: 'location', label: 'Location' },
      { key: 'platform', label: 'Primary platform', type: 'select', options: ['Instagram', 'TikTok', 'YouTube', 'Multi-platform', 'Other'] },
      { key: 'instagram', label: 'Instagram' },
      { key: 'tiktok', label: 'TikTok' },
      { key: 'youtube', label: 'YouTube' },
      { key: 'followers', label: 'Followers (total)' },
      { key: 'avg_views', label: 'Average views' },
      { key: 'engagement', label: 'Engagement rate' },
      { key: 'niche', label: 'Content categories / niche' },
      { key: 'audience', label: 'Audience demographics', type: 'long' },
      { key: 'portfolio', label: 'Portfolio link', type: 'url' },
      { key: 'rates', label: 'Rates' },
      { key: 'availability', label: 'Availability' },
      { key: 'travel', label: 'Travel availability', type: 'select', options: ['Local only', 'Florida', 'U.S.', 'International'] },
      { key: 'notes', label: 'Notes', type: 'long' },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Reviewing', 'Approved', 'Active', 'Declined'], default: 'New' },
    ],
  },
  brands: {
    label: 'Brands',
    desc: 'Brand & business leads ("I\'m a Brand").',
    columns: [
      { key: 'company', label: 'Company', required: true },
      { key: 'contact_name', label: 'Contact name', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone' },
      { key: 'website', label: 'Website / Instagram' },
      { key: 'industry', label: 'Industry', type: 'select', options: ['Restaurant', 'Hotel / Hospitality', 'Real Estate', 'Property Development', 'Tourism', 'Automotive', 'Retail', 'Consumer Brand', 'Local Business', 'Other'] },
      { key: 'location', label: 'Location' },
      { key: 'interests', label: 'Interested in' },
      { key: 'goals', label: 'Marketing goals', type: 'long' },
      { key: 'budget', label: 'Budget', type: 'select', options: ['Under $2.5k', '$2.5k–$5k', '$5k–$10k', '$10k–$25k', '$25k+', 'Not sure yet'] },
      { key: 'timeline', label: 'Timeline' },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Contacted', 'Proposal', 'Won', 'Lost'], default: 'New' },
    ],
  },
  events: {
    label: 'Events',
    desc: 'Event organizer leads ("I\'m an Event Organizer").',
    columns: [
      { key: 'event_name', label: 'Event', required: true },
      { key: 'organizer', label: 'Organizer / contact', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone' },
      { key: 'event_type', label: 'Event type', type: 'select', options: ['Festival', 'Concert', 'Sporting event', 'Conference', 'Charity event', 'Nightlife', 'Tourism event', 'Private event', 'Other'] },
      { key: 'location', label: 'Location' },
      { key: 'event_date', label: 'Date', type: 'date' },
      { key: 'audience', label: 'Audience' },
      { key: 'attendance', label: 'Expected attendance' },
      { key: 'needs', label: 'Looking for' },
      { key: 'sponsor_needs', label: 'Sponsor needs / details', type: 'long' },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Contacted', 'Proposal', 'Active', 'Closed'], default: 'New' },
    ],
  },
  campaigns: {
    label: 'Campaigns',
    desc: 'Internal — active and past campaigns.',
    columns: [
      { key: 'name', label: 'Campaign', required: true },
      { key: 'client', label: 'Client', required: true },
      { key: 'creators', label: 'Creators' },
      { key: 'budget', label: 'Budget' },
      { key: 'deliverables', label: 'Deliverables', type: 'long' },
      { key: 'start_date', label: 'Start', type: 'date' },
      { key: 'end_date', label: 'End', type: 'date' },
      { key: 'type', label: 'Type', type: 'select', options: ['Content Session', 'Social Content', 'Real Estate Media', 'Event Media', 'Creator Campaign', 'Sponsorship Campaign', 'Other'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Pitching', 'Booked', 'Active', 'In production', 'Live', 'Reporting', 'Complete'], default: 'Pitching' },
      { key: 'results', label: 'Results', type: 'long' },
    ],
  },
  sponsors: {
    label: 'Sponsors',
    desc: 'Internal — sponsor prospects and partners.',
    columns: [
      { key: 'company', label: 'Company', required: true },
      { key: 'industry', label: 'Industry' },
      { key: 'contact_name', label: 'Contact name' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone' },
      { key: 'campaign', label: 'Campaign' },
      { key: 'tier', label: 'Tier of interest' },
      { key: 'history', label: 'Sponsorship history', type: 'long' },
      { key: 'target_audience', label: 'Target audience' },
      { key: 'budget', label: 'Budget' },
      { key: 'notes', label: 'Notes', type: 'long' },
      { key: 'status', label: 'Status', type: 'select', options: ['Prospect', 'Contacted', 'Negotiating', 'Signed', 'Past partner'], default: 'Prospect' },
    ],
  },
};

for (const [name, t] of Object.entries(TABLES)) {
  const cols = t.columns.map((c) => `"${c.key}" ${c.type === 'number' ? 'REAL' : 'TEXT'}`).join(',\n  ');
  db.exec(`CREATE TABLE IF NOT EXISTS ${name} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${cols},
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
  // Lightweight migration: add any columns added to the schema later.
  const existing = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((r) => r.name));
  for (const c of t.columns) if (!existing.has(c.key)) db.exec(`ALTER TABLE ${name} ADD COLUMN "${c.key}" TEXT`);
}

// ── Seed: the featured sponsorship campaign (idempotent — only inserted if missing, never overwritten).
function seedCampaign() {
  const c = require('./campaign').load();
  if (!c.client || !c.campaignName) return;
  const exists = db.prepare('SELECT id FROM campaigns WHERE client = ? AND name = ?').get(c.client, c.campaignName);
  if (exists) return;
  const tiers = (c.tiers || []).map((t) => `${t.name} (${t.price}): ${t.benefits.join('; ')}`).join('\n');
  db.prepare(`INSERT INTO campaigns (name, client, type, status, deliverables, budget, source) VALUES (?, ?, 'Sponsorship Campaign', 'Active', ?, ?, 'seed')`)
    .run(c.campaignName, c.client, `Procure additional sponsors for the inaugural St. Pete Marathon (${c.date}, ${c.location}).\nTiers:\n${tiers}`, (c.tiers || []).map((t) => `${t.name} ${t.price}`).join(' / '));
  console.log('Seeded campaign:', c.campaignName);
}
seedCampaign();

function clean(table, input) {
  const t = TABLES[table];
  const row = {};
  const missing = [];
  for (const c of t.columns) {
    let v = input[c.key];
    if (Array.isArray(v)) v = v.join(', ');
    v = v == null ? '' : String(v).trim().slice(0, 5000);
    if (!v && c.default) v = c.default;
    if (c.required && !v) missing.push(c.label);
    row[c.key] = v;
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) missing.push('a valid email');
  return { row, missing };
}

function insert(table, input, source = 'website') {
  const { row, missing } = clean(table, input);
  if (missing.length) { const e = new Error('Missing: ' + missing.join(', ')); e.status = 400; throw e; }
  const keys = Object.keys(row);
  const stmt = db.prepare(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}, source) VALUES (${keys.map((k) => '@' + k).join(',')}, @source)`);
  return stmt.run({ ...row, source }).lastInsertRowid;
}

const all = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
const count = (table) => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
const remove = (table, id) => db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes;
const setStatus = (table, id, status) => db.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).run(status, id).changes;

module.exports = { db, TABLES, insert, all, count, remove, setStatus };
