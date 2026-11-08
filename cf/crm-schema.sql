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

