import {readSchoolImport} from './xlsx-reader.js';
// SchoolHub Live v1.3 — authenticated UI; no real names/data shipped in this file.
const root=document.querySelector('#root'), modal=document.querySelector('#modal'), toastElement=document.querySelector('#toast');
const state={user:null,tab:'dashboard',students:[],clubs:[],rooms:[],users:[],teacher_rooms:[],teacher_clubs:[],dashboard:null,audit:[],archived:[],importHistory:[],importDraft:null,page:1,query:'',roomFilter:'',clubFilter:'',busy:false};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allAdmin=()=>['super_admin','admin'].includes(state.user?.role);
const currentRole=()=>({super_admin:'Super Admin',admin:'Admin',teacher:'Teacher'}[state.user?.role]||'');
const schoolName='โรงเรียนเทพศาลาประชาสรรค์';
const brandMark=(extra='')=>`<img class="school-mark ${extra}" src="/assets/school-logo.png" alt="ตราโรงเรียนเทพศาลาประชาสรรค์"/>`;
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
   <div class="brand brand-login">${brandMark()}<span><span class="school-title">${schoolName}</span><small class="brand-subtitle">SchoolHub Live</small></span></div>
   <div class="tag neutral">GitHub + Cloudflare Pages + D1</div>
   <h1 style="margin-top:22px">${setup?'ตั้งค่า Super Admin ครั้งแรก':'เข้าสู่ระบบ SchoolHub'}</h1>
   <p class="sub" style="margin-top:5px">${setup?'ผู้ติดตั้งระบบต้องมีรหัสติดตั้งที่ตั้งไว้ใน Cloudflare':'สำหรับครูและผู้ดูแลระบบของโรงเรียนเทพศาลาประชาสรรค์เท่านั้น'}</p>
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
 const nav=[['dashboard','▦','ภาพรวม'],...(allAdmin()?[['import','📥','นำเข้า Excel']]:[]),['students','👥','นักเรียน'],...(allAdmin()?[['archived','🗂️','รายการนักเรียนที่นำออก']]:[]),['clubs','🎯','ชุมนุม'],['rooms','🏫','ห้องเรียน'],['export','📥','ส่งออกรายงาน'],...(allAdmin()?[['users','🔐','บัญชีและสิทธิ์'],['audit','🕘','ประวัติการแก้ไข']]:[])];
 root.innerHTML=`<div class="app-layout"><aside class="sidebar" id="sidebar"><div class="sidebar-head"><div class="brand brand-sidebar">${brandMark()}<span><span class="school-title">${schoolName}</span><small class="brand-subtitle">SchoolHub Live v1.3</small></span></div></div>
 <nav class="nav">${nav.map(([key,emoji,label])=>navItem(key,emoji,label)).join('')}</nav>
 <div class="sidebar-foot"><strong>${esc(state.user.display_name)}</strong><p class="sub">${esc(currentRole())}</p><button id="change-password">เปลี่ยนรหัสผ่าน</button><button id="logout">ออกจากระบบ</button><p class="mini" style="color:#a4c0df;margin-top:18px">เว็บจำลองเดิม <a style="color:white" href="/">เปิดที่นี่</a></p></div></aside>
 <div class="main"><header class="topbar"><div class="row"><button id="menu-toggle" class="btn mobile-header" aria-label="เปิดเมนู">☰</button><div><h1>${schoolName} <span class="muted mini">/ SchoolHub</span></h1><p class="sub">ปีการศึกษา 2569</p></div></div><div class="user-block"><span class="role-pill">${esc(currentRole())}</span><div class="avatar">${esc(state.user.display_name.charAt(0))}</div></div></header>
 <main class="page">${content}<p class="footer-note">SchoolHub Cloudflare v1.3 — ระบบข้อมูลจริงบน D1 • ใช้งานตามสิทธิ์บัญชี • ไม่มีข้อมูลนักเรียนฝังในหน้าเว็บ</p></main></div></div>`;
 root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.page=1;loadTab();});
 root.querySelector('#change-password').onclick=()=>passwordDialog();
 root.querySelector('#logout').onclick=async()=>{try{await post('auth/logout',{});}catch{}state.user=null;renderLogin();};
 root.querySelector('#menu-toggle').onclick=()=>root.querySelector('#sidebar').classList.toggle('open');
}
const title=(heading,sub,actions='')=>`<div class="page-heading"><div><h2>${heading}</h2><p class="sub">${sub}</p></div><div class="actions">${actions}</div></div>`;
const table=(headers,rows)=>`<div class="card" style="padding:0"><div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">ยังไม่มีรายการ</td></tr>`}</tbody></table></div></div>`;
function renderDashboard(){const d=state.dashboard||{};const stats=[['👨‍🎓','นักเรียนในขอบเขต',d.students],['🎯','ชุมนุม',d.clubs],['🏫','ห้องเรียน',d.rooms],['👩‍🏫','ครูที่ใช้งาน',d.teachers??'—']];
 shell(`${title('ภาพรวมโรงเรียน','ข้อมูลล่าสุดจากฐานข้อมูล D1 • โรงเรียนเทพศาลาประชาสรรค์')}
 <div class="kpis">${stats.map(([ico,label,n])=>`<div class="card kpi"><div class="symbol">${ico}</div><p class="sub">${label}</p><div class="number">${n??0}</div></div>`).join('')}</div>
 <div class="split section"><section class="card stack"><h3>เริ่มจัดการข้อมูล</h3><p class="sub">ข้อมูลถูกบันทึกในฐานข้อมูลจริง ไม่หายเมื่อรีเฟรช</p>
   <div class="actions"><button class="btn primary" data-goto="students">จัดการนักเรียน →</button><button class="btn" data-goto="clubs">ดูชุมนุม</button><button class="btn" data-goto="export">ส่งออก CSV</button></div></section>
   <section class="card stack"><h3>ขอบเขตของเวอร์ชันนี้</h3><p class="sub">✅ ล็อกอิน • D1 • นักเรียน/ชุมนุม • สิทธิ์ครู • นำเข้า XLSX/CSV • ประวัติ</p><p class="sub">⏳ Google Login, นำเข้าไฟล์โรงเรียนเดิมโดยตรง, เช็กชื่อรายสัปดาห์ และประเมินผลจะเพิ่มเป็นระยะ</p></section></div>`);
 root.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.goto;loadTab();});
}
function selectRoomOptions(placeholder='ทุกห้อง',id=''){return `<option value="">${esc(placeholder)}</option>`+state.rooms.map(r=>`<option value="${esc(r.id)}" ${String(id)===String(r.id)?'selected':''}>ม.${r.grade}/${r.room_no} (${r.year})</option>`).join('');}
function selectClubOptions(placeholder='ทุกชุมนุม',id=''){return `<option value="">${esc(placeholder)}</option>`+state.clubs.filter(c=>c.active).map(c=>`<option value="${esc(c.id)}" ${String(id)===String(c.id)?'selected':''}>${esc(c.name)} ${c.capacity?`(${c.members}/${c.capacity})`:''}</option>`).join('');}
function renderStudents(){const rows=state.students.map(s=>`<tr><td><strong>${esc(s.student_no)}</strong></td><td>${esc(s.prefix+' '+s.first_name+' '+s.last_name)}</td><td>ม.${s.grade}/${s.room_no}</td><td>${esc(s.club_name||'ยังไม่มีชุมนุม')}</td><td><span class="tag neutral">v${s.version}</span></td>
  <td><div class="actions">${s.can_edit_personal?`<button class="btn small" data-edit-student="${esc(s.id)}">แก้ไข</button>`:''}<button class="btn small" data-transfer="${esc(s.id)}">เปลี่ยนชุมนุม</button>${allAdmin()?`<button class="btn small danger" data-archive="${esc(s.id)}">นำออก</button>`:''}</div></td></tr>`).join('');
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
 root.querySelectorAll('[data-archive]').forEach(b=>b.onclick=()=>archiveDialog(state.students.find(s=>s.id===b.dataset.archive)));
}
function archiveDialog(student){
 if(!allAdmin())return;
 const fullName=`${student.prefix} ${student.first_name} ${student.last_name}`.trim();
 const fields=`<div class="warning-box"><strong>นำออกจากรายการใช้งาน (Soft Delete)</strong><p class="sub">${esc(fullName)} • เลขประจำตัว ${esc(student.student_no)} • ${esc(roomName(student.room_id))}</p>
 <p class="mini">ข้อมูลนักเรียน ชุมนุม และประวัติจะยังอยู่ใน D1 และสามารถกู้คืนผ่านเมนูรายการนักเรียนที่นำออกได้</p></div>
 ${htmlField('reason','เหตุผลการนำออก (อย่างน้อย 5 ตัวอักษร)','',{max:200})}
 <label class="checkbox-inline"><input type="checkbox" name="confirm_archive" required/><span>ยืนยันนำออกจากรายการใช้งาน</span></label>`;
 showModal('ยืนยันนำออกจากรายการ',fields,async p=>{
   if(String(p.reason||'').trim().length<5)throw new Error('กรุณากรอกเหตุผลอย่างน้อย 5 ตัวอักษร');
   await post('students/'+student.id+'/archive',{version:student.version,reason:p.reason});
 });
}
function restoreDialog(student){
 if(!allAdmin())return;
 const fields=`<div class="banner"><strong>กู้คืนนักเรียน</strong><p class="sub">${esc(student.prefix+' '+student.first_name+' '+student.last_name)} • ${esc(student.student_no)}</p>
 <p class="mini">นักเรียนจะกลับสู่ห้องและชุมนุมเดิม โดยระบบจะเก็บประวัติการนำออก/กู้คืนไว้</p></div>
 ${student.club_id?capacityOverrideFields('อนุญาตกู้คืนเกินโควตาชุมนุมเดิม (Admin เท่านั้น)'):''}
 <label class="checkbox-inline"><input type="checkbox" name="confirm_restore" required/><span>ยืนยันกู้คืนข้อมูลนักเรียน</span></label>`;
 showModal('กู้คืนนักเรียน',fields,async(p,form)=>{await post('students/'+student.id+'/restore',{version:student.version,reason:p.reason||'',override_capacity:!!form.querySelector('[name=override_capacity]:checked')});});
 activateOverrideValidation();
}
function renderArchived(){
 const rows=state.archived.map(s=>`<tr><td><strong>${esc(s.student_no)}</strong></td><td>${esc(s.prefix+' '+s.first_name+' '+s.last_name)}</td>
 <td>ม.${s.grade}/${s.room_no}</td><td>${esc(s.archived_by_name)}</td><td>${esc(new Date(s.archived_at).toLocaleString('th-TH'))}</td>
 <td class="reason-cell">${esc(s.reason)}</td><td><button class="btn small primary" data-restore="${esc(s.id)}">กู้คืน</button></td></tr>`).join('');
 shell(`${title('รายการนักเรียนที่นำออก','สำหรับ Admin และ Super Admin เท่านั้น • ยังเก็บข้อมูลและประวัติอยู่ในฐานข้อมูล', '<button class="btn" id="back-to-students">← กลับหน้ารายชื่อ</button>')}
 <div class="card"><div class="filters"><input id="archive-search" placeholder="ค้นหาชื่อหรือเลขประจำตัว…" aria-label="ค้นหารายการที่นำออก" value="${esc(state.query)}"/><button class="btn primary" id="search-archives">ค้นหา</button></div>
 <p class="sub">นำออกแบบ Soft Delete ไม่ลบประวัติ • เลขประจำตัวเดิมยังถูกสงวนไว้ • คืนข้อมูลผ่านปุ่มกู้คืน</p></div>
 <div class="section">${table(['เลขประจำตัว','ชื่อ–นามสกุล','ห้อง','นำออกโดย','วันเวลา','เหตุผล','จัดการ'],rows)}</div>
 <div class="row between section"><p class="sub">หน้า ${state.page}</p><div class="actions"><button class="btn" id="archive-prev" ${state.page===1?'disabled':''}>← ก่อนหน้า</button><button class="btn" id="archive-next" ${state.archived.length<50?'disabled':''}>หน้าถัดไป →</button></div></div>`);
 root.querySelector('#back-to-students').onclick=()=>{state.tab='students';state.page=1;state.query='';loadTab();};
 root.querySelector('#search-archives').onclick=()=>{state.query=root.querySelector('#archive-search').value.trim();state.page=1;loadTab();};
 root.querySelector('#archive-search').onkeydown=e=>{if(e.key==='Enter')root.querySelector('#search-archives').click();};
 root.querySelector('#archive-prev').onclick=()=>{state.page=Math.max(1,state.page-1);loadTab();};
 root.querySelector('#archive-next').onclick=()=>{state.page++;loadTab();};
 root.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreDialog(state.archived.find(s=>s.id===b.dataset.restore)));
}
function capacityOverrideFields(label='Admin: อนุญาตเพิ่มเกินโควตา'){
 return `<div class="override-area"><label class="checkbox-inline"><input type="checkbox" name="override_capacity"/><span>${esc(label)}</span></label>
 ${htmlField('reason','เหตุผลกรณีเกินโควตา','',{required:false,max:200})}
 <p class="reason-help" id="override-reason-help">⚠️ หากติ๊กอนุญาตเพิ่มเกินโควตา ต้องกรอกเหตุผลอย่างน้อย 5 ตัวอักษร</p></div>`;
}
function activateOverrideValidation(){
 const checkbox=modal.querySelector('[name=override_capacity]'),reason=modal.querySelector('[name=reason]');
 if(!checkbox||!reason)return;
 const update=()=>{reason.required=checkbox.checked;reason.minLength=checkbox.checked?5:0;};
 checkbox.addEventListener('change',update);update();
}
function studentDialog(student){
 const editing=!!student,optsRooms=state.rooms.map(r=>({id:r.id,label:`ม.${r.grade}/${r.room_no}`}));
 const overrideFields=(!editing && allAdmin())
   ? capacityOverrideFields()
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
 activateOverrideValidation();
}
function transferDialog(student){
 const choices=[{id:'',label:'ยังไม่สังกัดชุมนุม'},...state.clubs.filter(c=>c.active).map(c=>({id:c.id,label:`${c.name} (${c.capacity?c.members+'/'+c.capacity:'ไม่จำกัด'})`}))];
 const fields=`<p class="sub">${esc(student.prefix+' '+student.first_name+' '+student.last_name)} • ${esc(roomName(student.room_id))}</p>
 ${htmlField('club_id','เลือกชุมนุมใหม่',student.club_id||'',{type:'select',items:choices,required:false})}
 ${allAdmin()?capacityOverrideFields('อนุญาตเพิ่มเกินโควตา (Admin เท่านั้น)'):htmlField('reason','หมายเหตุการย้าย (ถ้ามี)','',{required:false})}
 <p class="form-note">ระบบย้ายชุมนุมทันทีและเก็บประวัติ • สมาชิกชุมนุมเดิมจะถูกนำออกอัตโนมัติ</p>`;
 showModal('เปลี่ยนชุมนุม',fields,async(p,form)=>{
   await post('memberships',{student_id:student.id,club_id:p.club_id||null,version:student.version,reason:p.reason||'',override_capacity:!!form.querySelector('[name=override_capacity]:checked')});
 });
 activateOverrideValidation();
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
 <div class="card stack"><h3>นำเข้า Excel / XLSX</h3><span class="tag">รองรับ .xlsx / .csv</span><p class="sub">ใช้แบบฟอร์ม SchoolHub แล้วตรวจข้อมูลรายห้องก่อนบันทึกใน D1</p>${allAdmin()?'<button class="btn primary" id="go-import">เปิดระบบนำเข้า →</button>':'<p class="sub">การนำเข้ารุ่นนี้จำกัดเฉพาะ Admin/Super Admin</p>'}</div></div>`);
 if(allAdmin())root.querySelector('#go-import').onclick=()=>{state.tab='import';loadTab();};
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
// SchoolHub v1.3 admin-only XLSX/CSV import UI. No workbook contents are published in GitHub.
function renderImport(){
 if(!allAdmin()){state.tab='dashboard';return renderDashboard();}
 const previous=(state.importHistory||[]).map(run=>`<tr><td>${esc(new Date(run.created_at).toLocaleString('th-TH'))}</td><td>${esc(roomName(run.room_id))}</td><td>${run.mode==='sync'?'ซิงก์ทั้งห้อง':'เพิ่ม/อัปเดต'}</td><td>${run.added}/${run.updated}/${run.archived}</td><td>${esc(run.actor)}</td></tr>`).join('');
 shell(`${title('นำเข้า Excel','เลือกห้องเรียนและตรวจสอบทุกการเปลี่ยนแปลงก่อนบันทึกลง D1')}
 <section class="card stack import-panel">
 <div class="row between"><h3>① เตรียมแบบฟอร์มรายชื่อนักเรียน</h3><a class="btn" href="/templates/SchoolHub_Import_v1.3.xlsx" download>📥 ดาวน์โหลดแบบฟอร์ม .xlsx</a></div>
 <p class="sub">รองรับไฟล์ .xlsx หรือ .csv ตามแบบฟอร์ม โรงเรียนเทพศาลาประชาสรรค์ • จำกัดไม่เกิน 120 คนต่อครั้ง • นำเข้าได้ครั้งละหนึ่งห้อง</p>
 <div class="warning-box mini">ไฟล์ต้นฉบับของโรงเรียนแต่ละชั้นมีรูปแบบแตกต่างกัน เวอร์ชันนี้ต้องจัดข้อมูลให้ตรงแบบฟอร์มก่อน ระบบจะไม่เดาชุมนุมที่สะกดต่างกัน และจะไม่อัปโหลดไฟล์ Excel ดิบไปยังเซิร์ฟเวอร์</div>
 <div class="grid2">
  <label class="field"><span>ห้องเรียนปลายทาง</span><select id="import-room" required>${state.rooms.map(r=>`<option value="${esc(r.id)}">ม.${r.grade}/${r.room_no} • ปี ${r.year}</option>`).join('')}</select></label>
  <label class="field"><span>ไฟล์ Excel/CSV</span><input type="file" id="import-file" accept=".xlsx,.csv" required/></label>
  <label class="field"><span>วิธีนำเข้า</span><select id="import-mode"><option value="merge">เพิ่ม/อัปเดตเท่านั้น (ไม่ลบคนที่ไม่อยู่ในไฟล์)</option><option value="sync">ซิงก์ทั้งห้อง (นำคนที่ไม่มีในไฟล์ออกแบบ Soft Delete)</option></select></label>
  <label class="field"><span>เหตุผล (จำเป็นเมื่อซิงก์หรืออนุญาตเกินโควตา)</span><input id="import-reason" maxlength="200" placeholder="กรุณากรอกอย่างน้อย 5 ตัวอักษร"/></label>
 </div>
 <label class="checkbox-inline"><input id="import-override" type="checkbox"/> Super Admin/Admin: อนุญาตเพิ่มเกินโควตาเมื่อมีเหตุผล</label>
 <p class="reason-help">กรณีเลือกอนุญาตเพิ่มเกินโควตา หรือซิงก์ทั้งห้อง ต้องกรอกเหตุผลอย่างน้อย 5 ตัวอักษร</p>
 <div class="actions"><button id="import-preview" class="btn primary">🔎 ตรวจสอบข้อมูลก่อนนำเข้า</button><button id="import-reset" class="btn">ล้างพรีวิว</button></div>
 <div id="import-feedback" class="mini" role="status" aria-live="polite"></div>
 </section>
 <section class="section" id="import-result" hidden></section>
 <section class="card section stack"><h3>ประวัติการนำเข้าสำเร็จ (30 รายการล่าสุด)</h3>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>วันที่</th><th>ห้อง</th><th>โหมด</th><th>เพิ่ม / แก้ / นำออก</th><th>ผู้ดำเนินการ</th></tr></thead><tbody>${previous||'<tr><td colspan="5" class="empty">ยังไม่มีการนำเข้า</td></tr>'}</tbody></table></div></section>`);
 const $=id=>root.querySelector('#'+id),clear=()=>{$('import-result').hidden=true;$('import-result').innerHTML='';state.importDraft=null;};
 ['import-file','import-room','import-mode','import-reason','import-override'].forEach(id=>$(id).addEventListener('change',clear));
 $('import-reset').onclick=()=>{clear();$('import-file').value='';$('import-feedback').textContent='ล้างข้อมูลพรีวิวแล้ว';};
 $('import-preview').onclick=async()=>{
  const button=$('import-preview'),file=$('import-file').files[0];clear();
  if(!file){$('import-feedback').textContent='กรุณาเลือกไฟล์ก่อน';return;}
  button.disabled=true;$('import-feedback').textContent='กำลังอ่านไฟล์และตรวจสอบกับฐานข้อมูล…';
  try{
   const rows=await readSchoolImport(file);
   const payload={rows,room_id:$('import-room').value,mode:$('import-mode').value,
     reason:$('import-reason').value.trim(),override_capacity:$('import-override').checked};
   const result=await post('import/preview',payload);
   state.importDraft={payload,preview_hash:result.preview_hash};
   renderImportPreview(result);
   $('import-feedback').textContent=`อ่านไฟล์ ${file.name} ได้ ${rows.length} แถว • พบข้อผิดพลาด ${result.summary.errors} รายการ`;
  }catch(e){$('import-feedback').textContent='เกิดข้อผิดพลาด: '+e.message;notify(e.message);}finally{button.disabled=false;}
 };
}
// Make every import problem traceable to the exact student and spreadsheet row.
// The same error data is used for the on-screen list and downloadable report.
function importIssueLabel(issue){
 const line=Number(issue.line)||0;
 const number=String(issue.student_no||'').trim();
 const student=String(issue.student_name||'').trim();
 return {line:line>0?`แถว ${line}`:'ทั้งไฟล์',number:number||'ไม่ระบุเลขประจำตัว',student:student||'ไม่ระบุชื่อ',detail:String(issue.detail||'ไม่ระบุสาเหตุ')};
}
function downloadImportErrors(data){
 const issues=Array.isArray(data.errors)?data.errors:[];
 const protect=value=>{const s=String(value??'');return /^[\s]*[=+\-@\t\r]/.test(s)?`'${s}`:s;};
 const cell=value=>`"${protect(value).replaceAll('"','""')}"`;
 const lines=[['แถวใน Excel','เลขประจำตัว','ชื่อ-นามสกุล','สาเหตุ','นักเรียนที่เกี่ยวข้อง'].map(cell).join(',')];
 for(const e of issues){
  const detail=importIssueLabel(e);
  const related=(e.related_students||[]).map(x=>`${x.line?`แถว ${x.line} `:''}${x.student_no||'—'} ${x.student_name||'—'}`).join(' / ');
  lines.push([detail.line,detail.number,detail.student,detail.detail,related].map(cell).join(','));
 }
 const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=`SchoolHub_Import_Errors_${String(data.room?.id||'room').replace(/[^a-zA-Z0-9_-]/g,'_')}.csv`;
 document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderImportPreview(data){
 const container=root.querySelector('#import-result');container.hidden=false;
 const label={add:'เพิ่มใหม่',update:'ปรับปรุง',unchanged:'ไม่เปลี่ยน',archive:'นำออก (Soft Delete)',error:'ผิดพลาด'};
 const summary=data.summary,items=Array.isArray(data.items)?data.items:[],issues=Array.isArray(data.errors)?data.errors:[];
 const hasRowErrors=items.some(x=>x.action==='error');
 const rows=items.map((r,index)=>`<tr id="import-row-${index}" data-import-action="${esc(r.action)}" class="${r.action==='error'?'import-error-row':''}">
  <td>${r.line||'—'}</td><td>${esc(r.student_no)}</td><td>${esc(r.student_name)}</td>
  <td><span class="tag ${r.action==='error'||r.action==='archive'?'warning':r.action==='unchanged'?'neutral':''}">${label[r.action]||esc(r.action)}</span></td>
  <td class="reason-cell">${esc(r.detail)}</td></tr>`).join('');
 const issueCards=issues.map((e,i)=>{
  const v=importIssueLabel(e);
  const rowIndex=items.findIndex(x=>x.action==='error'&&x.line===e.line&&x.student_no===e.student_no&&x.student_name===e.student_name);
  const linked=rowIndex>=0?`<a class="import-issue-link" href="#import-row-${rowIndex}" data-target="import-row-${rowIndex}" aria-label="ดูรายการแถว ${Number(e.line)||'?'} ในตาราง">ดูในตาราง ↓</a>`:'';
  const related=Array.isArray(e.related_students)&&e.related_students.length?`<div class="import-related">ผู้ที่เกี่ยวข้อง: ${e.related_students.map(x=>`<span>${esc(`แถว ${x.line} • ${x.student_no||'ไม่ระบุเลขประจำตัว'} • ${x.student_name||'ไม่ระบุชื่อ'}`)}</span>`).join('')}</div>`:'';
  return `<li class="import-issue" data-issue-index="${i}"><div class="import-issue-head"><strong>${esc(v.line)}</strong><span class="import-student-id">เลขประจำตัว: <strong>${esc(v.number)}</strong></span><span>ชื่อ: <strong>${esc(v.student)}</strong></span>${linked}</div>
   <div class="import-issue-detail">⚠ ${esc(v.detail)}</div>${related}</li>`;
 }).join('');
 container.innerHTML=`<div class="card stack"><div class="row between"><h3>② ตัวอย่างการเปลี่ยนแปลง • ม.${data.room.grade}/${data.room.room_no}</h3><span class="tag ${summary.errors?'warning':''}">${summary.errors?'มีข้อผิดพลาด':'พร้อมยืนยัน'}</span></div>
 <div class="import-stats"><span class="tag">เพิ่ม ${summary.add}</span><span class="tag neutral">แก้ไข ${summary.update}</span><span class="tag neutral">ไม่เปลี่ยน ${summary.unchanged}</span><span class="tag warning">นำออก ${summary.archive}</span><span class="tag ${summary.errors?'warning':'neutral'}">ผิดพลาด ${summary.errors}</span></div>
 ${issues.length?`<section class="import-errors" aria-labelledby="import-errors-heading" role="region">
  <div class="row between"><div><h4 id="import-errors-heading">⚠️ พบข้อผิดพลาด ${issues.length} รายการ</h4><p class="sub">ระบุแถว เลขประจำตัว และชื่อผู้เรียน เพื่อค้นหาและแก้ไขใน Excel ก่อนตรวจใหม่</p></div>
  <button type="button" id="import-export-errors" class="btn small">⬇ ดาวน์โหลดรายการผิดพลาด (.csv)</button></div>
  <ol class="import-issue-list">${issueCards}</ol></section>`:''}
 <div class="row between import-table-toolbar"><strong>ตารางพรีวิว (${items.length} แถว)</strong><div class="actions">
  ${hasRowErrors?`<button class="btn small" id="import-filter-errors" type="button" aria-pressed="true">เฉพาะแถวที่ผิด (${items.filter(r=>r.action==='error').length})</button><button class="btn small" id="import-filter-all" type="button" aria-pressed="false">แสดงทั้งหมด (${items.length})</button>`:''}
 </div></div><p id="import-filter-label" class="sub" aria-live="polite"></p>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>แถว</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>การดำเนินการ</th><th>รายละเอียด</th></tr></thead><tbody>${rows}</tbody></table></div>
 ${data.mode==='sync'?`<div class="sync-confirm"><h3>⚠️ โหมดซิงก์ทั้งห้อง</h3><p>นักเรียนที่ไม่อยู่ในไฟล์จำนวน <strong>${summary.archive}</strong> คน จะถูกนำออกจากรายการใช้งาน (ไม่ลบถาวร)</p>
 <label class="checkbox-inline"><input id="import-ack" type="checkbox"/> ยืนยันว่าได้ตรวจสอบรายชื่อที่จะนำออกทั้งหมดแล้ว</label>
 <label class="field"><span>พิมพ์รหัสห้อง <strong>${esc(data.room.id)}</strong> เพื่อยืนยัน</span><input id="import-confirm" autocomplete="off" placeholder="${esc(data.room.id)}"/></label></div>`:''}
 <div class="row between"><span class="sub">หากครูคนอื่นแก้ไขข้อมูลก่อนกดบันทึก ระบบจะให้พรีวิวใหม่ก่อน</span>
 <button class="btn primary" id="import-save" ${summary.errors?'disabled':''}>✅ ยืนยันและนำเข้าข้อมูล</button></div>
 <div id="import-save-response" role="status" class="mini"></div>
 </div>`;
 if(issues.length){container.querySelector('#import-export-errors').onclick=()=>downloadImportErrors(data);
  container.querySelectorAll('.import-issue-link').forEach(a=>a.addEventListener('click',event=>{
   event.preventDefault();const target=document.getElementById(a.dataset.target);
   if(target){target.hidden=false;target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('import-highlight');
    setTimeout(()=>target.classList.remove('import-highlight'),1600);}
  }));
 }
 if(hasRowErrors){
  const tableRows=[...container.querySelectorAll('tr[data-import-action]')],filterLabel=container.querySelector('#import-filter-label');
  const setFilter=onlyErrors=>{for(const r of tableRows)r.hidden=onlyErrors&&r.dataset.importAction!=='error';
   container.querySelector('#import-filter-errors').setAttribute('aria-pressed',String(onlyErrors));
   container.querySelector('#import-filter-all').setAttribute('aria-pressed',String(!onlyErrors));
   filterLabel.textContent=onlyErrors?'กำลังแสดงเฉพาะนักเรียนที่มีข้อผิดพลาด':'กำลังแสดงนักเรียนทุกรายการ';};
  container.querySelector('#import-filter-errors').onclick=()=>setFilter(true);
  container.querySelector('#import-filter-all').onclick=()=>setFilter(false);
  setFilter(true);
 }
 const button=container.querySelector('#import-save');
 if(button)button.onclick=async()=>{
   const draft=state.importDraft;if(!draft)return;
   if(data.mode==='sync' && (!container.querySelector('#import-ack').checked || container.querySelector('#import-confirm').value.trim()!==data.room.id)){
      container.querySelector('#import-save-response').textContent='กรุณาติ๊กยืนยันและพิมพ์รหัสห้องให้ถูกต้อง';return;
   }
   button.disabled=true;
   container.querySelector('#import-save-response').textContent='กำลังตรวจสอบข้อมูลล่าสุดและบันทึก…';
   try{
     const output=await post('import/commit',{...draft.payload,preview_hash:draft.preview_hash,
       confirm_sync:data.mode==='sync'?data.room.id:undefined,
       acknowledge_archives:data.mode==='sync'?container.querySelector('#import-ack').checked:false});
     notify(`นำเข้าสำเร็จ เพิ่ม ${output.summary.add} / แก้ ${output.summary.update} / นำออก ${output.summary.archive}`);
     state.importDraft=null;state.importHistory=(await api('import/history')).items;renderImport();
     root.querySelector('#import-feedback').textContent='บันทึกสำเร็จแล้ว • เลขที่รายการ '+output.run_id;
   }catch(err){container.querySelector('#import-save-response').textContent='บันทึกไม่สำเร็จ: '+err.message;
     notify(err.message);button.disabled=false;}
 };
}

async function loadTab(reload=false){if(!state.user)return;
 loading();try{
   // Read lookup tables on every navigation to reflect latest changes across users.
   const [rooms,clubs]=await Promise.all([api('rooms'),api('clubs')]);state.rooms=rooms.items;state.clubs=clubs.items;
   switch(state.tab){
    case 'dashboard':state.dashboard=await api('dashboard');renderDashboard();break;
    case 'archived':{if(!allAdmin()){state.tab='dashboard';return loadTab();}const params=new URLSearchParams({page:String(state.page),q:state.query});state.archived=(await api('students/archived?'+params)).items;renderArchived();break;}
    case 'import':{if(!allAdmin()){state.tab='dashboard';return loadTab();}state.importHistory=(await api('import/history')).items;renderImport();break;}
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
 }catch(err){root.innerHTML=`<div class="login-bg"><div class="login-panel stack"><div class="brand brand-login">${brandMark()}<span>${schoolName}</span></div><h1>ยังไม่พร้อมเชื่อม Cloudflare</h1><p class="warning-box">${esc(err.message)}</p><p class="sub">ตรวจว่า Cloudflare Pages เชื่อม D1 binding ชื่อ <strong>DB</strong> และรัน migration แล้ว</p><a href="/">กลับเว็บจำลอง</a><button class="btn" id="retry-start">ลองเชื่อมต่อใหม่</button></div></div>`;root.querySelector('#retry-start').onclick=start;}}
start();
