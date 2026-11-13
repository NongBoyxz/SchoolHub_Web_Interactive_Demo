import {readSchoolImport,readSchoolClubImport} from './xlsx-reader.js';
import {buildActivityForms} from './form-xlsx.js';
// SchoolHub Live v1.6.1 — role-scoped teacher Excel import; no student data in static assets.
const root=document.querySelector('#root'), modal=document.querySelector('#modal'), toastElement=document.querySelector('#toast');
const state={user:null,tab:'dashboard',students:[],clubs:[],rooms:[],users:[],teacher_rooms:[],teacher_clubs:[],dashboard:null,roomBreakdown:[],formOptions:null,studentTotal:0,audit:[],archived:[],importHistory:[],importDraft:null,clubImportDraft:null,clubImportHistory:[],allowedClubs:[],community:{room_id:'',date:'',term:1,items:[],dates:[]},page:1,query:'',roomFilter:'',clubFilter:'',busy:false};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allAdmin=()=>['super_admin','admin'].includes(state.user?.role);
const canUseImport=()=>allAdmin()||(state.user?.role==='teacher'&&Number(state.user.can_import_excel)===1);
const canClubImport=()=>allAdmin()||(state.user?.role==='teacher'&&Number(state.user.can_import_club_excel)===1);
const canClubSync=()=>allAdmin()||(state.user?.role==='teacher'&&Number(state.user.can_import_club_excel)===1&&Number(state.user.can_sync_club_excel)===1);
const canUseSync=()=>allAdmin()||(state.user?.role==='teacher'&&Number(state.user.can_import_excel)===1&&Number(state.user.can_sync_excel)===1);
const currentRole=()=>({super_admin:'Super Admin',admin:'Admin',teacher:'Teacher'}[state.user?.role]||'');
const schoolName='โรงเรียนเทพศาลาประชาสรรค์';
const brandMark=(extra='')=>`<img class="school-mark ${extra}" src="/assets/school-logo.png" alt="ตราโรงเรียนเทพศาลาประชาสรรค์"/>`;
const clubName=id=>state.clubs.find(x=>x.id===id)?.name||'ยังไม่กำหนด';
const roomName=id=>{const r=state.rooms.find(x=>x.id===id);return r?`ม.${r.grade}/${r.room_no}`:'—';};
const getForm = form => Object.fromEntries(new FormData(form).entries());
function notify(message){toastElement.textContent=message;toastElement.className='show';setTimeout(()=>{if(toastElement.textContent===message)toastElement.className='';},3600);}
async function api(path,options={}){
 const response=await fetch('/api/'+path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 const data=await response.json().catch(()=>({error:'ระบบไม่สามารถตอบกลับได้ กรุณาลองใหม่'}));
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
function showModal(title,content,onSubmit,options={}){
 document.querySelector('#modal-heading').textContent=title;
 document.querySelector('#modal-content').innerHTML=`<form id="modal-form" class="stack">${content}<div class="modal-actions"><button type="button" class="btn" id="modal-cancel">ยกเลิก</button><button type="submit" class="btn ${options.danger?'danger-action':'primary'}">${esc(options.submitText||'บันทึกข้อมูล')}</button></div></form>`;
 document.querySelector('#modal-cancel').onclick=()=>modal.close();
 const form=document.querySelector('#modal-form');
 form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
   try{await onSubmit(getForm(form),form);modal.close();notify(options.successText||'บันทึกเรียบร้อยแล้ว');await loadTab(true);}catch(err){notify(err.message);submit.disabled=false;}
 };
 modal.showModal();
}
document.querySelector('#modal-close').onclick=()=>modal.close();
function renderLogin(setup=false,loadError=''){
 state.user=null;
 root.innerHTML=`<div class="login-bg"><main class="login-panel">
   <div class="brand brand-login">${brandMark()}<span><span class="school-title">${schoolName}</span><small class="brand-subtitle">SchoolHub Live</small></span></div>

   <h1 style="margin-top:22px">${setup?'ตั้งค่า Super Admin ครั้งแรก':'เข้าสู่ระบบ SchoolHub'}</h1>
   <p class="sub" style="margin-top:5px">${setup?'กรุณาติดต่อผู้ดูแลระบบเพื่อรับรหัสตั้งค่าครั้งแรก':'สำหรับครูและผู้ดูแลระบบของโรงเรียนเทพศาลาประชาสรรค์เท่านั้น'}</p>
   <form id="login-form">
     ${setup?htmlField('setupToken','รหัสตั้งค่าระบบครั้งแรก'):''}
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
   catch(err){document.querySelector('#auth-error').textContent=/BOOTSTRAP_TOKEN|Cloudflare|D1|SQL|binding|migration/i.test(err.message)?'ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ':err.message;btn.disabled=false;}
 };
}
function passwordDialog(){
 const content=`${htmlField('old_password','รหัสผ่านเดิม','',{type:'password',max:128})}${htmlField('new_password','รหัสผ่านใหม่ (อย่างน้อย 12 ตัว)','',{type:'password',max:128})}`;
 showModal('เปลี่ยนรหัสผ่าน',content,async p=>{await post('auth/change-password',p);state.user=null;renderLogin();notify('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่');});
}
function navItem(key,emoji,label){return `<button class="nav-btn ${state.tab===key?'active':''}" data-tab="${key}"><span class="emoji">${emoji}</span>${esc(label)}</button>`;}
function shell(content){
 const nav=[['dashboard','▦','ภาพรวม'],...(canUseImport()?[['import','📥','นำเข้า Excel']]:[]),...(canClubImport()?[['club-import','🗃️','นำเข้าสมาชิกชุมนุม']]:[]),['community','🤝','กิจกรรมบำเพ็ญประโยชน์'],['forms','📋','แบบฟอร์มกิจกรรม'],['students','👥','นักเรียน'],...(allAdmin()?[['archived','🗂️','รายการนักเรียนที่นำออก']]:[]),['clubs','🎯','ชุมนุม'],['rooms','🏫','ห้องเรียน'],['export','📥','ส่งออกรายงาน'],...(allAdmin()?[['users','🔐','บัญชีและสิทธิ์'],['audit','🕘','ประวัติการแก้ไข']]:[])];
 root.innerHTML=`<div class="app-layout"><aside class="sidebar" id="sidebar"><div class="sidebar-head"><div class="brand brand-sidebar">${brandMark()}<span><span class="school-title">${schoolName}</span><small class="brand-subtitle">SchoolHub Live v1.6.1</small></span></div></div>
 <nav class="nav">${nav.map(([key,emoji,label])=>navItem(key,emoji,label)).join('')}</nav>
 <div class="sidebar-foot"><strong>${esc(state.user.display_name)}</strong><p class="sub">${esc(currentRole())}</p><button id="change-password">เปลี่ยนรหัสผ่าน</button><button id="logout">ออกจากระบบ</button><p class="mini" style="color:#a4c0df;margin-top:18px">เว็บจำลองเดิม <a style="color:white" href="/">เปิดที่นี่</a></p></div></aside>
 <div class="main"><header class="topbar"><div class="row"><button id="menu-toggle" class="btn mobile-header" aria-label="เปิดเมนู">☰</button><div><h1>${schoolName} <span class="muted mini">/ SchoolHub</span></h1><p class="sub">ปีการศึกษา 2569</p></div></div><div class="user-block"><span class="role-pill">${esc(currentRole())}</span><div class="avatar">${esc(state.user.display_name.charAt(0))}</div></div></header>
 <main class="page">${content}<p class="footer-note">SchoolHub v1.6 — ระบบข้อมูลจริงบน D1 • ใช้งานตามสิทธิ์บัญชี • ไม่มีข้อมูลนักเรียนฝังในหน้าเว็บ</p></main></div></div>`;
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
 <section class="card section stack"><div class="row between"><h3>จำนวนนักเรียนแยกตามห้องเรียน</h3><span class="tag neutral">${state.roomBreakdown.length} ห้องในขอบเขต</span></div>
 <div class="room-summary-grid">${state.roomBreakdown.map(r=>`<div class="room-summary"><strong>ม.${r.grade}/${r.room_no}</strong><span>${Number(r.students).toLocaleString('th-TH')} คน</span></div>`).join('')||'<p class="sub">ยังไม่มีห้องเรียนที่ได้รับมอบหมาย</p>'}</div></section>
 <div class="split section"><section class="card stack"><h3>เริ่มจัดการข้อมูล</h3><p class="sub">ข้อมูลถูกบันทึกในฐานข้อมูลจริง ไม่หายเมื่อรีเฟรช</p>
   <div class="actions"><button class="btn primary" data-goto="students">จัดการนักเรียน →</button><button class="btn" data-goto="clubs">ดูชุมนุม</button><button class="btn" data-goto="export">ส่งออก CSV</button></div></section>
   <section class="card stack"><h3>ขอบเขตของเวอร์ชันนี้</h3><p class="sub">✅ ล็อกอิน • D1 • นักเรียน/ชุมนุม • นำเข้า Excel • เช็กชื่อบำเพ็ญประโยชน์รายวัน • ประวัติ</p><p class="sub">⏳ Google Login, ตารางกิจกรรมกลาง 20 สัปดาห์, เช็กชื่อชุมนุม และประเมินผลจะพัฒนาต่อ</p></section></div>`);
 root.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.goto;loadTab();});
}
function selectRoomOptions(placeholder='ทุกห้อง',id=''){return `<option value="">${esc(placeholder)}</option>`+state.rooms.map(r=>`<option value="${esc(r.id)}" ${String(id)===String(r.id)?'selected':''}>ม.${r.grade}/${r.room_no} (${r.year})</option>`).join('');}
function selectClubOptions(placeholder='ทุกชุมนุม',id=''){return `<option value="">${esc(placeholder)}</option>`+state.clubs.filter(c=>c.active).map(c=>`<option value="${esc(c.id)}" ${String(id)===String(c.id)?'selected':''}>${esc(c.name)} ${c.capacity?`(${c.members}/${c.capacity})`:''}</option>`).join('');}
function renderStudents(){const rows=state.students.map(s=>`<tr><td><strong>${esc(s.student_no)}</strong></td><td>${esc(s.prefix+' '+s.first_name+' '+s.last_name)}</td><td>ม.${s.grade}/${s.room_no}</td><td>${esc(s.club_name||'ยังไม่มีชุมนุม')}</td><td><span class="tag neutral">v${s.version}</span></td>
  <td><div class="actions">${s.can_edit_personal?`<button class="btn small" data-edit-student="${esc(s.id)}">แก้ไข</button>`:''}<button class="btn small" data-transfer="${esc(s.id)}">เปลี่ยนชุมนุม</button>${allAdmin()?`<button class="btn small danger" data-archive="${esc(s.id)}">นำออก</button>`:''}</div></td></tr>`).join('');
 shell(`${title('ข้อมูลนักเรียน','ค้นหา เพิ่ม แก้ไข หรือย้ายชุมนุม โดยบันทึกข้อมูลจริง',`<button class="btn primary" id="add-student" ${!state.rooms.length?'disabled':''}>+ เพิ่มนักเรียน</button>`)}
 <div class="card"><div class="filters"><input id="search" aria-label="ค้นหานักเรียน" placeholder="ค้นหาจากชื่อ เลขประจำตัว…" value="${esc(state.query)}"/><select id="room-filter" aria-label="เลือกห้อง">${selectRoomOptions('ทุกห้อง',state.roomFilter)}</select><select id="club-filter" aria-label="เลือกชุมนุม">${selectClubOptions('ทุกชุมนุม',state.clubFilter)}</select><button id="apply-filter" class="btn primary">ค้นหา</button></div>
 <p class="sub" role="status" aria-live="polite"><strong>พบ ${Number(state.studentTotal).toLocaleString('th-TH')} คน</strong>${state.query?' จากคำค้นหา “'+esc(state.query)+'”':''} • แสดงหน้าละ 50 รายการ • เลขประจำตัวซ้ำไม่สามารถบันทึกได้</p></div>
 <div class="section">${table(['เลขประจำตัว','ชื่อ–นามสกุล','ห้อง','ชุมนุม','เวอร์ชัน','จัดการ'],rows)}</div>
 <div class="row between section"><p class="sub">หน้า ${state.page} / ${Math.max(1,Math.ceil(state.studentTotal/50))} • ผลลัพธ์ทั้งหมด ${Number(state.studentTotal).toLocaleString('th-TH')} คน</p><div class="actions"><button class="btn" id="prev-page" ${state.page===1?'disabled':''}>← ก่อนหน้า</button><button class="btn" id="next-page" ${state.page*50>=state.studentTotal?'disabled':''}>หน้าถัดไป →</button></div></div>`);
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
 <div class="card stack"><h3>นำเข้า Excel / XLSX</h3><span class="tag">รองรับ .xlsx / .csv</span><p class="sub">ใช้แบบฟอร์ม SchoolHub แล้วตรวจข้อมูลรายห้องก่อนบันทึกใน D1</p>${canUseImport()?'<button class="btn primary" id="go-import">เปิดระบบนำเข้า →</button>':'<p class="sub">ต้องได้รับสิทธิ์นำเข้า Excel จากผู้ดูแลระบบก่อน</p>'}</div></div>`);
 if(canUseImport())root.querySelector('#go-import').onclick=()=>{state.tab='import';loadTab();};
 root.querySelector('#export-csv').onclick=async()=>{
  try{const r=await fetch('/api/export/students',{credentials:'same-origin'});if(!r.ok){throw new Error((await r.json()).error||'ดาวน์โหลดไม่สำเร็จ');}
    const blob=await r.blob(),obj=URL.createObjectURL(blob),a=document.createElement('a');a.href=obj;a.download='schoolhub-students.csv';a.click();URL.revokeObjectURL(obj);notify('ส่งออกรายชื่อเรียบร้อย');}
  catch(err){notify(err.message);}
 };
}
function renderUsers(){
 const active=state.users.filter(u=>Number(u.active)===1);
 const removed=state.users.filter(u=>Number(u.active)!==1);
 const canRemove=u=>state.user.role==='super_admin'&&u.id!==state.user.id;
 const rows=active.map(u=>`<tr><td><strong>${esc(u.display_name)}</strong><div class="sub">${esc(u.username)}</div></td><td>${esc(u.role)}</td><td>ใช้งาน</td><td>${u.role==='teacher'?`${state.teacher_rooms.filter(x=>x.user_id===u.id).length} ห้อง / ${state.teacher_clubs.filter(x=>x.user_id===u.id).length} ชุมนุม`:'—'}</td><td>${u.role==='teacher'?`${u.can_import_excel?'✅ นำเข้า Excel':'⛔ ไม่อนุญาต'}${u.can_sync_excel?' • ✅ ซิงก์':''} • ${u.can_import_club_excel?'✅ ชุมนุม':'⛔ ชุมนุม'}${u.can_sync_club_excel?' • ✅ ซิงก์ชุมนุม':''}`:'—'}</td><td><div class="account-actions">${u.role==='teacher'?`<button class="btn small" data-assign="${esc(u.id)}">กำหนดหน้าที่และสิทธิ์</button>`:''}${canRemove(u)?`<button class="btn small danger-outline" data-remove-user="${esc(u.id)}">ลบบัญชี</button>`:u.id===state.user.id?'บัญชีของคุณ':''}</div></td></tr>`).join('');
 const deletedRows=removed.map(u=>`<tr><td><strong>${esc(u.display_name)}</strong><div class="sub">${esc(u.username)}</div></td><td>${esc(u.role)}</td><td><span class="account-disabled">ลบออกจากการใช้งานแล้ว</span></td><td>${state.user.role==='super_admin'?`<button class="btn small" data-restore-user="${esc(u.id)}">กู้คืนบัญชี</button>`:'—'}</td></tr>`).join('');
 shell(`${title('บัญชีและสิทธิ์','สร้างบัญชีครู มอบหมายงาน และจัดการบัญชีผู้ใช้',`<button class="btn primary" id="add-user">+ สร้างบัญชี</button>`)}
 <div class="warning-box" style="margin-bottom:15px">การลบบัญชีทำได้เฉพาะ Super Admin • บัญชีที่นำออกจะเข้าสู่ระบบไม่ได้ทันที • ประวัติการทำงานเดิมยังคงอยู่</div>
 ${table(['ชื่อผู้ใช้','บทบาท','สถานะ','หน้าที่','สิทธิ์ Excel','จัดการ'],rows)}
 ${removed.length?`<details class="card removed-accounts"><summary>บัญชีที่นำออกแล้ว (${removed.length})</summary><p class="sub">กู้คืนได้โดย Super Admin แต่ต้องมอบหมายห้องเรียน ชุมนุม และสิทธิ์นำเข้าใหม่</p>${table(['ชื่อผู้ใช้','บทบาท','สถานะ','จัดการ'],deletedRows)}</details>`:''}`);
 root.querySelector('#add-user').onclick=()=>userDialog();
 root.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>assignDialog(state.users.find(u=>u.id===b.dataset.assign)));
 root.querySelectorAll('[data-remove-user]').forEach(b=>b.onclick=()=>removeUserDialog(state.users.find(u=>u.id===b.dataset.removeUser)));
 root.querySelectorAll('[data-restore-user]').forEach(b=>b.onclick=()=>restoreUserDialog(state.users.find(u=>u.id===b.dataset.restoreUser)));
}
function removeUserDialog(user){
 if(!user||state.user.role!=='super_admin'||user.id===state.user.id)return;
 const fields=`<div class="warning-box">กำลังลบบัญชี <strong>${esc(user.display_name)}</strong> (${esc(user.username)})<br>ผู้ใช้นี้จะเข้าสู่ระบบไม่ได้ทันที และสิทธิ์/การมอบหมายทั้งหมดจะถูกเพิกถอน แต่ประวัติยังคงอยู่</div>
 ${htmlField('reason','เหตุผลในการลบบัญชี (อย่างน้อย 5 ตัวอักษร)','',{max:300})}
 ${htmlField('confirm_username',`พิมพ์ชื่อผู้ใช้ ${user.username} เพื่อยืนยัน`,'',{max:50})}`;
 showModal('ยืนยันลบบัญชีผู้ใช้',fields,async p=>post('users/'+encodeURIComponent(user.id)+'/remove',p),{danger:true,submitText:'ยืนยันลบบัญชี',successText:'ลบบัญชีออกจากการใช้งานแล้ว'});
}
function restoreUserDialog(user){
 if(!user||state.user.role!=='super_admin')return;
 const fields=`<div class="warning-box">กู้คืนบัญชี <strong>${esc(user.display_name)}</strong> (${esc(user.username)})<br>หลังจากกู้คืน ต้องกำหนดห้อง ชุมนุม และสิทธิ์นำเข้าใหม่ รหัสผ่านเดิมยังคงใช้ได้</div>
 ${htmlField('reason','เหตุผลในการกู้คืนบัญชี (อย่างน้อย 5 ตัวอักษร)','',{max:300})}
 ${htmlField('confirm_username',`พิมพ์ชื่อผู้ใช้ ${user.username} เพื่อยืนยัน`,'',{max:50})}`;
 showModal('ยืนยันกู้คืนบัญชี',fields,async p=>post('users/'+encodeURIComponent(user.id)+'/restore',p),{submitText:'ยืนยันกู้คืน',successText:'กู้คืนบัญชีแล้ว กรุณากำหนดสิทธิ์ใหม่'});
}

function userDialog(){const roleItems=[{id:'teacher',label:'ครู'},...(state.user.role==='super_admin'?[{id:'admin',label:'Admin'},{id:'super_admin',label:'Super Admin'}]:[])];
 const fields=`<div class="grid2">${htmlField('username','ชื่อผู้ใช้ (อังกฤษ 4 ตัวขึ้นไป)')}${htmlField('display_name','ชื่อ–นามสกุล')}</div>
 ${htmlField('password','รหัสผ่านอย่างน้อย 12 ตัว','',{type:'password',max:128})}${htmlField('role','บทบาท','teacher',{type:'select',items:roleItems})}
 <div class="warning-box mini">ผู้ใช้ใหม่ต้องเปลี่ยนรหัสผ่านในการดูแลบัญชีตามนโยบายโรงเรียน (ฟังก์ชันเปลี่ยนรหัสผ่านด้วยตนเองยังอยู่ในแผนถัดไป)</div>`;
 showModal('สร้างบัญชีผู้ใช้',fields,async p=>post('users',p));
}
function assignDialog(user){const ur=state.teacher_rooms.filter(x=>x.user_id===user.id).map(x=>x.room_id), uc=state.teacher_clubs.filter(x=>x.user_id===user.id).map(x=>x.club_id);
 const fields=`<p class="sub">${esc(user.display_name)}</p><strong>ห้องเรียนที่รับผิดชอบ</strong><div class="check-col">${state.rooms.map(r=>`<label><input name="room_ids" value="${esc(r.id)}" type="checkbox" ${ur.includes(r.id)?'checked':''}> ม.${r.grade}/${r.room_no}</label>`).join('')}</div>
 ${htmlField('club_id','ชุมนุมที่รับผิดชอบ (1 ชุมนุม)',uc[0]||'',{type:'select',items:[{id:'',label:'ยังไม่มอบหมาย'},...state.clubs.filter(c=>c.active).map(c=>({id:c.id,label:c.name}))],required:false})}
 <div class="card import-permission-card stack"><strong>🔐 สิทธิ์นำเข้า Excel สำหรับครูคนนี้</strong>
  <label class="checkbox-inline"><input name="can_import_excel" type="checkbox" ${user.can_import_excel?'checked':''}/> อนุญาตให้นำเข้า Excel (เฉพาะห้องที่มอบหมาย)</label>
  <label class="checkbox-inline"><input name="can_sync_excel" type="checkbox" ${user.can_sync_excel?'checked':''}/> อนุญาตซิงก์ทั้งห้อง (Soft Delete ผู้ที่ไม่อยู่ในไฟล์)</label>
  <label class="checkbox-inline"><input name="can_import_club_excel" type="checkbox" ${user.can_import_club_excel?'checked':''}/> อนุญาตนำเข้าสมาชิกชุมนุมที่รับผิดชอบ</label>
  <label class="checkbox-inline"><input name="can_sync_club_excel" type="checkbox" ${user.can_sync_club_excel?'checked':''}/> อนุญาตซิงก์สมาชิกชุมนุม (ถอนสมาชิกที่ไม่อยู่ในไฟล์)</label>
  <p class="reason-help">ซิงก์ทั้งห้องหรือชุมนุมอาจทำให้รายชื่อหายจากการแสดงผล โปรดเปิดสิทธิ์อย่างระมัดระวัง</p>
 </div>`;
 showModal('กำหนดหน้าที่และสิทธิ์ครู',fields,async(p,form)=>post('assignments',{
   user_id:user.id,room_ids:[...form.querySelectorAll('input[name=room_ids]:checked')].map(el=>el.value),
   club_ids:p.club_id?[p.club_id]:[],
   can_import_excel:!!form.querySelector('[name=can_import_excel]:checked'),
   can_sync_excel:!!form.querySelector('[name=can_sync_excel]:checked'),
   can_import_club_excel:!!form.querySelector('[name=can_import_club_excel]:checked'),
   can_sync_club_excel:!!form.querySelector('[name=can_sync_club_excel]:checked')
 }));
}
function renderAudit(){const rows=state.audit.map(x=>`<tr><td>${esc(new Date(x.at).toLocaleString('th-TH'))}</td><td>${esc(x.actor)}</td><td>${esc(x.action)}</td><td>${esc(x.entity_type)}</td><td title="${esc(x.entity_id)}">${esc(x.entity_id.slice(0,14))}</td></tr>`).join('');
 shell(`${title('ประวัติการแก้ไข','100 รายการล่าสุดจากฐานข้อมูล — ดูได้เฉพาะผู้ดูแล')}${table(['วันเวลา','ผู้ดำเนินการ','การดำเนินการ','ประเภท','รหัสรายการ'],rows)}`);
}
// SchoolHub v1.4 permission-gated XLSX/CSV import UI. File contents never enter GitHub.
function renderImport(){
 if(!canUseImport()){state.tab='dashboard';return renderDashboard();}
 if(state.rooms.length===0){shell(`${title('นำเข้า Excel','ยังไม่มีห้องเรียนที่สามารถนำเข้าได้')}<div class="card stack"><h3>ยังไม่ได้รับมอบหมายห้องเรียน</h3><p class="sub">ผู้ดูแลระบบต้องมอบหมายห้องเรียนให้บัญชีของคุณก่อน จึงจะนำเข้า Excel ได้</p></div>`);return;}
 const previous=(state.importHistory||[]).map(run=>`<tr><td>${esc(new Date(run.created_at).toLocaleString('th-TH'))}</td><td>${esc(roomName(run.room_id))}</td><td>${run.mode==='sync'?'ซิงก์ทั้งห้อง':'เพิ่ม/อัปเดต'}</td><td>${run.added}/${run.updated}/${run.archived}</td><td>${esc(run.actor)}</td></tr>`).join('');
 shell(`${title('นำเข้า Excel','เลือกห้องเรียนและตรวจสอบทุกการเปลี่ยนแปลงก่อนบันทึกลง D1')}
 <section class="card stack import-panel">
 <div class="row between"><h3>① เตรียมแบบฟอร์มรายชื่อนักเรียน</h3><a class="btn" href="/templates/SchoolHub_Import_v1.3.xlsx" download>📥 ดาวน์โหลดแบบฟอร์ม .xlsx</a></div>
 <p class="sub">รองรับไฟล์ .xlsx หรือ .csv ตามแบบฟอร์ม โรงเรียนเทพศาลาประชาสรรค์ • จำกัดไม่เกิน 120 คนต่อครั้ง • นำเข้าได้ครั้งละหนึ่งห้อง</p>
 <div class="warning-box mini">ไฟล์ต้นฉบับของโรงเรียนแต่ละชั้นมีรูปแบบแตกต่างกัน เวอร์ชันนี้ต้องจัดข้อมูลให้ตรงแบบฟอร์มก่อน ระบบจะไม่เดาชุมนุมที่สะกดต่างกัน และจะไม่อัปโหลดไฟล์ Excel ดิบไปยังเซิร์ฟเวอร์</div>
 <div class="grid2">
  <label class="field"><span>ห้องเรียนปลายทาง</span><select id="import-room" required>${state.rooms.map(r=>`<option value="${esc(r.id)}">ม.${r.grade}/${r.room_no} • ปี ${r.year}</option>`).join('')}</select></label>
  <label class="field"><span>วิธีกรอกข้อมูล</span><select id="import-source"><option value="file">เลือกไฟล์ Excel/CSV</option><option value="manual">พิมพ์ข้อมูลนักเรียนโดยตรง</option></select></label>
  <label class="field" id="import-file-wrap"><span>ไฟล์ Excel/CSV</span><input type="file" id="import-file" accept=".xlsx,.csv"/></label>
  <label class="field"><span>วิธีนำเข้า</span><select id="import-mode"><option value="merge">เพิ่ม/อัปเดตเท่านั้น (ไม่ลบคนที่ไม่อยู่ในไฟล์)</option>${canUseSync()?'<option value="sync">ซิงก์ทั้งห้อง (นำคนที่ไม่มีในไฟล์ออกแบบ Soft Delete)</option>':''}</select></label>
  <label class="field"><span>เหตุผล (จำเป็นเมื่อซิงก์หรืออนุญาตเกินโควตา)</span><input id="import-reason" maxlength="200" placeholder="กรุณากรอกอย่างน้อย 5 ตัวอักษร"/></label>
 </div>
 ${allAdmin()?'<label class="checkbox-inline"><input id="import-override" type="checkbox"/> Super Admin/Admin: อนุญาตเพิ่มเกินโควตาเมื่อมีเหตุผล</label>':'<div class="hint">ครูไม่สามารถเพิ่มสมาชิกเกินโควตาได้ หากชุมนุมเต็ม ให้ประสานผู้ดูแลระบบ</div>'}
 <p class="reason-help">กรณีซิงก์ทั้งห้อง${allAdmin()?'หรืออนุญาตเกินโควตา':''} ต้องกรอกเหตุผลอย่างน้อย 5 ตัวอักษร</p>
 <div id="import-manual-wrap" class="manual-area" hidden><h4>พิมพ์ทะเบียนนักเรียน (สูงสุด 120 คน)</h4><div id="import-manual-rows" class="manual-rows"></div><button type="button" class="btn" id="import-manual-add">+ เพิ่มแถว</button></div>
 <div class="actions"><button id="import-preview" class="btn primary">🔎 ตรวจสอบข้อมูลก่อนนำเข้า</button><button id="import-reset" class="btn">ล้างพรีวิว</button></div>
 <div id="import-feedback" class="mini" role="status" aria-live="polite"></div>
 </section>
 <section class="section" id="import-result" hidden></section>
 <section class="card section stack"><h3>ประวัติการนำเข้าสำเร็จ (30 รายการล่าสุด)</h3>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>วันที่</th><th>ห้อง</th><th>โหมด</th><th>เพิ่ม / แก้ / นำออก</th><th>ผู้ดำเนินการ</th></tr></thead><tbody>${previous||'<tr><td colspan="5" class="empty">ยังไม่มีการนำเข้า</td></tr>'}</tbody></table></div></section>`);
 const $=id=>root.querySelector('#'+id),clear=()=>{$('import-result').hidden=true;$('import-result').innerHTML='';state.importDraft=null;};
 const switchSource=()=>{const manual=$('import-source').value==='manual';$('import-file-wrap').hidden=manual;$('import-manual-wrap').hidden=!manual;clear();};
 $('import-source').onchange=switchSource;
 $('import-manual-add').onclick=()=>{addManualEntry($('import-manual-rows'),'student');clear();};
 $('import-manual-rows').addEventListener('input',clear);
 $('import-manual-rows').addEventListener('click',e=>{if(e.target.closest('button'))clear();});
 addManualEntry($('import-manual-rows'),'student');switchSource();
 ['import-file','import-room','import-mode','import-reason','import-override'].forEach(id=>$(id)?.addEventListener('change',clear));
 $('import-reset').onclick=()=>{clear();$('import-file').value='';$('import-feedback').textContent='ล้างข้อมูลพรีวิวแล้ว';};
 $('import-preview').onclick=async()=>{
  const button=$('import-preview'),file=$('import-file').files[0];clear();
  if($('import-source').value==='file'&&!file){$('import-feedback').textContent='กรุณาเลือกไฟล์ก่อน';return;}
  button.disabled=true;$('import-feedback').textContent='กำลังอ่านไฟล์และตรวจสอบกับฐานข้อมูล…';
  try{
   const rows=$('import-source').value==='manual'?getManualEntries($('import-manual-rows'),'student'):await readSchoolImport(file);
   const payload={rows,room_id:$('import-room').value,mode:$('import-mode').value,
     reason:$('import-reason').value.trim(),override_capacity:!!$('import-override')?.checked};
   const result=await post('import/preview',payload);
   state.importDraft={payload,preview_hash:result.preview_hash};
   renderImportPreview(result);
   $('import-feedback').textContent=`ตรวจสอบข้อมูล ${rows.length} แถว • พบข้อผิดพลาด ${result.summary.errors} รายการ`;
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


// v1.5 — club membership Excel: only existing students, teacher can target assigned clubs.
async function downloadClubCsv(clubId){
 const r=await fetch('/api/export/club-members?club_id='+encodeURIComponent(clubId),{credentials:'same-origin'});
 if(!r.ok)throw new Error((await r.json()).error||'ส่งออกชุมนุมไม่สำเร็จ');
 const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='SchoolHub_Club_Members.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function addManualEntry(holder,type){
 if(holder.children.length>=120){notify('พิมพ์ข้อมูลได้ครั้งละไม่เกิน 120 คน');return;}
 const fields=type==='student'?[['student_no','เลขประจำตัว'],['prefix','คำนำหน้า'],['first_name','ชื่อ'],['last_name','นามสกุล'],['club_name','ชื่อชุมนุม (ว่างได้)']]:[['student_no','เลขประจำตัว'],['student_name','ชื่อ-นามสกุล (ตรวจสอบ)']];
 const row=document.createElement('div');row.className='manual-row';
 row.innerHTML=fields.map(([key,label])=>`<label class="field"><span>${esc(label)}</span><input type="text" data-key="${key}" maxlength="140" ${key==='student_no'?'inputmode="numeric"':''} /></label>`).join('')+'<button type="button" class="btn small danger" aria-label="ลบแถว">ลบ</button>';
 row.querySelector('button').onclick=()=>row.remove();holder.append(row);
}
function getManualEntries(holder,type){
 const rows=[...holder.querySelectorAll('.manual-row')].map((row,i)=>{
  const item={source_line:i+1};row.querySelectorAll('input').forEach(input=>item[input.dataset.key]=input.value.trim());return item;
 }).filter(item=>Object.entries(item).some(([key,val])=>key!=='source_line'&&val));
 if(!rows.length)throw new Error('กรุณาพิมพ์ข้อมูลอย่างน้อย 1 คน');
 if(rows.length>120)throw new Error('นำเข้าได้ไม่เกิน 120 คนต่อครั้ง');
 return rows;
}
function renderClubImport(){
 const clubs=state.allowedClubs||[];
 if(!clubs.length){shell(`${title('นำเข้าสมาชิกชุมนุม','ยังไม่ได้รับมอบหมายชุมนุมที่นำเข้าได้')}<div class="card"><p>ผู้ดูแลต้องมอบหมายครูเป็นที่ปรึกษาชุมนุมและเปิดสิทธิ์นำเข้า Excel ก่อน</p></div>`);return;}
 const history=(state.clubImportHistory||[]).map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString('th-TH'))}</td><td>${esc(x.club_name)}</td><td>${x.mode==='sync'?'ซิงก์':'เพิ่ม/ย้าย'}</td><td>${x.added}/${x.moved}/${x.removed}</td><td>${esc(x.actor)}</td></tr>`).join('');
 shell(`${title('นำเข้าสมาชิกชุมนุม','เพิ่ม/ย้ายสมาชิกโดยใช้เลขประจำตัวเดิมจากทะเบียน ไม่สร้างนักเรียนใหม่')}
 <section class="card stack import-panel">
 <div class="row between"><h3>① เลือกชุมนุมและไฟล์สมาชิก</h3><a class="btn" href="/templates/SchoolHub_Club_Members_v1.5.xlsx" download>⬇ ดาวน์โหลดแบบฟอร์มชุมนุม (.xlsx)</a></div>
 <div class="warning-box mini">ใช้ไฟล์มาตรฐาน 2 คอลัมน์: เลขประจำตัวนักเรียน และ ชื่อ-นามสกุล (ตรวจสอบ) • อ่านไฟล์บนเครื่อง • ครั้งละไม่เกิน 120 คน • เมื่อย้ายชุมนุมจะบันทึกประวัติ</div>
 <div class="grid2"><label class="field"><span>ชุมนุมปลายทาง</span><select id="club-import-club">${clubs.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} (${c.members} คน${c.capacity?'/'+c.capacity:''})</option>`).join('')}</select></label>
 <label class="field"><span>วิธีกรอกข้อมูล</span><select id="club-import-source"><option value="file">เลือกไฟล์ Excel/CSV</option><option value="manual">พิมพ์เลขประจำตัวและชื่อโดยตรง</option></select></label>
 <label class="field" id="club-import-file-wrap"><span>ไฟล์ .xlsx หรือ .csv</span><input type="file" id="club-import-file" accept=".xlsx,.csv"/></label>
 <label class="field"><span>โหมด</span><select id="club-import-mode"><option value="merge">เพิ่มสมาชิก/ย้ายตามไฟล์ (ไม่ถอนคนอื่น)</option>${canClubSync()?'<option value="sync">ซิงก์สมาชิกทั้งหมด (ถอนผู้ที่ไม่มีในไฟล์)</option>':''}</select></label>
 <label class="field"><span>เหตุผลประกอบ (จำเป็นเมื่อซิงก์หรืออนุญาตเกินโควตา)</span><input id="club-import-reason" maxlength="200" placeholder="เช่น ปรับทะเบียนชุมนุม ปีการศึกษา 2569"/></label></div>
 ${allAdmin()?'<label class="checkbox-inline"><input type="checkbox" id="club-import-override"> Admin: อนุญาตสมาชิกเกินโควตา</label><p class="reason-help">หากอนุญาตเกินโควตาต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร</p>':''}
 <div id="club-import-manual-wrap" class="manual-area" hidden><h4>พิมพ์สมาชิกชุมนุม (สูงสุด 120 คน)</h4><div id="club-import-manual-rows" class="manual-rows"></div><button type="button" class="btn" id="club-import-manual-add">+ เพิ่มแถว</button></div>
 <div class="actions"><button class="btn primary" id="club-import-preview">🔎 ตรวจสอบข้อมูลก่อนนำเข้า</button><button class="btn" id="club-import-export">⬇ ส่งออกรายชื่อชุมนุม (.csv)</button></div>
 <p class="sub" id="club-import-feedback" role="status"></p><div id="club-import-result" hidden></div></section>
 <section class="section card stack"><h3>ประวัติการนำเข้าชุมนุม (30 รายการล่าสุด)</h3>${table(['เวลา','ชุมนุม','โหมด','เพิ่ม/ย้าย/ถอน','ผู้ดำเนินการ'],history)}</section>`);
 const $=id=>root.querySelector('#'+id);
 $('club-import-source').onchange=()=>{const manual=$('club-import-source').value==='manual';$('club-import-file-wrap').hidden=manual;$('club-import-manual-wrap').hidden=!manual;state.clubImportDraft=null;$('club-import-result').hidden=true;};
 $('club-import-manual-add').onclick=()=>{addManualEntry($('club-import-manual-rows'),'club');state.clubImportDraft=null;$('club-import-result').hidden=true;};
 const clearClubPreview=()=>{state.clubImportDraft=null;$('club-import-result').hidden=true;};
 $('club-import-manual-rows').addEventListener('input',clearClubPreview);
 $('club-import-manual-rows').addEventListener('click',e=>{if(e.target.closest('button'))clearClubPreview();});
 addManualEntry($('club-import-manual-rows'),'club');
 $('club-import-export').onclick=async()=>{try{await downloadClubCsv($('club-import-club').value);}catch(e){notify(e.message);}};
 $('club-import-preview').onclick=async()=>{
  const b=$('club-import-preview');b.disabled=true;
  try{
   const file=$('club-import-file').files?.[0],rows=$('club-import-source').value==='manual'?getManualEntries($('club-import-manual-rows'),'club'):await readSchoolClubImport(file);
   const payload={club_id:$('club-import-club').value,mode:$('club-import-mode').value,
      reason:$('club-import-reason').value.trim(),override_capacity:!!$('club-import-override')?.checked,rows};
   const plan=await post('club-import/preview',payload);
   state.clubImportDraft={payload,preview_hash:plan.preview_hash};
   renderClubImportPreview(plan);
   $('club-import-feedback').textContent=`พรีวิว ${rows.length} แถว • ผิดพลาด ${plan.summary.errors} รายการ`;
  }catch(e){state.clubImportDraft=null;$('club-import-result').hidden=true;$('club-import-feedback').textContent=e.message;notify(e.message);}finally{b.disabled=false;}
 };
}
function renderClubImportPreview(plan){
 const el=root.querySelector('#club-import-result');el.hidden=false;
 const actionLabel={add:'เพิ่มสมาชิก',move:'ย้ายชุมนุม',remove:'ถอนสมาชิก',unchanged:'ไม่เปลี่ยน',error:'ผิดพลาด'};
 const issues=plan.errors||[],rows=plan.items||[];
 el.innerHTML=`<div class="card stack"><div class="row between"><h3>② ตรวจสอบข้อมูล • ${esc(plan.club.name)}</h3><span class="tag ${issues.length?'warning':''}">${issues.length?'พบข้อผิดพลาด':'พร้อมยืนยัน'}</span></div>
 <div class="import-stats"><span class="tag">เพิ่ม ${plan.summary.add}</span><span class="tag">ย้าย ${plan.summary.move}</span><span class="tag warning">ถอน ${plan.summary.remove}</span><span class="tag neutral">ไม่เปลี่ยน ${plan.summary.unchanged}</span><span class="tag warning">ผิดพลาด ${plan.summary.errors}</span></div>
 ${issues.length?`<div class="import-errors"><h4>⚠️ รายการที่ต้องแก้ ${issues.length}</h4><ol class="import-issue-list">${issues.map(x=>`<li class="import-issue">แถว ${x.line||'ทั้งไฟล์'} • ${esc(x.student_no||'—')} • ${esc(x.student_name||'—')}<div class="import-issue-detail">${esc(x.detail)}</div></li>`).join('')}</ol></div>`:''}
 <div class="table-wrap"><table class="data-table"><thead><tr><th>แถว</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>การเปลี่ยนแปลง</th><th>รายละเอียด</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.line||'—'}</td><td>${esc(x.student_no)}</td><td>${esc(x.student_name)}</td><td><span class="tag ${['remove','error'].includes(x.action)?'warning':''}">${actionLabel[x.action]}</span></td><td>${esc(x.detail)}</td></tr>`).join('')}</tbody></table></div>
 ${plan.mode==='sync'?`<div class="sync-confirm"><h3>⚠️ ยืนยันการซิงก์ชุมนุม</h3><p>ระบบจะถอนนักเรียน ${plan.summary.remove} คนที่ไม่ได้อยู่ในไฟล์ออกจากชุมนุม (นักเรียนยังอยู่ในทะเบียน)</p>
 <label class="checkbox-inline"><input type="checkbox" id="club-import-ack"> ตรวจสอบรายชื่อทั้งหมดแล้ว</label>
 <label class="field"><span>พิมพ์ชื่อชุมนุม <b>${esc(plan.club.name)}</b> เพื่อยืนยัน</span><input id="club-import-confirm" autocomplete="off"></label></div>`:''}
 <button class="btn primary" id="club-import-save" ${issues.length?'disabled':''}>✅ ยืนยันการนำเข้าสมาชิกชุมนุม</button><p class="sub" id="club-import-result-text" role="status"></p></div>`;
 el.querySelector('#club-import-save').onclick=async()=>{
  const button=el.querySelector('#club-import-save'),draft=state.clubImportDraft;if(!draft)return;
  if(plan.mode==='sync' && (!el.querySelector('#club-import-ack').checked || el.querySelector('#club-import-confirm').value.trim()!==plan.club.name)){
    el.querySelector('#club-import-result-text').textContent='กรุณาติ๊กยืนยันและพิมพ์ชื่อชุมนุมให้ตรง';return;
  }
  button.disabled=true;
  try{
    const result=await post('club-import/commit',{...draft.payload,preview_hash:draft.preview_hash,
      confirm_club:plan.mode==='sync'?plan.club.name:undefined,
      acknowledge_removals:plan.mode==='sync'?true:false});
    state.clubImportDraft=null;notify(`สำเร็จ: เพิ่ม ${result.summary.add}, ย้าย ${result.summary.move}, ถอน ${result.summary.remove}`);
    await loadTab(true);
  }catch(e){button.disabled=false;el.querySelector('#club-import-result-text').textContent=e.message;notify(e.message);}
 };
}
const thailandDate=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
async function showCommunity(){
 const cm=state.community;
 if(!state.rooms.length){shell(`${title('กิจกรรมบำเพ็ญประโยชน์','เช็กชื่อรายวันแยกจากกิจกรรมชุมนุม')}<div class="card warning-box">ยังไม่มีห้องเรียนที่ได้รับมอบหมาย</div>`);return;}
 if(!state.rooms.some(x=>x.id===cm.room_id))cm.room_id=state.rooms[0].id;
 if(!cm.date)cm.date=thailandDate();
 const params=new URLSearchParams({room_id:cm.room_id,date:cm.date}),[data,history]=await Promise.all([
    api('community/attendance?'+params),api('community/dates?room_id='+encodeURIComponent(cm.room_id))]);
 cm.items=data.items;cm.dates=history.items;if(data.term)cm.term=data.term;
 const entries=Object.entries(data.counts).map(([key,n])=>`<span class="tag ${key==='ขาด'||key==='ลา'?'warning':''}">${esc(key)} ${n}</span>`).join(' ');
 const rows=data.items.map(s=>`<tr data-person="${esc(s.id)}"><td>${esc(s.student_no)}</td><td>${esc(`${s.prefix} ${s.first_name} ${s.last_name}`.trim())}</td>
 <td><select class="att-status" data-id="${esc(s.id)}" data-version="${s.attendance_version}" aria-label="เช็กชื่อ ${esc(s.first_name)}"><option value="" ${s.status===null?'selected':''}>ยังไม่ระบุ</option>${['มา','สาย','ลา','ขาด'].map(status=>`<option value="${status}" ${s.status===status?'selected':''}>${status}</option>`).join('')}</select></td>
 <td class="mini">${esc(s.marked_by||'—')}${s.marked_at?' • '+esc(new Date(s.marked_at).toLocaleString('th-TH')):''}</td></tr>`).join('');
 shell(`${title('กิจกรรมบำเพ็ญประโยชน์','ครูประจำชั้นทั้งสองคนเช็กชื่อได้ • แยกแต่ละวัน • มา/สาย = เข้าเรียน • ลา/ขาด = ไม่เข้าเรียน')}
 <section class="card stack"><div class="grid3"><label class="field"><span>ห้องเรียน</span><select id="community-room">${state.rooms.map(r=>`<option value="${esc(r.id)}" ${r.id===cm.room_id?'selected':''}>ม.${r.grade}/${r.room_no}</option>`).join('')}</select></label>
 <label class="field"><span>วันที่กิจกรรม</span><input type="date" id="community-date" value="${esc(cm.date)}"/></label>
 <label class="field"><span>ภาคเรียน (กำหนดเมื่อเช็กชื่อครั้งแรกของวันนี้)</span><select id="community-term" ${data.term?'disabled':''}><option value="1" ${cm.term===1?'selected':''}>ภาคเรียน 1</option><option value="2" ${cm.term===2?'selected':''}>ภาคเรียน 2</option></select></label></div>
 <div class="actions"><button class="btn primary" id="community-load">เปิดรายชื่อวันที่เลือก</button><button class="btn" id="community-csv">⬇ ส่งออก CSV วันที่เลือก</button></div>
 <div class="row"><strong>สรุปสถานะ:</strong>${entries}</div><p class="sub">ยังไม่ระบุ = ยังไม่เช็กชื่อ (ไม่นับเป็นขาด) • เปลี่ยนสถานะแล้วบันทึกทันทีลง D1 • หากมีการแก้ไขพร้อมกันจะให้โหลดใหม่</p>
 <div class="table-wrap"><table class="data-table attendance-table"><thead><tr><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>สถานะ</th><th>เช็กล่าสุดโดย</th></tr></thead><tbody>${rows}</tbody></table></div></section>
 <section class="card stack section"><h3>วันที่เคยเช็กชื่อ (100 วันล่าสุด)</h3><div class="attendance-day-chips">${history.items.length?history.items.map(x=>`<button class="btn small" data-cm-date="${esc(x.date)}">${esc(x.date)} • ภาค ${x.term} • ${x.marked} คน</button>`).join(''):'ยังไม่มีวันที่บันทึก'}</div></section>`);
 const $=name=>root.querySelector('#'+name);
 $('community-load').onclick=async()=>{
  cm.room_id=$('community-room').value;cm.date=$('community-date').value;cm.term=Number($('community-term').value);
  await loadTab(true);
 };
 $('community-date').onchange=()=>{};
 root.querySelectorAll('[data-cm-date]').forEach(b=>b.onclick=async()=>{cm.date=b.dataset.cmDate;await loadTab(true);});
 root.querySelectorAll('.att-status').forEach(select=>select.onchange=async()=>{
  const status=select.value||null,v=Number(select.dataset.version);select.disabled=true;
  try{await post('community/mark',{room_id:cm.room_id,date:cm.date,term:cm.term,student_id:select.dataset.id,status,version:v});await loadTab(true);}
  catch(e){notify(e.message);await loadTab(true);}
 });
 $('community-csv').onclick=()=>{
  const protect=v=>{const st=String(v??'');return /^[\s]*[=+\-@\t\r]/.test(st)?`'${st}`:st;};
  const cell=v=>`"${protect(v).replaceAll('"','""')}"`;
  const csv=[['วันที่','ห้อง','เลขประจำตัว','คำนำหน้า','ชื่อ','นามสกุล','สถานะ','ผู้บันทึก'].map(cell).join(',')];
  for(const s of data.items)csv.push([cm.date,roomName(cm.room_id),s.student_no,s.prefix,s.first_name,s.last_name,s.status||'ยังไม่ระบุ',s.marked_by||''].map(cell).join(','));
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv.join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`SchoolHub_Community_${cm.room_id}_${cm.date}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
}

function renderForms(){
 const options=state.formOptions||{rooms:[],clubs:[]};
 shell(`${title('แบบฟอร์มกิจกรรม','ใช้รูปแบบจากตารางเช็คเวลาเรียน 2.69.xlsx • สร้างไฟล์ Excel ในเบราว์เซอร์')}
 <section class="card stack"><div class="warning-box mini">ฟอร์มเปล่าจะไม่ใส่รายชื่อหรือผลเช็กชื่อ • ฟอร์มเติมข้อมูลใช้ทะเบียนตามสิทธิ์บัญชี • ผลเช็กชื่ออัตโนมัติใช้เฉพาะบำเพ็ญประโยชน์ที่บันทึกไว้ใน D1 (ระบบเช็กชื่อชุมนุมยังไม่ได้เปิดใช้งาน)</div>
 <div class="grid2">
 <label class="field"><span>ประเภทกิจกรรม</span><select id="form-kind"><option value="club">ชุมนุม</option><option value="community">บำเพ็ญประโยชน์</option><option value="other">กิจกรรมอื่น ๆ (ใช้รายชื่อห้องเรียน)</option></select></label>
 <label class="field"><span>ห้องเรียน / ชุมนุม</span><select id="form-target"></select></label>
 <label class="field"><span>ปีการศึกษา</span><input id="form-year" type="number" min="2500" max="2700" value="2569"></label>
 <label class="field"><span>ภาคเรียน</span><select id="form-term"><option value="1">1</option><option value="2" selected>2</option></select></label>
 <label class="field"><span>รูปแบบการดาวน์โหลด</span><select id="form-mode"><option value="filled">เติมรายชื่อและผลเช็กชื่อที่มี</option><option value="blank">ฟอร์มเปล่า (ไม่ใส่รายชื่อ/ผลเช็กชื่อ)</option></select></label>
 <label class="field"><span>วันที่เริ่มกิจกรรม (ไม่บังคับ; ใช้ทำหัวตาราง 20 สัปดาห์)</span><input id="form-start" type="date"></label>
 <label class="field" id="form-other-wrap" hidden><span>ชื่อกิจกรรมอื่น ๆ</span><input id="form-other-name" maxlength="80" placeholder="เช่น ลูกเสือ"></label>
 </div><p class="sub">หนึ่งหน้ารองรับรายชื่อ 41 คน ถ้ามีมากกว่านั้น ระบบจะจัดเป็นหลายไฟล์ Excel ภายใน ZIP โดยไม่ตัดรายชื่อทิ้ง</p>
 <div class="actions"><button id="form-download" class="btn primary">⬇ ดาวน์โหลดแบบฟอร์ม Excel</button><a class="btn" href="/templates/SchoolHub_Attendance_2_69_Original.xlsx" download>ดูไฟล์ต้นฉบับ</a></div>
 <p id="form-result" class="sub" role="status" aria-live="polite"></p>
 </section>`);
 const $=id=>root.querySelector('#'+id);
 const refresh=()=>{
   const kind=$('form-kind').value,choices=kind==='club'?options.clubs:options.rooms;
   $('form-other-wrap').hidden=kind!=='other';
   $('form-target').innerHTML=choices.map(item=>`<option value="${esc(item.id)}">${esc(kind==='club'?item.name:`ม.${item.grade}/${item.room_no}`)}</option>`).join('');
 };
 $('form-kind').onchange=refresh;refresh();
 $('form-download').onclick=async()=>{
  const button=$('form-download'),status=$('form-result'),kind=$('form-kind').value,target=$('form-target').value,mode=$('form-mode').value;
  if(mode==='filled'&&!target){status.textContent='ไม่มีห้องหรือชุมนุมที่ได้รับอนุญาต';return;}
  button.disabled=true;status.textContent='กำลังสร้างแบบฟอร์มตามต้นฉบับ…';
  try{
   const term=Number($('form-term').value),year=Number($('form-year').value);
   const data=mode==='filled'?await api(`forms/data?kind=${kind}&id=${encodeURIComponent(target)}&term=${term}`):{kind,year,term,label:'',students:[],sessions:[]};
   const activity=kind==='other'?$('form-other-name').value.trim():data.label;
   if(kind==='other'&&!activity)throw new Error('กรุณาระบุชื่อกิจกรรมอื่น ๆ');
   const result=await buildActivityForms({kind,term,year:mode==='filled'?Number(data.year):year,activity:activity||data.label,
     startDate:$('form-start').value,students:data.students,sessions:data.sessions,sessionCount:data.sessionCount||0});
   const url=URL.createObjectURL(result.blob),a=document.createElement('a');a.href=url;a.download=result.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
   status.textContent=`สร้างไฟล์สำเร็จ • ${data.students.length} คน • ${result.pages} หน้า${result.note?' • '+result.note:''}`;
  }catch(e){status.textContent='ดาวน์โหลดไม่สำเร็จ: '+e.message;notify(e.message);}finally{button.disabled=false;}
 };
}
async function loadTab(reload=false){if(!state.user)return;
 loading();try{
   // Read lookup tables on every navigation to reflect latest changes across users.
   const [rooms,clubs]=await Promise.all([api('rooms'),api('clubs')]);state.rooms=rooms.items;state.clubs=clubs.items;
   switch(state.tab){
    case 'dashboard':{const [summary,breakdown]=await Promise.all([api('dashboard'),api('dashboard/rooms')]);state.dashboard=summary;state.roomBreakdown=breakdown.items;renderDashboard();break;}
    case 'archived':{if(!allAdmin()){state.tab='dashboard';return loadTab();}const params=new URLSearchParams({page:String(state.page),q:state.query});state.archived=(await api('students/archived?'+params)).items;renderArchived();break;}
    case 'club-import':{if(!canClubImport()){state.tab='dashboard';return loadTab();}const [allowed,hist]=await Promise.all([api('club-import/allowed'),api('club-import/history')]);state.allowedClubs=allowed.items;state.clubImportHistory=hist.items;renderClubImport();break;}
    case 'community':await showCommunity();break;
    case 'forms':state.formOptions=await api('forms/options');renderForms();break;
    case 'import':{if(!canUseImport()){state.tab='dashboard';return loadTab();}state.importHistory=(await api('import/history')).items;renderImport();break;}
    case 'students':{const params=new URLSearchParams({page:String(state.page),q:state.query,room_id:state.roomFilter,club_id:state.clubFilter});const result=await api('students?'+params);state.students=result.items;state.studentTotal=Number(result.total||0);renderStudents();break;}
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
 }catch(err){root.innerHTML=`<div class="login-bg"><div class="login-panel stack"><div class="brand brand-login">${brandMark()}<span>${schoolName}</span></div><h1>ขณะนี้ไม่สามารถเปิดระบบได้</h1><p class="warning-box">กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดติดต่อผู้ดูแลระบบของโรงเรียน</p><button class="btn" id="retry-start">ลองอีกครั้ง</button></div></div>`;root.querySelector('#retry-start').onclick=start;}}
start();
