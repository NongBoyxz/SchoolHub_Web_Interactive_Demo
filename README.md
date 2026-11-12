# SchoolHub Cloudflare v1.1 — GitHub → Cloudflare Pages → D1

> **สถานะ: รุ่นทดลองระบบข้อมูลจริงบน Cloudflare / ยังไม่พร้อมเปิดใช้ข้อมูลนักเรียนจริงทั้งโรงเรียน** เนื่องจากยังไม่มีการกู้คืนบัญชี Super Admin แบบอีเมล/Recovery Code, การนำเข้า XLSX และระบบสำรองข้อมูลตามข้อกำหนดเต็มรูปแบบ

เวอร์ชันนี้เพิ่มเว็บ `/app/` ที่เรียกข้อมูลจาก Cloudflare D1 ผ่าน Pages Functions โดยไม่เปลี่ยนลักษณะการใช้งานหน้า `index.html` (เว็บจำลองที่หน้าแรก) และไม่แนบไฟล์นักเรียนจริงไว้ใน Repository

## ฟังก์ชัน v1.1 ที่ทำได้

- ตั้งค่า Super Admin ครั้งแรกด้วย `BOOTSTRAP_TOKEN` ที่เก็บเป็น Secret บน Cloudflare
- ล็อกอินชื่อผู้ใช้/รหัสผ่าน; cookie HttpOnly, Secure, SameSite=Strict; logout, เปลี่ยนรหัสผ่าน
- บทบาท Super Admin, Admin และ Teacher ตรวจสิทธิ์ **ฝั่ง API** (ไม่ใช่แค่ซ่อนเมนู)
- ผู้ดูแลสร้างบัญชีให้ครู; มอบหมายห้องได้หลายห้องและชุมนุมได้ 1 ชุมนุมต่อครู
- รายชื่อห้อง ม.1–ม.6 สำหรับปี 2569 (โครงสร้าง 33 ห้อง แต่ **ไม่มีข้อมูลนักเรียนจริง**)
- เพิ่มและแก้ไขนักเรียน; เลขประจำตัวไม่ซ้ำ; รหัสภายในถาวร; ตรวจเวอร์ชันเพื่อป้องกันเขียนทับ
- ชุมนุม: เพิ่ม แก้ไข ปิดใช้งาน กำหนดจำนวนสูงสุด; Admin เพิ่มเกินโควตาพร้อมเหตุผลได้
- ย้ายชุมนุมทันที พร้อมประวัติ; จำกัดครูตามห้อง/ชุมนุมที่รับผิดชอบ
- ดาวน์โหลดรายชื่อนักเรียนเป็น **CSV UTF-8** ซึ่งเปิดด้วย Excel ได้; จำกัดข้อมูลตามสิทธิ์
- ประวัติการแก้ไขล่าสุดสำหรับ Admin

## ฟังก์ชันที่ยังไม่ได้ทำ

- เข้าระบบด้วย Google, สมัครครูเองพร้อมอนุมัติ, ลืมรหัสผ่านและ Recovery Code
- อัปโหลด XLSX พร้อมพรีวิว/อัปเดตเฉพาะรายชื่อ/ซิงก์เต็ม และตัวตรวจข้อมูลต้นฉบับ
- ปีการศึกษาใหม่/เลื่อนชั้นจริงแบบคัดลอกและ Excel
- เช็กชื่อชุมนุม/บำเพ็ญประโยชน์ 20 สัปดาห์, ประเมินผล, รายงาน PDF, Template Manager
- สำรอง/กู้คืนแบบใช้งานจากหน้าเว็บ, การแจ้งเตือนอีเมล, รูปภาพกิจกรรม
- การทดสอบพร้อมใช้งานจริง (security review, load test, backup recovery drill, independent audit)

## 1. วิธีเตรียม GitHub โดยไม่ลบ Demo เดิม

1. สำรอง Repository หรือสร้าง Branch เช่น `schoolhub-v1-1-test` จาก `main`
2. คัดลอกเนื้อหาใน ZIP ไปยัง **ราก Repository** (โฟลเดอร์เดียวกับ `index.html` เดิม) ได้แก่ `public/`, `functions/`, `migrations/`, `scripts/`, `package.json`, `.gitignore`
3. **อย่าแทนที่ไฟล์ `index.html` ที่อยู่ราก Repository เดิม** — ชุดนี้จงใจไม่รวมไฟล์ root นั้น
4. Build script (`scripts/build.mjs`) จะนำ `index.html` ล่าสุดใน GitHub ไปวางเป็น `public/index.html` ให้อัตโนมัติขณะ Deploy ทำให้หน้าแรกไม่ถูกแทนที่ด้วย HTML เก่าใน ZIP
5. Commit ไปยัง Branch ทดลองก่อน ไม่ Push เข้า `main` จนตรวจเรียบร้อย

