// SchoolHub v1.8: photographs stay on the device. Generate one activity-specific DOCX per download.
import {getEntries, packageZip, updateEntry, uncompressed, crc32} from './form-xlsx.js';
const enc = new TextEncoder(), dec = new TextDecoder();
const FRAME_W = 1200, FRAME_H = 900, MAX_SIZE = 10*1024*1024;
const TEMPLATE = {club:'/templates/SchoolHub_Photo_Club_Template.docx',community:'/templates/SchoolHub_Photo_Community_Template.docx'};
const label = {club:'ชุมนุม',community:'บำเพ็ญประโยชน์'};
const html = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safe(s,max=240){return String(s??'').trim().slice(0,max);}
function xml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function thaiDate(value){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));return m?`${m[3]}/${m[2]}/${Number(m[1])+543}`:safe(value,35);}
function cleanFile(s){return safe(s,50).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\s+/g,'_')||'กิจกรรม';}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
export async function createPhotoDocx({kind,imageBlob,activity,date,place,details,advisor1,advisor2}){
 if(!TEMPLATE[kind])throw Error('ประเภทกิจกรรมไม่ถูกต้อง');
 if(!(imageBlob instanceof Blob)||!imageBlob.size||imageBlob.size>MAX_SIZE)throw Error('กรุณาเลือกรูปภาพขนาดไม่เกิน 10 MB');
 const response=await fetch(TEMPLATE[kind],{cache:'force-cache'});if(!response.ok)throw Error('ไม่พบแบบฟอร์มเอกสาร');
 const entries=getEntries(new Uint8Array(await response.arrayBuffer()));
 const values={ACTIVITY:safe(activity,90)||'................................................',DATE:thaiDate(date)||'................................................',
  PLACE:safe(place,90)||'................................................',DETAILS:safe(details,240)||'........................................................................',
  ADVISOR1:safe(advisor1,80)||'....................................',ADVISOR2:safe(advisor2,80)||'....................................'};
 const photo=new Uint8Array(await imageBlob.arrayBuffer());let imageFound=false,documentFound=false;
 const out=[];
 for(const entry of entries){
  if(entry.name==='word/media/image1.jpg'){imageFound=true;out.push({...entry,method:0,packed:photo,plainSize:photo.length,crc:crc32(photo)});continue;}
  if(entry.name==='word/document.xml'){
   documentFound=true;let source=dec.decode(await uncompressed(entry));
   for(const [key,value] of Object.entries(values)){
     const tag='{{'+key+'}}';if(!source.includes(tag))throw Error('แบบฟอร์มขาดช่องข้อมูล '+key);
     // Existing placeholders are a single w:t node; preserve that run's formatting.
     source=source.replaceAll(tag,xml(value).replace(/\r?\n/g,' '));
   }
   out.push(updateEntry(entry,source));continue;
  }
  out.push(entry);
 }
 if(!imageFound||!documentFound)throw Error('แบบฟอร์มมีโครงสร้างไม่ครบ');
 return {blob:packageZip(out),filename:`SchoolHub_ภาพประกอบ${label[kind]}_${cleanFile(activity)}.docx`};
}
export function mountPhotoReport(container,{kind='club',options={}}={}){
 if(!TEMPLATE[kind])kind='club';
 let img=null,x=0,y=0,zoom=1,busy=false;
 const targets=kind==='club'?(options.clubs||[]):(options.rooms||[]);
 container.innerHTML=`<div class="photo-report stack">
  <div class="banner">อ้างอิงแบบฟอร์มภาพประกอบกิจกรรมของโรงเรียน • ดาวน์โหลดเอกสาร Word แยกตามประเภท • รูปจะประมวลผลบนอุปกรณ์นี้ ไม่ส่งภาพขึ้นเซิร์ฟเวอร์</div>
  <div class="photo-layout">
   <section class="card stack"><h3>1. เลือกและครอปภาพประกอบ</h3>
    <label class="field"><span>แนบรูปภาพ (JPG, PNG, HEIC ที่เบราว์เซอร์อ่านได้; ไม่เกิน 10 MB)</span><input id="photo-file" type="file" accept="image/*"></label>
    <div class="photo-editor"><canvas id="photo-crop" width="${FRAME_W}" height="${FRAME_H}" aria-label="พื้นที่ครอปรูปภาพอัตราส่วน 4 ต่อ 3"></canvas><p class="mini">ลากภาพเพื่อจัดตำแหน่งภายในกรอบอัตราส่วน 4:3</p></div>
    <label class="field"><span>ขยายภาพ <strong id="photo-scale-label">100%</strong></span><input type="range" id="photo-zoom" min="100" max="300" step="5" value="100"></label>
    <button class="btn" id="photo-center" type="button">จัดภาพให้อยู่ตรงกลาง</button></section>
   <section class="card stack"><h3>2. ข้อมูลในเอกสาร ${label[kind]}</h3>
    <label class="field"><span>เลือก${kind==='club'?'ชุมนุม':'ห้องเรียน'}เพื่อช่วยกรอกชื่อกิจกรรม</span><select id="photo-target"><option value="">กรอกเอง</option>${targets.map(t=>`<option value="${html(t.id)}">${html(kind==='club'?t.name:`ม.${t.grade}/${t.room_no}`)}</option>`).join('')}</select></label>
    <label class="field"><span>ชื่อกิจกรรม</span><input id="photo-activity" maxlength="90" placeholder="ระบุชื่อกิจกรรม"></label>
    <label class="field"><span>วันที่ทำกิจกรรม</span><input id="photo-date" type="date"></label>
    <label class="field"><span>สถานที่ทำกิจกรรม</span><input id="photo-place" maxlength="90"></label>
    <label class="field"><span>ลักษณะการทำกิจกรรมพอสังเขป</span><textarea id="photo-details" maxlength="240" rows="3" placeholder="เขียนสรุปกิจกรรม (ไม่เกิน 240 ตัวอักษร)"></textarea></label>
    <div class="grid2"><label class="field"><span>ครูที่ปรึกษาคนที่ 1</span><input id="photo-advisor1" maxlength="80"></label><label class="field"><span>ครูที่ปรึกษาคนที่ 2</span><input id="photo-advisor2" maxlength="80"></label></div>
    <p class="sub">ไฟล์ที่ดาวน์โหลดเป็นเอกสาร A4 สำหรับ${label[kind]}เพียงประเภทเดียว สามารถเปิดแก้ไขใน Microsoft Word ได้</p>
    <button type="button" class="btn primary" id="photo-download" disabled>ดาวน์โหลดภาพประกอบ${label[kind]} (.docx)</button><p id="photo-message" role="status" class="sub"></p>
   </section></div></div>`;
 const $=id=>container.querySelector('#'+id),cv=$('photo-crop'),ctx=cv.getContext('2d');
 function draw(){ctx.fillStyle='#f4f7fb';ctx.fillRect(0,0,FRAME_W,FRAME_H);if(!img){ctx.fillStyle='#52677d';ctx.textAlign='center';ctx.font='29px sans-serif';ctx.fillText('เลือกภาพเพื่อดูตัวอย่าง',FRAME_W/2,FRAME_H/2);return;}
  const base=Math.max(FRAME_W/img.naturalWidth,FRAME_H/img.naturalHeight),scale=base*zoom,w=img.naturalWidth*scale,h=img.naturalHeight*scale;
  x=Math.max((FRAME_W-w)/2,Math.min((w-FRAME_W)/2,x));y=Math.max((FRAME_H-h)/2,Math.min((h-FRAME_H)/2,y));
  ctx.drawImage(img,(FRAME_W-w)/2+x,(FRAME_H-h)/2+y,w,h);
 }
 draw();
 $('photo-file').onchange=async()=>{
   const file=$('photo-file').files?.[0];img=null;draw();$('photo-download').disabled=true;
   if(!file)return;
   if(file.size>MAX_SIZE){$('photo-message').textContent='รูปภาพต้องมีขนาดไม่เกิน 10 MB';return;}
   if(!file.type.startsWith('image/')){$('photo-message').textContent='กรุณาเลือกไฟล์รูปภาพ';return;}
   const url=URL.createObjectURL(file),loaded=new Image();
   loaded.onload=()=>{URL.revokeObjectURL(url);img=loaded;x=y=0;zoom=1;$('photo-zoom').value=100;$('photo-scale-label').textContent='100%';$('photo-message').textContent='เลือกรูปแล้ว สามารถลากหรือปรับการขยายได้';$('photo-download').disabled=false;draw();};
   loaded.onerror=()=>{URL.revokeObjectURL(url);$('photo-message').textContent='เบราว์เซอร์นี้ไม่สามารถเปิดรูปภาพได้ กรุณาแปลงเป็น JPG หรือ PNG';};loaded.src=url;
 };
 $('photo-zoom').oninput=()=>{zoom=Number($('photo-zoom').value)/100;$('photo-scale-label').textContent=$('photo-zoom').value+'%';draw();};
 $('photo-center').onclick=()=>{x=y=0;draw();};
 let drag=null;cv.style.touchAction='none';cv.onpointerdown=e=>{if(!img)return;drag={id:e.pointerId,px:e.clientX,py:e.clientY};cv.setPointerCapture(e.pointerId);};
 cv.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;const rect=cv.getBoundingClientRect();x+=(e.clientX-drag.px)*FRAME_W/rect.width;y+=(e.clientY-drag.py)*FRAME_H/rect.height;drag.px=e.clientX;drag.py=e.clientY;draw();};
 cv.onpointerup=cv.onpointercancel=()=>{drag=null;};
 $('photo-target').onchange=()=>{const entry=targets.find(t=>String(t.id)===$('photo-target').value);if(entry)$('photo-activity').value=kind==='club'?entry.name:`บำเพ็ญประโยชน์ ห้อง ม.${entry.grade}/${entry.room_no}`;};
 $('photo-download').onclick=async()=>{if(!img||busy)return;busy=true;$('photo-download').disabled=true;$('photo-message').textContent='กำลังสร้างเอกสาร Word…';
   try{const blob=await new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error('ครอปรูปไม่สำเร็จ')),'image/jpeg',.91));
    const result=await createPhotoDocx({kind,imageBlob:blob,activity:$('photo-activity').value,date:$('photo-date').value,
     place:$('photo-place').value,details:$('photo-details').value,advisor1:$('photo-advisor1').value,advisor2:$('photo-advisor2').value});
    download(result.blob,result.filename);$('photo-message').textContent='สร้างไฟล์สำเร็จ • ภาพถูกครอปตามกรอบ 4:3 แล้ว';
   }catch(e){$('photo-message').textContent='สร้างเอกสารไม่สำเร็จ: '+e.message;}finally{busy=false;$('photo-download').disabled=!img;}
 };
}
