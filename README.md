## v1.7.0 — เลขที่นักเรียน / แบบฟอร์มแยกประเภท / เมนูย่อ

เพิ่มช่อง `roll_no` ให้ตาราง `students` (Migration 0007) และเรียงรายชื่อในห้องตามเลขที่ต้นฉบับพร้อมแสดงในหน้าเว็บ/เช็กชื่อ/CSV; เมนูยุบเหลือกลุ่มหลักที่เปิดเมนูย่อยได้ และไฟล์แบบฟอร์มแต่ละประเภทเหลือเพียง 2 Worksheet ที่เกี่ยวข้อง

ข้อมูลเลขที่จริง **ไม่อยู่ใน Source Code** ต้องนำเข้าไฟล์ `PRIVATE_student_roll_numbers_2569.sql` แยกผ่าน Wrangler หลังสำรอง D1; เก็บไฟล์นี้นอก Repository และอย่า Commit ขึ้น GitHub

# SchoolHub Cloudflare v1.8.2 — โรงเรียนเทพศาลาประชาสรรค์

This codebase deploys to Cloudflare Pages Functions and the existing D1 `DB` binding. Do not commit database exports, real student rosters, access tokens, or user passwords.

## Hotfix v1.8.2 — ภาพที่เลือกแต่ไม่ขึ้นพรีวิว

- เปลี่ยนการแสดงพรีวิวให้ใช้ FileReader (Data URL) เป็นหลัก และ Object URL เป็นทางเลือกสำรอง
- ใส่ภาพที่ถอดรหัสแล้วลงกรอบโดยตรง ลดการโหลดรูปซ้ำและปัญหา race condition
- แสดงสถานะการอ่านภาพใกล้ช่องเลือกไฟล์ พร้อมตรวจชนิดไฟล์จริง (JPG / PNG / WebP / HEIC / AVIF)
- ปรับข้อความข้อผิดพลาดให้บอกได้เมื่อไฟล์นามสกุล .jpg แต่ข้อมูลเป็น HEIC/AVIF หรือไฟล์เสีย
- ไม่มีการแก้ไข D1 และไม่ต้องรัน Migration

## เวอร์ชันล่าสุด v1.8.2

- ภาพประกอบกิจกรรมชุมนุมและบำเพ็ญประโยชน์เป็นไฟล์ Word A4 **แยกประเภท**, เลือก/ครอปรูป 4:3 และสร้างเอกสารในเบราว์เซอร์โดยไม่อัปโหลดรูป
- ระบบเช็กชื่อตามห้องและชุมนุมใหม่ พร้อมสถานะ มา/สาย/ลา/ขาด/ยังไม่ระบุ, สิทธิ์ผู้ใช้และประวัติแยกจากระบบบำเพ็ญประโยชน์เดิม
- แยกเมนูบำเพ็ญประโยชน์, เพิ่มหมวดเช็กชื่อ 3 ประเภท, ปรับธีมฟ้า–ขาว–ทองและหน้าจอมือถือ
- **Migration `migrations/0008_classroom_club_attendance.sql` ต้องสำรอง D1 และติดตั้งก่อน Deploy**; ไม่ต้องรัน Migration รุ่นก่อนหรือรีเซ็ตนักเรียนอีก
- คู่มือ Windows/Ubuntu: `INSTALL_TH_v1.8.md`

## อัปเดตจาก v1.8.0 เป็น v1.8.1 (แก้ไขหน้าเว็บและเพิ่มดาวน์โหลด)

