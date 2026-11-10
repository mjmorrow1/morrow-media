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
