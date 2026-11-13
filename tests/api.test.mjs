import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequest} from '../functions/api/[[path]].js';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0002_student_archives.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0003_excel_import.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0004_teacher_excel_permissions.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0005_club_import_community_attendance.sql',import.meta.url),'utf8'));
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
  assert.equal(r.data.errors[0].student_no,'TEST-001');
  assert.match(r.data.errors[0].student_name,/ซ้ำ/);
  assert.match(r.data.errors[0].detail,/แถว 2/);
  const sourceLinePreview=await call('import/preview','POST',{...payload,rows:[{...makeRow('TEST-900','ชื่อระบุแถวจริง','ไม่พบชุมนุม'),source_line:29}]},session);
  assert.equal(sourceLinePreview.data.errors[0].line,29);
  assert.equal(sourceLinePreview.data.errors[0].student_no,'TEST-900');
  assert.match(sourceLinePreview.data.errors[0].student_name,/ชื่อระบุแถวจริง/);
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
  const quotaIssue=r.data.errors.find(e=>e.detail.includes('โควตา'));
  assert.ok(quotaIssue?.related_students?.some(s=>s.student_no==='TEST-101'&&s.student_name.includes('นำเข้า')),
    'quota issue identifies student number and name');
  const override={...payload,override_capacity:true,reason:'ได้รับอนุญาตพิเศษแล้ว'};
  r=await call('import/preview','POST',override,session);assert.equal(r.data.summary.errors,0);
  const nextHash=r.data.preview_hash;
  r=await call('import/commit','POST',{...override,preview_hash:nextHash},session);assert.equal(r.status,200,JSON.stringify(r.data));
  const found=await call('students?room_id=2569-3-1','GET',null,session);
  assert.equal(found.data.items.length,1);
  assert.equal(found.data.items[0].club_id,importClub);
});

test('v1.4 teacher Excel permissions: default deny, room scope, sync and override restrictions, scoped history, revocation',async()=>{
  let r=await call('users','POST',{username:'teacher2',display_name:'ครูสิทธิ์ Excel',role:'teacher',password:'teacher-secret-2026'},session);
  assert.equal(r.status,201);const tId=r.data.id;
  r=await call('auth/login','POST',{username:'teacher2',password:'teacher-secret-2026'});
  assert.equal(r.status,200);const tCookie=r.cookie.split(';')[0];
  const row=(no,name)=>({student_no:no,prefix:'นางสาว',first_name:name,last_name:'ทดสอบ',club_name:''});
  const payload={room_id:'2569-4-1',mode:'merge',rows:[row('T-401','คนหนึ่ง'),row('T-402','คนสอง')]};
  r=await call('auth/me','GET',null,tCookie);assert.equal(r.data.user.can_import_excel,0);
  r=await call('import/preview','POST',payload,tCookie);assert.equal(r.status,403);
  r=await call('import/history','GET',null,tCookie);assert.equal(r.status,403);
  r=await call('assignments','POST',{user_id:tId,room_ids:['2569-4-1'],club_ids:[],can_import_excel:true,can_sync_excel:true},tCookie);
  assert.equal(r.status,403,'teachers cannot self-grant');
  r=await call('assignments','POST',{user_id:tId,room_ids:['2569-4-1'],club_ids:[],can_import_excel:false,can_sync_excel:true},session);
  assert.equal(r.status,400,'sync implies import');
  r=await call('assignments','POST',{user_id:tId,room_ids:['2569-4-1'],club_ids:[],can_import_excel:true,can_sync_excel:false},session);
  assert.equal(r.status,200);
  r=await call('auth/me','GET',null,tCookie);assert.equal(r.data.user.can_import_excel,1);assert.equal(r.data.user.can_sync_excel,0);
  r=await call('rooms','GET',null,tCookie);assert.deepEqual(r.data.items.map(x=>x.id),['2569-4-1']);
  r=await call('import/preview','POST',{...payload,room_id:'2569-2-1'},tCookie);assert.equal(r.status,403);
  r=await call('import/commit','POST',{...payload,room_id:'2569-2-1',preview_hash:'invalid'},tCookie);assert.equal(r.status,403);
  r=await call('import/preview','POST',{...payload,mode:'sync',reason:'ซิงก์ข้อมูลนักเรียน'},tCookie);assert.equal(r.status,403);
  r=await call('import/preview','POST',{...payload,override_capacity:true,reason:'ขอเพิ่มเกินโควตา'},tCookie);assert.equal(r.status,403);
  r=await call('import/preview','POST',payload,tCookie);assert.equal(r.status,200);assert.equal(r.data.summary.add,2);
  let committed=await call('import/commit','POST',{...payload,preview_hash:r.data.preview_hash},tCookie);
  assert.equal(committed.status,200,JSON.stringify(committed.data));
  r=await call('import/history','GET',null,tCookie);assert.ok(r.data.items.length===1);assert.equal(r.data.items[0].actor,'ครูสิทธิ์ Excel');
  r=await call('students?room_id=2569-4-1','GET',null,session);assert.equal(r.data.items.length,2);
  // Admin gives explicit permission to use the destructive sync workflow.
  r=await call('assignments','POST',{user_id:tId,room_ids:['2569-4-1'],club_ids:[],can_import_excel:true,can_sync_excel:true},session);assert.equal(r.status,200);
  const sync={room_id:'2569-4-1',mode:'sync',rows:[row('T-401','คนหนึ่ง')],reason:'รายชื่อนักเรียนปรับใหม่'};
  r=await call('import/preview','POST',sync,tCookie);assert.equal(r.status,200);assert.equal(r.data.summary.archive,1);
  committed=await call('import/commit','POST',{...sync,preview_hash:r.data.preview_hash,confirm_sync:'2569-4-1',acknowledge_archives:true},tCookie);
  assert.equal(committed.status,200,JSON.stringify(committed.data));
  r=await call('students?room_id=2569-4-1','GET',null,session);assert.equal(r.data.items.length,1);
  r=await call('import/history','GET',null,tCookie);assert.equal(r.data.items.length,2);
  // Creating a preview is not sufficient authorization if admin revokes access before commit.
  const pending={room_id:'2569-4-1',mode:'merge',rows:[row('T-403','คนสาม')]};
  r=await call('import/preview','POST',pending,tCookie);assert.equal(r.status,200);
  const staleHash=r.data.preview_hash;
  r=await call('assignments','POST',{user_id:tId,room_ids:['2569-4-1'],club_ids:[],can_import_excel:false,can_sync_excel:false},session);assert.equal(r.status,200);
  r=await call('import/commit','POST',{...pending,preview_hash:staleHash},tCookie);assert.equal(r.status,403);
  r=await call('auth/me','GET',null,tCookie);assert.equal(r.data.user.can_import_excel,0);
  r=await call('students?room_id=2569-4-1','GET',null,session);assert.ok(!r.data.items.some(x=>x.student_no==='T-403'));
  r=await call('import/history','GET',null,tCookie);assert.equal(r.status,403);
});

