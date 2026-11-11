import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const roots=['src','api','scripts','tests','public/js'];let n=0;
function crawl(dir){if(!fs.existsSync(dir))return;for(const x of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,x.name);if(x.isDirectory())crawl(file);else if(file.endsWith('.js')){execFileSync(process.execPath,['--check',file],{stdio:'pipe'});n++;}}}
for(const r of roots)crawl(r);console.log(`Syntax verified in ${n} JavaScript files.`);
