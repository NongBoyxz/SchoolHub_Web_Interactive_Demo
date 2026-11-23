-- SchoolHub v1.7.0: student number-in-class, independent of student ID.
-- Apply ONCE to Cloudflare D1 after full backup. This file contains NO student records.
-- The private roll-number fill is distributed separately; NEVER commit that file.
ALTER TABLE students ADD COLUMN roll_no INTEGER DEFAULT NULL CHECK(roll_no IS NULL OR (roll_no >= 1 AND roll_no <= 200));
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_room_roll ON students(room_id,roll_no) WHERE roll_no IS NOT NULL;