test('v1.5 club Excel import: scope, missing student, named validation, merge, sync, audit and revoke',async()=>{
  let r=await call('clubs','POST',{name:'ชุมนุม v15',year:2569,capacity:2},session);
  assert.equal(r.status,201);const targetClub=r.data.id;
  const extra=[];
  for(let n=1;n<=3;n++){
    r=await call('students','POST',{student_no:'V15-00'+n,prefix:'เด็กชาย',first_name:'ตัวอย่าง'+n,last_name:'ทดสอบ',room_id:'2569-5-1'},session);
    assert.equal(r.status,201);extra.push(r.data.id);
  }
  r=await call('users','POST',{username:'advisor15',display_name:'ครูชุมนุม v15',role:'teacher',password:'test-password-advisor-15'},session);
  assert.equal(r.status,201);const advisorId=r.data.id;
  r=await call('auth/login','POST',{username:'advisor15',password:'test-password-advisor-15'});
  assert.equal(r.status,200);const advCookie=r.cookie.split(';')[0];
  r=await call('club-import/allowed','GET',null,advCookie);assert.equal(r.status,403);
  r=await call('assignments','POST',{user_id:advisorId,room_ids:[],club_ids:[targetClub],can_import_club_excel:true,can_sync_club_excel:false},session);
  assert.equal(r.status,200);
  r=await call('club-import/allowed','GET',null,advCookie);
  assert.deepEqual(r.data.items.map(x=>x.id),[targetClub]);
  const row=(student_no,student_name='')=>({student_no,student_name});
  const base={club_id:targetClub,mode:'merge',rows:[row('V15-001'),row('V15-002')]};
  r=await call('club-import/preview','POST',{...base,mode:'sync',reason:'ต้องตรวจสอบอีกครั้ง'},advCookie);
  assert.equal(r.status,403,'teacher cannot sync without grant');
  r=await call('club-import/preview','POST',{...base,override_capacity:true,reason:'เกินโควตาต้องห้าม'},advCookie);
  assert.equal(r.status,403);
  r=await call('club-import/preview','POST',{...base,rows:[row('V15-001'),row('V15-001')]},advCookie);
  assert.equal(r.status,200);assert.equal(r.data.summary.errors,1);
  assert.match(r.data.errors[0].detail,/ซ้ำ/);
  r=await call('club-import/preview','POST',{...base,rows:[row('NO_SUCH_STUDENT')]},advCookie);
  assert.equal(r.data.summary.errors,1);
  r=await call('club-import/preview','POST',{...base,rows:[row('V15-001','ผิดชื่อแน่นอน')]},advCookie);
  assert.equal(r.data.summary.errors,1);
  r=await call('club-import/preview','POST',base,advCookie);
  assert.equal(r.status,200);assert.equal(r.data.summary.add,2);assert.equal(r.data.summary.errors,0);
  let committed=await call('club-import/commit','POST',{...base,preview_hash:r.data.preview_hash},advCookie);
  assert.equal(committed.status,200,JSON.stringify(committed.data));
  r=await call('club-import/commit','POST',{...base,preview_hash:r.data.preview_hash},advCookie);
  assert.equal(r.status,409,'cannot commit same plan twice');
  r=await call('clubs','GET',null,session);assert.equal(r.data.items.find(c=>c.id===targetClub).members,2);
  r=await call('club-import/preview','POST',{...base,rows:[row('V15-003')]},advCookie);
  assert.ok(r.data.summary.errors>0,'teacher cannot exceed capacity');
  // Teacher permission and club assignment are enforced at commit, not just preview.
  const sync={club_id:targetClub,mode:'sync',reason:'ปรับเปลี่ยนสมาชิกชุมนุม',rows:[row('V15-001')]};
  r=await call('assignments','POST',{user_id:advisorId,room_ids:[],club_ids:[targetClub],can_import_club_excel:true,can_sync_club_excel:true},session);
  assert.equal(r.status,200);
  r=await call('club-import/preview','POST',sync,advCookie);
  assert.equal(r.status,200);assert.equal(r.data.summary.remove,1);
  committed=await call('club-import/commit','POST',{...sync,preview_hash:r.data.preview_hash,confirm_club:'WRONG',acknowledge_removals:true},advCookie);
  assert.equal(committed.status,400);
  committed=await call('club-import/commit','POST',{...sync,preview_hash:r.data.preview_hash,confirm_club:'ชุมนุม v15',acknowledge_removals:true},advCookie);
  assert.equal(committed.status,200,JSON.stringify(committed.data));
  r=await call('students?room_id=2569-5-1','GET',null,session);
  assert.equal(r.data.items.find(s=>s.student_no==='V15-002').club_id,null,'sync removes membership only');
  r=await call('club-import/history','GET',null,advCookie);assert.equal(r.status,200);assert.equal(r.data.items.length,2);
  r=await call('club-import/allowed','GET',null,advCookie);assert.equal(r.data.items[0].members,1);
  r=await call('export/club-members?club_id='+encodeURIComponent(targetClub),'GET',null,advCookie);
  assert.equal(r.status,200);assert.ok(r.data.includes('V15-001'));assert.ok(!r.data.includes('V15-002'));
  r=await call('club-import/preview','POST',{...base,rows:[row('V15-003')]},advCookie);
  assert.equal(r.status,200);const hash=r.data.preview_hash;
  r=await call('assignments','POST',{user_id:advisorId,room_ids:[],club_ids:[targetClub],can_import_club_excel:false,can_sync_club_excel:false},session);
  assert.equal(r.status,200);
  committed=await call('club-import/commit','POST',{...base,rows:[row('V15-003')],preview_hash:hash},advCookie);
  assert.equal(committed.status,403);
});