- ปรับการแนบภาพ: แสดงตัวอย่างทันทีด้วย `<img>` ในกรอบครอป 4:3 (ใช้งานง่ายบนมือถือ), ซูมและลากจัดตำแหน่ง, ใช้ canvas เฉพาะตอนสร้างรูป JPEG สำหรับ Word; แจ้งสาเหตุเมื่อเปิดไฟล์รูปไม่ได้
- ช่อง `เปิดใช้งานชุมนุม` ในหน้าต่างแก้ไขใช้ checkbox ขนาด 18 × 18 px ไม่ขยายเต็มความกว้าง
- ทำหน้าจอเช็กชื่อ **ตามห้อง / ชุมนุม / บำเพ็ญประโยชน์** ให้ใช้ปุ่ม **มา, สาย, ลา, ขาด, —** เหมือนกันทุกหน้า โดยส่งเข้า API และตาราง D1 เดิมของแต่ละประเภท
- เหลือจุดเช็กชื่อบำเพ็ญประโยชน์เพียงหน้าเดียวที่หมวด **เช็กชื่อ**; หมวดบำเพ็ญประโยชน์ยังมีฟังก์ชันภาพประกอบ
- เพิ่มปุ่ม **ดาวน์โหลดใบเช็กชื่อ** และ **ฟอร์มเปล่า** บนทั้ง 3 หน้า ใช้ตัวสร้าง XLSX จาก `ตารางเช็คเวลาเรียน 2.69.xlsx` เดิม มี 2 Worksheet เฉพาะกิจกรรม; ดาวน์โหลดรายชื่อจาก API ตามสิทธิ์ผู้ใช้ พร้อมสถานะในวันที่มีบันทึกจริงของภาคเรียนที่เลือก (ไม่รวมข้อมูลจากวันอื่นแบบคาดเดา)
- เพิ่ม `kind=room` ใน `/api/forms/data` เพื่อรับทะเบียนและสถานะเช็กชื่อรายห้องผ่าน API ที่ตรวจสิทธิ์ผู้ใช้; `kind=club` และ `kind=community` ยังคงทำงานเดิม
- นำลิงก์ **เว็บจำลองเดิม** ออกจากหน้าล็อกอินและ Sidebar แล้ว (เว็บไซต์เดิมที่ราก URL ไม่ได้ถูกลบทิ้ง)
- **ไม่มี Migration ใหม่** สำหรับอัปเดตจาก v1.8.0; ไม่ต้องนำเข้าข้อมูลนักเรียนหรือเลขที่ซ้ำ

ดูคู่มือ Windows `INSTALL_TH_v1.8.1.md` ก่อนติดตั้ง

## Changes in 1.6.3
- Super Admin can use **ลบถาวร** inside **บัญชีที่นำออกแล้ว**.
- A removed account disappears from the user list and cannot be restored.
- Preserve historical foreign keys through a pseudonymous user tombstone; this is not a physical erasure of all past records or backups.
- New D1 migration: `migrations/0006_purged_accounts.sql`. Backup D1 and apply the migration **once before deploying v1.6.3**.
- Earlier v1.6.2 removal-history feature is unchanged.

## Changes in 1.6.2

- **Super Admin only:** open **บัญชีและสิทธิ์ → ดู/ลบประวัติการลบบัญชี** or go to **ประวัติการแก้ไข** to see all account-removal audit records, 50 per page.
- Permanently delete **one selected `remove_user` audit entry** after supplying a reason (at least 5 characters) and typing `ลบประวัติ` exactly. This affects the active D1 audit table; database backups may still contain older copies.
- A separate minimal `purge_user_removal_history` audit event is retained to identify which record was purged and by whom. Removing an event does **not** delete/deactivate/restore the actual user or delete any other audit records.
- Admin and Teacher roles cannot view or purge this special history via the API. Server checks permissions and records audit atomically.
- No migration required. Back up D1; don't run `apply_real_data.py` or earlier migrations again.

See `INSTALL_TH_v1.6.3.md` for the Ubuntu upgrade steps.

## Changes in 1.6.1

- Super Admin can remove (deactivate) user accounts from **บัญชีและสิทธิ์**, with required reason and exact username confirmation; active sessions and teacher assignments are revoked transactionally.
- Only Super Admin may restore deactivated accounts. On restore all Excel import permissions remain disabled, and homeroom/club assignments must be granted again.
- Self-removal and removal of the final active Super Admin are blocked in both API and UI.
- No hard deletion of `users` rows, so attendance, imports and audit references remain valid. Deactivated usernames remain reserved.
- No schema migration. Back up D1 before deploying v1.6.1; do not rerun real-data import or earlier migrations.

See `INSTALL_TH_v1.6.1.md` for Ubuntu instructions.

## Changes in 1.6

1. Counts for all filtered student search results.
2. Student totals by room in Dashboard, respecting role permissions.
3. Nontechnical end-user Login.
4. Manual entry mode in student and club Excel-import preview/commit flows.
5. Activity-form download derived from the user's supplied original `ตารางเช็คเวลาเรียน 2.69.xlsx`, in blank or populated mode. PDF output, club attendance and assessment are **not yet** supported.

The bundled blank original is `public/templates/SchoolHub_Attendance_2_69_Original.xlsx`; its six worksheets are preserved in generated XLSX. A roster per club/room is fetched from D1 only after authorization. Community attendance is included only where actually recorded. Up to 41 students fit on one worksheet; a multi-page roster downloads as a ZIP of several XLSX files. Dates are not inferred from a hardcoded template; set a start date or use saved community session dates.

## Upgrade

No migration is necessary from v1.5.0; **never rerun the earlier real-data reset importer**. Verify the existing `DB` binding and Back up D1 before deploying. Copy the `update/` directory into the existing Git checkout, run `npm run check && npm test`, then push the testing branch.

See `INSTALL_TH_v1.6.md` for a full Ubuntu walkthrough and checks.
