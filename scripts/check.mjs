// Portable syntax checking: works in PowerShell, cmd.exe, Bash, and Codespaces.
import {spawnSync} from 'node:child_process';
const files=['functions/api/[[path]].js','public/app/app.js','public/app/xlsx-reader.js',
 'public/app/form-xlsx.js','public/app/photo-report.js'];
for(const file of files){
 const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
 if(r.status!==0){console.error('Syntax check failed:',file);process.exit(r.status||1);}
}
console.log('Syntax check passed for',files.length,'files');