test('v1.5 community attendance: homeroom scope, date, four statuses, stale update, absent vs unmarked, audit',async()=>{
  let r=await call('auth/login','POST',{username:'teacher1',password:'teacher-pass-2026'});
  assert.equal(r.status,200);const teach=r.cookie.split(';')[0];
  const url='community/attendance?room_id=2569-1-1&date=2026-11-12';
  r=await call(url,'GET',null,teach);assert.equal(r.status,200);
  assert.ok(r.data.items.length>=1);const target=r.data.items.find(s=>s.student_no==='12355');assert.ok(target);
  assert.equal(target.status,null);assert.equal(r.data.counts['ยังไม่ระบุ'],r.data.items.length);
  const payload={room_id:'2569-1-1',date:'2026-11-12',term:2,student_id:target.id,status:'มา',version:0};
  r=await call('community/mark','POST',payload,teach);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.version,1);
  r=await call('community/mark','POST',payload,teach);assert.equal(r.status,409,'stale data must not override');
  r=await call(url,'GET',null,session);assert.equal(r.data.counts['มา'],1);assert.equal(r.data.term,2);
  const testStatuses=['สาย','ลา','ขาด',null];let v=1;
  for(const st of testStatuses){
    const res=await call('community/mark','POST',{...payload,status:st,version:v++},session);
    assert.equal(res.status,200,JSON.stringify(res.data));
  }
  r=await call(url,'GET',null,teach);assert.equal(r.data.items.find(s=>s.id===target.id).status,null);
  assert.equal(r.data.counts['ยังไม่ระบุ'],r.data.items.length);
  r=await call('community/dates?room_id=2569-1-1','GET',null,teach);
  assert.equal(r.status,200);assert.equal(r.data.items[0].date,'2026-11-12');
  r=await call('community/mark','POST',{...payload,term:1,status:'ขาด',version:v},session);
  assert.equal(r.status,409,'cannot silently reassign session term');
  r=await call('community/mark','POST',{...payload,date:'2026-02-31',status:'มา',version:0},session);
  assert.equal(r.status,400);
  r=await call('community/mark','POST',{...payload,status:'ไม่มา',version:v},session);
  assert.equal(r.status,400);
  // Teacher can only access assigned homerooms, not arbitrary clubs or rooms.
  r=await call('community/attendance?room_id=2569-5-1&date=2026-11-12','GET',null,teach);assert.equal(r.status,403);
  r=await call('community/mark','POST',{...payload,room_id:'2569-5-1',version:0},teach);assert.equal(r.status,403);
  r=await call('audit','GET',null,session);assert.ok(r.data.items.some(x=>x.action==='community_attendance_mark'));
});


