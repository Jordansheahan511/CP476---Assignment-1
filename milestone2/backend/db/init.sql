-- backend/db/init.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  date_of_birth TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  priority    TEXT NOT NULL DEFAULT 'Medium',
  status      TEXT NOT NULL DEFAULT 'Not Started',
  created_by  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS task_assignments (
  task_id     INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- share table for the share button
CREATE TABLE IF NOT EXISTS task_shares (
  task_id    INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  shared_by  INTEGER NOT NULL,
  shared_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (shared_by) REFERENCES users(user_id) ON DELETE RESTRICT
);

-- If a user adds another user as a team member, both accounts should be able to see
-- the same task dashboard items
CREATE TABLE IF NOT EXISTS team_members (
  owner_id   INTEGER NOT NULL,
  member_id  INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, member_id),
  FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
