import {createAdmissionPdf} from '../services/report-pdf.js';
import {Router} from 'express';
import {query,transaction} from '../db.js';
import {auth,permit,escape as e,hash,token} from '../security.js';
import {input,select,form,table} from '../ui.js';
import {grades,validYear} from './rules.js';
import {issueInvitation} from './identity.js';
import {config} from '../config.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const managers=['super_admin','admin','headteacher'];
const audit=(actor,action,entity,id)=>query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[actor,action,entity,String(id)]);
const year=()=>new Date().getFullYear();
r.get('/admissions/requirements',auth,permit(...managers),safe(async(req,res)=>{
 const rows=(await query('SELECT * FROM reporting_requirements ORDER BY year DESC,grade,kind,item LIMIT 300')).rows;
 res.locals.render('Reporting Materials and Documents',`<h1>Reporting Day Requirements</h1><p>Each year and grade may have different required materials and documents.</p><div class="formbox">${form('/admissions/requirements',input('Academic year','year','number',year(),true)+select('Grade','grade',grades)+select('Requirement type','kind',['document','material'])+input('Required item','item','text','',true),res.locals.csrf,'Add requirement')}</div>${table(['Year','Grade','Type','Requirement'],rows.map(x=>[e(x.year),e(x.grade),e(x.kind),e(x.item)]))}`);
}));
r.post('/admissions/requirements',auth,permit(...managers),safe(async(req,res)=>{
 const {year:yr,grade,kind,item}=req.body;if(!validYear(yr)||!grades.includes(grade)||!['document','material'].includes(kind)||!item?.trim()||item.length>250)return res.sendStatus(400);
 await query('INSERT INTO reporting_requirements(year,grade,kind,item) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[yr,grade,kind,item.trim()]);await audit(req.user.id,'create','reporting_requirement',`${yr}:${grade}:${item}`);res.redirect('/admissions/requirements');
}));
r.get('/admissions/:id/offer',auth,permit(...managers),safe(async(req,res)=>{
 const a=(await query('SELECT * FROM applications WHERE id=$1',[req.params.id])).rows[0];if(!a)return res.sendStatus(404);
 const yr=a.academic_year||year();const rows=(await query('SELECT kind,item FROM reporting_requirements WHERE year=$1 AND grade=$2 ORDER BY kind,item',[yr,a.grade])).rows;
 res.locals.render('Review Admission Offer',`<h1>Review Application: ${e(a.reference)}</h1><div class="card"><h2>${e(a.first_name)} ${e(a.last_name)}</h2><p>Grade: ${e(a.grade)}</p><p>Guardian: ${e(a.guardian_name)} · ${e(a.guardian_email)}</p><p>Status: ${e(a.status)}</p></div><h2>Reporting checklist</h2>${table(['Type','Item'],rows.map(x=>[e(x.kind),e(x.item)]))}<p>Issue the offer only after reviewing the learner's application. The guardian will receive a queued admission email.</p>${a.status==='pending'?`<div class="formbox">${form('/admissions/'+a.id+'/offer',input('Academic year','year','number',yr,true)+input('Reporting date','reporting_date','date','',true)+input('Reporting time','reporting_time','time','08:00',true)+input('Admin notes','admin_note'),res.locals.csrf,'Approve and issue admission offer')}</div>`:'<p>Application is no longer pending.</p>'}`);
}));
r.post('/admissions/:id/offer',auth,permit(...managers),safe(async(req,res)=>{
 const {year:yr,reporting_date,reporting_time,admin_note}=req.body;
 if(!validYear(yr)||!/^\d{4}-\d{2}-\d{2}$/.test(reporting_date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(reporting_time||'')||String(admin_note||'').length>1000)return res.sendStatus(400);
 const info=await transaction(async c=>{
  const a=(await c.query('SELECT * FROM applications WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!a||a.status!=='pending')return null;
  await c.query('INSERT INTO academic_years(year) VALUES($1) ON CONFLICT DO NOTHING',[yr]);
  const existing=(await c.query('SELECT * FROM guardians WHERE lower(email)=lower($1) AND phone=$2 ORDER BY id LIMIT 1',[a.guardian_email,a.guardian_phone])).rows[0];
  const guardian=existing||(await c.query('INSERT INTO guardians(full_name,email,phone) VALUES($1,$2,$3) RETURNING *',[a.guardian_name,a.guardian_email,a.guardian_phone])).rows[0];
  const number=`WCS-${yr}-${String(a.id).padStart(5,'0')}`;
  const student=(await c.query(`INSERT INTO students(first_name,last_name,admission_number,grade,status,guardian_id) VALUES($1,$2,$3,$4,'pending',$5) RETURNING id`,[a.first_name,a.last_name,number,a.grade,guardian.id])).rows[0];
  await c.query('INSERT INTO student_guardians(student_id,guardian_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[student.id,guardian.id]);
  await c.query(`UPDATE applications SET status='approved',student_id=$1,academic_year=$2,reporting_date=$3,reporting_time=$4,admin_note=$5,reviewed_by=$6,reviewed_at=now() WHERE id=$7`,[student.id,yr,reporting_date,reporting_time,admin_note||'',req.user.id,a.id]);
  const requirements=(await c.query('SELECT kind,item FROM reporting_requirements WHERE year=$1 AND grade=$2 ORDER BY kind,item',[yr,a.grade])).rows;
  const list=requirements.map(x=>`- ${x.kind}: ${x.item}`).join('\n')||'Contact the school for required materials and documents.';
  const body=`WAKILISHA COMPREHENSIVE SCHOOL\nAdmission Offer\nLearner: ${a.first_name} ${a.last_name}\nAdmission number: ${number}\nGrade: ${a.grade}\nAcademic year: ${yr}\nReporting: ${reporting_date} at ${reporting_time}\n\nRequired materials and documents:\n${list}\n\n${admin_note||''}\nFor questions, contact ${config.email} / ${config.phone}.`;
  await c.query('INSERT INTO email_outbox(recipient,subject,body) VALUES($1,$2,$3)',[a.guardian_email,'Wakilisha Comprehensive School - Admission Approved',body]);
  // Create guardian portal account and queue a one-time activation link.
  const guardianEmail=a.guardian_email.toLowerCase().trim();let user=(await c.query('SELECT id FROM users WHERE lower(email)=$1',[guardianEmail])).rows[0];
  if(!user)user=(await c.query(`INSERT INTO users(full_name,email,role,password_hash) VALUES($1,$2,'parent',$3) RETURNING id`,[guardian.full_name,guardianEmail,await hash(token())])).rows[0];
  await c.query('INSERT INTO guardian_accounts(guardian_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[guardian.id,user.id]);
  await c.query(`INSERT INTO user_role_memberships(user_id,role_id) SELECT $1,id FROM school_roles WHERE name='parent' ON CONFLICT DO NOTHING`,[user.id]);
  await issueInvitation(c,user.id,guardianEmail);
  return {number,studentId:student.id};
 });
 if(!info)return res.status(409).send('Application was already reviewed.');await audit(req.user.id,'approve','application',req.params.id);
 res.locals.render('Admission Approved',`<h1>Admission offer issued</h1><p>Student number: <strong>${e(info.number)}</strong></p><p>Admission instructions and secure guardian portal invitation are queued for email delivery.</p><a class="btn" href="/admissions/${req.params.id}/letter.pdf">Download Admission Letter</a> <a class="btn" href="/admissions/${req.params.id}/reporting">Reporting Day</a>`);
}));
r.get('/admissions/:id/letter.pdf',auth,safe(async(req,res)=>{
 const a=(await query('SELECT a.*,s.admission_number FROM applications a JOIN students s ON s.id=a.student_id WHERE a.id=$1 AND a.status=$2',[req.params.id,'approved'])).rows[0];if(!a)return res.sendStatus(404);
 const manager=managers.includes(req.user.role);
 const guardian=req.user.role==='parent'&&(await query(`SELECT 1 FROM student_guardians sg JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE sg.student_id=$1 AND ga.user_id=$2`,[a.student_id,req.user.id])).rowCount>0;
 if(!manager&&!guardian)return res.sendStatus(403);
 const reqs=(await query('SELECT kind,item FROM reporting_requirements WHERE year=$1 AND grade=$2 ORDER BY kind,item',[a.academic_year,a.grade])).rows;
 const data=createAdmissionPdf({...a,school_contact:config.email},reqs);
 res.set('Cache-Control','private, no-store');res.set('Content-Disposition',`attachment; filename="Admission-${a.admission_number}.pdf"`);res.type('application/pdf').send(data);
}));
r.get('/admissions/:id/reporting',auth,permit(...managers),safe(async(req,res)=>{
 const a=(await query('SELECT a.*,s.admission_number,s.status student_status FROM applications a JOIN students s ON s.id=a.student_id WHERE a.id=$1',[req.params.id])).rows[0];if(!a||a.status!=='approved')return res.sendStatus(404);
 const items=(await query(`SELECT r.id,r.kind,r.item,COALESCE(c.completed,false) completed FROM reporting_requirements r LEFT JOIN reporting_requirement_checks c ON c.requirement_id=r.id AND c.application_id=$1 WHERE r.year=$2 AND r.grade=$3 ORDER BY kind,item`,[a.id,a.academic_year,a.grade])).rows;
 const checked=(await query('SELECT * FROM reporting_checks WHERE application_id=$1',[a.id])).rows[0];
 const inputs=items.map(x=>`<label class="check"><input type="checkbox" name="requirement_ids" value="${e(x.id)}" ${x.completed?'checked':''}> ${e(x.kind.toUpperCase())}: ${e(x.item)}</label>`).join('');
 res.locals.render('Reporting Day Verification',`<h1>Reporting Day: ${e(a.first_name)} ${e(a.last_name)}</h1><div class="card"><p>Admission: ${e(a.admission_number)} · ${e(a.grade)}</p><p>Expected: ${e(a.reporting_date||'Not set')} · ${e(a.reporting_time||'')}</p><p>Student status: ${e(a.student_status)}</p></div><p>Mark each requirement individually. Enrollment becomes active only after all listed requirements and identity verification are completed.</p><div class="formbox">${form('/admissions/'+a.id+'/reporting',inputs+'<label><input type="checkbox" name="identity_verified" value="1" '+(checked?.documents_ok?'checked':'')+'> Student and guardian identity verified</label><label>Notes<textarea name="notes" maxlength="2000">'+e(checked?.notes||'')+'</textarea></label>',res.locals.csrf,'Save verification')}</div>`);
}));
r.post('/admissions/:id/reporting',auth,permit(...managers),safe(async(req,res)=>{
 const id=req.params.id,submitted=[].concat(req.body.requirement_ids||[]).map(String);
 const answer=await transaction(async c=>{
  const a=(await c.query('SELECT a.*,s.status student_status FROM applications a JOIN students s ON s.id=a.student_id WHERE a.id=$1 AND a.status=$2 FOR UPDATE OF a',[id,'approved'])).rows[0];if(!a)return null;
  const items=(await c.query('SELECT id FROM reporting_requirements WHERE year=$1 AND grade=$2',[a.academic_year,a.grade])).rows.map(x=>String(x.id));
  if(submitted.some(v=>!items.includes(v)))throw Error('Unknown reporting requirement');
  for(const reqId of items)await c.query(`INSERT INTO reporting_requirement_checks(application_id,requirement_id,completed,verified_by) VALUES($1,$2,$3,$4) ON CONFLICT(application_id,requirement_id) DO UPDATE SET completed=EXCLUDED.completed,verified_by=EXCLUDED.verified_by`,[id,reqId,submitted.includes(reqId),req.user.id]);
  const complete=Boolean(req.body.identity_verified)&&items.every(x=>submitted.includes(x));
  await c.query(`INSERT INTO reporting_checks(application_id,verified_by,documents_ok,materials_ok,notes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(application_id) DO UPDATE SET verified_by=EXCLUDED.verified_by,documents_ok=EXCLUDED.documents_ok,materials_ok=EXCLUDED.materials_ok,notes=EXCLUDED.notes,verified_at=now()`,[id,req.user.id,!!req.body.identity_verified,items.every(x=>submitted.includes(x)),String(req.body.notes||'').slice(0,2000)]);
  if(complete){
   await c.query("UPDATE students SET status='active',updated_at=now() WHERE id=$1 AND status='pending'",[a.student_id]);
   await c.query('INSERT INTO academic_years(year) VALUES($1) ON CONFLICT DO NOTHING',[a.academic_year]);
   await c.query(`INSERT INTO enrollments(student_id,year,grade,stream) SELECT id,$2,grade,stream FROM students WHERE id=$1 ON CONFLICT(student_id,year) DO NOTHING`,[a.student_id,a.academic_year]);
  }
  return complete;
 });if(answer===null)return res.sendStatus(404);await audit(req.user.id,'reporting_verification','application',id);
 res.locals.render('Reporting Status',`<h1>${answer?'Learner reporting completed':'Requirements pending'}</h1><p>${answer?'Student enrollment is now active.':'Missing materials or verification must be completed before activation.'}</p><a href="/admissions/${e(id)}/reporting">Review checklist</a>`);
}));
export default r;
