// SchoolHub v1.3 — Cloudflare Pages Functions + D1. No student data is bundled in static assets.
const encoder = new TextEncoder();
const MAX_BODY = 90000;
const SESSION_SECONDS = 8 * 3600;
const sqlNow = () => new Date().toISOString();
const error = (message, status = 400, code = 'ERROR') => Object.assign(new Error(message), { status, code });
const id = () => crypto.randomUUID();
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const randomHex = length => hex(crypto.getRandomValues(new Uint8Array(length)));
const sha256 = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
async function passwordHash(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), c => parseInt(c, 16));
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt, iterations:100000 }, key, 256)));
}
function constantEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i=0; i<Math.max(a.length,b.length); i++) diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return diff === 0;
}
function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), { status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers} });
}
function cleanString(value, max=120) { return String(value??'').trim().slice(0,max); }
function required(value, title, max=120) {
  const s=cleanString(value,max);
  if(!s) throw error(`กรุณาระบุ${title}`);
  return s;
}
function validUsername(v) {
  const u=cleanString(v,50).toLowerCase();
  if (!/^[a-z0-9_.-]{4,50}$/.test(u)) throw error('ชื่อผู้ใช้ต้องเป็นอักษรอังกฤษ/ตัวเลข 4–50 ตัว');
  return u;
}
function validPassword(p) {
  if(typeof p!=='string'||p.length<12||p.length>128) throw error('รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร และไม่เกิน 128 ตัว');
  return p;
}
async function body(request) {
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) throw error('กรุณาส่งข้อมูล JSON');
  const raw=await request.text();
  if(encoder.encode(raw).byteLength>MAX_BODY) throw error('ข้อมูลใหญ่เกินกำหนด',413);
  try { const p=JSON.parse(raw); if(!p || Array.isArray(p) || typeof p!=='object') throw 0; return p; }
  catch { throw error('JSON ไม่ถูกต้อง'); }
}
function requireMethod(method, expected) { if(method!==expected) throw error('Method not allowed',405); }
function access(user, ...roles) { if(!user || !roles.includes(user.role)) throw error('ไม่มีสิทธิ์ดำเนินการ',403,'FORBIDDEN'); }
function isAdmin(user) { return user.role==='super_admin'||user.role==='admin'; }
function canImportExcel(user) { return isAdmin(user) || (user.role==='teacher' && user.can_import_excel===1); }
function canSyncExcel(user) { return isAdmin(user) || (user.role==='teacher' && user.can_import_excel===1 && user.can_sync_excel===1); }
function cookieToken(request) { const m=/(?:^|;\s*)sh_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie')||''); return m?.[1]||null; }
const cookie = (v, seconds=SESSION_SECONDS) => `sh_session=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
async function who(db, request) {
  const token = cookieToken(request);
  if(!token) return null;
  const hashed=await sha256(token);
  return await db.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.active,u.can_import_excel,u.can_sync_excel
    FROM sessions s JOIN users u ON s.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(hashed,sqlNow()).first();
}
async function visibleRoom(db,user,roomId) {
  if(isAdmin(user)) return true;
  return !!(await db.prepare('SELECT 1 AS ok FROM teacher_rooms WHERE user_id=? AND room_id=?').bind(user.id,roomId).first());
}
async function visibleClub(db,user,clubId) {
  if(isAdmin(user)) return true;
  return !!(await db.prepare('SELECT 1 AS ok FROM teacher_clubs WHERE user_id=? AND club_id=?').bind(user.id,clubId).first());
}
async function studentVisible(db,user,s) { return isAdmin(user) || await visibleRoom(db,user,s.room_id) || (s.club_id && await visibleClub(db,user,s.club_id)); }
async function studentRow(db,studentId) {
  return db.prepare(`SELECT s.*,r.year AS room_year,r.grade,r.room_no FROM students s
    JOIN rooms r ON r.id=s.room_id WHERE s.id=?`).bind(studentId).first();
}
async function validatedClub(db,clubId,year) {
  if(clubId===null || clubId==='' || clubId===undefined) return null;
  const c=await db.prepare('SELECT * FROM clubs WHERE id=? AND year=? AND active=1').bind(clubId,year).first();
  if(!c) throw error('ชุมนุมปลายทางไม่มีหรือไม่เปิดใช้งาน');
  return c;
}
async function log(db,user,action,type,entityId,details={}) {
  await db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at) VALUES (?,?,?,?,?,?)')
    .bind(user.id,action,type,entityId,JSON.stringify(details),sqlNow()).run();
}
async function login(db, request) {
  const p=await body(request); const username=validUsername(p.username); const password=String(p.password||'');
  const ip=cleanString(request.headers.get('CF-Connecting-IP')||'local',64);
  const key=await sha256(`${ip}:${username}`), now=Date.now();
  const attempt=await db.prepare('SELECT attempts,updated_at FROM login_attempts WHERE key=?').bind(key).first();
  if(attempt && Date.parse(attempt.updated_at)>now-15*60000 && attempt.attempts>=6) throw error('ลองรหัสผ่านมากเกินไป โปรดลองใหม่ใน 15 นาที',429,'RATE_LIMIT');
  const u=await db.prepare('SELECT * FROM users WHERE username=? AND active=1').bind(username).first();
  // Fixed amount of PBKDF2 work even if the username does not exist.
  const salt=u?.password_salt || '0'.repeat(32);
  const computed=await passwordHash(password||'not-a-password',salt);
  if(!u||!constantEqual(computed,u.password_hash)) {
    const next=(attempt&&Date.parse(attempt.updated_at)>now-15*60000?attempt.attempts:0)+1;
    await db.prepare(`INSERT INTO login_attempts(key,attempts,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,updated_at=excluded.updated_at`).bind(key,next,sqlNow()).run();
    throw error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',401,'LOGIN_FAILED');
  }
  await db.prepare('DELETE FROM login_attempts WHERE key=?').bind(key).run();
  const token=randomHex(32), expiry=new Date(Date.now()+SESSION_SECONDS*1000).toISOString();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
    .bind(await sha256(token),u.id,expiry,sqlNow()).run();
  return json({ok:true,user:{id:u.id,username:u.username,display_name:u.display_name,role:u.role,can_import_excel:u.can_import_excel,can_sync_excel:u.can_sync_excel}},200,{'Set-Cookie':cookie(token)});
}
async function setup(db,request,env) {
  const p=await body(request);
  const existing=await db.prepare('SELECT 1 AS yes FROM users LIMIT 1').first();
  if(existing) throw error('ตั้งค่า Super Admin ครั้งแรกไปแล้ว',409,'ALREADY_SETUP');
  if(!env.BOOTSTRAP_TOKEN || String(env.BOOTSTRAP_TOKEN).length<24) throw error('ยังไม่ได้ตั้งค่า BOOTSTRAP_TOKEN ใน Cloudflare',503,'NOT_CONFIGURED');
  if(!constantEqual(String(p.setupToken||''),String(env.BOOTSTRAP_TOKEN))) throw error('รหัสติดตั้งไม่ถูกต้อง',403,'FORBIDDEN');
  const username=validUsername(p.username), displayName=required(p.display_name,'ชื่อผู้ดูแล');
  const pwd=validPassword(p.password), salt=randomHex(16), uid=id();
  const hashed=await passwordHash(pwd,salt);
  // INSERT ... SELECT guarded by NOT EXISTS ensures concurrent setups cannot create two first users.
  const res=await db.prepare(`INSERT INTO users(id,username,display_name,role,password_salt,password_hash,created_at)
    SELECT ?,?,?,'super_admin',?,?,? WHERE NOT EXISTS(SELECT 1 FROM users)`)
    .bind(uid,username,displayName,salt,hashed,sqlNow()).run();
  if(!res.meta?.changes) throw error('บัญชีแรกถูกสร้างไปแล้ว',409);
  await log(db,{id:uid},'bootstrap','user',uid,{username});
  return json({ok:true,message:'สร้าง Super Admin แล้ว กรุณาเข้าสู่ระบบ'},201);
}
async function getDashboard(db,user) {
  if(isAdmin(user)) {
    const [students,clubs,rooms,teachers]=await db.batch([
      db.prepare("SELECT COUNT(*) AS n FROM students WHERE status='active' AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=students.id)"),
      db.prepare('SELECT COUNT(*) AS n FROM clubs WHERE active=1'),
      db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE year=(SELECT label FROM academic_years WHERE is_current=1 LIMIT 1)'),
      db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='teacher' AND active=1")
    ]);
    return {students:students.results[0].n,clubs:clubs.results[0].n,rooms:rooms.results[0].n,teachers:teachers.results[0].n};
  }
  const [st,cl,rm]=await db.batch([
    db.prepare(`SELECT COUNT(DISTINCT s.id) AS n FROM students s WHERE s.status='active' AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=s.id)
      AND (s.room_id IN (SELECT room_id FROM teacher_rooms WHERE user_id=?) OR
      s.club_id IN (SELECT club_id FROM teacher_clubs WHERE user_id=?))`).bind(user.id,user.id),
    db.prepare('SELECT COUNT(*) AS n FROM teacher_clubs WHERE user_id=?').bind(user.id),
    db.prepare('SELECT COUNT(*) AS n FROM teacher_rooms WHERE user_id=?').bind(user.id)
  ]);
  return {students:st.results[0].n,clubs:cl.results[0].n,rooms:rm.results[0].n,teachers:null};
}
async function listStudents(db,user,url) {
  const q=cleanString(url.searchParams.get('q'),100),roomId=cleanString(url.searchParams.get('room_id'),80);
  const clubId=cleanString(url.searchParams.get('club_id'),80), page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
  const limit=50, where=["s.status='active'",'NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=s.id)']; const args=[];
  if(!isAdmin(user)) {where.push(`(s.room_id IN(SELECT room_id FROM teacher_rooms WHERE user_id=?) OR s.club_id IN(SELECT club_id FROM teacher_clubs WHERE user_id=?))`); args.push(user.id,user.id);}
  if(q){where.push(`(s.student_no LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)`); args.push(`%${q}%`,`%${q}%`,`%${q}%`);}
  if(roomId){where.push('s.room_id=?'); args.push(roomId);}
  if(clubId){where.push('s.club_id=?'); args.push(clubId);}
  const stmt=db.prepare(`SELECT s.id,s.student_no,s.prefix,s.first_name,s.last_name,s.room_id,s.club_id,s.status,s.version,
     r.grade,r.room_no,r.year,c.name AS club_name,
     (CASE WHEN ?=1 OR s.room_id IN (SELECT room_id FROM teacher_rooms WHERE user_id=?) THEN 1 ELSE 0 END) AS can_edit_personal
    FROM students s JOIN rooms r ON r.id=s.room_id LEFT JOIN clubs c ON c.id=s.club_id
    WHERE ${where.join(' AND ')} ORDER BY r.grade,r.room_no,s.student_no LIMIT ? OFFSET ?`);
  const rows=await stmt.bind(isAdmin(user)?1:0,user.id,...args,limit,(page-1)*limit).all();
  return {items:rows.results,page,page_size:limit};
}
async function createStudent(db,user,request) {
  const p=await body(request);
  const studentNo=required(p.student_no,'เลขประจำตัว',30), first=required(p.first_name,'ชื่อ',100);
  const last=required(p.last_name,'นามสกุล',100), roomId=required(p.room_id,'ห้องเรียน',80);
  const room=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(roomId).first();
  if(!room) throw error('ไม่พบห้องเรียน');
  if(!await visibleRoom(db,user,roomId)) throw error('ไม่มีสิทธิ์เพิ่มนักเรียนในห้องนี้',403);
  const club=await validatedClub(db,p.club_id,room.year), clubId=club?.id||null;
  if(clubId && !isAdmin(user) && !await visibleRoom(db,user,roomId)) throw error('ไม่มีสิทธิ์',403);
  const studentId=id(),now=sqlNow();
  if(isAdmin(user)&&p.override_capacity===true&&cleanString(p.reason,200).length<5) throw error('กรุณากรอกเหตุผลอย่างน้อย 5 ตัวอักษรเมื่ออนุญาตเกินโควตา');
  const override=isAdmin(user)&&p.override_capacity===true;
  const statement = db.prepare(`INSERT INTO students(id,student_no,prefix,first_name,last_name,room_id,club_id,created_at,updated_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR ?=1 OR
     (SELECT capacity FROM clubs WHERE id=?) IS NULL OR
     (SELECT COUNT(*) FROM students WHERE club_id=? AND status='active' AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=students.id)) < (SELECT capacity FROM clubs WHERE id=?)`)
   .bind(studentId,studentNo,cleanString(p.prefix,20),first,last,roomId,clubId,now,now,clubId,override?1:0,clubId,clubId,clubId);
  try {
    const r=await statement.run();
    if(!r.meta?.changes) throw error('ชุมนุมเต็มแล้ว ไม่สามารถเพิ่มสมาชิกได้',409,'CLUB_FULL');
  } catch(e) { if(/UNIQUE constraint failed: students.student_no/i.test(String(e))) throw error('เลขประจำตัวนี้มีอยู่ในระบบแล้ว',409,'DUPLICATE'); throw e; }
  if(clubId) await db.prepare('INSERT INTO membership_history(student_id,old_club_id,new_club_id,actor_id,reason,at) VALUES(?,?,?,?,?,?)')
    .bind(studentId,null,clubId,user.id,cleanString(p.reason,200),now).run();
  await log(db,user,'create','student',studentId,{student_no:studentNo,room_id:roomId,club_id:clubId});
  return {id:studentId};
}
async function updateStudent(db,user,studentId,request) {
  const p=await body(request), current=await studentRow(db,studentId);
  if(!current||current.status!=='active'||await db.prepare('SELECT 1 FROM student_archives WHERE student_id=?').bind(studentId).first()) throw error('ไม่พบนักเรียนที่ใช้งานอยู่',404);
  if(!await studentVisible(db,user,current)) throw error('ไม่มีสิทธิ์เข้าถึงนักเรียน',403);
  if(!await visibleRoom(db,user,current.room_id)) throw error('เฉพาะครูประจำชั้นของนักเรียนหรือ Admin จึงแก้ข้อมูลส่วนตัวได้',403);
  const v=Number(p.version); if(!Number.isInteger(v)||v!==current.version) throw error('ข้อมูลมีการแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด',409,'STALE');
  const next={student_no: p.student_no===undefined?current.student_no:required(p.student_no,'เลขประจำตัว',30),
    prefix:p.prefix===undefined?current.prefix:cleanString(p.prefix,20),
    first_name:p.first_name===undefined?current.first_name:required(p.first_name,'ชื่อ',100),
    last_name:p.last_name===undefined?current.last_name:required(p.last_name,'นามสกุล',100),
    room_id:p.room_id===undefined?current.room_id:required(p.room_id,'ห้องเรียน',80),
    status:p.status===undefined?current.status:p.status};
  if(!isAdmin(user) && (next.room_id!==current.room_id||next.status!==current.status)) throw error('ย้ายห้องหรือเปลี่ยนสถานะเป็นสิทธิ์ของ Admin เท่านั้น',403);
  if(!['active','transferred','graduated'].includes(next.status)) throw error('สถานะไม่ถูกต้อง');
  const newRoom=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(next.room_id).first();
  if(!newRoom) throw error('ไม่พบห้องเรียน');
  if(current.club_id && newRoom.year!==current.room_year) throw error('กรุณาย้ายชุมนุมออกก่อนย้ายไปต่างปีการศึกษา');
  const now=sqlNow();
  const stmts=[
    db.prepare(`UPDATE students SET student_no=?,prefix=?,first_name=?,last_name=?,room_id=?,status=?,version=version+1,updated_at=?
      WHERE id=? AND version=? AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=students.id)`).bind(next.student_no,next.prefix,next.first_name,next.last_name,next.room_id,next.status,now,studentId,v),
    db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at)
      SELECT ?,'update','student',?,?,? FROM students WHERE id=? AND version=? AND changes()>0`)
      .bind(user.id,studentId,JSON.stringify({old:{student_no:current.student_no,room_id:current.room_id,status:current.status},new:next}),now,studentId,v+1)
  ];
  try {const [r]=await db.batch(stmts); if(!r.meta?.changes) throw error('ข้อมูลมีการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่',409,'STALE');}
  catch(e){if(/UNIQUE constraint failed: students.student_no/i.test(String(e))) throw error('เลขประจำตัวนี้มีอยู่ในระบบแล้ว',409,'DUPLICATE'); throw e;}
  return {ok:true,version:v+1};
}
async function transferClub(db,user,request) {
  const p=await body(request), s=await studentRow(db,required(p.student_id,'นักเรียน',80));
  if(!s||s.status!=='active'||await db.prepare('SELECT 1 FROM student_archives WHERE student_id=?').bind(s.id).first()) throw error('ไม่พบนักเรียนที่ใช้งานอยู่',404);
  if(!await studentVisible(db,user,s)) throw error('ไม่มีสิทธิ์',403);
  const v=Number(p.version);
  if(!Number.isInteger(v)||v!==s.version) throw error('ข้อมูลมีการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่',409,'STALE');
  const newClub=await validatedClub(db,p.club_id,s.room_year), clubId=newClub?.id||null;
  if(s.club_id===clubId) throw error('นักเรียนอยู่ในชุมนุมนี้แล้ว');
  if(!isAdmin(user) && !(await visibleRoom(db,user,s.room_id) || (s.club_id && await visibleClub(db,user,s.club_id)) || (clubId && await visibleClub(db,user,clubId)))) throw error('ไม่มีสิทธิ์ย้ายสมาชิก',403);
  if(isAdmin(user)&&p.override_capacity===true&&cleanString(p.reason,200).length<5) throw error('กรุณากรอกเหตุผลอย่างน้อย 5 ตัวอักษรเมื่ออนุญาตเกินโควตา');
  const override=isAdmin(user)&&p.override_capacity===true;
  const now=sqlNow(), reason=cleanString(p.reason,200);
  const capacityClause=clubId ? `AND (?=1 OR (SELECT capacity FROM clubs WHERE id=?) IS NULL OR (SELECT COUNT(*) FROM students WHERE club_id=? AND status='active' AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=students.id)) < (SELECT capacity FROM clubs WHERE id=?))` : '';
  const update=db.prepare(`UPDATE students SET club_id=?,version=version+1,updated_at=? WHERE id=? AND version=? AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=students.id) ${capacityClause}`);
  const params=clubId?[clubId,now,s.id,v,override?1:0,clubId,clubId,clubId]:[null,now,s.id,v];
  const [result] = await db.batch([
    update.bind(...params),
    db.prepare(`INSERT INTO membership_history(student_id,old_club_id,new_club_id,actor_id,reason,at)
      SELECT ?,?,?,?,?,? FROM students WHERE id=? AND version=? AND changes()>0`).bind(s.id,s.club_id,clubId,user.id,reason,now,s.id,v+1),
    db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at)
      SELECT ?,'transfer','student',?,?,? FROM students WHERE id=? AND version=? AND changes()>0`)
      .bind(user.id,s.id,JSON.stringify({old_club_id:s.club_id,new_club_id:clubId,override:!!override,reason}),now,s.id,v+1)
  ]);
  if(!result.meta?.changes) throw error('ข้อมูลเปลี่ยนแล้วหรือชุมนุมเต็ม กรุณาตรวจสอบและลองใหม่',409,'STALE_OR_FULL');
  return {ok:true,version:v+1};
}
async function listArchivedStudents(db,user,url) {
  access(user,'super_admin','admin');
  const q=cleanString(url.searchParams.get('q'),100);
  const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
  const args=[], where=[];
  if(q){where.push('(s.student_no LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)');args.push(`%${q}%`,`%${q}%`,`%${q}%`);}
  const result=await db.prepare(`SELECT s.id,s.student_no,s.prefix,s.first_name,s.last_name,s.room_id,s.club_id,s.status,s.version,
     r.grade,r.room_no,r.year,a.archived_at,a.reason,a.archived_by,u.display_name AS archived_by_name
     FROM student_archives a JOIN students s ON s.id=a.student_id
     JOIN rooms r ON r.id=s.room_id JOIN users u ON u.id=a.archived_by
     ${where.length?'WHERE '+where.join(' AND '):''}
     ORDER BY a.archived_at DESC,s.student_no LIMIT 50 OFFSET ?`).bind(...args, (page-1)*50).all();
  return {items:result.results,page,page_size:50};
}
async function archiveStudent(db,user,studentId,request) {
  access(user,'super_admin','admin');
  const p=await body(request), student=await studentRow(db,studentId);
  if(!student||student.status!=='active') throw error('ไม่พบนักเรียนที่ใช้งานอยู่',404);
  const version=Number(p.version);
  if(!Number.isInteger(version)||student.version!==version) throw error('ข้อมูลมีการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่',409,'STALE');
  const already=await db.prepare('SELECT 1 FROM student_archives WHERE student_id=?').bind(studentId).first();
  if(already) throw error('นักเรียนถูกนำออกจากรายการแล้ว',409,'ALREADY_ARCHIVED');
  const reason=required(p.reason,'เหตุผลการนำออก',200);
  if(reason.length<5) throw error('กรุณากรอกเหตุผลการนำออกอย่างน้อย 5 ตัวอักษร');
  const at=sqlNow();
  const [updated,archived]=await db.batch([
    db.prepare(`UPDATE students SET version=version+1,updated_at=? WHERE id=? AND version=? AND status='active'
      AND NOT EXISTS(SELECT 1 FROM student_archives a WHERE a.student_id=students.id)`).bind(at,studentId,version),
    db.prepare(`INSERT INTO student_archives(student_id,archived_at,archived_by,reason)
      SELECT s.id,?,?,? FROM students s WHERE s.id=? AND s.version=? AND changes()>0`)
      .bind(at,user.id,reason,studentId,version+1),
    db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at)
      SELECT ?,'archive','student',?,?,? FROM students WHERE id=? AND version=? AND changes()>0`)
      .bind(user.id,studentId,JSON.stringify({reason,old_version:version}),at,studentId,version+1)
  ]).then(result=>result.slice(0,2));
  if(!updated.meta?.changes||!archived.meta?.changes) throw error('ข้อมูลนักเรียนถูกแก้ไขไปแล้ว กรุณาโหลดใหม่',409,'STALE');
  return {ok:true,version:version+1};
}
async function restoreStudent(db,user,studentId,request) {
  access(user,'super_admin','admin');
  const p=await body(request), student=await studentRow(db,studentId);
  if(!student) throw error('ไม่พบข้อมูลนักเรียน',404);
  const version=Number(p.version);
  if(!Number.isInteger(version)||version!==student.version) throw error('ข้อมูลมีการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่',409,'STALE');
  const archived=await db.prepare('SELECT * FROM student_archives WHERE student_id=?').bind(studentId).first();
  if(!archived) throw error('นักเรียนไม่ได้อยู่ในรายการที่นำออก',409,'NOT_ARCHIVED');
  // Restoring an old membership cannot silently exceed a club's capacity.
  let needsOverride=false;
  if(student.club_id){
    const cap=await db.prepare(`SELECT c.capacity,COUNT(s.id) AS members FROM clubs c LEFT JOIN students s
      ON s.club_id=c.id AND s.status='active' AND NOT EXISTS(SELECT 1 FROM student_archives a WHERE a.student_id=s.id)
      WHERE c.id=? GROUP BY c.id`).bind(student.club_id).first();
    needsOverride=cap?.capacity!==null && cap?.capacity!==undefined && Number(cap.members)>=Number(cap.capacity);
  }
  const reason=cleanString(p.reason,200);
  if(needsOverride && !(p.override_capacity===true && reason.length>=5))
    throw error('ชุมนุมเดิมเต็มแล้ว ต้องติ๊กอนุญาตเพิ่มเกินโควตาและระบุเหตุผลอย่างน้อย 5 ตัวอักษร',409,'CLUB_FULL');
  if(p.override_capacity===true && reason.length<5) throw error('กรุณากรอกเหตุผลอย่างน้อย 5 ตัวอักษร');
  const now=sqlNow();
  const override=needsOverride && p.override_capacity===true && reason.length>=5;
  const clubCapacityClause=student.club_id?`AND (?=1 OR (SELECT capacity FROM clubs WHERE id=?) IS NULL OR
      (SELECT COUNT(*) FROM students s WHERE s.club_id=? AND s.status='active' AND NOT EXISTS
       (SELECT 1 FROM student_archives a WHERE a.student_id=s.id)) < (SELECT capacity FROM clubs WHERE id=?))`:'';
  const capacityParams=student.club_id?[override?1:0,student.club_id,student.club_id,student.club_id]:[];
  const [updated,unarchived]=await db.batch([
    db.prepare(`UPDATE students SET version=version+1,updated_at=? WHERE id=? AND version=?
      AND EXISTS(SELECT 1 FROM student_archives a WHERE a.student_id=students.id)
      ${clubCapacityClause}`).bind(now,studentId,version,...capacityParams),
    db.prepare(`DELETE FROM student_archives WHERE student_id=? AND EXISTS
      (SELECT 1 FROM students WHERE id=? AND version=?) AND changes()>0`).bind(studentId,studentId,version+1),
    db.prepare(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at)
      SELECT ?,'restore','student',?,?,? FROM students WHERE id=? AND version=? AND changes()>0`)
      .bind(user.id,studentId,JSON.stringify({archived_at:archived.archived_at,archive_reason:archived.reason,override_capacity:needsOverride,reason}),now,studentId,version+1)
  ]).then(result=>result.slice(0,2));
  if(!updated.meta?.changes||!unarchived.meta?.changes) throw error('ข้อมูลนักเรียนถูกแก้ไขไปแล้ว กรุณาโหลดใหม่',409,'STALE');
  return {ok:true,version:version+1};
}
async function listClubs(db,user) {
  const where=isAdmin(user)?'1=1':'(c.id IN(SELECT club_id FROM teacher_clubs WHERE user_id=?) OR c.id IN(SELECT club_id FROM students WHERE room_id IN(SELECT room_id FROM teacher_rooms WHERE user_id=?)))';
  const args=isAdmin(user)?[]:[user.id,user.id];
  const rows=await db.prepare(`SELECT c.id,c.year,c.name,c.capacity,c.active,COUNT(s.id) AS members
    FROM clubs c LEFT JOIN students s ON s.club_id=c.id AND s.status='active' AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=s.id)
    WHERE ${where} GROUP BY c.id ORDER BY c.year DESC,c.name`).bind(...args).all();
  return rows.results;
}
async function clubSave(db,user,request,clubId) {
  access(user,'super_admin','admin'); const p=await body(request);
  const name=required(p.name,'ชื่อชุมนุม',140), year=Number(p.year||2569);
  if(!Number.isInteger(year)||year<2500||year>2700) throw error('ปีการศึกษาไม่ถูกต้อง');
  const capacity=p.capacity===null||p.capacity===''||p.capacity===undefined?null:Number(p.capacity);
  if(capacity!==null&&(!Number.isInteger(capacity)||capacity<=0||capacity>10000)) throw error('จำนวนสูงสุดไม่ถูกต้อง');
  if(clubId){
    const current=await db.prepare('SELECT * FROM clubs WHERE id=?').bind(clubId).first();
    if(!current) throw error('ไม่พบชุมนุม',404);
    const active=p.active===undefined?current.active:(p.active?1:0);
    const r=await db.prepare('UPDATE clubs SET name=?,capacity=?,active=? WHERE id=?').bind(name,capacity,active,clubId).run();
    await log(db,user,'update','club',clubId,{name,capacity,active}); return {ok:!!r.meta?.changes,id:clubId};
  }
  const existsYear=await db.prepare('SELECT 1 AS ok FROM academic_years WHERE label=?').bind(year).first();
  if(!existsYear) throw error('ยังไม่มีปีการศึกษานี้');
  const cId=id();
  try{await db.prepare('INSERT INTO clubs(id,year,name,capacity) VALUES(?,?,?,?)').bind(cId,year,name,capacity).run();}
  catch(e){if(/UNIQUE/i.test(String(e))) throw error('มีชุมนุมชื่อนี้อยู่ในปีการศึกษาแล้ว',409);throw e;}
  await log(db,user,'create','club',cId,{year,name,capacity}); return {ok:true,id:cId};
}
async function listRooms(db,user) {
  const where=isAdmin(user)?'1=1':'id IN(SELECT room_id FROM teacher_rooms WHERE user_id=?)';
  const args=isAdmin(user)?[]:[user.id];
  const results=await db.prepare(`SELECT id,year,grade,room_no FROM rooms WHERE ${where} ORDER BY year DESC,grade,room_no`).bind(...args).all();
  return results.results;
}
async function listUsers(db,user) {
  access(user,'super_admin','admin');
  const users=await db.prepare('SELECT id,username,display_name,role,active,can_import_excel,can_sync_excel,created_at FROM users ORDER BY role,display_name').all();
  const trs=await db.prepare('SELECT user_id,room_id FROM teacher_rooms').all();
  const tcs=await db.prepare('SELECT user_id,club_id FROM teacher_clubs').all();
  return {users:users.results,teacher_rooms:trs.results,teacher_clubs:tcs.results};
}
async function addUser(db,user,request) {
  access(user,'super_admin','admin');const p=await body(request);
  const role=cleanString(p.role,20)||'teacher';
  if(!['teacher','admin','super_admin'].includes(role)) throw error('บทบาทไม่ถูกต้อง');
  if(user.role!=='super_admin'&&role!=='teacher') throw error('มีเพียง Super Admin ที่สร้างบัญชี Admin ได้',403);
  const username=validUsername(p.username),displayName=required(p.display_name,'ชื่อผู้ใช้'),pwd=validPassword(p.password),salt=randomHex(16),userId=id();
  try{await db.prepare('INSERT INTO users(id,username,display_name,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(userId,username,displayName,role,salt,await passwordHash(pwd,salt),sqlNow()).run();}
  catch(e){if(/UNIQUE/i.test(String(e))) throw error('ชื่อผู้ใช้นี้มีอยู่แล้ว',409);throw e;}
  await log(db,user,'create','user',userId,{username,role});return {id:userId,ok:true};
}
async function assignTeacher(db,user,request) {
  access(user,'super_admin','admin');const p=await body(request);
  const target=await db.prepare("SELECT id,role,can_import_excel,can_sync_excel FROM users WHERE id=? AND role='teacher'").bind(p.user_id).first();
  if(!target) throw error('ไม่พบบัญชีครู');
  if(!Array.isArray(p.room_ids)||!Array.isArray(p.club_ids)||p.room_ids.length>50||p.club_ids.length>1) throw error('ข้อมูลมอบหมายไม่ถูกต้อง (ครูรับชุมนุมได้หนึ่งชุมนุม)');
  if(p.can_import_excel!==undefined && typeof p.can_import_excel!=='boolean')throw error('สิทธิ์นำเข้า Excel ต้องเป็น true/false');
  if(p.can_sync_excel!==undefined && typeof p.can_sync_excel!=='boolean')throw error('สิทธิ์ซิงก์ Excel ต้องเป็น true/false');
  const canImport=p.can_import_excel===undefined?!!target.can_import_excel:p.can_import_excel;
  const canSync=p.can_sync_excel===undefined?!!target.can_sync_excel:p.can_sync_excel;
  if(canSync&&!canImport)throw error('ต้องเปิดสิทธิ์นำเข้าก่อน จึงอนุญาตให้ซิงก์ทั้งห้องได้');
  const roomIds=[...new Set(p.room_ids.map(v=>String(v)))],clubIds=[...new Set(p.club_ids.map(v=>String(v)))];
  for(const r of roomIds)if(!await db.prepare('SELECT 1 AS ok FROM rooms WHERE id=?').bind(r).first())throw error('ไม่พบห้องเรียน '+r);
  for(const c of clubIds)if(!await db.prepare('SELECT 1 AS ok FROM clubs WHERE id=? AND active=1').bind(c).first())throw error('ไม่พบชุมนุม '+c);
  const statements=[db.prepare('DELETE FROM teacher_rooms WHERE user_id=?').bind(target.id),db.prepare('DELETE FROM teacher_clubs WHERE user_id=?').bind(target.id),
    db.prepare('UPDATE users SET can_import_excel=?,can_sync_excel=? WHERE id=?').bind(canImport?1:0,canSync?1:0,target.id)];
  for(const r of roomIds) statements.push(db.prepare('INSERT INTO teacher_rooms(user_id,room_id) VALUES(?,?)').bind(target.id,r));
  for(const c of clubIds) statements.push(db.prepare('INSERT INTO teacher_clubs(user_id,club_id) VALUES(?,?)').bind(target.id,c));
  statements.push(db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at) VALUES(?,?,?,?,?,?)')
    .bind(user.id,'assign','user',target.id,JSON.stringify({rooms:roomIds,clubs:clubIds,can_import_excel:canImport,can_sync_excel:canSync}),sqlNow()));
  await db.batch(statements);return {ok:true};
}
async function exportStudents(db,user) {
  const all=[];
  // No pagination bypass: teachers can export only records visible to their assignments.
  const where=isAdmin(user)?'1=1':'(s.room_id IN(SELECT room_id FROM teacher_rooms WHERE user_id=?) OR s.club_id IN(SELECT club_id FROM teacher_clubs WHERE user_id=?))';
  const args=isAdmin(user)?[]:[user.id,user.id];
  const list=await db.prepare(`SELECT s.student_no,s.prefix,s.first_name,s.last_name,r.year,r.grade,r.room_no,c.name AS club_name
    FROM students s JOIN rooms r ON s.room_id=r.id LEFT JOIN clubs c ON c.id=s.club_id
    WHERE ${where} AND s.status='active' AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=s.id) ORDER BY r.grade,r.room_no,s.student_no`).bind(...args).all();
  const safe = v => { const s=String(v??''); return /^[\s]*[=+\-@\t\r]/.test(s)?`'${s}`:s; };
  const quoted = v => `"${safe(v).replaceAll('"','""')}"`;
  all.push(['เลขประจำตัว','คำนำหน้า','ชื่อ','นามสกุล','ปีการศึกษา','ระดับชั้น','ห้อง','ชุมนุม'].map(quoted).join(','));
  for(const s of list.results) all.push([s.student_no,s.prefix,s.first_name,s.last_name,s.year,s.grade,s.room_no,s.club_name].map(quoted).join(','));
  return new Response('\uFEFF'+all.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="schoolhub-students.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
// SchoolHub v1.4 XLSX/CSV import: admin or explicitly permitted homeroom teachers only.
// No XLSX file bytes are ever stored in public assets or in D1.
const IMPORT_MAX_ROWS = 120;
const normalizeClubName = v => cleanString(v,120).normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('th');
function parseImportRows(raw) {
  if(!Array.isArray(raw)||raw.length===0||raw.length>IMPORT_MAX_ROWS) throw error(`กรุณาเลือกข้อมูล 1–${IMPORT_MAX_ROWS} แถวต่อห้องเรียน`);
  return raw.map((item,i)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw error(`รูปแบบข้อมูลแถว ${i+2} ไม่ถูกต้อง`);
    const get=(key,max)=>{const value=item[key]; if(typeof value!=='string' && typeof value!=='number' && value!==undefined && value!==null)throw error(`ข้อมูลแถว ${i+2} ไม่ถูกต้อง: ${key}`);
      const str=String(value??'').trim().normalize('NFC');if(str.length>max)throw error(`ข้อมูลแถว ${i+2} ยาวเกินกำหนด: ${key}`);return str;};
    const sourceLine=item.source_line===undefined?i+2:Number(item.source_line);
    if(!Number.isInteger(sourceLine)||sourceLine<2||sourceLine>2000)throw error(`หมายเลขแถวต้นฉบับไม่ถูกต้อง: รายการ ${i+1}`);
    return {line:sourceLine,student_no:get('student_no',30),prefix:get('prefix',20),first_name:get('first_name',100),last_name:get('last_name',100),club_name:get('club_name',120)};
  });
}
function previewRowLine(entry,action,detail='') {return {line:entry.line,student_no:entry.student_no,student_name:[entry.prefix,entry.first_name,entry.last_name].filter(Boolean).join(' '),action,detail};}
async function importPlan(db,user,p) {
  if(!canImportExcel(user))throw error('บัญชีนี้ไม่ได้รับสิทธิ์นำเข้า Excel',403,'IMPORT_PERMISSION');
  const roomId=required(p.room_id,'ห้องเรียน',80), mode=cleanString(p.mode,20);
  if(!['merge','sync'].includes(mode)) throw error('กรุณาเลือกโหมดเพิ่ม/อัปเดต หรือซิงก์ทั้งห้อง');
  if(mode==='sync'&&!canSyncExcel(user))throw error('ครูยังไม่ได้รับสิทธิ์ซิงก์ทั้งห้อง',403,'SYNC_PERMISSION');
  if(!isAdmin(user) && p.override_capacity===true)throw error('อนุญาตเพิ่มเกินโควตาได้เฉพาะ Admin',403,'FORBIDDEN');
  if(!isAdmin(user) && !(await visibleRoom(db,user,roomId)))throw error('นำเข้าได้เฉพาะห้องเรียนที่ได้รับมอบหมาย',403,'ROOM_SCOPE');
  const rows=parseImportRows(p.rows);
  const room=await db.prepare('SELECT id,year,grade,room_no FROM rooms WHERE id=?').bind(roomId).first();
  if(!room) throw error('ไม่พบห้องเรียน');
  const existing=await db.prepare(`SELECT s.id,s.student_no,s.prefix,s.first_name,s.last_name,s.club_id,s.room_id,s.version,s.status,a.student_id AS archived
    FROM students s LEFT JOIN student_archives a ON a.student_id=s.id WHERE s.room_id=? OR s.student_no IN (${rows.map(()=>'?').join(',')})`)
    .bind(roomId,...rows.map(r=>r.student_no)).all();
  const allStudents=existing.results||[],byNo=new Map(allStudents.map(s=>[s.student_no,s]));
  const [clubsResult,countResult]=await Promise.all([
    db.prepare('SELECT id,name,capacity,active,year FROM clubs WHERE year=?').bind(room.year).all(),
    db.prepare(`SELECT s.club_id AS id,COUNT(*) AS n FROM students s WHERE s.status='active' AND s.club_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM student_archives a WHERE a.student_id=s.id) GROUP BY s.club_id`).all()
  ]);
  const clubs=clubsResult.results||[], clubMap=new Map(clubs.filter(c=>c.active).map(c=>[normalizeClubName(c.name),c]));
  const counts=new Map((countResult.results||[]).map(c=>[c.id,Number(c.n)]));
  const seen=new Map(),items=[],errors=[],ops=[],deltas=new Map();
  const delta=(club,n)=>{if(club)deltas.set(club,(deltas.get(club)||0)+n);};
  for(const row of rows){
    const issues=[];
    if(!row.student_no)issues.push('ไม่มีเลขประจำตัวนักเรียน');
    if(!row.first_name)issues.push('ไม่มีชื่อ');
    if(!row.last_name)issues.push('ไม่มีนามสกุล');
    if(row.student_no){if(seen.has(row.student_no))issues.push(`เลขประจำตัวซ้ำภายในไฟล์ (ปรากฏครั้งแรกที่แถว ${seen.get(row.student_no)})`);else seen.set(row.student_no,row.line);}
    const current=byNo.get(row.student_no);
    if(current&&current.room_id!==roomId)issues.push('เลขประจำตัวนี้อยู่คนละห้อง ต้องย้ายห้องจากเมนูนักเรียนก่อน');
    if(current&&(current.archived||current.status!=='active'))issues.push('เลขประจำตัวนี้ไม่อยู่ในสถานะใช้งาน ต้องกู้คืนหรือแก้สถานะก่อน');
    const clubRaw=row.club_name.trim();
    let clubId=null;
    if(clubRaw && clubRaw!=='-'){
      const club=clubMap.get(normalizeClubName(clubRaw));
      if(!club)issues.push(`ไม่พบชุมนุมที่เปิดใช้งาน: ${clubRaw} (ให้สร้างหรือแก้ชื่อก่อน)`);
      else clubId=club.id;
    }else if(current && !clubRaw){ clubId=current.club_id; } // blank means preserve for existing students
    if(issues.length){const info=previewRowLine(row,'error',issues.join(' • '));items.push(info);errors.push(info);continue;}
    if(!current){
      ops.push({kind:'add',row,club_id:clubId});items.push(previewRowLine(row,'add',clubId?'เพิ่มพร้อมชุมนุม':'เพิ่มโดยไม่กำหนดชุมนุม'));
      delta(clubId,1);
    }else{
      const updated=[row.prefix!==current.prefix,row.first_name!==current.first_name,row.last_name!==current.last_name,clubId!==current.club_id].some(Boolean);
      if(updated){
        ops.push({kind:'update',row,id:current.id,version:current.version,old_club_id:current.club_id,club_id:clubId});
        delta(current.club_id,-1);delta(clubId,1);
        items.push(previewRowLine(row,'update','แก้ไขชื่อ/คำนำหน้าหรือชุมนุม'));
      }else items.push(previewRowLine(row,'unchanged','ข้อมูลตรงกับฐานข้อมูลแล้ว'));
    }
  }
  if(mode==='sync'){
    const scope=allStudents.filter(s=>s.room_id===roomId && s.status==='active' && !s.archived && !seen.has(s.student_no));
    for(const s of scope){const row={line:0,student_no:s.student_no,prefix:s.prefix,first_name:s.first_name,last_name:s.last_name};
      items.push(previewRowLine(row,'archive','ไม่มีในไฟล์: นำออกจากรายการแบบ Soft Delete'));
      ops.push({kind:'archive',id:s.id,version:s.version,student_no:s.student_no,old_club_id:s.club_id});delta(s.club_id,-1);
    }
  }
  const over=[];
  for(const [clubId,d] of deltas) {
    if(d<=0)continue;
    const club=clubs.find(c=>c.id===clubId);
    if(!club)continue;
    const before=counts.get(clubId)||0,after=before+d;
    if(club.capacity!==null && after>Number(club.capacity))over.push({id:clubId,name:club.name,before,after,capacity:Number(club.capacity)});
  }
  const override=p.override_capacity===true, reason=cleanString(p.reason,200);
  if(over.length&&(!override || reason.length<5)){
    errors.push({line:0,student_no:'',student_name:'',action:'error',detail:`ชุมนุมเกินโควตา: ${over.map(c=>c.name).join(', ')}; ต้องติ๊กอนุญาตและกรอกเหตุผลอย่างน้อย 5 ตัวอักษร`,
      related_students:ops.filter(op=>['add','update'].includes(op.kind) && over.some(c=>c.id===op.club_id))
        .map(op=>({line:op.row.line,student_no:op.row.student_no,student_name:[op.row.prefix,op.row.first_name,op.row.last_name].filter(Boolean).join(' ')}))});
  }
  if(override&&reason.length<5)errors.push({line:0,action:'error',detail:'เหตุผลกรณีเพิ่มเกินโควตาต้องมีอย่างน้อย 5 ตัวอักษร'});
  if(mode==='sync' && reason.length<5)errors.push({line:0,action:'error',detail:'โหมดซิงก์ทั้งห้องต้องกรอกเหตุผลอย่างน้อย 5 ตัวอักษร'});
  const summary={add:items.filter(x=>x.action==='add').length,update:items.filter(x=>x.action==='update').length,
    unchanged:items.filter(x=>x.action==='unchanged').length,archive:items.filter(x=>x.action==='archive').length,errors:errors.length};
  const snapshot={room_id:roomId,mode,actor_id:user.id,reason,override,rows,ops,counts:[...counts].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),
    clubData:clubs.map(c=>[c.id,c.name,c.capacity,c.active]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))};
  const preview_hash=await sha256(JSON.stringify(snapshot));
  return {room,mode,summary,items,errors,over,preview_hash,ops,override,reason,deltas};
}
async function importPreview(db,user,request){const p=await body(request);const plan=await importPlan(db,user,p);
  // Never send internal student UUIDs in the plan response; client sees only relevant preview.
  return {ok:!plan.errors.length,room:plan.room,mode:plan.mode,summary:plan.summary,items:plan.items,
    errors:plan.errors,over_capacity:plan.over,preview_hash:plan.preview_hash};
}
function checkGuard(db, predicate, bind=[]){return db.prepare(`INSERT INTO excel_import_guard(probe) SELECT CASE WHEN (${predicate}) THEN 1 ELSE 0 END`).bind(...bind);}
async function importCommit(db,user,request){
  const p=await body(request),plan=await importPlan(db,user,p);
  if(plan.errors.length)throw error('ข้อมูลไม่ผ่านการตรวจสอบ กรุณาดูรายการข้อผิดพลาดก่อนบันทึก',409,'IMPORT_INVALID');
  if(!constantEqual(String(p.preview_hash||''),plan.preview_hash))throw error('ข้อมูลหรือจำนวนสมาชิกเปลี่ยนจากตอนพรีวิว กรุณาตรวจสอบตัวอย่างใหม่',409,'STALE_PREVIEW');
  if(plan.mode==='sync' && p.confirm_sync!==plan.room.id)throw error('โหมดซิงก์ต้องยืนยันรหัสห้องให้ถูกต้อง',400,'CONFIRM_REQUIRED');
  if(plan.mode==='sync' && plan.summary.archive>0 && !p.acknowledge_archives)throw error('กรุณายืนยันการนำรายชื่อที่ไม่อยู่ในไฟล์ออกก่อน',400);
  const now=sqlNow(),runId=id(), statements=[];
  // Revalidate teacher permissions and room membership atomically at commit time.
  // Covers an admin revoking access while a preview is open in another browser.
  if(!isAdmin(user))statements.push(checkGuard(db,`EXISTS(
    SELECT 1 FROM users u JOIN teacher_rooms tr ON tr.user_id=u.id
    WHERE u.id=? AND u.role='teacher' AND u.active=1 AND u.can_import_excel=1
      AND (?='merge' OR u.can_sync_excel=1) AND tr.room_id=?)`,[user.id,plan.mode,plan.room.id]));
  const reason=plan.reason||'';
  for(const op of plan.ops){
    if(op.kind==='add'){
      const sId=id(),r=op.row;
      statements.push(db.prepare(`INSERT INTO students(id,student_no,prefix,first_name,last_name,room_id,club_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(sId,r.student_no,r.prefix,r.first_name,r.last_name,plan.room.id,op.club_id,now,now));
      if(op.club_id)statements.push(db.prepare('INSERT INTO membership_history(student_id,old_club_id,new_club_id,actor_id,reason,at) VALUES(?,?,?,?,?,?)')
        .bind(sId,null,op.club_id,user.id,'นำเข้า Excel',now));
      statements.push(db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at) VALUES(?,?,?,?,?,?)')
        .bind(user.id,'import_create','student',sId,JSON.stringify({student_no:r.student_no,room_id:plan.room.id,run_id:runId}),now));
    }else if(op.kind==='update'){
      const r=op.row;
      statements.push(checkGuard(db,`EXISTS (SELECT 1 FROM students WHERE id=? AND version=? AND room_id=? AND status='active'
        AND NOT EXISTS(SELECT 1 FROM student_archives a WHERE a.student_id=students.id))`,[op.id,op.version,plan.room.id]));
      statements.push(db.prepare('UPDATE students SET prefix=?,first_name=?,last_name=?,club_id=?,version=version+1,updated_at=? WHERE id=? AND version=?')
        .bind(r.prefix,r.first_name,r.last_name,op.club_id,now,op.id,op.version));
      if(op.old_club_id!==op.club_id)statements.push(db.prepare('INSERT INTO membership_history(student_id,old_club_id,new_club_id,actor_id,reason,at) VALUES(?,?,?,?,?,?)')
        .bind(op.id,op.old_club_id,op.club_id,user.id,reason||'นำเข้า Excel เปลี่ยนชุมนุม',now));
      statements.push(db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at) VALUES(?,?,?,?,?,?)')
        .bind(user.id,'import_update','student',op.id,JSON.stringify({student_no:r.student_no,run_id:runId}),now));
    }else if(op.kind==='archive'){
      statements.push(checkGuard(db,`EXISTS (SELECT 1 FROM students WHERE id=? AND version=? AND room_id=? AND status='active'
        AND NOT EXISTS(SELECT 1 FROM student_archives a WHERE a.student_id=students.id))`,[op.id,op.version,plan.room.id]));
      statements.push(db.prepare('UPDATE students SET version=version+1,updated_at=? WHERE id=? AND version=?').bind(now,op.id,op.version));
      statements.push(db.prepare('INSERT INTO student_archives(student_id,archived_at,archived_by,reason) VALUES(?,?,?,?)')
        .bind(op.id,now,user.id,`ซิงก์ Excel: ${reason}`));
      statements.push(db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at) VALUES(?,?,?,?,?,?)')
        .bind(user.id,'import_archive','student',op.id,JSON.stringify({student_no:op.student_no,run_id:runId}),now));
    }
  }
  if(!plan.override)for(const [clubId,delta] of plan.deltas){if(delta<=0)continue;
    statements.push(checkGuard(db,`(SELECT capacity FROM clubs WHERE id=?) IS NULL OR
       (SELECT COUNT(*) FROM students s WHERE s.club_id=? AND s.status='active'
        AND NOT EXISTS(SELECT 1 FROM student_archives a WHERE a.student_id=s.id)) <= (SELECT capacity FROM clubs WHERE id=?)`,
      [clubId,clubId,clubId]));
  }
  statements.push(db.prepare(`INSERT INTO excel_import_runs(id,actor_id,room_id,mode,preview_hash,added,updated,archived,unchanged,override_capacity,reason,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(runId,user.id,plan.room.id,plan.mode,plan.preview_hash,plan.summary.add,plan.summary.update,plan.summary.archive,plan.summary.unchanged,plan.override?1:0,reason,now));
  statements.push(db.prepare('DELETE FROM excel_import_guard'));
  try{await db.batch(statements);}catch(e){
    if(/CHECK constraint failed: (?:excel_import_guard|probe)/i.test(String(e)))throw error('ข้อมูลมีผู้แก้ไขระหว่างนำเข้าหรือจำนวนสมาชิกเกินโควตา กรุณาพรีวิวใหม่',409,'STALE_OR_FULL');
    if(/UNIQUE constraint failed: students.student_no/i.test(String(e)))throw error('มีเลขประจำตัวซ้ำในฐานข้อมูล กรุณาพรีวิวใหม่',409,'DUPLICATE');
    throw e;
  }
  return {ok:true,run_id:runId,room:plan.room,summary:plan.summary,at:now};
}
async function importHistory(db,user){
  if(!canImportExcel(user))throw error('บัญชีนี้ไม่ได้รับสิทธิ์นำเข้า Excel',403,'IMPORT_PERMISSION');
  const where=isAdmin(user)?'1=1':'i.actor_id=?';
  const result=await db.prepare(`SELECT i.id,i.room_id,i.mode,i.added,i.updated,i.archived,i.unchanged,i.reason,i.created_at,
    u.display_name AS actor FROM excel_import_runs i JOIN users u ON u.id=i.actor_id
    WHERE ${where} ORDER BY i.created_at DESC LIMIT 30`).bind(...(isAdmin(user)?[]:[user.id])).all();
  return {items:result.results};
}

export async function onRequest({request,env}) {
  const url=new URL(request.url), route=url.pathname.replace(/^\/api\/?/,'').replace(/\/+$/,'');
  try {
    if(!env.DB) throw error('ยังไม่ได้ผูก D1 Database ชื่อ DB กับ Cloudflare Pages',503,'MISSING_DB');
    const db=env.DB;
    if(request.method==='OPTIONS') throw error('Method not allowed',405);
    if(!['GET','POST','PATCH'].includes(request.method)) throw error('Method not allowed',405);
    if(request.method!=='GET') {
      const origin=request.headers.get('origin');
      if(origin && origin!==url.origin) throw error('Cross-site request blocked',403,'ORIGIN');
      if(request.headers.get('sec-fetch-site')==='cross-site') throw error('Cross-site request blocked',403,'ORIGIN');
    }
    if(route==='status') { requireMethod(request.method,'GET'); const first=await db.prepare('SELECT 1 AS ok FROM users LIMIT 1').first(); return json({ready:true,setup_required:!first,version:'1.4.0'}); }
    if(route==='setup') {requireMethod(request.method,'POST');return await setup(db,request,env);}
    if(route==='auth/login') {requireMethod(request.method,'POST');return await login(db,request);}
    if(route==='auth/logout') {requireMethod(request.method,'POST');const token=cookieToken(request);if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
    const user=await who(db,request);if(!user) throw error('กรุณาเข้าสู่ระบบ',401,'UNAUTHORIZED');
    if(route==='auth/me') {requireMethod(request.method,'GET');return json({user});}
    if(route==='auth/change-password') {
      requireMethod(request.method,'POST'); const p=await body(request);
      const record=await db.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      const verify=await passwordHash(String(p.old_password||''),record.password_salt);
      if(!constantEqual(verify,record.password_hash)) throw error('รหัสผ่านเดิมไม่ถูกต้อง',403,'WRONG_PASSWORD');
      const salt=randomHex(16), nextHash=await passwordHash(validPassword(p.new_password),salt);
      await db.batch([
        db.prepare('UPDATE users SET password_salt=?,password_hash=? WHERE id=?').bind(salt,nextHash,user.id),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
        db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details,at) VALUES(?,?,?,?,?,?)').bind(user.id,'change_password','user',user.id,'{}',sqlNow())
      ]);
      return json({ok:true,login_again:true},200,{'Set-Cookie':cookie('',0)});
    }
    if(route==='import/preview') {requireMethod(request.method,'POST');return json(await importPreview(db,user,request));}
    if(route==='import/commit') {requireMethod(request.method,'POST');return json(await importCommit(db,user,request));}
    if(route==='import/history') {requireMethod(request.method,'GET');return json(await importHistory(db,user));}
    if(route==='dashboard') {requireMethod(request.method,'GET');return json(await getDashboard(db,user));}
    if(route==='rooms') {requireMethod(request.method,'GET');return json({items:await listRooms(db,user)});}
    if(route==='clubs' && request.method==='GET')return json({items:await listClubs(db,user)});
    if(route==='clubs' && request.method==='POST')return json(await clubSave(db,user,request,null),201);
    if(route.startsWith('clubs/')&&request.method==='PATCH')return json(await clubSave(db,user,request,route.split('/')[1]));
    if(route==='students/archived'&&request.method==='GET')return json(await listArchivedStudents(db,user,url));
    if(route==='students'&&request.method==='GET')return json(await listStudents(db,user,url));
    if(route==='students'&&request.method==='POST')return json(await createStudent(db,user,request),201);
    if(route.startsWith('students/')&&request.method==='PATCH')return json(await updateStudent(db,user,route.split('/')[1],request));
    if(/^students\/[^/]+\/archive$/.test(route)){requireMethod(request.method,'POST');return json(await archiveStudent(db,user,route.split('/')[1],request));}
    if(/^students\/[^/]+\/restore$/.test(route)){requireMethod(request.method,'POST');return json(await restoreStudent(db,user,route.split('/')[1],request));}
    if(route==='memberships'&&request.method==='POST')return json(await transferClub(db,user,request));
    if(route==='users'&&request.method==='GET')return json(await listUsers(db,user));
    if(route==='users'&&request.method==='POST')return json(await addUser(db,user,request),201);
    if(route==='assignments'&&request.method==='POST')return json(await assignTeacher(db,user,request));
    if(route==='audit'&&request.method==='GET') {access(user,'super_admin','admin');const q=await db.prepare(`SELECT a.id,a.at,a.action,a.entity_type,a.entity_id,a.details,u.display_name AS actor
      FROM audit_log a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`).all();return json({items:q.results});}
    if(route==='export/students'&&request.method==='GET')return await exportStudents(db,user);
    throw error('ไม่พบ API ที่ร้องขอ',404,'NOT_FOUND');
  }catch(e){
    const status=(Number.isInteger(e.status)&&e.status>=400&&e.status<600)?e.status:500;
    if(status===500) console.error('SchoolHub API failure',e);
    const message=status===500?'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่หรือติดต่อผู้ดูแล':e.message;
    return json({error:message,code:e.code||'ERROR'},status);
  }
}
