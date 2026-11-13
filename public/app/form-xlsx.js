// SchoolHub v1.6: fill the official workbook *on-device* while retaining its XLSX styles,
// merges, print settings, worksheets, and relationships. No CDN or student data in assets.
const enc=new TextEncoder(),dec=new TextDecoder('utf-8');
const XLSX='/templates/SchoolHub_Attendance_2_69_Original.xlsx';
const PAGE_ROWS=41;
const u16=(a,p)=>a[p]|(a[p+1]<<8);
const u32=(a,p)=>(a[p]|a[p+1]<<8|a[p+2]<<16|a[p+3]<<24)>>>0;
function p16(a,o,n){a[o]=n&255;a[o+1]=(n>>>8)&255;}
function p32(a,o,n){p16(a,o,n);p16(a,o+2,n>>>16);}
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function getEntries(bytes){
 if(bytes.length>10*1024*1024)throw Error('แบบฟอร์มต้นฉบับมีขนาดใหญ่เกินไป');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(bytes,i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('แบบฟอร์มต้นฉบับไม่ใช่ XLSX ที่ถูกต้อง');
 const count=u16(bytes,end+10),start=u32(bytes,end+16),entries=[];let p=start;
 if(count>3000)throw Error('รายการภายในแบบฟอร์มมีมากเกินไป');
 for(let i=0;i<count;i++){
  if(u32(bytes,p)!==0x02014b50)throw Error('แบบฟอร์ม XLSX เสียหาย');
  const flags=u16(bytes,p+8),method=u16(bytes,p+10),crc=u32(bytes,p+16),compressedSize=u32(bytes,p+20),plainSize=u32(bytes,p+24);
  const nameLen=u16(bytes,p+28),extra=u16(bytes,p+30),comment=u16(bytes,p+32),local=u32(bytes,p+42);
  const name=dec.decode(bytes.slice(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
  if(name.includes('..')||name.startsWith('/')||flags&1)throw Error('ไฟล์ XLSX มีรายการที่ไม่ปลอดภัย');
  if(method!==0&&method!==8)throw Error('XLSX มีรูปแบบบีบอัดที่ไม่รองรับ');
  if(local+30>bytes.length||u32(bytes,local)!==0x04034b50)throw Error('ส่วนข้อมูล XLSX เสียหาย');
  const pos=local+30+u16(bytes,local+26)+u16(bytes,local+28);
  if(pos+compressedSize>bytes.length||plainSize>15*1024*1024)throw Error('ขนาด XLSX ไม่ถูกต้อง');
  entries.push({name,method,crc,plainSize,packed:bytes.slice(pos,pos+compressedSize)});
 }
 return entries;
}
async function uncompressed(entry){
 if(!entry)throw Error('ไม่พบ Worksheet ในแบบฟอร์มต้นฉบับ');
 if(entry.method===0)return entry.packed;
 if(!globalThis.DecompressionStream)throw Error('เบราว์เซอร์นี้ยังไม่รองรับการสร้างแบบฟอร์ม XLSX');
 const raw=new Blob([entry.packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 const out=new Uint8Array(await new Response(raw).arrayBuffer());
 if(out.length!==entry.plainSize)throw Error('ขนาดข้อมูล XLSX ไม่ตรง');
 return out;
}
// Produce a valid ZIP with reused deflated original members, preserving Office assets and styles.
// Modified XML is stored uncompressed; this avoids external ZIP libraries or servers.
function packageZip(entries){
 const sections=[],index=[];let offset=0;
 for(const e of entries){
  const name=enc.encode(e.name),flags=0x0800,packed=e.packed;
  const h=new Uint8Array(30+name.length);p32(h,0,0x04034b50);p16(h,4,20);p16(h,6,flags);p16(h,8,e.method);
  p32(h,14,e.crc);p32(h,18,packed.length);p32(h,22,e.plainSize);p16(h,26,name.length);h.set(name,30);
  sections.push(h,packed);
  const c=new Uint8Array(46+name.length);p32(c,0,0x02014b50);p16(c,4,20);p16(c,6,20);p16(c,8,flags);p16(c,10,e.method);
  p32(c,16,e.crc);p32(c,20,packed.length);p32(c,24,e.plainSize);p16(c,28,name.length);p32(c,42,offset);c.set(name,46);index.push(c);
  offset+=h.length+packed.length;
 }
 const indexLen=index.reduce((sum,x)=>sum+x.length,0),end=new Uint8Array(22);
 p32(end,0,0x06054b50);p16(end,8,entries.length);p16(end,10,entries.length);p32(end,12,indexLen);p32(end,16,offset);
 return new Blob([...sections,...index,end],{type:'application/zip'});
}
function updateEntry(entry,content){const bytes=enc.encode(content);return {...entry,method:0,crc:crc32(bytes),plainSize:bytes.length,packed:bytes};}
function patchCells(xml,updates){
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error('แบบฟอร์มต้นฉบับมี XML ที่ไม่ถูกต้อง');
 const ns=doc.documentElement.namespaceURI,data=doc.getElementsByTagNameNS(ns,'sheetData')[0];
 if(!data)throw Error('ไม่พบข้อมูล Worksheet');
 const rows=new Map([...data.children].filter(x=>x.localName==='row').map(x=>[Number(x.getAttribute('r')),x]));
 const colNo=s=>{let v=0;for(const c of s)v=v*26+c.charCodeAt(0)-64;return v;};
 for(const [ref,value] of Object.entries(updates)){
  const match=/^([A-Z]+)(\d+)$/.exec(ref);if(!match)throw Error('พิกัดเซลล์ไม่ถูกต้อง');
  const rowNo=Number(match[2]);let row=rows.get(rowNo);
  if(!row){row=doc.createElementNS(ns,'row');row.setAttribute('r',String(rowNo));
   const next=[...rows].find(([r])=>r>rowNo)?.[1];data.insertBefore(row,next||null);rows.set(rowNo,row);}
  let cell=[...row.children].find(x=>x.localName==='c'&&x.getAttribute('r')===ref);
  if(!cell){cell=doc.createElementNS(ns,'c');cell.setAttribute('r',ref);
   const targetCol=colNo(match[1]);const next=[...row.children].find(x=>x.localName==='c'&&colNo((x.getAttribute('r')||'').replace(/\d+/g,''))>targetCol);
   row.insertBefore(cell,next||null);
  }
  while(cell.firstChild)cell.removeChild(cell.firstChild);
  if(value===null||String(value)===''){cell.removeAttribute('t');continue;}
  cell.setAttribute('t','inlineStr');const is=doc.createElementNS(ns,'is'),t=doc.createElementNS(ns,'t');
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=String(value);
  is.appendChild(t);cell.appendChild(is);
 }
 return new XMLSerializer().serializeToString(doc);
}
function dateLabel(iso){const [year,month,day]=iso.split('-').map(Number);return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year+543}`;}
function datePlus(start,days){const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function statusAbbr(status){return ({'มา':'ม','สาย':'ส','ลา':'ล','ขาด':'ข'})[status]||'';}
function column(n){let result='';while(n){n--;result=String.fromCharCode(65+(n%26))+result;n=Math.floor(n/26);}return result;}
function cleanName(name){return String(name||'').replace(/[\\/:*?"<>|]/g,'_').slice(0,55);}
async function buildSingle(archive,opts,page,index,total){
 const {kind,term,year,activity,startDate,students,sessions}=opts;
 const mappings={};for(const x of archive){if(/^xl\/worksheets\/sheet[1-5]\.xml$/.test(x.name))mappings[x.name]=x;}
 if(Object.keys(mappings).length!==5)throw Error('แบบฟอร์มต้นฉบับมี Worksheet ไม่ครบ');
 const attendance=kind==='community'?5:2,schedule=kind==='community'?4:3;
 const changes={};for(let n=1;n<=5;n++)changes['xl/worksheets/sheet'+n+'.xml']={};
 const communityTitle=`แบบประเมินการจัดกิจกรรมบำเพ็ญประโยชน์ฯ ภาคเรียนที่ ${term} ปีการศึกษา ${year}`;
 const clubTitle=`แบบประเมินการจัดกิจกรรม${kind==='other'?activity:'ชุมนุม'} ภาคเรียนที่ ${term} ปีการศึกษา ${year}`;
 changes['xl/worksheets/sheet2.xml'].B1=clubTitle;
 changes['xl/worksheets/sheet5.xml'].B1=communityTitle;
 changes['xl/worksheets/sheet3.xml'].B2=`ตารางการจัดกิจกรรม${kind==='other'?activity:'ชุมนุม'} ${kind==='club'||kind==='other'?activity:''}`;
 changes['xl/worksheets/sheet4.xml'].B2='ตารางการจัดกิจกรรมบำเพ็ญประโยชน์ฯ';
 for(const n of [3,4]){
   changes[`xl/worksheets/sheet${n}.xml`].B3=`ภาคเรียนที่ ${term} ปีการศึกษา ${year}`;
 }
 changes['xl/worksheets/sheet1.xml'].B8=`เอกสารแบบฟอร์มปีการศึกษา ${year} ภาคเรียน ${term}`;
 changes['xl/worksheets/sheet1.xml'].B9='ตรวจสอบรายชื่อ วันที่ และผลการเข้าร่วมก่อนใช้งาน';
 changes['xl/worksheets/sheet1.xml'].B10='วันที่ที่ยังไม่เช็กชื่อจะปล่อยว่างไว้ ไม่ถือเป็นการขาดเรียน';
 changes['xl/worksheets/sheet2.xml'].AJ5=null; // Do not carry over the fixed opening date from the supplied original.
 const chosen=changes[`xl/worksheets/sheet${attendance}.xml`];
 const titleSuffix=`${kind==='other'?'':` • ${activity||'แบบฟอร์ม'}`}${total>1?` (หน้า ${index+1}/${total})`:''}`;
 chosen.B1=(attendance===5?communityTitle:clubTitle)+titleSuffix;
 const dates=[];
 if(startDate){for(let n=0;n<20;n++)dates.push(datePlus(startDate,n*7));}
 else if(kind==='community'){for(const s of sessions.slice(0,20))dates.push(s.date);}
 for(const n of [2,5]){
  const a=changes[`xl/worksheets/sheet${n}.xml`];
  // The supplied original includes fixed dates from term 2/2569. Blank any unsupplied dates.
  for(let i=0;i<20;i++)a[`${column(7+i)}4`]=dates[i]?dateLabel(dates[i]):null;
  for(let row=5;row<=45;row++)for(const col of ['C','D','F',...Array.from({length:20},(_,i)=>column(i+7)),'AA'])a[`${col}${row}`]=null;
 }
 for(const n of [3,4]){
  const a=changes[`xl/worksheets/sheet${n}.xml`];
  for(let i=0;i<20;i++)a[`C${i+7}`]=dates[i]?dateLabel(dates[i]):null;
 }
 const marks=new Map(sessions.map(s=>[s.date,new Map((s.marks||[]).map(m=>[m.student_id,m.status]))]));
 for(let i=0;i<page.length;i++){
  const s=page[i],row=i+5;
  chosen[`B${row}`]=index*PAGE_ROWS+i+1;
  chosen[`C${row}`]=String(s.student_no??'');
  chosen[`D${row}`]=[s.prefix,s.first_name,s.last_name].filter(Boolean).join(' ').trim();
  chosen[`F${row}`]=`ม.${s.grade}/${s.room_no}`;
  let attended=0;
  for(let w=0;w<Math.min(20,dates.length);w++){
    const st=marks.get(dates[w])?.get(s.id);
    const code=statusAbbr(st);
    if(code){chosen[`${column(7+w)}${row}`]=code;if(st==='มา'||st==='สาย')attended++;}
  }
  if(kind==='community'&&attended)chosen[`AA${row}`]=attended;
 }
 if(kind==='community')chosen.AH6='ม=มา ส=สาย ล=ลา ข=ขาด (ช่องว่าง=ยังไม่ระบุ)';
 else changes['xl/worksheets/sheet2.xml'].AJ6='ช่องว่าง = ยังไม่มีข้อมูลเช็กชื่อ';
 const result=[];
 for(const entry of archive){
  const edits=changes[entry.name];
  if(!edits){result.push(entry);continue;}
  const text=dec.decode(await uncompressed(entry));result.push(updateEntry(entry,patchCells(text,edits)));
 }
 return packageZip(result);
}
export async function buildActivityForms(options){
 const {kind,term,year,activity,startDate,students=[],sessions=[],sessionCount=0}=options;
 if(!['club','community','other'].includes(kind)||![1,2].includes(Number(term))||!Number.isInteger(Number(year))||year<2500||year>2700)throw Error('ประเภทกิจกรรม ปี หรือภาคเรียนไม่ถูกต้อง');
 if(startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(startDate))throw Error('วันที่เริ่มกิจกรรมไม่ถูกต้อง');
 if(students.length>2000)throw Error('รายชื่อมากเกินขีดจำกัด');
 const r=await fetch(XLSX,{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error('ไม่พบไฟล์แบบฟอร์ม Excel ต้นฉบับ');
 const archive=getEntries(new Uint8Array(await r.arrayBuffer()));
 const total=Math.max(1,Math.ceil(students.length/PAGE_ROWS)),outputs=[];
 for(let index=0;index<total;index++){
  const page=students.slice(index*PAGE_ROWS,(index+1)*PAGE_ROWS);
  outputs.push({name:`SchoolHub_${kind}_${year}_T${term}_page${index+1}.xlsx`,packed:new Uint8Array(await buildSingle(archive,options,page,index,total).then(x=>x.arrayBuffer()))});
 }
 let blob,filename;
 if(total===1){blob=new Blob([outputs[0].packed],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});filename=outputs[0].name;}
 else{
  const files=outputs.map(o=>({name:o.name,method:0,crc:crc32(o.packed),plainSize:o.packed.length,packed:o.packed}));
  files.push({name:'README.txt',method:0,...(()=>{const bytes=enc.encode(`SchoolHub ${year} semester ${term}. ${total} workbook pages. Each page contains up to ${PAGE_ROWS} students; no students omitted. Student data is confidential.`);return {packed:bytes,plainSize:bytes.length,crc:crc32(bytes)};})()});
  blob=packageZip(files);filename=`SchoolHub_${kind}_${year}_T${term}_${total}_pages.zip`;
 }
 const note=kind==='club'?'ชุมนุมยังไม่มีระบบเช็กชื่ออัตโนมัติ':kind==='other'?'เติมเฉพาะทะเบียนนักเรียน':sessionCount>20?'มีบันทึกเกิน 20 วัน: ฟอร์มใส่เฉพาะ 20 วันแรก กรุณาตรวจข้อมูลที่เหลือ':'เติมการเช็กชื่อที่มีข้อมูลจริง';
 return {blob,filename,pages:total,note};
}
