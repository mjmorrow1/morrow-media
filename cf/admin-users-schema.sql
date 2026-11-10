-- Provisioned admin accounts. The owner still signs in with ADMIN_EMAIL / ADMIN_PASS_HASH.
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS form_alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_type TEXT,
  row_id INTEGER,
  ok INTEGER,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
