import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const server=read('../src/server.js'),web=read('../public/js/site.js'),legacy=read('../src/extended.js'),upload=read('../src/modules/uploads.js');

test('private student file uploads are wired end-to-end behind authenticated routes',()=>{
 assert.match(server,/app\.use\(express\.raw\(\{type:'application\/octet-stream'/);
 assert.match(server,/app\.use\(uploadsRoutes\)/);
 assert.match(web,/data-secure-upload/);
 assert.match(web,/x-csrf-token/);
 assert.match(upload,/r\.post\('\/files\/upload',auth,permit/);
 assert.match(upload,/r\.get\('\/files\/:id',auth/);
 assert.match(read('../database/migrations/007_files.sql'),/uploaded_file_id UUID REFERENCES uploaded_files/);
});
test('termly billing uses historical grade enrollment for the billed academic year',()=>{
 assert.match(legacy,/JOIN enrollments en ON en\.student_id=s\.id/);
 assert.match(legacy,/JOIN fee_structures fs ON fs\.grade=en\.grade AND fs\.year=en\.year/);
 const scheduled=read('../scripts/bill-term.js');
 assert.match(scheduled,/JOIN enrollments en ON en\.year=fs\.year AND en\.grade=fs\.grade/);
 assert.match(scheduled,/ON CONFLICT\(student_id,academic_year,term,item\) DO NOTHING/);
 assert.match(scheduled,/s\.status='active'/);
});
test('assignment creation records stream and learning area for teacher authorization',()=>{
 assert.match(legacy,/INSERT INTO assignments\(title,grade,stream,subject,description,deadline,teacher_id\)/);
 assert.match(legacy,/ta\.stream=\$3 AND lower\(ta\.subject\)=lower\(\$4\)/);
});
