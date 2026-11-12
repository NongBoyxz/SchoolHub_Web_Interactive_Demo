// SchoolHub Live v1.1 — authenticated UI; no real names/data shipped in this file.
const root=document.querySelector('#root'), modal=document.querySelector('#modal'), toastElement=document.querySelector('#toast');
const state={user:null,tab:'dashboard',students:[],clubs:[],rooms:[],users:[],teacher_rooms:[],teacher_clubs:[],dashboard:null,audit:[],page:1,query:'',roomFilter:'',clubFilter:'',busy:false};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allAdmin=()=>['super_admin','admin'].includes(state.user?.role);
const currentRole=()=>({super_admin:'Super Admin',admin:'Admin',teacher:'Teacher'}[state.user?.role]||'');
const clubName=id=>state.clubs.find(x=>x.id===id)?.name||'ยังไม่กำหนด';
const roomName=id=>{const r=state.rooms.find(x=>x.id===id);return r?`ม.${r.grade}/${r.room_no}`:'—';};
const getForm = form => Object.fromEntries(new FormData(form).entries());
function notify(message){toastElement.textContent=message;toastElement.className='show';setTimeout(()=>{if(toastElement.textContent===message)toastElement.className='';},3600);}
async function api(path,options={}){
 const response=await fetch('/api/'+path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 const data=await response.json().catch(()=>({error:'เซิร์ฟเวอร์ไม่ตอบกลับด้วย JSON'}));
 if(!response.ok){if(response.status===401&&state.user){state.user=null;renderLogin();}throw Object.assign(new Error(data.error||'เกิดข้อผิดพลาด'),{status:response.status,code:data.code});}
 return data;
}
const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
const patch=(path,body)=>api(path,{method:'PATCH',body:JSON.stringify(body)});
const loading=html=>root.innerHTML=html||'<div class="center-loading"><span class="spinner"></span> กำลังโหลดข้อมูล…</div>';
function htmlField(name,label,value='',opts={}){
 const required=opts.required===false?'':'required';
 if(opts.type==='select')return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}" ${required}>${opts.items.map(i=>`<option value="${esc(i.id)}" ${String(i.id)===String(value)?'selected':''}>${esc(i.label)}</option>`).join('')}</select></label>`;
 return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${opts.type||'text'}" value="${esc(value)}" maxlength="${opts.max||120}" placeholder="${esc(opts.placeholder||'')}" ${required} ${opts.min?`min="${opts.min}"`:''}></label>`;
}
function showModal(title,content,onSubmit){
 document.querySelector('#modal-heading').textContent=title;
 document.querySelector('#modal-content').innerHTML=`<form id="modal-form" class="stack">${content}<div class="modal-actions"><button type="button" class="btn" id="modal-cancel">ยกเลิก</button><button type="submit" class="btn primary">บันทึกข้อมูล</button></div></form>`;
 document.querySelector('#modal-cancel').onclick=()=>modal.close();
 const form=document.querySelector('#modal-form');
 form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
   try{await onSubmit(getForm(form),form);modal.close();notify('บันทึกเรียบร้อยแล้ว');await loadTab(true);}catch(err){notify(err.message);submit.disabled=false;}
 };
 modal.showModal();
}
document.querySelector('#modal-close').onclick=()=>modal.close();
function renderLogin(setup=false,loadError=''){
 state.user=null;
 root.innerHTML=`<div class="login-bg"><main class="login-panel">
   <div class="brand"><div class="logo">S</div><span>SchoolHub <small class="mini muted">Live</small></span></div>
   <div class="tag neutral">GitHub + Cloudflare Pages + D1</div>
   <h1 style="margin-top:22px">${setup?'ตั้งค่า Super Admin ครั้งแรก':'เข้าสู่ระบบ SchoolHub'}</h1>
   <p class="sub" style="margin-top:5px">${setup?'ผู้ติดตั้งระบบต้องมีรหัสติดตั้งที่ตั้งไว้ใน Cloudflare':'สำหรับครูและผู้ดูแลระบบของโรงเรียนเท่านั้น'}</p>
   <form id="login-form">
     ${setup?htmlField('setupToken','รหัสติดตั้ง (BOOTSTRAP_TOKEN)'):''}
     ${setup?htmlField('display_name','ชื่อผู้ดูแลระบบ'):''}
     ${htmlField('username','ชื่อผู้ใช้','',{max:50})}
     ${htmlField('password',setup?'รหัสผ่านอย่างน้อย 12 ตัว':'รหัสผ่าน','',{type:'password',max:128})}
     <button class="btn primary" style="width:100%;margin-top:9px" type="submit">${setup?'สร้างบัญชี Super Admin':'เข้าสู่ระบบ'} →</button>
     <div class="auth-error" id="auth-error">${esc(loadError)}</div>
   </form><p class="login-footer">ระบบข้อมูลจริง • ห้ามใช้บัญชีร่วมกัน • ข้อมูลนักเรียนไม่อยู่ใน HTML</p>
   <p class="login-footer" style="margin-top:7px"><a href="/">กลับไปยังเว็บจำลองเดิม</a></p>
 </main></div>`;
 const f=document.querySelector('#login-form');f.onsubmit=async e=>{e.preventDefault();const d=getForm(f), btn=f.querySelector('button');btn.disabled=true;
   try {if(setup){await post('setup',{setupToken:d.setupToken,display_name:d.display_name,username:d.username,password:d.password});notify('สร้าง Super Admin แล้ว กรุณาเข้าสู่ระบบ');renderLogin();}
   else{const r=await post('auth/login',{username:d.username,password:d.password});state.user=r.user;await loadTab();}}
   catch(err){document.querySelector('#auth-error').textContent=err.message;btn.disabled=false;}
 };
}
function passwordDialog(){
 const content=`${htmlField('old_password','รหัสผ่านเดิม','',{type:'password',max:128})}${htmlField('new_password','รหัสผ่านใหม่ (อย่างน้อย 12 ตัว)','',{type:'password',max:128})}`;
 showModal('เปลี่ยนรหัสผ่าน',content,async p=>{await post('auth/change-password',p);state.user=null;renderLogin();notify('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่');});
}
function navItem(key,emoji,label){return `<button class="nav-btn ${state.tab===key?'active':''}" data-tab="${key}"><span class="emoji">${emoji}</span>${esc(label)}</button>`;}
function shell(content){
 const nav=[['dashboard','▦','ภาพรวม'],['students','👥','นักเรียน'],['clubs','🎯','ชุมนุม'],['rooms','🏫','ห้องเรียน'],['export','📥','ส่งออกรายงาน'],...(allAdmin()?[['users','🔐','บัญชีและสิทธิ์'],['audit','🕘','ประวัติการแก้ไข']]:[])];
 root.innerHTML=`<div class="app-layout"><aside class="sidebar" id="sidebar"><div class="sidebar-head"><div class="brand"><div class="logo">S</div>SchoolHub</div><p class="sub">Cloudflare Live v1.1</p></div>
 <nav class="nav">${nav.map(([key,emoji,label])=>navItem(key,emoji,label)).join('')}</nav>
 <div class="sidebar-foot"><strong>${esc(state.user.display_name)}</strong><p class="sub">${esc(currentRole())}</p><button id="change-password">เปลี่ยนรหัสผ่าน</button><button id="logout">ออกจากระบบ</button><p class="mini" style="color:#a4c0df;margin-top:18px">เว็บจำลองเดิม <a style="color:white" href="/">เปิดที่นี่</a></p></div></aside>
 <div class="main"><header class="topbar"><div class="row"><button id="menu-toggle" class="btn mobile-header" aria-label="เปิดเมนู">☰</button><div><h1>SchoolHub <span class="muted mini">/ ระบบข้อมูลโรงเรียน</span></h1><p class="sub">ปีการศึกษา 2569</p></div></div><div class="user-block"><span class="role-pill">${esc(currentRole())}</span><div class="avatar">${esc(state.user.display_name.charAt(0))}</div></div></header>
 <main class="page">${content}<p class="footer-note">SchoolHub Cloudflare v1.1 — ระบบข้อมูลจริงบน D1 • ใช้งานตามสิทธิ์บัญชี • ไม่มีข้อมูลนักเรียนฝังในหน้าเว็บ</p></main></div></div>`;
 root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.page=1;loadTab();});
 root.querySelector('#change-password').onclick=()=>passwordDialog();
 root.querySelector('#logout').onclick=async()=>{try{await post('auth/logout',{});}catch{}state.user=null;renderLogin();};
 root.querySelector('#menu-toggle').onclick=()=>root.querySelector('#sidebar').classList.toggle('open');
}
const title=(heading,sub,actions='')=>`<div class="page-heading"><div><h2>${heading}</h2><p class="sub">${sub}</p></div><div class="actions">${actions}</div></div>`;
const table=(headers,rows)=>`<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">ยังไม่มีรายการ</td></tr>`}</tbody></table></div></div>`;
function renderDashboard(){const d=state.dashboard||{};const stats=[['👨‍🎓','นักเรียนในขอบเขต',d.students],['🎯','ชุมนุม',d.clubs],['🏫','ห้องเรียน',d.rooms],['👩‍🏫','ครูที่ใช้งาน',d.teachers??'—']];
 shell(`${title('ภาพรวมโรงเรียน','ข้อมูลล่าสุดจากฐานข้อมูล D1 เมื่อเปิดหน้าเว็บไซต์')}
 <div class="kpis">${stats.map(([ico,label,n])=>`<div class="card kpi"><div class="symbol">${ico}</div><p class="sub">${label}</p><div class="number">${n??0}</div></div>`).join('')}</div>
 <div class="split section"><section class="card stack"><h3>เริ่มจัดการข้อมูล</h3><p class="sub">ข้อมูลถูกบันทึกในฐานข้อมูลจริง ไม่หายเมื่อรีเฟรช</p>
   <div class="actions"><button class="btn primary" data-goto="students">จัดการนักเรียน →</button><button class="btn" data-goto="clubs">ดูชุมนุม</button><button class="btn" data-goto="export">ส่งออก CSV</button></div></section>
   <section class="card stack"><h3>ขอบเขตของเวอร์ชันนี้</h3><p class="sub">✅ ล็อกอิน • D1 • นักเรียน/ชุมนุม • สิทธิ์ครู • ประวัติ • CSV</p><p class="sub">⏳ Google Login, XLSX import, เช็กชื่อรายสัปดาห์ และประเมินผลจะเพิ่มเป็นระยะ</p></section></div>`);
 root.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.goto;loadTab();});
}
function selectRoomOptions(placeholder='ทุกห้อง',id=''){return `<option value="">${esc(placeholder)}</option>`+state.rooms.map(r=>`<option value="${esc(r.id)}" ${String(id)===String(r.id)?'selected':''}>ม.${r.grade}/${r.room_no} (${r.year})</option>`).join('');}
function selectClubOptions(placeholder='ทุกชุมนุม',id=''){return `<option value="">${esc(placeholder)}</option>`+state.clubs.filter(c=>c.active).map(c=>`<option value="${esc(c.id)}" ${String(id)===String(c.id)?'selected':''}>${esc(c.name)} ${c.capacity?`(${c.members}/${c.capacity})`:''}</option>`).join('');}
function renderStudents(){const rows=state.students.map(s=>`<tr><td><strong>${esc(s.student_no)}</strong></td><td>${esc(s.prefix+' '+s.first_name+' '+s.last_name)}</td><td>ม.${s.grade}/${s.room_no}</td><td>${esc(s.club_name||'ยังไม่มีชุมนุม')}</td><td><span class="tag neutral">v${s.version}</span></td>
  <td><div class="actions">${s.can_edit_personal?`<button class="btn small" data-edit-student="${esc(s.id)}">แก้ไข</button>`:''}<button class="btn small" data-transfer="${esc(s.id)}">เปลี่ยนชุมนุม</button></div></td></tr>`).join('');
 shell(`${title('ข้อมูลนักเรียน','ค้นหา เพิ่ม แก้ไข หรือย้ายชุมนุม โดยบันทึกข้อมูลจริง',`<button class="btn primary" id="add-student" ${!state.rooms.length?'disabled':''}>+ เพิ่มนักเรียน</button>`)}
 <div class="card"><div class="filters"><input id="search" aria-label="ค้นหานักเรียน" placeholder="ค้นหาจากชื่อ เลขประจำตัว…" value="${esc(state.query)}"/><select id="room-filter" aria-label="เลือกห้อง">${selectRoomOptions('ทุกห้อง',state.roomFilter)}</select><select id="club-filter" aria-label="เลือกชุมนุม">${selectClubOptions('ทุกชุมนุม',state.clubFilter)}</select><button id="apply-filter" class="btn primary">ค้นหา</button></div>
 <p class="sub">แสดงครั้งละ 50 รายการ • เลขประจำตัวซ้ำไม่สามารถบันทึกได้ • การแก้ไขใช้ระบบตรวจเวอร์ชัน</p></div>
 <div class="section">${table(['เลขประจำตัว','ชื่อ–นามสกุล','ห้อง','ชุมนุม','เวอร์ชัน','จัดการ'],rows)}</div>
 <div class="row between section"><p class="sub">หน้า ${state.page}</p><div class="actions"><button class="btn" id="prev-page" ${state.page===1?'disabled':''}>← ก่อนหน้า</button><button class="btn" id="next-page" ${state.students.length<50?'disabled':''}>หน้าถัดไป →</button></div></div>`);
 root.querySelector('#add-student').onclick=()=>studentDialog();
 root.querySelector('#apply-filter').onclick=()=>{state.query=root.querySelector('#search').value.trim();state.roomFilter=root.querySelector('#room-filter').value;state.clubFilter=root.querySelector('#club-filter').value;state.page=1;loadTab();};
 root.querySelector('#search').onkeydown=e=>{if(e.key==='Enter')root.querySelector('#apply-filter').click();};
 root.querySelector('#prev-page').onclick=()=>{state.page=Math.max(1,state.page-1);loadTab();};
 root.querySelector('#next-page').onclick=()=>{state.page++;loadTab();};
 root.querySelectorAll('[data-edit-student]').forEach(b=>b.onclick=()=>studentDialog(state.students.find(s=>s.id===b.dataset.editStudent)));
 root.querySelectorAll('[data-transfer]').forEach(b=>b.onclick=()=>transferDialog(state.students.find(s=>s.id===b.dataset.transfer)));
}
function studentDialog(student){
 const editing=!!student,optsRooms=state.rooms.map(r=>({id:r.id,label:`ม.${r.grade}/${r.room_no}`}));
 const overrideFields=(!editing && allAdmin())
   ? `<label class="row"><input type="checkbox" name="override_capacity" style="width:auto;min-height:0"/> Admin: อนุญาตเพิ่มเกินโควตา</label>${htmlField('reason','เหตุผลกรณีเกินโควตา','',{required:false})}`
   : '';
 const fields=`<div class="grid2">${htmlField('student_no','เลขประจำตัวนักเรียน',student?.student_no||'')}${htmlField('prefix','คำนำหน้า',student?.prefix||'นาย',{required:false})}
 ${htmlField('first_name','ชื่อ',student?.first_name||'')}${htmlField('last_name','นามสกุล',student?.last_name||'')}
 ${htmlField('room_id','ห้องเรียน',student?.room_id||optsRooms[0]?.id,{type:'select',items:optsRooms})}</div>
 ${!editing?htmlField('club_id','ชุมนุมเริ่มต้น','',{type:'select',items:[{id:'',label:'ยังไม่เลือกชุมนุม'},...state.clubs.filter(c=>c.active).map(c=>({id:c.id,label:c.name}))],required:false}):''}
 ${overrideFields}
 <p class="form-note">${editing?'ครูประจำชั้นแก้ข้อมูลส่วนตัวได้ทันที แต่การย้ายห้อง/เปลี่ยนสถานะเป็นสิทธิ์ Admin':'การเพิ่มสมาชิกชุมนุมต้องไม่เกินโควตาที่ตั้งไว้'}</p>`;
 showModal(editing?'แก้ไขข้อมูลนักเรียน':'เพิ่มนักเรียนใหม่',fields,async(p,form)=>{
   if(editing)await patch('students/'+student.id,{...p,version:student.version});
   else await post('students',{...p,club_id:p.club_id||null,override_capacity:!!form.querySelector('[name=override_capacity]:checked')});
 });
}
function transferDialog(student){
 const choices=[{id:'',label:'ยังไม่สังกัดชุมนุม'},...state.clubs.filter(c=>c.active).map(c=>({id:c.id,label:`${c.name} (${c.capacity?c.members+'/'+c.capacity:'ไม่จำกัด'})`}))];
 const fields=`<p class="sub">${esc(student.prefix+' '+student.first_name+' '+student.last_name)} • ${esc(roomName(student.room_id))}</p>
 ${htmlField('club_id','เลือกชุมนุมใหม่',student.club_id||'',{type:'select',items:choices,required:false})}
 ${allAdmin()?`<label class="row"><input name="override_capacity" type="checkbox" style="width:auto;min-height:0"/> อนุญาตเพิ่มเกินโควตา (Admin เท่านั้น)</label>${htmlField('reason','เหตุผล (จำเป็นถ้าเกินโควตา)','',{required:false})}`:htmlField('reason','หมายเหตุการย้าย (ถ้ามี)','',{required:false})}
 <p class="form-note">ระบบย้ายชุมนุมทันทีและเก็บประวัติ • สมาชิกชุมนุมเดิมจะถูกนำออกอัตโนมัติ</p>`;
 showModal('เปลี่ยนชุมนุม',fields,async(p,form)=>{
   await post('memberships',{student_id:student.id,club_id:p.club_id||null,version:student.version,reason:p.reason||'',override_capacity:!!form.querySelector('[name=override_capacity]:checked')});
 });
}
function renderClubs(){const rows=state.clubs.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${c.year}</td><td>${c.members}</td><td>${c.capacity??'ไม่จำกัด'}</td><td><span class="tag ${c.active?'':'warning'}">${c.active?(c.capacity&&c.members>=c.capacity?'เต็ม / จำกัด':'เปิดใช้งาน'):'ปิดใช้งาน'}</span></td><td>${allAdmin()?`<button class="btn small" data-edit-club="${esc(c.id)}">แก้ไข</button>`:'—'}</td></tr>`).join('');
 shell(`${title('ชุมนุม','จำนวนสมาชิกอ่านจากฐานข้อมูลจริง และตรวจโควตาก่อนเพิ่ม',allAdmin()?'<button class="btn primary" id="add-club">+ เพิ่มชุมนุม</button>':'')}${table(['ชื่อชุมนุม','ปี','สมาชิก','จำนวนสูงสุด','สถานะ','จัดการ'],rows)}`);
 if(allAdmin()){
  root.querySelector('#add-club').onclick=()=>clubDialog();
  root.querySelectorAll('[data-edit-club]').forEach(b=>b.onclick=()=>clubDialog(state.clubs.find(c=>c.id===b.dataset.editClub)));
 }
}
function clubDialog(club){const editing=!!club;
 const fields=`${htmlField('name','ชื่อชุมนุม',club?.name||'')}
 <div class="grid2">${htmlField('year','ปีการศึกษา',club?.year||2569,{type:'number',min:2500})}${htmlField('capacity','จำนวนสูงสุด (ว่าง = ไม่จำกัด)',club?.capacity||'',{type:'number',required:false,min:1})}</div>
 ${editing?`<label class="row"><input name="active" type="checkbox" style="width:auto;min-height:0" ${club.active?'checked':''}/> เปิดใช้งานชุมนุม</label>`:''}`;
 showModal(editing?'แก้ไขชุมนุม':'เพิ่มชุมนุมใหม่',fields,async(p,form)=>{
  const value={name:p.name,year:Number(p.year),capacity:p.capacity?Number(p.capacity):null};
  if(editing){value.active=!!form.querySelector('[name=active]:checked');await patch('clubs/'+club.id,value);}
  else await post('clubs',value);
 });
}
function renderRooms(){const rows=state.rooms.map(r=>`<tr><td>ม.${r.grade}/${r.room_no}</td><td>${r.year}</td><td>${state.user.role==='teacher'?'รับผิดชอบ':'—'}</td></tr>`).join('');
 shell(`${title('ห้องเรียน','รายการห้องเรียนปีการศึกษา 2569 จากฐานข้อมูล')}${table(['ห้องเรียน','ปีการศึกษา','หน้าที่ของฉัน'],rows)}`);
}
function renderExport(){shell(`${title('ส่งออกรายงาน','ข้อมูลจริงจากฐานข้อมูล Cloudflare D1')}
 <div class="split"><div class="card stack"><h3>ดาวน์โหลดรายชื่อนักเรียน</h3><p class="sub">เปิดได้ด้วย Microsoft Excel โดยเลือกเข้ารหัส UTF-8 และมีการป้องกันสูตรอันตรายในเซลล์</p>
 <div class="actions"><button class="btn primary" id="export-csv">📥 ดาวน์โหลด CSV</button></div><div class="hint">ครูทั่วไปจะดาวน์โหลดได้เฉพาะนักเรียนในห้องหรือชุมนุมที่ได้รับมอบหมาย ผู้ดูแลระบบดาวน์โหลดได้ทั้งโรงเรียน</div></div>
 <div class="card stack"><h3>นำเข้า Excel / XLSX</h3><span class="tag warning" style="align-self:flex-start">ยังไม่เปิดใช้งานใน v1.1</span><p class="sub">การนำเข้าพร้อมตรวจสอบข้อมูลซ้ำ/เวอร์ชันและพรีวิวก่อนบันทึกเป็นงานระยะถัดไป ห้ามใช้โหมดสาธิตเดิมนำเข้าข้อมูลจริง</p><p class="sub">สำหรับตอนนี้เพิ่มหรือแก้ไขรายชื่อผ่านเมนูนักเรียนได้อย่างปลอดภัยกว่า</p></div></div>`);
 root.querySelector('#export-csv').onclick=async()=>{
  try{const r=await fetch('/api/export/students',{credentials:'same-origin'});if(!r.ok){throw new Error((await r.json()).error||'ดาวน์โหลดไม่สำเร็จ');}
    const blob=await r.blob(),obj=URL.createObjectURL(blob),a=document.createElement('a');a.href=obj;a.download='schoolhub-students.csv';a.click();URL.revokeObjectURL(obj);notify('ส่งออกรายชื่อเรียบร้อย');}
  catch(err){notify(err.message);}
 };
}
function renderUsers(){const rows=state.users.map(u=>`<tr><td><strong>${esc(u.display_name)}</strong><div class="sub">${esc(u.username)}</div></td><td>${esc(u.role)}</td><td>${u.active?'ใช้งาน':'ระงับ'}</td><td>${u.role==='teacher'?`${state.teacher_rooms.filter(x=>x.user_id===u.id).length} ห้อง / ${state.teacher_clubs.filter(x=>x.user_id===u.id).length} ชุมนุม`:'—'}</td><td>${u.role==='teacher'?`<button class="btn small" data-assign="${esc(u.id)}">กำหนดหน้าที่</button>`:'—'}</td></tr>`).join('');
 shell(`${title('บัญชีและสิทธิ์','สร้างบัญชีครูและกำหนดห้องเรียน/ชุมนุมโดยผู้ดูแล',`<button class="btn primary" id="add-user">+ สร้างบัญชี</button>`)}
 <div class="warning-box" style="margin-bottom:15px">การสมัครด้วยตนเองและ Google Login ยังไม่รวมในเวอร์ชันนี้ • ตั้งรหัสผ่านชั่วคราวให้ครูเป็นรายบุคคลและส่งผ่านช่องทางส่วนตัว</div>
 ${table(['ชื่อผู้ใช้','บทบาท','สถานะ','หน้าที่','จัดการ'],rows)}`);
 root.querySelector('#add-user').onclick=()=>userDialog();
 root.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>assignDialog(state.users.find(u=>u.id===b.dataset.assign)));
}
function userDialog(){const roleItems=[{id:'teacher',label:'ครู'},...(state.user.role==='super_admin'?[{id:'admin',label:'Admin'},{id:'super_admin',label:'Super Admin'}]:[])];
 const fields=`<div class="grid2">${htmlField('username','ชื่อผู้ใช้ (อังกฤษ 4 ตัวขึ้นไป)')}${htmlField('display_name','ชื่อ–นามสกุล')}</div>
 ${htmlField('password','รหัสผ่านอย่างน้อย 12 ตัว','',{type:'password',max:128})}${htmlField('role','บทบาท','teacher',{type:'select',items:roleItems})}
 <div class="warning-box mini">ผู้ใช้ใหม่ต้องเปลี่ยนรหัสผ่านในการดูแลบัญชีตามนโยบายโรงเรียน (ฟังก์ชันเปลี่ยนรหัสผ่านด้วยตนเองยังอยู่ในแผนถัดไป)</div>`;
 showModal('สร้างบัญชีผู้ใช้',fields,async p=>post('users',p));
}
function assignDialog(user){const ur=state.teacher_rooms.filter(x=>x.user_id===user.id).map(x=>x.room_id), uc=state.teacher_clubs.filter(x=>x.user_id===user.id).map(x=>x.club_id);
 const fields=`<p class="sub">${esc(user.display_name)}</p><strong>ห้องเรียนที่รับผิดชอบ</strong><div class="check-col">${state.rooms.map(r=>`<label><input name="room_ids" value="${esc(r.id)}" type="checkbox" ${ur.includes(r.id)?'checked':''}> ม.${r.grade}/${r.room_no}</label>`).join('')}</div>
 ${htmlField('club_id','ชุมนุมที่รับผิดชอบ (1 ชุมนุม)',uc[0]||'',{type:'select',items:[{id:'',label:'ยังไม่มอบหมาย'},...state.clubs.filter(c=>c.active).map(c=>({id:c.id,label:c.name}))],required:false})}`;
 showModal('กำหนดหน้าที่ครู',fields,async(p,form)=>post('assignments',{user_id:user.id,room_ids:[...form.querySelectorAll('input[name=room_ids]:checked')].map(el=>el.value),club_ids:p.club_id?[p.club_id]:[]}));
}
function renderAudit(){const rows=state.audit.map(x=>`<tr><td>${esc(new Date(x.at).toLocaleString('th-TH'))}</td><td>${esc(x.actor)}</td><td>${esc(x.action)}</td><td>${esc(x.entity_type)}</td><td title="${esc(x.entity_id)}">${esc(x.entity_id.slice(0,14))}</td></tr>`).join('');
 shell(`${title('ประวัติการแก้ไข','100 รายการล่าสุดจากฐานข้อมูล — ดูได้เฉพาะผู้ดูแล')}${table(['วันเวลา','ผู้ดำเนินการ','การดำเนินการ','ประเภท','รหัสรายการ'],rows)}`);
}
async function loadTab(reload=false){if(!state.user)return;
 loading();try{
   // Read lookup tables on every navigation to reflect latest changes across users.
   const [rooms,clubs]=await Promise.all([api('rooms'),api('clubs')]);state.rooms=rooms.items;state.clubs=clubs.items;
   switch(state.tab){
    case 'dashboard':state.dashboard=await api('dashboard');renderDashboard();break;
    case 'students':{const params=new URLSearchParams({page:String(state.page),q:state.query,room_id:state.roomFilter,club_id:state.clubFilter});state.students=(await api('students?'+params)).items;renderStudents();break;}
    case 'clubs':renderClubs();break;
    case 'rooms':renderRooms();break;
    case 'export':renderExport();break;
    case 'users':if(!allAdmin()){state.tab='dashboard';return loadTab();}Object.assign(state,await api('users'));renderUsers();break;
    case 'audit':if(!allAdmin()){state.tab='dashboard';return loadTab();}state.audit=(await api('audit')).items;renderAudit();break;
    default:state.tab='dashboard';return loadTab();
   }
 }catch(err){shell(`<div class="card stack"><h2>เปิดข้อมูลไม่สำเร็จ</h2><p>${esc(err.message)}</p><button class="btn" id="retry">ลองใหม่</button></div>`);root.querySelector('#retry').onclick=()=>loadTab();}
}
async function start(){try{const status=await api('status');if(status.setup_required){renderLogin(true);return;}
 const me=await api('auth/me').catch(e=>{if(e.status===401)return null;throw e;});if(me?.user){state.user=me.user;await loadTab();}else renderLogin();
 }catch(err){root.innerHTML=`<div class="login-bg"><div class="login-panel stack"><div class="brand"><div class="logo">S</div>SchoolHub</div><h1>ยังไม่พร้อมเชื่อม Cloudflare</h1><p class="warning-box">${esc(err.message)}</p><p class="sub">ตรวจว่า Cloudflare Pages เชื่อม D1 binding ชื่อ <strong>DB</strong> และรัน migration แล้ว</p><a href="/">กลับเว็บจำลอง</a><button class="btn" id="retry-start">ลองเชื่อมต่อใหม่</button></div></div>`;root.querySelector('#retry-start').onclick=start;}}
start();
