import {Router} from 'express';
import {query,transaction} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {grades} from './rules.js';
import {parseCsv,csvEscape} from './csv.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const admins=['super_admin','admin'];
r.get('/students/import',auth,permit(...admins),(req,res)=>res.locals.render('Bulk Import Students',`<h1>Bulk Student Registration (CSV)</h1><p>Export your Excel sheet as CSV UTF-8 first. Required headers: <code>first_name,last_name,admission_number,grade,guardian_name,guardian_phone</code>. Optional: <code>guardian_email,stream</code>.</p><p>Maximum 500 students per import. Records are committed together; if a row fails, nothing is imported.</p><div class="formbox"><form id="student-import" data-csv-import method="post" action="/students/import"><input type="hidden" name="_csrf" value="${e(res.locals.csrf)}"><label>Choose CSV file<input type="file" accept=".csv,text/csv" name="file" required></label><button class="btn" type="submit">Import students</button><p role="status" data-import-status></p></form></div><a href="/students/export">Export existing learner register CSV</a>`));
r.post('/students/import',auth,permit(...admins),safe(async(req,res)=>{
 let rows;try{rows=parseCsv(req.body);}catch(err){return res.status(400).send(e(err.message));}
 if(!rows.length||rows.length>500)return res.status(400).send('CSV must contain between 1 and 500 students.');
 const seen=new Set();for(const [i,x] of rows.entries()){
  if(!x.first_name||!x.last_name||!x.admission_number||!grades.includes(x.grade)||!x.guardian_name||!x.guardian_phone||x.first_name.length>100||x.last_name.length>100||x.guardian_name.length>150||x.guardian_phone.length>30||String(x.guardian_email||'').length>150||String(x.stream||'A').length>15)return res.status(400).send(`Invalid student fields in CSV row ${i+2}`);
  if(seen.has(x.admission_number))return res.status(409).send(`Duplicate admission number within CSV: ${e(x.admission_number)}`);seen.add(x.admission_number);
 }
 const year=new Date().getFullYear();const count=await transaction(async c=>{
  await c.query('INSERT INTO academic_years(year) VALUES($1) ON CONFLICT DO NOTHING',[year]);
  for(const x of rows){
   const g=(await c.query('INSERT INTO guardians(full_name,email,phone) VALUES($1,$2,$3) RETURNING id',[x.guardian_name,x.guardian_email||null,x.guardian_phone])).rows[0];
   const student=(await c.query('INSERT INTO students(first_name,last_name,admission_number,grade,stream,status,guardian_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[x.first_name,x.last_name,x.admission_number,x.grade,x.stream||'A','active',g.id])).rows[0];
   await c.query('INSERT INTO student_guardians(student_id,guardian_id) VALUES($1,$2)',[student.id,g.id]);
   await c.query('INSERT INTO enrollments(student_id,year,grade,stream) VALUES($1,$2,$3,$4)',[student.id,year,x.grade,x.stream||'A']);
  }return rows.length;
 });
 await query('INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user.id,'bulk_import','student',String(year),JSON.stringify({count})]);
 res.locals.render('Import Complete',`<h1>Import successful</h1><p>${count} learners registered. Academic year: ${year}.</p><a class="btn" href="/students">View student records</a>`);
}));
r.get('/students/export',auth,permit(...admins),safe(async(req,res)=>{
 const rows=(await query('SELECT admission_number,first_name,last_name,grade,stream,status FROM students ORDER BY admission_number')).rows;
 const fields=['admission_number','first_name','last_name','grade','stream','status'];
 const lines=[fields.map(csvEscape).join(','),...rows.map(x=>fields.map(f=>csvEscape(x[f])).join(','))].join('\r\n');
 res.set('Content-Disposition','attachment; filename="Wakilisha-Student-Register.csv"');res.set('Cache-Control','private, no-store');res.type('text/csv; charset=utf-8').send('\ufeff'+lines);
}));
export default r;
