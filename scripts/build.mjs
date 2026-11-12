// Preserve the latest root index.html already in the GitHub repository.
// Do not overwrite that root file when installing this patch.
import {existsSync,copyFileSync,mkdirSync} from 'node:fs';
if(existsSync('index.html')){
 mkdirSync('public',{recursive:true});
 copyFileSync('index.html','public/index.html');
 console.log('Copied current GitHub root index.html into public/index.html (demo preserved).');
}else{
 console.log('No root index.html found: using packaged public/index.html as demo fallback.');
}
