-- SchoolHub v1.3 additive migration. Back up D1 before applying.
-- Supports atomic import guard checks and server-side audit of completed imports.
CREATE TABLE IF NOT EXISTS excel_import_guard (
  probe INTEGER NOT NULL CHECK (probe=1)
);
CREATE TABLE IF NOT EXISTS excel_import_runs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  mode TEXT NOT NULL CHECK(mode IN ('merge','sync')),
  preview_hash TEXT NOT NULL,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  unchanged INTEGER NOT NULL DEFAULT 0,
  override_capacity INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_excel_import_runs_created ON excel_import_runs(created_at);
