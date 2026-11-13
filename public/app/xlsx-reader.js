// SchoolHub v1.3. XLSX first-sheet reader using standard browser APIs only.
// No CDN, third-party parser, upload of workbook bytes, or Excel macro execution.
const FIELDS=['student_no','prefix','first_name','last_name','club_name'];
const HEADERS=['เลขประจำตัวนักเรียน','คำนำหน้า','ชื่อ','นามสกุล','ชุมนุม'];
const MAX_FILE=4*1024*1024, MAX_XML=10*1024*1024;
const utf8=new TextDecoder('utf-8');
function fail(msg){throw new Error(msg);}
function u16(b,o){return b[o]|b[o+1]<<8;}
function u32(b,o){return (b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;}
function zipFiles(input){
 const bytes=new Uint8Array(input);if(bytes.length>MAX_FILE)fail('ไฟล์มีขนาดเกิน 4 MB');
 let eocd=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(bytes,p)===0x06054b50){eocd=p;break;}
 if(eocd<0)fail('ไฟล์ไม่ใช่ XLSX (ZIP) ที่ถูกต้อง');
 const count=u16(bytes,eocd+10),base=u32(bytes,eocd+16),out=new Map();
 if(count>2500)fail('ไฟล์ XLSX มีรายการมากผิดปกติ');
 let pos=base;
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||u32(bytes,pos)!==0x02014b50)fail('โครงสร้าง XLSX ไม่สมบูรณ์');
  const flags=u16(bytes,pos+8),method=u16(bytes,pos+10),compressed=u32(bytes,pos+20),plain=u32(bytes,pos+24),nameLen=u16(bytes,pos+28),extraLen=u16(bytes,pos+30),commentLen=u16(bytes,pos+32),local=u32(bytes,pos+42);
  const name=utf8.decode(bytes.subarray(pos+46,pos+46+nameLen));pos+=46+nameLen+extraLen+commentLen;
  if(name.includes('..')||name.startsWith('/'))fail('พบพาธไม่ปลอดภัยภายใน XLSX');
  if(flags&1)fail('ไม่รองรับไฟล์ XLSX ที่ตั้งรหัสผ่าน');
  if(plain>MAX_XML || compressed>MAX_FILE)fail('ไฟล์ XLSX ภายในมีขนาดใหญ่เกินกำหนด');
  if(local+30>bytes.length||u32(bytes,local)!==0x04034b50)fail('XLSX ไม่สมบูรณ์');
  const start=local+30+u16(bytes,local+26)+u16(bytes,local+28);
  if(start+compressed>bytes.length)fail('XLSX ถูกตัดขาด');
  out.set(name,{method,compressed:bytes.slice(start,start+compressed),plain});
 }
 return out;
}
async function readMember(entries,name){
 const entry=entries.get(name);if(!entry)fail('ไม่พบ '+name+' ในไฟล์ XLSX');
 let array;
 if(entry.method===0)array=entry.compressed;
 else if(entry.method===8){
  if(!globalThis.DecompressionStream)fail('เบราว์เซอร์นี้ยังไม่รองรับการอ่าน XLSX กรุณาใช้ Chrome หรือ Firefox รุ่นใหม่');
  array=new Uint8Array(await new Response(new Blob([entry.compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
 }else fail('XLSX ใช้รูปแบบบีบอัดที่ไม่รองรับ');
 if(array.length>MAX_XML || array.length!==entry.plain)fail('XLSX ภายในมีขนาดผิดปกติ');
 return utf8.decode(array);
}
function xmlDoc(s){if(/<!DOCTYPE/i.test(s))fail('ไฟล์ XML มีส่วนที่ไม่รองรับ');
 const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)fail('พบ XML ที่ไม่ถูกต้องใน XLSX');return d;
}
function nodes(parent,name){return [...parent.getElementsByTagName('*')].filter(el=>el.localName===name);}
function child(el,name){return [...el.children].find(x=>x.localName===name)||null;}
function xref(ref){const m=/^([A-Z]+)(\d+)$/i.exec(ref||'');if(!m)return null;let col=0;for(const letter of m[1].toUpperCase())col=col*26+letter.charCodeAt(0)-64;return {col:col-1,row:Number(m[2])};}
async function xlsxRows(buffer){
 const entries=zipFiles(buffer);
 const book=xmlDoc(await readMember(entries,'xl/workbook.xml'));
 const sheets=nodes(book,'sheet');if(!sheets.length)fail('ไฟล์ไม่มี Worksheet');
 const first=sheets[0],ref=first.getAttribute('r:id')||first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
 const rels=xmlDoc(await readMember(entries,'xl/_rels/workbook.xml.rels'));
 const link=nodes(rels,'Relationship').find(x=>x.getAttribute('Id')===ref);
 if(!link || link.getAttribute('TargetMode')==='External')fail('ไม่สามารถหา Worksheet แรกได้');
 const target=link.getAttribute('Target')||'';
 const path=target.startsWith('/')?target.replace(/^\//,''):('xl/'+target).replace(/\/\.\//g,'/');
 if(path.includes('..'))fail('ที่อยู่ Worksheet ไม่ปลอดภัย');
 const shared=entries.has('xl/sharedStrings.xml')?nodes(xmlDoc(await readMember(entries,'xl/sharedStrings.xml')),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
 const sheet=xmlDoc(await readMember(entries,path));
 const data=[];let formulaFound=false, cellCount=0;
 for(const row of nodes(sheet,'row')){
  const rowNo=Number(row.getAttribute('r')||data.length+1);
  if(rowNo>2000)fail('จำนวนแถวสูงเกินกำหนด');
  const values=Array(5).fill('');
  for(const cell of [...row.children].filter(x=>x.localName==='c')){
    if(++cellCount>10000)fail('ไฟล์มีจำนวนเซลล์มากเกินกำหนด');
    const ref=xref(cell.getAttribute('r'));if(!ref||ref.col>4)continue;
    if(child(cell,'f'))formulaFound=true;
    const kind=cell.getAttribute('t')||'';
    const v=child(cell,'v')?.textContent??'';
    values[ref.col]=kind==='s'?(shared[Number(v)]??''):kind==='inlineStr'?(child(cell,'is')?nodes(child(cell,'is'),'t').map(x=>x.textContent).join(''):''):v;
  }
  data.push({rowNo,values});
 }
 if(formulaFound)fail('ไม่รองรับสูตร Excel ในคอลัมน์นำเข้า กรุณาแปลงเป็นข้อความก่อน');
 return mapRows(data);
}
function mapRows(sheetRows){
 const first=sheetRows.find(r=>r.values.some(v=>String(v).trim()))?.values;
 if(!first || HEADERS.some((header,i)=>String(first[i]??'').trim()!==header))
   fail('หัวคอลัมน์ไม่ตรงแบบฟอร์ม v1.3 กรุณาดาวน์โหลดแบบฟอร์มและจัดเรียง: '+HEADERS.join(', '));
 const firstIndex=sheetRows.findIndex(r=>r.values.some(v=>String(v).trim()));
 const rows=sheetRows.slice(firstIndex+1).filter(r=>r.values.some(v=>String(v).trim())).map(r=>({...Object.fromEntries(FIELDS.map((key,i)=>[key,String(r.values[i]??'').trim()])),source_line:r.rowNo}));
 if(!rows.length)fail('ไฟล์ไม่มีข้อมูลนักเรียน กรุณากรอกข้อมูลก่อน');
 if(rows.length>120)fail('จำกัดการนำเข้าไม่เกิน 120 คนต่อครั้ง');
 return rows;
}
function parseCsv(text){
 text=text.replace(/^\uFEFF/,'');const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':text.split(/\r?\n/,1)[0].includes(';')?';':',';
 const result=[],rows=[];let cell='',record=[],quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(ch===delimiter && !quoted){record.push(cell);cell='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;record.push(cell);rows.push(record);record=[];cell='';}
  else cell+=ch;
 }
 if(quoted)fail('CSV มีเครื่องหมายคำพูดไม่ครบ');
 if(cell||record.length){record.push(cell);rows.push(record);}
 rows.forEach((values,i)=>result.push({rowNo:i+1,values}));return mapRows(result);
}
export async function readSchoolImport(file){
 if(!file)fail('กรุณาเลือกไฟล์');if(file.size>MAX_FILE)fail('ไฟล์ใหญ่เกิน 4 MB');
 const name=file.name.toLowerCase();if(name.endsWith('.xlsx'))return await xlsxRows(await file.arrayBuffer());
 if(name.endsWith('.csv'))return parseCsv(await file.text());
 fail('รองรับเฉพาะ .xlsx หรือ .csv เท่านั้น');
}
