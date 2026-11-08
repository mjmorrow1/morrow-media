CREATE TABLE IF NOT EXISTS creators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "location" TEXT,
  "platform" TEXT,
  "instagram" TEXT,
  "tiktok" TEXT,
  "youtube" TEXT,
  "followers" TEXT,
  "avg_views" TEXT,
  "engagement" TEXT,
  "niche" TEXT,
  "audience" TEXT,
  "portfolio" TEXT,
  "rates" TEXT,
  "availability" TEXT,
  "travel" TEXT,
  "notes" TEXT,
  "status" TEXT,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "company" TEXT,
  "contact_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "industry" TEXT,
  "location" TEXT,
  "interests" TEXT,
  "goals" TEXT,
  "budget" TEXT,
  "timeline" TEXT,
  "status" TEXT,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "event_name" TEXT,
  "organizer" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "event_type" TEXT,
  "location" TEXT,
  "event_date" TEXT,
  "audience" TEXT,
  "attendance" TEXT,
  "needs" TEXT,
  "sponsor_needs" TEXT,
  "status" TEXT,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "client" TEXT,
  "creators" TEXT,
  "budget" TEXT,
  "deliverables" TEXT,
  "start_date" TEXT,
  "end_date" TEXT,
  "type" TEXT,
  "status" TEXT,
  "results" TEXT,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "company" TEXT,
  "industry" TEXT,
  "contact_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "campaign" TEXT,
  "tier" TEXT,
  "history" TEXT,
  "target_audience" TEXT,
  "budget" TEXT,
  "notes" TEXT,
  "status" TEXT,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_login_fails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT,
  at INTEGER
);
CREATE INDEX IF NOT EXISTS admin_login_fails_ip_at ON admin_login_fails (ip, at);
-- CRM migration (additive only: new tables + indexes; existing submission tables are untouched). Safe to re-run.
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT, email TEXT, phone TEXT, social TEXT,
  type TEXT DEFAULT 'other', stage TEXT DEFAULT 'lead', tags TEXT, source TEXT, notes TEXT,
  src_table TEXT, src_id INTEGER,
  created_at TEXT, updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_uq ON contacts (email) WHERE email IS NOT NULL AND email != '';
CREATE INDEX IF NOT EXISTS contacts_src ON contacts (src_table, src_id);
CREATE TABLE IF NOT EXISTS contact_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'note',
  body TEXT, at TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS contact_activities_contact ON contact_activities (contact_id, at);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  duration_min INTEGER DEFAULT 30,
  type TEXT DEFAULT 'call',
  notes TEXT,
  status TEXT DEFAULT 'open',
  location TEXT,
  seq INTEGER DEFAULT 0,
  gcal_event_id TEXT,
  completed_at TEXT, created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS followups_gcal ON followups (gcal_event_id);
CREATE INDEX IF NOT EXISTS followups_due ON followups (status, due_at);
CREATE INDEX IF NOT EXISTS followups_contact ON followups (contact_id, due_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
-- Authentisign (Lone Wolf) e-signature log. Manual today; external_signing_id / last_webhook_at are for the future API + webhook.
CREATE TABLE IF NOT EXISTS signings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  sent_at TEXT, completed_at TEXT,
  link TEXT, ref_id TEXT, notes TEXT,
  external_signing_id TEXT, last_webhook_at TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS signings_contact ON signings (contact_id, created_at);
CREATE INDEX IF NOT EXISTS signings_status ON signings (status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS signings_external_uq ON signings (external_signing_id) WHERE external_signing_id IS NOT NULL;
-- Short-lived Google OAuth state. The verifier is encrypted. Rows are single-use.
CREATE TABLE IF NOT EXISTS gcal_oauth_states (
  state TEXT PRIMARY KEY,
  verifier_enc TEXT NOT NULL,
  admin_email TEXT,
  created_at TEXT NOT NULL
);


-- Tickets (Jira-style) + KPI goals. Additive only.
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#0d0d0c',
  archived INTEGER DEFAULT 0,
  next_num INTEGER DEFAULT 1,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  num INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'task',
  status TEXT DEFAULT 'to do',
  priority TEXT DEFAULT 'medium',
  assignee TEXT DEFAULT 'Matt',
  labels TEXT,
  due_date TEXT,
  points REAL,
  value_cents INTEGER,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  followup_id INTEGER REFERENCES followups(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  started_at TEXT, completed_at TEXT, created_at TEXT, updated_at TEXT,
  UNIQUE (project_id, num)
);
CREATE INDEX IF NOT EXISTS tickets_status ON tickets (status, updated_at);
CREATE INDEX IF NOT EXISTS tickets_contact ON tickets (contact_id);
CREATE INDEX IF NOT EXISTS tickets_parent ON tickets (parent_id);
CREATE INDEX IF NOT EXISTS tickets_done ON tickets (completed_at);
CREATE TABLE IF NOT EXISTS ticket_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  body TEXT NOT NULL, author TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS ticket_comments_t ON ticket_comments (ticket_id, created_at);
CREATE TABLE IF NOT EXISTS ticket_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  field TEXT NOT NULL, from_value TEXT, to_value TEXT, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_history_t ON ticket_history (ticket_id, at);
CREATE INDEX IF NOT EXISTS ticket_history_status ON ticket_history (field, to_value, at);
CREATE TABLE IF NOT EXISTS kpi_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target REAL NOT NULL,
  period TEXT DEFAULT 'monthly',
  source TEXT DEFAULT 'manual',
  manual_value REAL DEFAULT 0,
  unit TEXT DEFAULT 'count',
  archived INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT
);
INSERT OR IGNORE INTO projects (name, key, color, archived, next_num, created_at, updated_at) VALUES ('Morrow Media', 'MM', '#0d0d0c', 0, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Grok site-editor chatbot (admin). Additive only.
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,          -- user | assistant | system
  content TEXT NOT NULL,
  patches_json TEXT,           -- assistant proposals (JSON array) when present
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_messages_created ON ai_messages (created_at);

CREATE TABLE IF NOT EXISTS ai_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | applied | discarded
  summary TEXT,
  patches_json TEXT NOT NULL,
  message_id INTEGER,
  applied_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS site_overrides (
  path TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  ct TEXT,
  h TEXT,
  note TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
