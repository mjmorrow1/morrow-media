-- Jobs and invoices. Additive only: new tables + indexes + a permissions seed row.
-- Do not ALTER or DROP existing tables. Safe to re-run. Do not apply to production D1
-- until the owner approves a publish.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  completed_at TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_contact ON jobs (contact_id, updated_at);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status, updated_at);

CREATE TABLE IF NOT EXISTS job_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS job_line_items_job ON job_line_items (job_id, sort, id);

CREATE TABLE IF NOT EXISTS invoice_counters (
  key TEXT PRIMARY KEY,
  next INTEGER NOT NULL
);
INSERT OR IGNORE INTO invoice_counters (key, next) VALUES ('SBM', 1);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  job_id INTEGER REFERENCES jobs(id),
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'draft',
  issued_at TEXT,
  due_at TEXT,
  notes TEXT,
  tax_rate REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  public_token TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_payment_link_url TEXT,
  paid_at TEXT,
  paid_method TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS invoices_contact ON invoices (contact_id, created_at);
CREATE INDEX IF NOT EXISTS invoices_job ON invoices (job_id, created_at);
CREATE INDEX IF NOT EXISTS invoices_status ON invoices (status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_token_uq ON invoices (public_token);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_stripe_session_uq ON invoices (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice ON invoice_line_items (invoice_id, sort, id);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT,
  paid_at TEXT,
  note TEXT,
  stripe_event_id TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice ON invoice_payments (invoice_id, paid_at);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_stripe_event_uq ON invoice_payments (stripe_event_id) WHERE stripe_event_id IS NOT NULL;

INSERT OR IGNORE INTO admin_permissions (key, label, sort) VALUES ('invoices', 'Manage jobs and invoices', 3);