โครงสร้างที่ได้:

```text
SchoolHub_Web_Interactive_Demo/
├─ index.html                 ← เว็บเดิม (ไม่แก้)
├─ public/
│  ├─ index.html              ← สำเนา fallback; จะถูก build ทับจาก root/index.html
│  ├─ app/
│  │  ├─ index.html
│  │  ├─ app.js
│  │  └─ style.css
│  ├─ _headers
│  └─ robots.txt
├─ functions/api/[[path]].js  ← API ทำงานบน Pages Functions
├─ migrations/0001_init.sql  ← โครงสร้าง D1 และ 33 ห้อง
├─ scripts/build.mjs
└─ package.json
```

## 2. ตั้งค่า Cloudflare Pages

ใน Cloudflare Dashboard → Workers & Pages → โปรเจกต์ Pages ที่เชื่อม GitHub อยู่

1. ไปที่ **Build settings** ของ Pages project:
   - Framework preset: None
   - Build command: `node scripts/build.mjs` (หรือ `npm run build`)
   - Build output directory: `public`
   - Root directory: ราก Repository
   - Production branch: `main` ตามที่ใช้อยู่
2. บันทึกการตั้งค่า; **ตรวจว่า Branch ทดลองสร้าง Preview ได้** ก่อนรวมเข้า `main`
3. ชุดนี้ไม่ต้องเปลี่ยนโดเมนหรือสร้าง Repository ใหม่

> หาก Pages เดิมกำหนด Output directory เป็น `.` หรือ root การเปลี่ยนเป็น `public` เป็นสิ่งจำเป็นเพื่อให้ `/app/` และ Functions ทำงานตามโครงสร้างใหม่นี้ กรุณาตรวจ Preview ก่อน เพราะการเปลี่ยน build config อาจกระทบหน้าแรกถ้าไม่ได้รัน build script

## 3. สร้าง D1 และรันโครงสร้างฐานข้อมูล

สร้างฐานข้อมูล D1 สำหรับ **ทดลองแยกจากฐานข้อมูลใช้งานจริง** ชื่อเช่น `schoolhub-staging`

วิธีผ่าน Wrangler CLI (จากเครื่องที่มี Node.js):

```bash
npx wrangler login
npx wrangler d1 create schoolhub-staging
npx wrangler d1 execute schoolhub-staging --remote --file=./migrations/0001_init.sql
```

**สำคัญ:** `--remote` คือเขียนลงฐานข้อมูล Cloudflare ที่เลือก (ไม่ใช่เครื่องคุณ) ควรตรวจชื่อ DB ให้แน่ใจก่อนรัน และ **ห้ามรัน migration ตัวนี้บนฐานข้อมูลที่มีข้อมูลเดิมโดยไม่ได้สำรอง**

ใน Pages Project → Settings → Bindings → Add D1 database binding:

- Variable name ต้องเป็น **`DB`** (ตัวพิมพ์ใหญ่)
- เลือก D1 `schoolhub-staging` สำหรับ Preview/ทดลอง
- หากมี Production ให้สร้าง **D1 แยกอีกชุด** สำหรับ Production อย่าผูกทั้งสองสภาพแวดล้อมเข้าฐานเดียวกัน
- บันทึกและ Deploy ใหม่

หากตั้งค่าผ่าน Wrangler config โปรดตรวจความต่างระหว่าง Preview/Production อย่านำ `wrangler.example.toml` ซึ่งยังเป็น placeholder ไป Deploy ทันที

## 4. ตั้งค่า Secret สำหรับสร้าง Super Admin

บน Pages Project ตั้งค่า **Secret** ชื่อ `BOOTSTRAP_TOKEN` ผ่าน Cloudflare Dashboard ใน environment ที่ทดลอง โดยกำหนดเป็นค่าแบบสุ่มยาวอย่างน้อย 24 ตัวอักษร เช่น สร้างด้วย:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**ห้ามใส่รหัสนี้ไว้ใน GitHub, JavaScript, HTML, หรือไฟล์ `.env` ที่ Commit**

