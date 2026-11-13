-- SchoolHub v1.2 additive migration. Run ONLY after 0001_init.sql on an existing D1 database.
-- No existing students, passwords, membership history or clubs are deleted.
CREATE TABLE IF NOT EXISTS student_archives (
  student_id TEXT PRIMARY KEY REFERENCES students(id),
  archived_at TEXT NOT NULL,
  archived_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_student_archives_at ON student_archives(archived_at);
