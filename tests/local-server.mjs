// Minimal test harness. Runs only on loopback; never stores real student data.
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname,join,normalize} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {onRequest} from '../functions/api/[[path]].js';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0002_student_archives.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0003_excel_import.sql',import.meta.url),'utf8'));
const db={
 prepare(q){const s=sqlite.prepare(q), m={sql:q,args:[],bind(...x){m.args=x;return m},async first(){return s.get(...m.args)||null},async all(){return {results:s.all(...m.args)}},async run(){return {meta:{changes:s.run(...m.args).changes}}}};return m;},
 async batch(stmts){sqlite.exec('BEGIN');try{const result=[];for(const s of stmts)result.push(/^\s*SELECT/i.test(s.sql)?await s.all():await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
};
const dir=join(import.meta.dirname,'../public');
createServer(async (req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:8788');
 if(url.pathname.startsWith('/api/')) {
  let data='';for await(const c of req)data+=c;
  const r=await onRequest({request:new Request(url.toString(),{method:req.method,headers:{...req.headers,origin:req.headers.origin||url.origin},body:['GET','HEAD'].includes(req.method)?undefined:data}),env:{DB:db,BOOTSTRAP_TOKEN:'test-local-only-strong-setup-token'}});
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
 }
 const file=normalize(join(dir,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
 if(!file.startsWith(dir)){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}
 catch{res.writeHead(404);res.end('Not Found');}
}).listen(8788,'127.0.0.1',()=>console.log('SchoolHub local test http://127.0.0.1:8788/app/'));
