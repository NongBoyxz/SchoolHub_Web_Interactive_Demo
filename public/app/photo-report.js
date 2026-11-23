// SchoolHub v1.8: photographs stay on the device. Generate one activity-specific DOCX per download.
import {getEntries, packageZip, updateEntry, uncompressed, crc32} from './form-xlsx.js?v=1.8.1';
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
// Display the crop with a normal <img> element. An off-screen canvas is used only
// for the final JPEG; this avoids blank canvas previews on some mobile browsers.
export function cropFrameGeometry(imageWidth,imageHeight,zoom=1,x=0,y=0){
 if(!Number.isFinite(imageWidth)||!Number.isFinite(imageHeight)||imageWidth<=0||imageHeight<=0)throw Error('ขนาดภาพไม่ถูกต้อง');
 if(!Number.isFinite(zoom)||zoom<1||zoom>3)throw Error('ระดับขยายภาพไม่ถูกต้อง');
 const base=Math.max(FRAME_W/imageWidth,FRAME_H/imageHeight),width=imageWidth*base*zoom,height=imageHeight*base*zoom;
 const limitX=(width-FRAME_W)/2,limitY=(height-FRAME_H)/2;
 const dx=Math.max(-limitX,Math.min(limitX,x)),dy=Math.max(-limitY,Math.min(limitY,y));
 return {left:(FRAME_W-width)/2+dx,top:(FRAME_H-height)/2+dy,width,height,x:dx,y:dy};
}
export function mountPhotoReport(container,{kind='club',options={}}={}){
 if(!TEMPLATE[kind])kind='club';
 let img=null,fileUrl=null,x=0,y=0,zoom=1,busy=false,geometry=null;
 const targets=kind==='club'?(options.clubs||[]):(options.rooms||[]);
 container.innerHTML=`<div class="photo-report stack">
  <div class="banner">แนบภาพประกอบกิจกรรมของโรงเรียน • ครอปภาพก่อนดาวน์โหลดเอกสาร Word • ประมวลผลบนอุปกรณ์ของคุณโดยไม่ส่งภาพขึ้นเซิร์ฟเวอร์</div>
  <div class="photo-layout">
   <section class="card stack"><h3>1. แนบภาพและจัดกรอบ</h3>
    <label class="field"><span>เลือกรูป JPG / PNG / WebP (สูงสุด 10 MB)</span><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"></label>
    <div id="photo-preview-area" class="photo-editor" aria-label="พื้นที่ครอปภาพประกอบ">
      <div id="photo-frame" class="photo-frame" role="img" aria-label="ตัวอย่างภาพที่จะใส่ในเอกสาร กรอบแนวนอนสัดส่วน 4 ต่อ 3">
        <div id="photo-placeholder" class="photo-placeholder">🖼️<span>ยังไม่ได้เลือกรูปภาพ</span><small>รูปตัวอย่างจะแสดงในกรอบนี้</small></div>
        <img id="photo-preview" alt="ตัวอย่างภาพครอป 4 ต่อ 3" draggable="false" hidden>
        <div class="photo-guides" aria-hidden="true"></div>
      </div>
      <p class="mini" id="photo-file-info">เลือกรูป แล้วใช้นิ้วหรือเมาส์ลากเพื่อเลื่อนภาพในกรอบ 4:3</p>
    </div>
    <canvas id="photo-crop" width="${FRAME_W}" height="${FRAME_H}" hidden aria-hidden="true"></canvas>
    <label class="field"><span>ซูมภาพ <strong id="photo-scale-label">100%</strong></span><input type="range" id="photo-zoom" min="100" max="300" step="5" value="100" disabled></label>
    <button class="btn" id="photo-center" type="button" disabled>จัดภาพให้อยู่ตรงกลาง</button>
   </section>
   <section class="card stack"><h3>2. ข้อมูลในเอกสาร ${label[kind]}</h3>
    <label class="field"><span>เลือก${kind==='club'?'ชุมนุม':'ห้องเรียน'}เพื่อช่วยกรอกชื่อกิจกรรม</span><select id="photo-target"><option value="">กรอกเอง</option>${targets.map(t=>`<option value="${html(t.id)}">${html(kind==='club'?t.name:`ม.${t.grade}/${t.room_no}`)}</option>`).join('')}</select></label>
    <label class="field"><span>ชื่อกิจกรรม</span><input id="photo-activity" maxlength="90" placeholder="ระบุชื่อกิจกรรม"></label>
    <label class="field"><span>วันที่ทำกิจกรรม</span><input id="photo-date" type="date"></label>
    <label class="field"><span>สถานที่ทำกิจกรรม</span><input id="photo-place" maxlength="90"></label>
    <label class="field"><span>ลักษณะการทำกิจกรรมพอสังเขป</span><textarea id="photo-details" maxlength="240" rows="3" placeholder="เขียนสรุปกิจกรรม (ไม่เกิน 240 ตัวอักษร)"></textarea></label>
    <div class="grid2"><label class="field"><span>ครูที่ปรึกษาคนที่ 1</span><input id="photo-advisor1" maxlength="80"></label><label class="field"><span>ครูที่ปรึกษาคนที่ 2</span><input id="photo-advisor2" maxlength="80"></label></div>
    <p class="sub">เมื่อกดดาวน์โหลด ภาพที่แสดงอยู่ในกรอบจะถูกใส่ในเอกสาร Word A4 ของ${label[kind]}เพียงประเภทเดียว</p>
    <button type="button" class="btn primary" id="photo-download" disabled>⬇ ดาวน์โหลดภาพประกอบ${label[kind]} (.docx)</button><p id="photo-message" role="status" aria-live="polite" class="sub"></p>
   </section></div></div>`;
 const $=id=>container.querySelector('#'+id),cv=$('photo-crop'),ctx=cv.getContext('2d'),preview=$('photo-preview'),frame=$('photo-frame');
 const message=$('photo-message');
 function resetImage(){
   if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl=null;}
   img=null;geometry=null;x=0;y=0;zoom=1;preview.hidden=true;preview.removeAttribute('src');
   $('photo-placeholder').hidden=false;$('photo-zoom').value='100';$('photo-zoom').disabled=true;
   $('photo-center').disabled=true;$('photo-download').disabled=true;$('photo-scale-label').textContent='100%';
   $('photo-file-info').textContent='เลือกรูป แล้วใช้นิ้วหรือเมาส์ลากเพื่อเลื่อนภาพในกรอบ 4:3';
 }
 function draw(){
   if(!img)return;
   geometry=cropFrameGeometry(img.naturalWidth,img.naturalHeight,zoom,x,y);x=geometry.x;y=geometry.y;
   // Percent sizing makes the preview reliable even if the CSS frame is resized.
   preview.style.left=(geometry.left/FRAME_W*100)+'%';
   preview.style.top=(geometry.top/FRAME_H*100)+'%';
   preview.style.width=(geometry.width/FRAME_W*100)+'%';
   preview.style.height=(geometry.height/FRAME_H*100)+'%';
 }
 $('photo-file').onchange=()=>{
   const file=$('photo-file').files?.[0];resetImage();message.textContent='';
   if(!file)return;
   if(file.size>MAX_SIZE){message.textContent='รูปภาพต้องมีขนาดไม่เกิน 10 MB';return;}
   if(!file.type.startsWith('image/')&&!/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)){
     message.textContent='กรุณาเลือกไฟล์ภาพ JPG, PNG หรือ WebP';return;
   }
   message.textContent='กำลังโหลดตัวอย่างภาพ…';
   fileUrl=URL.createObjectURL(file);
   const loaded=new Image();
   loaded.onload=()=>{
     if(fileUrl!==loaded.src)return;
     if(!loaded.naturalWidth||!loaded.naturalHeight){message.textContent='ไม่พบขนาดรูปภาพ';return;}
     img=loaded;x=0;y=0;zoom=1;
     preview.src=fileUrl;preview.hidden=false;$('photo-placeholder').hidden=true;
     $('photo-zoom').disabled=false;$('photo-center').disabled=false;$('photo-download').disabled=false;
     $('photo-file-info').textContent=`${file.name} • ${img.naturalWidth} × ${img.naturalHeight} พิกเซล • ลากเพื่อเลื่อนและซูมเพื่อครอป`;
     message.textContent='แสดงตัวอย่างภาพแล้ว • ภาพที่ดาวน์โหลดจะตรงกับกรอบนี้';draw();
   };
   loaded.onerror=()=>{
     resetImage();message.textContent='ไม่สามารถแสดงภาพนี้ได้ กรุณาใช้ JPG, PNG หรือ WebP (ไฟล์ HEIC อาจไม่รองรับในเบราว์เซอร์นี้)';
   };
   loaded.src=fileUrl;
 };
 $('photo-zoom').oninput=()=>{zoom=Number($('photo-zoom').value)/100;$('photo-scale-label').textContent=$('photo-zoom').value+'%';draw();};
 $('photo-center').onclick=()=>{x=y=0;draw();};
 let drag=null;frame.addEventListener('pointerdown',e=>{
   if(!img)return;drag={id:e.pointerId,px:e.clientX,py:e.clientY};
   try{frame.setPointerCapture(e.pointerId);}catch{}
 });
 frame.addEventListener('pointermove',e=>{
   if(!drag||e.pointerId!==drag.id)return;
   const rect=frame.getBoundingClientRect();if(!rect.width||!rect.height)return;
   x+=(e.clientX-drag.px)*FRAME_W/rect.width;y+=(e.clientY-drag.py)*FRAME_H/rect.height;
   drag.px=e.clientX;drag.py=e.clientY;draw();
 });
 const endDrag=()=>{drag=null;};frame.addEventListener('pointerup',endDrag);frame.addEventListener('pointercancel',endDrag);
 $('photo-target').onchange=()=>{const entry=targets.find(t=>String(t.id)===$('photo-target').value);if(entry)$('photo-activity').value=kind==='club'?entry.name:`บำเพ็ญประโยชน์ ห้อง ม.${entry.grade}/${entry.room_no}`;};
 $('photo-download').onclick=async()=>{
   if(!img||!geometry||busy)return;busy=true;$('photo-download').disabled=true;message.textContent='กำลังสร้างเอกสาร Word…';
   try{
     if(!ctx)throw Error('เบราว์เซอร์ไม่รองรับการครอปรูป กรุณาลองเบราว์เซอร์อื่น');
     ctx.clearRect(0,0,FRAME_W,FRAME_H);
     ctx.drawImage(img,geometry.left,geometry.top,geometry.width,geometry.height);
     const blob=await new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error('ครอปรูปไม่สำเร็จ')),'image/jpeg',.91));
     const result=await createPhotoDocx({kind,imageBlob:blob,activity:$('photo-activity').value,date:$('photo-date').value,
       place:$('photo-place').value,details:$('photo-details').value,advisor1:$('photo-advisor1').value,advisor2:$('photo-advisor2').value});
     download(result.blob,result.filename);message.textContent='สร้างเอกสารสำเร็จ • ใช้ภาพที่ครอปในกรอบตัวอย่าง';
   }catch(e){message.textContent='สร้างเอกสารไม่สำเร็จ: '+e.message;}
   finally{busy=false;$('photo-download').disabled=!img;}
 };
}
