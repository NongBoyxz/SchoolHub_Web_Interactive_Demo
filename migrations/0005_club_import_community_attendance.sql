-- SchoolHub 1.5 additive migration; execute ONCE after exporting D1 backup.
-- Roles: homeroom for community service, club advisor for club membership import.
ALTER TABLE users ADD COLUMN can_import_club_excel INTEGER NOT NULL DEFAULT 0 CHECK(can_import_club_excel IN (0,1));
ALTER TABLE users ADD COLUMN can_sync_club_excel INTEGER NOT NULL DEFAULT 0 CHECK(can_sync_club_excel IN (0,1));
CREATE TABLE IF NOT EXISTS club_import_runs (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id),
 club_id TEXT NOT NULL REFERENCES clubs(id),
 mode TEXT NOT NULL CHECK(mode IN ('merge','sync')),
 preview_hash TEXT NOT NULL,
 added INTEGER NOT NULL,
 moved INTEGER NOT NULL,
 removed INTEGER NOT NULL,
 unchanged INTEGER NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 override_capacity INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_club_import_runs_club ON club_import_runs(club_id,created_at);
CREATE TABLE IF NOT EXISTS community_sessions (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL REFERENCES rooms(id),
 activity_date TEXT NOT NULL CHECK(length(activity_date)=10),
 term INTEGER NOT NULL CHECK(term IN(1,2)),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(room_id,activity_date)
);
CREATE INDEX IF NOT EXISTS idx_community_sessions_room_date ON community_sessions(room_id,activity_date);
CREATE TABLE IF NOT EXISTS community_attendance (
 session_id TEXT NOT NULL REFERENCES community_sessions(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 status TEXT CHECK(status IS NULL OR status IN ('มา','สาย','ลา','ขาด')),
 version INTEGER NOT NULL DEFAULT 1,
 marked_by TEXT NOT NULL REFERENCES users(id),
 marked_at TEXT NOT NULL,
 PRIMARY KEY(session_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_community_attendance_student ON community_attendance(student_id,session_id);
