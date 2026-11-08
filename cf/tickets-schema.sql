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
