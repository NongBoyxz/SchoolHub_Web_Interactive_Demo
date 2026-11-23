# SchoolHub v1.7.0 — 2026-11-20

- Added `students.roll_no` for actual classroom roll numbers. Roster, attendance, forms and exports sort by grade, room, roll number (unassigned last).
- Added optional validated roll number in the add/edit student dialog. Classroom moves clear the previous room roll by default.
- Added a room-list shortcut to open each classroom's roster.
- Official activity Excel exports now retain **only two related worksheets** per download: club (club attendance + activity schedule), community (community attendance + schedule), or other (two activity worksheets). Extra source sheets and workbook relationships are removed.
- Collapsed the left sidebar into Overview plus 4 expandable navigation groups; no existing screen was removed.
- `migrations/0007_student_roll_numbers.sql` must be applied once before deploying this build.
- **Private student number mapping is distributed separately** and must never be pushed to GitHub.
- 19 local API tests passed; browser XLSX exports were validated and re-imported (2 sheets each).

## v1.6.3 — Permanent removal from the disabled-account list
- Add **ลบถาวร** next to **กู้คืนบัญชี** in **บัญชีที่นำออกแล้ว**.
- Super Admin only; target account must already be inactive.
- Require exact username + phrase ลบถาวร + meaningful reason.
- Prevent login, remove from users list, disallow restoring and free the original username for reuse.
- Keep an anonymized account reference for D1 foreign-key consistency and append an audit event.
- `0006_purged_accounts.sql` adds `purged_at`; run once before deploy.
- No student, room, club or attendance data reset.

# SchoolHub — Changelog

## v1.6.2 — Super Admin purge for account-removal audit entries

- Added dedicated, paginated account-removal audit list (`GET /api/audit/user-removals`) available **only to Super Admin**.
- Super Admin can purge **one exact** `remove_user` audit entry by ID (`POST /api/audit/user-removals/:id/purge`) with mandatory reason and typed confirmation.
- Atomic transaction deletes the selected record and writes a minimal `purge_user_removal_history` audit event. Audit event does not include the removed account username. Other history, user rows, session records and permissions are untouched.
- Added shortcut from **บัญชีและสิทธิ์**, and paginated list/dialog in **ประวัติการแก้ไข**. Pagination covers older removal records not shown in the latest 100 general audit entries.
- Added API test suite scenario for Super Admin/other roles, confirmation, duplicate purge, transaction consistency, and preserving unrelated history.
- No schema migration; existing D1 with real student data remains untouched by deploying these code files.

## v1.6.1 — Super Admin account removal and recovery

- Added account **ลบบัญชี** only for Super Admin, requiring a reason (≥5 characters) and typed confirmation of the exact username.
- Implemented transactional account deactivation (`active=0`), session revocation and teacher room/club assignment removal. No user row is physically removed, protecting historical foreign keys and audit trails.
- Prevented self-removal and removal of the last active Super Admin, including server-side guard against concurrent changes.
- Added a separate list of removed accounts and Super Admin-only **กู้คืนบัญชี**; login is restored but prior grants and teaching assignments are not.
- Fixed list-users API to return club Excel permissions and blocked reassigning a removed teacher.
- Added end-to-end API integration scenarios for authorization, active sessions, reason/username confirmation, audit, restoration and uniqueness.
- No new migration and no student/club/attendance data changes required.


## v1.6.0 — Search counts, manual entry, dashboard by room & official attendance workbook

- Added `total` to `/api/students` filtered responses; page controls use total matches instead of page-length heuristics.
- Added `/api/dashboard/rooms` with counts of **active, non-archived students** in each room, scoped to the user's homeroom rights.
- Simplified the Login view to hide infrastructure and diagnostic implementation text from end users; first-account setup remains distinct.
- Added **type-in rows** as an alternative to uploading `.xlsx/.csv` for student and club member import, continuing to use the same server-side Preview/Commit authorization, duplicate checks, quota limits and history. Every manual edit invalidates any prior preview.
- Added **แบบฟอร์มกิจกรรม** with authenticated `/api/forms/options` and `/api/forms/data`; preserved all six original worksheets from `ตารางเช็คเวลาเรียน 2.69.xlsx`. Blank forms and forms prefilled from authorized room/club rosters are generated on the user's device.
- Recorded attendance marks (`มา/สาย/ลา/ขาด`) are filled **only** for community-service sessions recorded in D1. Club attendance and other activity attendance cannot be filled until those modules exist; missing marks stay blank (never inferred as absences).
- Template dates are cleared unless configured; a starting date fills 20 weekly headings. Memberships spanning >41 students are split into multiple XLSX files within a ZIP without silently dropping students.
- Database: **no schema migration** and **no destructive changes**. Student names and IDs are never placed in public templates or JS bundles.
- Existing v1.5 functionality retained.

## Security notes

Authenticated form-data endpoints enforce homeroom / adviser scope server-side. Files are created in the browser; the XLSX source is a blank official form and contains no student records. ZIPs from the application may contain students' private information: store and share accordingly.

## v1.8.0 — ภาพประกอบกิจกรรม / เช็กชื่อ 3 ประเภท / ฟ้า–ขาว–ทอง / มือถือ

- เพิ่มแบบฟอร์ม Word A4 ภาพประกอบชุมนุมและบำเพ็ญประโยชน์ **แยกไฟล์**; อ้างอิงหัวข้อและกรอบภาพสี่เหลี่ยมจากเอกสารต้นฉบับ `.doc`, อัปโหลดและครอปรูปอัตราส่วน 4:3 ก่อนสร้าง `.docx` ในเบราว์เซอร์ (ไม่มีข้อมูลรูปส่งเข้า D1 หรือ CDN)
- เพิ่ม Migration **0008** เพื่อเช็กชื่อตามห้องและเช็กชื่อชุมนุม โดยรักษาการเช็กชื่อบำเพ็ญประโยชน์ไว้คนละชุดตาราง
- ตรวจสิทธิ์ผู้ใช้ใน API และบันทึกประวัติ; optimistic concurrency ไม่เขียนทับงานครูคนอื่น
- เพิ่มเช็กชื่อชุมนุมจาก D1 เป็นแหล่งข้อมูลสำหรับแบบฟอร์มเวลาเรียนชุมนุม
- แยกหมวดบำเพ็ญประโยชน์ออกมาเป็นเมนูหลัก และเพิ่มหมวดเช็กชื่อพร้อมเมนูย่อย 3 ประเภท
- ธีมฟ้า–ขาว–ทองแบบเรียบ, เมนูมือถือแบบ overlay, สถานะแบบแตะง่าย, ตารางแบบการ์ดบนจอเล็ก
- ปรับคำสั่ง `npm run check` ให้ใช้ได้ทั้ง Windows PowerShell และ Ubuntu
- ไม่มีการลบหรือแก้เลขประจำตัวนักเรียนเดิมใน Migration และไม่มีทะเบียนจริงใน Source Code
