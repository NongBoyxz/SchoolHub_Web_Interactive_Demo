# SchoolHub Cloudflare v1.1

## เพิ่มใหม่
- Cloudflare Pages app ที่ `/app/` พร้อม UI Responsive
- Cloudflare Pages Function API + D1 schema และ 33 ห้องโครงสร้างปี 2569
- Initial Super Admin Setup ป้องกันคนที่ไม่ทราบ Secret
- Session cookie Secure + HttpOnly, role checks ฝั่ง API, PBKDF2 password hashing, rate-limited login
- เพิ่ม/แก้ข้อมูลนักเรียน, ตรวจเลขประจำตัวซ้ำ, version checks และ audit log
- จัดการชื่อชุมนุม/ความจุ, ย้ายสมาชิก, ประวัติย้าย และ Admin override เมื่อเต็ม
- ผู้ดูแลสร้างบัญชีครูและกำหนดความรับผิดชอบ
- CSV export เฉพาะข้อมูลที่มีสิทธิ์

## ยังไม่รองรับ
- นำเข้า XLSX, ซิงก์ Excel เต็ม, Google OAuth, Self-signup, Recovery Codes
- ปีการศึกษาใหม่, เช็กชื่อ/ประเมินผล, เทมเพลตรายงาน/PDF, สำรองกู้คืนและอีเมล

## เป้าหมายการ Deploy
- เก็บ root `index.html` ปัจจุบันไว้ (Demo ไม่หาย)
- เปลี่ยน Build command เป็น `node scripts/build.mjs`, Output directory `public`
- เก็บข้อมูลจริงไว้ใน D1 เท่านั้น