ไปที่ URL Preview ของคุณเติม `/app/` เช่น `https://<preview-domain>/app/` และใส่ `BOOTSTRAP_TOKEN` เฉพาะการสร้างบัญชี Super Admin ครั้งแรก บัญชีใหม่ใช้รหัสผ่านยาวอย่างน้อย 12 ตัว เมื่อมีบัญชีแล้วระบบจะปิดการตั้งค่าแรกโดยอัตโนมัติ

> **ความปลอดภัย:** ถ้าลืมรหัส Super Admin รุ่นนี้ยังไม่มีระบบอีเมล/Recovery Code ให้ใช้ จึงควรเก็บข้อมูลกู้คืนไว้ก่อนนำไปใช้จริง ห้ามนำข้อมูลนักเรียนจริงขึ้นระบบก่อนเพิ่มกลไกกู้คืนและสำรองข้อมูลที่ทดสอบแล้ว

## 5. ทดลองใช้งาน

1. เข้า `/app/` และตั้งค่า Super Admin ครั้งแรก
2. เข้าสู่ระบบ → สร้างชุมนุม → เพิ่มนักเรียนตัวอย่าง 1–2 คน
3. ลองย้ายชุมนุม ตรวจประวัติการแก้ไข และส่งออก CSV
4. ไปที่เมนูบัญชี สร้าง Teacher และกำหนดห้อง/ชุมนุม
5. ใช้หน้าต่างส่วนตัว (Incognito) เข้าระบบด้วย Teacher; ตรวจว่าแก้ข้อมูลนอกห้องไม่ได้
6. ลองเปิดข้อมูลเก่าค้างไว้จากสองแท็บแล้วแก้ไขซ้อน ต้องได้รับข้อผิดพลาดข้อมูลเปลี่ยน (HTTP 409)

### การตรวจ API

- `GET /api/status` → `{ready:true,setup_required:...}` เมื่อ DB พร้อม
- `GET /api/auth/me` → 401 ถ้าไม่ได้ล็อกอิน
- `GET /api/students` → ข้อมูลได้เฉพาะบัญชีมีสิทธิ์

## 6. ทดลองทดสอบโค้ด (ไม่ใช้ Cloudflare จริง)

หากติดตั้ง Node.js v22 ขึ้นไปแล้ว สามารถรัน Unit Test ของ Pages Functions กับ SQLite ในเครื่อง:

```bash
node --test tests/api.test.mjs
```

ทดสอบ 5 กลุ่ม: ตั้งค่า Super Admin, ล็อกอิน, นักเรียนและโควตา, ย้ายชุมนุม/CSV, สิทธิ์ครู/Logout

> ทดสอบนี้เป็น **mock D1 ด้วย Node SQLite** ไม่เท่ากับการทดสอบบน Cloudflare Workers runtime จริง; ให้ทดสอบ Deploy บน Preview ก่อน

## 7. ข้อควรระวังก่อนเปิดใช้ข้อมูลจริง

- GitHub Repository ของคุณเป็น Public: ห้าม Push ไฟล์ Excel ของนักเรียน, DB, API tokens, credential หรือสำเนาข้อมูลจริง
- D1 ต้องผูกกับ Pages Functions ไม่ใช่เขียนข้อมูลนักเรียนไว้ใน HTML
- HTTPS ใช้จริงบน Pages; คุกกี้ตั้งค่า Secure, HttpOnly และ SameSite=Strict
- ก่อนใช้จริงทั้งโรงเรียนต้องมีการกู้คืนบัญชี การสำรอง/ทดสอบกู้คืน การเปลี่ยนรหัส/ปิดบัญชีครู การป้องกัน brute force ในระดับ WAF และตรวจ PDPA/สิทธิ์การเข้าถึง
- โค้ดนี้ **ไม่ได้ถูก Push ไป GitHub หรือ Deploy ให้คุณอัตโนมัติ** ต้อง Commit และตั้งค่าตามขั้นตอนข้างต้น

## แหล่งอ้างอิงทางเทคนิค

- Cloudflare Pages Functions: https://developers.cloudflare.com/pages/functions/get-started/
- Cloudflare Pages + D1 binding: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Pages Git integration: https://developers.cloudflare.com/pages/get-started/git-integration/
- Cloudflare D1 CLI: https://developers.cloudflare.com/d1/get-started/
