-- SchoolHub Cloudflare D1, v1.1. Do not put private student data in GitHub.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS academic_years (
  label INTEGER PRIMARY KEY,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN(0,1))
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL REFERENCES academic_years(label),
  grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 6),
  room_no INTEGER NOT NULL CHECK(room_no BETWEEN 1 AND 99),
  UNIQUE(year,grade,room_no)
);
CREATE INDEX IF NOT EXISTS idx_rooms_year ON rooms(year,grade,room_no);
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL REFERENCES academic_years(label),
  name TEXT NOT NULL,
  capacity INTEGER CHECK(capacity IS NULL OR capacity > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  UNIQUE(year,name)
);
CREATE INDEX IF NOT EXISTS idx_clubs_year ON clubs(year,name);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_no TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  club_id TEXT REFERENCES clubs(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','transferred','graduated')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_room ON students(room_id,status);
CREATE INDEX IF NOT EXISTS idx_students_club ON students(club_id,status);
CREATE TABLE IF NOT EXISTS teacher_rooms (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,room_id)
);
CREATE TABLE IF NOT EXISTS teacher_clubs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,club_id)
);
CREATE TABLE IF NOT EXISTS membership_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL REFERENCES students(id),
  old_club_id TEXT REFERENCES clubs(id),
  new_club_id TEXT REFERENCES clubs(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_membership_student ON membership_history(student_id,at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
INSERT OR IGNORE INTO academic_years(label,is_current) VALUES (2569,1);
-- A structural starting point only: actual room list can be adjusted by Admin.
-- 5 rooms for M.1-M.3; 6 rooms for M.4-M.6 based on uploaded source files.
INSERT OR IGNORE INTO rooms(id,year,grade,room_no) VALUES
('2569-1-1',2569,1,1),('2569-1-2',2569,1,2),('2569-1-3',2569,1,3),('2569-1-4',2569,1,4),('2569-1-5',2569,1,5),
('2569-2-1',2569,2,1),('2569-2-2',2569,2,2),('2569-2-3',2569,2,3),('2569-2-4',2569,2,4),('2569-2-5',2569,2,5),
('2569-3-1',2569,3,1),('2569-3-2',2569,3,2),('2569-3-3',2569,3,3),('2569-3-4',2569,3,4),('2569-3-5',2569,3,5),
('2569-4-1',2569,4,1),('2569-4-2',2569,4,2),('2569-4-3',2569,4,3),('2569-4-4',2569,4,4),('2569-4-5',2569,4,5),('2569-4-6',2569,4,6),
('2569-5-1',2569,5,1),('2569-5-2',2569,5,2),('2569-5-3',2569,5,3),('2569-5-4',2569,5,4),('2569-5-5',2569,5,5),('2569-5-6',2569,5,6),
('2569-6-1',2569,6,1),('2569-6-2',2569,6,2),('2569-6-3',2569,6,3),('2569-6-4',2569,6,4),('2569-6-5',2569,6,5),('2569-6-6',2569,6,6);
