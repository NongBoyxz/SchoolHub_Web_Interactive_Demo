import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequest} from '../functions/api/[[path]].js';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
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
