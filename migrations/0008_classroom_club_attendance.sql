-- SchoolHub v1.8.0, additive only: room and club attendance.
-- Run ONCE after a successful D1 backup. Keep existing community attendance separate.
CREATE TABLE IF NOT EXISTS activity_sessions (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('room','club')),
 target_id TEXT NOT NULL,
 activity_date TEXT NOT NULL CHECK(length(activity_date)=10),
 term INTEGER NOT NULL CHECK(term IN (1,2)),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(kind,target_id,activity_date)
);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_type_date ON activity_sessions(kind,target_id,activity_date);
CREATE TABLE IF NOT EXISTS activity_attendance (
 session_id TEXT NOT NULL REFERENCES activity_sessions(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 status TEXT CHECK(status IS NULL OR status IN ('มา','สาย','ลา','ขาด')),
 version INTEGER NOT NULL DEFAULT 1,
 marked_by TEXT NOT NULL REFERENCES users(id),
 marked_at TEXT NOT NULL,
 PRIMARY KEY(session_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_attendance_student ON activity_attendance(student_id,session_id);
