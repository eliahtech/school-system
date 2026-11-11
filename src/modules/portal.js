import {Router} from 'express';
import {query,transaction} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {input,select,form,table} from '../ui.js';
import {grades,validYear} from './rules.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const managers=['super_admin','admin'];
async function linkedStudentIds(user){
 if(user.role==='student')return (await query('SELECT id FROM students WHERE user_id=$1',[user.id])).rows.map(s=>s.id);
 if(user.role==='parent')return (await query('SELECT DISTINCT sg.student_id id FROM student_guardians sg JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE ga.user_id=$1',[user.id])).rows.map(s=>s.id);
 return [];
}
r.get('/my/reports',auth,permit('student','parent'),safe(async(req,res)=>{
 const ids=await linkedStudentIds(req.user);if(!ids.length)return res.locals.render('Academic Reports','<h1>My Academic Reports</h1><p>No learner account linked.</p>');
 const rows=(await query(`SELECT rv.id,rv.year,rv.term,rv.version,rv.approved_at,s.first_name,s.last_name,s.admission_number FROM report_versions rv JOIN students s ON s.id=rv.student_id WHERE rv.student_id=ANY($1::bigint[]) ORDER BY rv.year DESC,rv.term NULLS LAST,rv.version DESC LIMIT 200`,[ids])).rows;
 res.locals.render('Academic Reports',`<h1>Published CBC Reports</h1><p>Only headteacher-approved official report snapshots are shown here.</p>${table(['Learner','Year','Period','Version','Download'],rows.map(x=>[e(x.first_name+' '+x.last_name),e(x.year),e(x.term?'Term '+x.term:'Annual'),e(x.version),`<a href="/reports/${x.id}/pdf">PDF report</a>`]))}`);
}));
r.get('/my/attendance',auth,permit('student','parent'),safe(async(req,res)=>{
 const ids=await linkedStudentIds(req.user);if(!ids.length)return res.locals.render('My Attendance','<h1>Attendance</h1><p>No linked learners.</p>');
 const rows=(await query(`SELECT s.first_name,s.last_name,a.day,a.status FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.student_id=ANY($1::bigint[]) ORDER BY a.day DESC LIMIT 150`,[ids])).rows;
 res.locals.render('My Attendance',`<h1>Learner Attendance</h1>${table(['Learner','Date','Status'],rows.map(x=>[e(x.first_name+' '+x.last_name),e(new Date(x.day).toISOString().slice(0,10)),e(x.status)]))}`);
}));
r.get('/my/fees',auth,permit('student','parent'),safe(async(req,res)=>{
 const ids=await linkedStudentIds(req.user);if(!ids.length)return res.locals.render('Fee Statements','<h1>Fee Statements</h1><p>No linked learners.</p>');
 const rows=(await query('SELECT id,first_name,last_name,admission_number,status FROM students WHERE id=ANY($1::bigint[]) ORDER BY first_name',[ids])).rows;
 res.locals.render('Fee Statements',`<h1>My Fee Statements</h1><p>Balances and historical payments remain available even after a student graduates.</p>${table(['Learner','Admission','Status','Statement'],rows.map(x=>[e(x.first_name+' '+x.last_name),e(x.admission_number),e(x.status),`<a href="/finance/statement/${x.id}">View fees and receipts</a>`]))}`);
}));
r.get('/students/promote',auth,permit(...managers),(req,res)=>res.locals.render('Student Promotion',`<h1>Promote or Graduate Student</h1><p>Historical academic-year enrollments remain unchanged. Grade 9 graduation stops future termly charges without erasing outstanding balances.</p><div class="formbox">${form('/students/promote',input('Admission number','admission_number','text','',true)+input('New academic year','year','number',new Date().getFullYear()+1,true)+select('New grade / Grade 9 graduation','new_grade',[...grades,'Graduated'])+input('Stream','stream','text','A',true),res.locals.csrf,'Confirm promotion')}</div>`));
r.post('/students/promote',auth,permit(...managers),safe(async(req,res)=>{
 const {admission_number,year,new_grade,stream}=req.body;if(!validYear(year)||!([...grades,'Graduated'].includes(new_grade))||!stream?.trim()||stream.length>12)return res.sendStatus(400);
 const info=await transaction(async c=>{
  const s=(await c.query('SELECT * FROM students WHERE admission_number=$1 FOR UPDATE',[admission_number?.trim()])).rows[0];if(!s)return null;
  if(s.status!=='active')return {error:'Only currently active students may be promoted.'};
  const last=(await c.query('SELECT max(year) AS year FROM enrollments WHERE student_id=$1',[s.id])).rows[0].year;
  if(last&&Number(year)<=Number(last))return {error:'Promotion year must follow the previous enrollment year.'};
  const index=grades.indexOf(s.grade);const next=grades[index+1];
  if(new_grade!==(index===grades.length-1?'Graduated':next))return {error:'Use the next consecutive grade. Grade 9 learners should graduate.'};
  if(new_grade==='Graduated'){
   await c.query("UPDATE students SET status='graduated',updated_at=now() WHERE id=$1",[s.id]);
   await c.query(`INSERT INTO student_status_changes(student_id,previous_status,new_status,reason,changed_by) VALUES($1,$2,$3,$4,$5)`,[s.id,s.status,'graduated','Completed Grade 9',req.user.id]);
  }else{
   await c.query('INSERT INTO academic_years(year) VALUES($1) ON CONFLICT DO NOTHING',[year]);
   await c.query('INSERT INTO enrollments(student_id,year,grade,stream) VALUES($1,$2,$3,$4)',[s.id,year,new_grade,stream]);
   await c.query('UPDATE students SET grade=$1,stream=$2,updated_at=now() WHERE id=$3',[new_grade,stream,s.id]);
  }
  return {id:s.id,graduated:new_grade==='Graduated'};
 });if(!info)return res.sendStatus(404);if(info.error)return res.status(409).send(e(info.error));
 await query('INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user.id,info.graduated?'graduate':'promote','student',info.id,JSON.stringify({year,new_grade,stream})]);
 res.locals.render('Promotion Recorded',`<h1>${info.graduated?'Graduation recorded':'Student promoted'}</h1><p>Prior academic and financial records remain accessible.</p><a href="/students">Back to students</a>`);
}));
export default r;
