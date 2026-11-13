import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequest} from '../functions/api/[[path]].js';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0002_student_archives.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0003_excel_import.sql',import.meta.url),'utf8'));
const db={
 prepare(sql){let stmt=sqlite.prepare(sql), args=[];
   const wrap={bind(...v){args=v;return wrap;},first(){return stmt.get(...args)??null;},all(){return {results:stmt.all(...args)};},run(){return {meta:{changes:stmt.run(...args).changes}};}};
   return wrap;
 },
 async batch(stmts){sqlite.exec('BEGIN');try{const r=[];for(const s of stmts){if(s.all) {
   // D1 .batch SELECT and mutation return results in D1 shape.
   try {r.push(await s.run());} catch(e) {if(/readonly|statement/i.test(String(e))){r.push(await s.all());}else throw e;}
  }}sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
};
// Override batch to detect read vs write by wrapper's original SQL
const oldPrepare=db.prepare;
db.prepare=function(sql){const stmt=oldPrepare(sql);stmt._query=sql;return stmt;};
db.batch=async stmts=>{sqlite.exec('BEGIN');try{const out=[];for(const st of stmts)out.push(/^\s*SELECT/i.test(st._query)?await st.all():await st.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}};
const env={DB:db,BOOTSTRAP_TOKEN:'a-long-secret-unique-token-for-setup'};
function make(path,method='GET',data=null,cookie=''){
 return new Request('https://schoolhub.test/api/'+path,{method,headers:{...(data?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(method!=='GET'?{origin:'https://schoolhub.test'}:{})},body:data?JSON.stringify(data):undefined});
}
async function call(path,method='GET',data=null,cookie='') {
 const res=await onRequest({request:make(path,method,data,cookie),env});
 const output=res.headers.get('content-type')?.includes('application/json')?await res.json():await res.text();
 return {status:res.status,data:output,cookie:res.headers.get('set-cookie')};
}
let session='',teacherCookie='',stuId='', clubId='', teacherId='';
test('initial setup only once, session login works', async()=>{
 let r=await call('status');assert.equal(r.data.setup_required,true);
 r=await call('setup','POST',{setupToken:'a-long-secret-unique-token-for-setup',username:'admin1',display_name:'ผู้ดูแลหลัก',password:'strong-password-00001'});
 assert.equal(r.status,201);
 r=await call('setup','POST',{setupToken:'a-long-secret-unique-token-for-setup',username:'admin2',display_name:'ผู้ดูแลใหม่',password:'strong-password-00002'});
 assert.equal(r.status,409);
 r=await call('auth/login','POST',{username:'admin1',password:'wrong-password'});assert.equal(r.status,401);
 r=await call('auth/login','POST',{username:'admin1',password:'strong-password-00001'});assert.equal(r.status,200);session=r.cookie.split(';')[0];
 r=await call('auth/me','GET',null,session);assert.equal(r.data.user.role,'super_admin');
});
test('clubs and student persistence, duplicate check, quota and conflict',async()=>{
 let r=await call('clubs','POST',{name:'คอมพิวเตอร์',year:2569,capacity:1},session);assert.equal(r.status,201);clubId=r.data.id;
 r=await call('students','POST',{student_no:'12345',prefix:'นาย',first_name:'ตัวอย่าง',last_name:'ทดลอง',room_id:'2569-1-1',club_id:clubId},session);assert.equal(r.status,201);stuId=r.data.id;
 r=await call('students','POST',{student_no:'12345',first_name:'ซ้ำ',last_name:'ทดสอบ',room_id:'2569-1-1'},session);assert.equal(r.status,409);
 r=await call('students','POST',{student_no:'12346',first_name:'สมาชิก',last_name:'ใหม่',room_id:'2569-1-1',club_id:clubId},session);assert.equal(r.status,409);
 r=await call('students','POST',{student_no:'12346',first_name:'สมาชิก',last_name:'ใหม่',room_id:'2569-1-1',club_id:clubId,override_capacity:true,reason:'เหตุผลพิเศษตามข้ออนุญาต'},session);assert.equal(r.status,201);
 r=await call('students','GET',null,session);assert.equal(r.data.items.length,2);
 r=await call('students/'+stuId,'PATCH',{version:1,student_no:'12355'},session);assert.equal(r.status,200);assert.equal(r.data.version,2);
 r=await call('students/'+stuId,'PATCH',{version:1,first_name:'เก่า'},session);assert.equal(r.status,409);
});
test('club transfer, audit, CSV export',async()=>{
 let r=await call('memberships','POST',{student_id:stuId,version:2,club_id:null,reason:'ย้ายออก'},session);
 assert.equal(r.status,200);
 r=await call('audit','GET',null,session);assert.ok(r.data.items.length>=4);
 r=await call('export/students','GET',null,session);assert.ok(String(r.data).includes('12355'));
});
test('teacher assignment and scope enforcement',async()=>{
 let r=await call('users','POST',{username:'teacher1',display_name:'ครูทดลอง',role:'teacher',password:'teacher-pass-2026'},session);assert.equal(r.status,201);teacherId=r.data.id;
 r=await call('assignments','POST',{user_id:teacherId,room_ids:['2569-1-1'],club_ids:[clubId]},session);assert.equal(r.status,200);
 r=await call('auth/login','POST',{username:'teacher1',password:'teacher-pass-2026'});assert.equal(r.status,200);teacherCookie=r.cookie.split(';')[0];
 r=await call('students','GET',null,teacherCookie);assert.equal(r.status,200);assert.equal(r.data.items.length,2);
 r=await call('clubs','POST',{name:'ไม่ได้',year:2569},teacherCookie);assert.equal(r.status,403);
 r=await call('students','POST',{student_no:'77777',first_name:'ห้องอื่น',last_name:'ต้องห้าม',room_id:'2569-2-1'},teacherCookie);assert.equal(r.status,403);
 r=await call('students/'+stuId,'PATCH',{version:3,room_id:'2569-2-1'},teacherCookie);assert.equal(r.status,403);
});
test('logout clears access',async()=>{
 let r=await call('auth/logout','POST',{},teacherCookie);assert.equal(r.status,200);
 r=await call('auth/me','GET',null,teacherCookie);assert.equal(r.status,401);
});
test('soft delete archives without destroying records; only admins may archive/restore; quota and CSV stay accurate',async()=>{
 const r0=await call('students','GET',null,session);
 const member=r0.data.items.find(s=>s.student_no==='12346');
 assert.ok(member,'second club member');
 // A teacher may view students, but never archive a student.
 let r=await call('auth/login','POST',{username:'teacher1',password:'teacher-pass-2026'});
 const teacherSession=r.cookie.split(';')[0];
 r=await call('students/'+member.id+'/archive','POST',{version:member.version,reason:'ออกตามใบคำร้อง'},teacherSession);
 assert.equal(r.status,403);
 r=await call('students/archived','GET',null,teacherSession);assert.equal(r.status,403);
 r=await call('students/'+member.id+'/archive','POST',{version:member.version,reason:'สั้น'},session);
 assert.equal(r.status,400);
 r=await call('students/'+member.id+'/archive','POST',{version:member.version,reason:'นำออกจากรายการเพื่อทดสอบ'},session);
 assert.equal(r.status,200);assert.equal(r.data.version,member.version+1);
 r=await call('students','GET',null,session);
 assert.ok(!r.data.items.some(s=>s.id===member.id),'student hidden from active listing');
 r=await call('students/archived','GET',null,session);
 const archive=r.data.items.find(s=>s.id===member.id);
 assert.ok(archive);assert.equal(archive.version,member.version+1);
 r=await call('students/'+member.id,'PATCH',{version:member.version+1,first_name:'ต้องไม่แก้'},session);assert.equal(r.status,404);
 r=await call('clubs','GET',null,session);assert.equal(r.data.items.find(c=>c.id===clubId).members,0);
 r=await call('export/students','GET',null,session);assert.ok(!r.data.includes('12346'));
 // Archived student ID is reserved, so history can't accidentally attach to a replacement student.
 r=await call('students','POST',{student_no:'12346',first_name:'ซ้ำ',last_name:'เก็บประวัติ',room_id:'2569-1-1'},session);assert.equal(r.status,409);
 // Fill the newly freed membership and verify the restore quota guard.
 r=await call('students','POST',{student_no:'99998',first_name:'สมาชิก',last_name:'ใหม่',room_id:'2569-1-1',club_id:clubId},session);assert.equal(r.status,201);
 r=await call('students/'+member.id+'/restore','POST',{version:archive.version},session);
 assert.equal(r.status,409);assert.equal(r.data.code,'CLUB_FULL');
 r=await call('students/'+member.id+'/restore','POST',{version:archive.version,override_capacity:true,reason:'ขออนุญาตคืนสมาชิกเดิม'},session);
 assert.equal(r.status,200);
 r=await call('students','GET',null,session);assert.ok(r.data.items.some(s=>s.id===member.id));
 r=await call('students/archived','GET',null,session);assert.ok(!r.data.items.some(s=>s.id===member.id));
 r=await call('clubs','GET',null,session);assert.equal(r.data.items.find(c=>c.id===clubId).members,2);
 r=await call('audit','GET',null,session);assert.ok(r.data.items.some(a=>a.action==='archive'));assert.ok(r.data.items.some(a=>a.action==='restore'));
});
test('v1.3 Excel preview/commit: room-scoped add/update, duplicates, stale previews, audit',async()=>{
  const makeRow=(no,name,club='')=>({student_no:no,prefix:'เด็กชาย',first_name:name,last_name:'ตรวจสอบ',club_name:club});
  const payload={room_id:'2569-2-1',mode:'merge',rows:[makeRow('TEST-001','หนึ่ง'),makeRow('TEST-002','สอง')]};
  let r=await call('import/preview','POST',payload,teacherCookie);assert.equal(r.status,401,'teacher logged out');
  r=await call('import/preview','POST',payload,session);assert.equal(r.status,200);assert.equal(r.data.summary.add,2);assert.equal(r.data.summary.errors,0);
  const hash=r.data.preview_hash;
  let result=await call('import/commit','POST',{...payload,preview_hash:hash},session);
  assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.summary.add,2);
  result=await call('import/commit','POST',{...payload,preview_hash:hash},session);
  assert.equal(result.status,409,'duplicate commit must not repeat');
  r=await call('students?room_id=2569-2-1','GET',null,session);assert.equal(r.data.items.length,2);
  const duplicate={...payload,rows:[makeRow('TEST-001','หนึ่ง'),makeRow('TEST-001','ซ้ำ')]};
  r=await call('import/preview','POST',duplicate,session);assert.equal(r.status,200);assert.ok(r.data.summary.errors>0);
  result=await call('import/commit','POST',{...duplicate,preview_hash:r.data.preview_hash},session);assert.equal(result.status,409);
  r=await call('import/preview','POST',{...payload,rows:[makeRow('TEST-003','สาม','ชุมนุมไม่มีจริง')]},session);
  assert.ok(r.data.summary.errors>0);
  r=await call('import/preview','POST',{...payload,rows:[makeRow('12355','ข้ามห้อง')]},session);assert.ok(r.data.summary.errors>0);
  r=await call('import/history','GET',null,session);assert.ok(r.data.items.some(x=>x.room_id==='2569-2-1'));
});
test('v1.3 full sync archives missing students only after deliberate confirmation; version updates',async()=>{
  const row={student_no:'TEST-001',prefix:'เด็กหญิง',first_name:'หนึ่งปรับใหม่',last_name:'ตรวจสอบ',club_name:''};
  const payload={room_id:'2569-2-1',mode:'sync',rows:[row],reason:'ซิงก์ทะเบียนนักเรียนทดสอบ'};
  let r=await call('import/preview','POST',payload,session);
  assert.equal(r.status,200);assert.equal(r.data.summary.archive,1);assert.equal(r.data.summary.update,1);
  const hash=r.data.preview_hash;
  let attempt=await call('import/commit','POST',{...payload,preview_hash:hash,confirm_sync:'WRONG',acknowledge_archives:true},session);
  assert.equal(attempt.status,400);
  attempt=await call('import/commit','POST',{...payload,preview_hash:hash,confirm_sync:'2569-2-1',acknowledge_archives:false},session);
  assert.equal(attempt.status,400);
  attempt=await call('import/commit','POST',{...payload,preview_hash:hash,confirm_sync:'2569-2-1',acknowledge_archives:true},session);
  assert.equal(attempt.status,200,JSON.stringify(attempt.data));
  r=await call('students?room_id=2569-2-1','GET',null,session);assert.equal(r.data.items.length,1);assert.equal(r.data.items[0].first_name,'หนึ่งปรับใหม่');
  r=await call('students/archived','GET',null,session);assert.ok(r.data.items.some(x=>x.student_no==='TEST-002'));
  r=await call('import/history','GET',null,session);assert.ok(r.data.items.some(x=>x.mode==='sync'&&x.archived===1));
});
test('v1.3 stale preview and club quota override are enforced on server',async()=>{
  let r=await call('clubs','POST',{name:'ชุมนุมสำหรับนำเข้า',year:2569,capacity:1},session);assert.equal(r.status,201);const importClub=r.data.id;
  const payload={room_id:'2569-3-1',mode:'merge',rows:[{student_no:'TEST-101',prefix:'นาย',first_name:'นำเข้า',last_name:'หนึ่ง',club_name:'ชุมนุมสำหรับนำเข้า'}]};
  r=await call('import/preview','POST',payload,session);assert.equal(r.data.summary.errors,0);
  const originalHash=r.data.preview_hash;
  r=await call('students','POST',{student_no:'TEST-102',prefix:'นาย',first_name:'เพิ่งเพิ่ม',last_name:'ชุมนุม',room_id:'2569-1-1',club_id:importClub},session);assert.equal(r.status,201);
  r=await call('import/commit','POST',{...payload,preview_hash:originalHash},session);assert.equal(r.status,409);
  r=await call('import/preview','POST',payload,session);assert.ok(r.data.summary.errors>0);
  const override={...payload,override_capacity:true,reason:'ได้รับอนุญาตพิเศษแล้ว'};
  r=await call('import/preview','POST',override,session);assert.equal(r.data.summary.errors,0);
  const nextHash=r.data.preview_hash;
  r=await call('import/commit','POST',{...override,preview_hash:nextHash},session);assert.equal(r.status,200,JSON.stringify(r.data));
  const found=await call('students?room_id=2569-3-1','GET',null,session);
  assert.equal(found.data.items.length,1);
  assert.equal(found.data.items[0].club_id,importClub);
});
