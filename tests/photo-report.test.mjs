import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPhotoDocx,detectImageFormat} from '../public/app/photo-report.js';
import {getEntries,uncompressed} from '../public/app/form-xlsx.js';
const base=new URL('../public/',import.meta.url);
const originalFetch=globalThis.fetch;
async function create(kind){
 globalThis.fetch=async url=>{
   assert.match(url,/^\/templates\//);
   return new Response(readFileSync(new URL('.'+url,base)),{status:200});
 };
 const original=readFileSync(new URL('./templates/SchoolHub_Photo_Club_Template.docx',base));
 const image=new Uint8Array(await uncompressed(getEntries(original).find(e=>e.name==='word/media/image1.jpg')));
 const output=await createPhotoDocx({kind,imageBlob:new Blob([image],{type:'image/jpeg'}),
  activity:'กิจกรรมทดสอบการเข้าร่วม',date:'2026-11-23',place:'ห้องเรียน',details:'ตัวอย่างการกรอกข้อความ',advisor1:'คุณครูหนึ่ง',advisor2:'คุณครูสอง'});
 assert.match(output.filename,/\.docx$/);
 const bytes=new Uint8Array(await output.blob.arrayBuffer());const entries=getEntries(bytes);
 const xml=new TextDecoder().decode(await uncompressed(entries.find(e=>e.name==='word/document.xml')));
 assert.match(xml,/กิจกรรมทดสอบการเข้าร่วม/);assert.match(xml,/คุณครูหนึ่ง/);
 assert.ok(!xml.includes('{{ACTIVITY}}'));
 assert.equal(entries.filter(e=>e.name==='word/media/image1.jpg').length,1);
 return output;
}
test('generate two separate activity-photo Word documents with cropped image embedded in correct frame',async()=>{
 try{
   const club=await create('club');const community=await create('community');
   assert.match(club.filename,/ชุมนุม/);assert.match(community.filename,/บำเพ็ญประโยชน์/);
   if(process.env.SCHOOLHUB_RENDER_DOCS){
      writeFileSync(process.env.SCHOOLHUB_RENDER_DOCS+'/club.docx',new Uint8Array(await club.blob.arrayBuffer()));
      writeFileSync(process.env.SCHOOLHUB_RENDER_DOCS+'/community.docx',new Uint8Array(await community.blob.arrayBuffer()));
   }
 }finally{globalThis.fetch=originalFetch;}
});

test('v1.8.1 on-device preview uses a crop frame that matches JPEG export at 4:3',async()=>{
 const {cropFrameGeometry}=await import('../public/app/photo-report.js');
 const size=cropFrameGeometry(800,600,1,0,0);
 assert.equal(size.width/size.height,4/3);
 assert.equal(size.left,0);assert.equal(size.top,0);
 const portrait=cropFrameGeometry(900,1200,1,0,0);
 assert.equal(portrait.height,1600);assert.equal(portrait.left,0);assert.equal(portrait.top,-350);
 const dragged=cropFrameGeometry(900,1200,1,500,-1000);
 assert.equal(dragged.x,0);assert.equal(dragged.y,-350);
 const z=cropFrameGeometry(900,1200,2,100,25);
 assert.ok(z.width>=1200&&z.height>=900);
 assert.equal(z.x,100);assert.equal(z.y,25);
 assert.throws(()=>cropFrameGeometry(0,0),/ขนาดภาพ/);
});

test('v1.8.2 identify actual image signatures instead of trusting extensions',()=>{
 assert.equal(detectImageFormat(Uint8Array.from([255,216,255,224,0,0])),'jpeg');
 assert.equal(detectImageFormat(Uint8Array.from([137,80,78,71,13,10,26,10])),'png');
 assert.equal(detectImageFormat(new TextEncoder().encode('RIFF1234WEBP')),'webp');
 assert.equal(detectImageFormat(new Uint8Array([0,0,0,24,...new TextEncoder().encode('ftypheic')])),'heic');
 assert.equal(detectImageFormat(new Uint8Array([0,0,0,24,...new TextEncoder().encode('ftypavif')])),'avif');
 assert.equal(detectImageFormat(new TextEncoder().encode('not really an image')),'unknown');
});