test('v1.6 accurate search count and room breakdown obey role scope',async()=>{
 let r=await call('students?q=TEST-001','GET',null,session);
 assert.equal(r.status,200);assert.equal(r.data.total,1);assert.equal(r.data.items.length,1);
 r=await call('students?q=THIS-DATA-DOES-NOT-EXIST','GET',null,session);
 assert.equal(r.status,200);assert.equal(r.data.total,0);
 r=await call('dashboard/rooms','GET',null,session);
 assert.equal(r.status,200);assert.equal(r.data.items.length,33);
 assert.ok(r.data.items.find(x=>x.id==='2569-1-1'));
 const logged=await call('auth/login','POST',{username:'teacher1',password:'teacher-pass-2026'});
 const teacherNew=logged.cookie.split(';')[0];
 r=await call('dashboard/rooms','GET',null,teacherNew);
 assert.equal(r.status,200);assert.deepEqual(r.data.items.map(x=>x.id),['2569-1-1']);
 r=await call('students?q=TEST-001','GET',null,teacherNew);
 assert.equal(r.data.total,0,'teacher must not learn counts outside scope');
});

test('v1.6 form roster API restricts teachers and includes only real unarchived members',async()=>{
 let r=await call('forms/options','GET',null,session);assert.equal(r.status,200);
 assert.equal(r.data.rooms.length,33);
 r=await call(`forms/data?kind=club&id=${encodeURIComponent(clubId)}&term=2`,'GET',null,session);
 assert.equal(r.status,200);assert.equal(r.data.kind,'club');
 assert.ok(r.data.students.every(x=>x.student_no));
 r=await call('forms/data?kind=community&id=2569-1-1&term=1','GET',null,session);
 assert.equal(r.status,200);
 assert.ok(Array.isArray(r.data.sessions));
 r=await call('forms/data?kind=other&id=2569-1-1&term=2','GET',null,session);
 assert.equal(r.status,200);
 const logged=await call('auth/login','POST',{username:'teacher1',password:'teacher-pass-2026'});
 const teacherNew=logged.cookie.split(';')[0];
 r=await call('forms/options','GET',null,teacherNew);assert.equal(r.data.rooms.length,1);
 r=await call('forms/data?kind=other&id=2569-2-1','GET',null,teacherNew);assert.equal(r.status,403);
 r=await call('forms/data?kind=club&id=nonexistent','GET',null,teacherNew);assert.equal(r.status,404);
 r=await call('forms/data?kind=other&id=2569-1-1','GET',null,teacherNew);assert.equal(r.status,200);
 r=await call('forms/options','GET');assert.equal(r.status,401);
});
