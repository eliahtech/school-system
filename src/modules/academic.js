import {createReportPdf} from '../services/report-pdf.js';
import {Router} from 'express';
import crypto from 'node:crypto';
import {query,transaction} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {input,select,form,table} from '../ui.js';
import {grades,validYear,validTerm,assessScore,performanceLevel,autoRemark,reportPayload} from './rules.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const managers=['super_admin','admin','headteacher'];
const isManager=u=>managers.includes(u.role);
const bad=(res,text='Invalid form data')=>res.status(400).send(e(text));
const yr=()=>new Date().getFullYear();
const log=(actor,action,entity,id,details={})=>query('INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[actor,action,entity,String(id),JSON.stringify(details)]);
async function teacherCan(u,studentId,subject,year,client={query}){
 if(isManager(u))return true;if(u.role!=='teacher')return false;
 const q=await client.query(`SELECT 1 FROM students s JOIN teacher_assignments ta ON ta.grade=s.grade AND ta.stream=s.stream AND ta.year=$3 AND lower(ta.subject)=lower($4) JOIN staff st ON st.id=ta.staff_id WHERE s.id=$1 AND st.user_id=$2 LIMIT 1`,[studentId,u.id,year,subject]);return q.rowCount>0;
}
async function mayRead(u,studentId,year,client={query}){
 if(isManager(u))return true;
 if(u.role==='student')return (await client.query('SELECT 1 FROM students WHERE id=$1 AND user_id=$2',[studentId,u.id])).rowCount>0;
 if(u.role==='parent')return (await client.query('SELECT 1 FROM student_guardians sg JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE sg.student_id=$1 AND ga.user_id=$2',[studentId,u.id])).rowCount>0;
 if(u.role==='teacher')return (await client.query(`SELECT 1 FROM students s JOIN teacher_assignments ta ON ta.grade=s.grade AND ta.stream=s.stream AND ta.year=$3 JOIN staff st ON st.id=ta.staff_id WHERE s.id=$1 AND st.user_id=$2 LIMIT 1`,[studentId,u.id,year])).rowCount>0;
 return false;
}
export {mayRead,teacherCan};
// School-configurable grades, learning areas, numerical vs observation assessment.
r.get('/academic/schemes',auth,permit(...managers),safe(async(req,res)=>{
 const rows=(await query('SELECT * FROM assessment_schemes ORDER BY year DESC,grade,subject LIMIT 300')).rows;
 res.locals.render('CBC Assessment Schemes',`<h1>CBC Assessment Schemes</h1><p>School-defined scores and thresholds are not represented as official universal CBC boundaries.</p><div class="formbox">${form('/academic/schemes',input('Academic year','year','number',yr(),true)+select('Grade','grade',grades)+input('Learning area','subject','text','',true)+select('Assessment mode','mode',['numerical','rubric'])+input('CAT maximum','cat_max','number','30',true)+input('Exam maximum','exam_max','number','70',true)+input('Threshold scheme (optional)','threshold_scheme'),res.locals.csrf,'Save scheme')}</div>${table(['Year','Grade','Learning area','Mode','CAT max','Exam max'],rows.map(x=>[e(x.year),e(x.grade),e(x.subject),e(x.mode),e(x.cat_max),e(x.exam_max)]))}`);
}));
r.post('/academic/schemes',auth,permit(...managers),safe(async(req,res)=>{
 const {year,grade,subject,mode,cat_max,exam_max,threshold_scheme}=req.body;
 if(!validYear(year)||!grades.includes(grade)||!subject?.trim()||subject.length>100||!['numerical','rubric'].includes(mode))return bad(res);
 const c=Number(cat_max),x=Number(exam_max);if(!Number.isFinite(c)||!Number.isFinite(x)||c<0||x<0||c+x<=0||c+x>1000)return bad(res);
 await query(`INSERT INTO assessment_schemes(year,grade,subject,mode,cat_max,exam_max,threshold_scheme,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(year,grade,subject) DO UPDATE SET mode=EXCLUDED.mode,cat_max=EXCLUDED.cat_max,exam_max=EXCLUDED.exam_max,threshold_scheme=EXCLUDED.threshold_scheme`,[year,grade,subject.trim(),mode,c,x,threshold_scheme||null,req.user.id]);
 await log(req.user.id,'configure','assessment_scheme',`${year}-${grade}-${subject}`);res.redirect('/academic/schemes');
}));
r.get('/academic/levels',auth,permit(...managers),safe(async(req,res)=>{
 const rows=(await query('SELECT * FROM performance_levels ORDER BY scheme,minimum DESC')).rows;
 res.locals.render('Performance Bands',`<h1>School Performance Bands</h1><p>Configure school-defined numerical bands. For rubric assessments, teachers record criteria directly instead.</p><div class="formbox">${form('/academic/levels',input('Scheme name','scheme','text','school-default',true)+select('Level','code',['EE','ME','AE','BE'])+input('Minimum %','minimum','number','',true)+input('Maximum %','maximum','number','',true),res.locals.csrf,'Save level')}</div>${table(['Scheme','Level','Minimum','Maximum'],rows.map(x=>[e(x.scheme),e(x.code),e(x.minimum),e(x.maximum)]))}`);
}));
r.post('/academic/levels',auth,permit(...managers),safe(async(req,res)=>{
 const {scheme,code,minimum,maximum}=req.body;const a=Number(minimum),b=Number(maximum);
 if(!scheme?.trim()||scheme.length>60||!['EE','ME','AE','BE'].includes(code)||![a,b].every(Number.isFinite)||a<0||b>100||a>b)return bad(res);
 await query('INSERT INTO performance_levels(scheme,code,minimum,maximum) VALUES($1,$2,$3,$4) ON CONFLICT(scheme,code) DO UPDATE SET minimum=EXCLUDED.minimum,maximum=EXCLUDED.maximum',[scheme.trim(),code,a,b]);await log(req.user.id,'configure','performance_level',`${scheme}:${code}`);res.redirect('/academic/levels');
}));
r.get('/academic/marks/new',auth,permit(...managers,'teacher'),(req,res)=>res.locals.render('Enter Official Assessment',`<h1>Official Assessment Entry</h1><p>Only assigned learning areas can be marked. Approved assessments are locked.</p><div class="formbox">${form('/academic/marks',input('Admission number','admission_number','text','',true)+input('Academic year','year','number',yr(),true)+select('Term','term',['1','2','3'])+input('Learning area','subject','text','',true)+input('CAT score','cat','number','0',true)+input('Exam score','exam','number','0',true)+'<label>Subject remark<textarea name="remark" maxlength="1000"></textarea></label>',res.locals.csrf,'Save draft marks')}</div>`));
r.post('/academic/marks',auth,permit(...managers,'teacher'),safe(async(req,res)=>{
 const {admission_number,year,term,subject,cat,exam,remark}=req.body;
 if(!validYear(year)||!validTerm(term)||!subject?.trim()||subject.length>100||String(remark||'').length>1000)return bad(res);
 const student=(await query('SELECT id,grade FROM students WHERE admission_number=$1',[admission_number?.trim()])).rows[0];if(!student)return res.sendStatus(404);
 if(!(await teacherCan(req.user,student.id,subject,Number(year))))return res.sendStatus(403);
 const scheme=(await query(`SELECT * FROM assessment_schemes WHERE year=$1 AND grade=$2 AND lower(subject)=lower($3)`,[year,student.grade,subject.trim()])).rows[0];
 if(!scheme||scheme.mode!=='numerical')return bad(res,'Configure a numerical assessment scheme for this learning area first.');
 let score;try{score=assessScore({cat:Number(cat),exam:Number(exam),catMax:Number(scheme.cat_max),examMax:Number(scheme.exam_max)});}catch{return bad(res,'Marks are outside the configured maximums.');}
 const prior=(await query('SELECT approved FROM assessments WHERE student_id=$1 AND academic_year=$2 AND term=$3 AND lower(subject)=lower($4)',[student.id,year,term,subject.trim()])).rows[0];if(prior?.approved)return res.status(409).send('Approved assessment is locked.');
 await query(`INSERT INTO assessments(student_id,subject,academic_year,term,cat,exam,remark,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(student_id,subject,academic_year,term) DO UPDATE SET cat=EXCLUDED.cat,exam=EXCLUDED.exam,remark=EXCLUDED.remark,recorded_by=EXCLUDED.recorded_by,updated_at=now() WHERE assessments.approved=false`,[student.id,scheme.subject,year,term,cat,exam,remark||'',req.user.id]);await log(req.user.id,'save_draft','assessment',student.id,{year,term,subject,percent:score.percent});res.redirect('/assessments');
}));
r.get('/academic/competencies/new',auth,permit(...managers,'teacher'),(req,res)=>res.locals.render('Competency Observation',`<h1>Competency Observation</h1><p>Record evidence-based observation, not an invented numerical equivalent.</p><div class="formbox">${form('/academic/competencies',input('Admission number','admission_number','text','',true)+input('Academic year','year','number',yr(),true)+select('Term','term',['1','2','3'])+input('Learning area','subject','text','',true)+input('Competency criterion','criterion','text','',true)+select('Observed level','level',['EE','ME','AE','BE']),res.locals.csrf,'Save observation')}</div>`));
r.post('/academic/competencies',auth,permit(...managers,'teacher'),safe(async(req,res)=>{
 const {admission_number,year,term,subject,criterion,level}=req.body;
 if(!validYear(year)||!validTerm(term)||!subject?.trim()||!criterion?.trim()||subject.length>100||criterion.length>200||!['EE','ME','AE','BE'].includes(level))return bad(res);
 const s=(await query('SELECT id FROM students WHERE admission_number=$1',[admission_number])).rows[0];if(!s)return res.sendStatus(404);
 if(!(await teacherCan(req.user,s.id,subject,Number(year))))return res.sendStatus(403);
 const frozen=(await query('SELECT 1 FROM report_versions WHERE student_id=$1 AND year=$2 AND term=$3 LIMIT 1',[s.id,year,term])).rowCount>0;if(frozen)return res.status(409).send('Approved report snapshot locks competency observations for this period. Request an audited correction.');
 await query(`INSERT INTO competency_observations(student_id,subject,criterion,level,year,term,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(student_id,subject,criterion,year,term) DO UPDATE SET level=EXCLUDED.level,recorded_by=EXCLUDED.recorded_by`,[s.id,subject.trim(),criterion.trim(),level,year,term,req.user.id]);await log(req.user.id,'record','competency',s.id,{subject,criterion,year,term});res.redirect('/assessments');
}));
async function buildSnapshot(student,year,term,client={query}){
 const params=term===null?[student.id,year]:[student.id,year,term];const cond=term===null?'':'AND term=$3';
 const a=(await client.query(`SELECT subject,cat,exam,remark,term,approved FROM assessments WHERE student_id=$1 AND academic_year=$2 ${cond} AND approved=true ORDER BY term,subject`,params)).rows;
 const schemes=(await client.query('SELECT * FROM assessment_schemes WHERE year=$1 AND grade=$2',[year,student.grade])).rows;
 const levels=(await client.query('SELECT scheme,code,minimum,maximum FROM performance_levels')).rows;
 const annotated=a.map(x=>{const scheme=schemes.find(s=>s.subject.toLowerCase()===x.subject.toLowerCase());if(!scheme||scheme.mode!=='numerical')return x;
  const percent=assessScore({cat:Number(x.cat),exam:Number(x.exam),catMax:Number(scheme.cat_max),examMax:Number(scheme.exam_max)}).percent;
  const level=performanceLevel(percent,levels.filter(l=>l.scheme===scheme.threshold_scheme));
  return {...x,percent,level,suggested_remark:!x.remark&&level?autoRemark(level):null};
 });
 const o=(await client.query(`SELECT subject,criterion,level,term FROM competency_observations WHERE student_id=$1 AND year=$2 ${cond} ORDER BY term,subject,criterion`,params)).rows;
 const t=(await client.query(`SELECT status,count(*)::int total FROM attendance WHERE student_id=$1 AND EXTRACT(YEAR FROM day)=$2 ${term===null?'':'AND EXTRACT(MONTH FROM day) BETWEEN 1 AND 12'} GROUP BY status`,[student.id,year])).rows;
 return reportPayload({student,year,term,assessments:a,observations:o,attendance:t,remarks:{}});
}
export {buildSnapshot};
r.post('/academic/approve',auth,permit('super_admin','headteacher'),safe(async(req,res)=>{
 const {admission_number,year,term}=req.body;
 if(!validYear(year)||!validTerm(term))return bad(res);
 const id=await transaction(async c=>{
  const s=(await c.query('SELECT * FROM students WHERE admission_number=$1 FOR UPDATE',[admission_number])).rows[0];if(!s)throw Error('Student not found');
  const incomplete=(await c.query('SELECT id FROM assessments WHERE student_id=$1 AND academic_year=$2 AND term=$3 AND (cat IS NULL OR exam IS NULL) LIMIT 1',[s.id,year,term])).rowCount>0;if(incomplete)throw Error('Complete all numerical assessment components before approval');
  await c.query('UPDATE assessments SET approved=true,approved_by=$1,approved_at=now() WHERE student_id=$2 AND academic_year=$3 AND term=$4 AND approved=false',[req.user.id,s.id,year,term]);
  const payload=await buildSnapshot(s,Number(year),Number(term),c);
  const h=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const v=await c.query(`SELECT COALESCE(max(version),0)+1 AS n FROM report_versions WHERE student_id=$1 AND year=$2 AND term=$3`,[s.id,year,term]);
  const report=await c.query(`INSERT INTO report_versions(student_id,year,term,payload,approved_by,version,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[s.id,year,term,JSON.stringify(payload),req.user.id,v.rows[0].n,h]);return report.rows[0].id;
 });await log(req.user.id,'approve','report_version',id);res.redirect('/reports/'+id);
}));
r.get('/academic/approve',auth,permit('super_admin','headteacher'),(req,res)=>res.locals.render('Approve Term Report',`<h1>Approve Term Reports</h1><p>Approval locks existing official marks and creates an immutable report snapshot.</p><div class="formbox">${form('/academic/approve',input('Admission number','admission_number','text','',true)+input('Year','year','number',yr(),true)+select('Term','term',['1','2','3']),res.locals.csrf,'Approve and save snapshot')}</div>`));
r.post('/academic/annual',auth,permit('super_admin','headteacher'),safe(async(req,res)=>{
 const {admission_number,year}=req.body;if(!validYear(year))return bad(res);
 const id=await transaction(async c=>{
  const student=(await c.query('SELECT * FROM students WHERE admission_number=$1 FOR UPDATE',[admission_number])).rows[0];if(!student)throw Error('Student not found');
  const terms=(await c.query('SELECT DISTINCT term FROM report_versions WHERE student_id=$1 AND year=$2 AND term IS NOT NULL',[student.id,year])).rows.map(x=>Number(x.term));
  if(terms.length!==3)throw Error('Approve term reports for all three terms before annual publication.');
  const payload=await buildSnapshot(student,Number(year),null,c);payload.report_type='annual';payload.term_reports_approved=terms.sort();
  const v=(await c.query('SELECT COALESCE(max(version),0)+1 n FROM report_versions WHERE student_id=$1 AND year=$2 AND term IS NULL',[student.id,year])).rows[0].n;
  const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const saved=await c.query('INSERT INTO report_versions(student_id,year,term,payload,approved_by,version,report_type,content_hash) VALUES($1,$2,NULL,$3,$4,$5,$6,$7) RETURNING id',[student.id,year,JSON.stringify(payload),req.user.id,v,'annual',hash]);return saved.rows[0].id;
 });await log(req.user.id,'publish','annual_report',id);res.redirect('/reports/'+id);
}));
r.get('/academic/annual',auth,permit('super_admin','headteacher'),(req,res)=>res.locals.render('Annual CBC Report',`<h1>Annual CBC Report Book</h1><p>All three term reports must be approved. Annual snapshots use approved official results, never LMS practice marks.</p><div class="formbox">${form('/academic/annual',input('Admission number','admission_number','text','',true)+input('Year','year','number',yr(),true),res.locals.csrf,'Publish annual report')}</div>`));
r.get('/reports/:id/pdf',auth,safe(async(req,res)=>{
 const report=(await query('SELECT id,student_id,year,term,payload,version FROM report_versions WHERE id=$1',[req.params.id])).rows[0];
 if(!report)return res.sendStatus(404);
 if(!(await mayRead(req.user,report.student_id,report.year)))return res.sendStatus(403);
 const data=createReportPdf(report.payload,{id:report.id,version:report.version});
 res.set('Cache-Control','private, no-store');res.set('Content-Disposition',`attachment; filename="Wakilisha-Report-${report.id}-v${report.version}.pdf"`);
 res.type('application/pdf').send(data);
}));
r.get('/reports/:id',auth,safe(async(req,res)=>{
 const report=(await query('SELECT * FROM report_versions WHERE id=$1',[req.params.id])).rows[0];if(!report)return res.sendStatus(404);
 if(!(await mayRead(req.user,report.student_id,report.year)))return res.sendStatus(403);
 const payload=report.payload,student=payload.student;
 const markRows=payload.official_assessments.map(a=>[e(a.term),e(a.subject),e(a.cat??'—'),e(a.exam??'—'),e(a.remark||a.suggested_remark||'—')]);
 const obsRows=payload.competency_observations.map(o=>[e(o.term),e(o.subject),e(o.criterion),e(o.level)]);
 const body=`<div class="report"><p>WAKILISHA COMPREHENSIVE SCHOOL</p><h1>${report.term?'Term '+report.term:'Annual'} CBC Progress Report · ${e(report.year)}</h1><h2>${e(student.first_name)} ${e(student.last_name)}</h2><p>Admission: ${e(student.admission_number)} · ${e(student.grade)} ${e(student.stream)}</p><p>Approved report version ${e(report.version)} · Published ${e(new Date(report.approved_at).toLocaleDateString('en-KE'))}</p><h3>Official learning-area assessments</h3>${table(['Term','Learning area','CAT','Exam','Teacher remark'],markRows)}<h3>Competency observations</h3>${table(['Term','Learning area','Criterion','Level'],obsRows)}<h3>Attendance summary</h3>${table(['Status','Days'],payload.attendance.map(a=>[e(a.status),e(a.total)]))}<h3>Learning development</h3><p>Performance levels reflect the school's configured assessment policy. Practical assignments and LMS practice marks are excluded from official assessment totals.</p><p>Prepared for Wakilisha Comprehensive School · Authentic snapshot #${e(report.id)}</p><button class="no-print" data-print>Print / Save as PDF</button></div>`;
 res.set('Cache-Control','private, no-store');res.locals.render('Approved CBC Report',`<p><a class=\"btn\" href=\"/reports/${report.id}/pdf\">Download official PDF</a></p>`+body);
}));
export default r;
