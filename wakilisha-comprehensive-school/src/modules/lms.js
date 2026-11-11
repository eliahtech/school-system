import {Router} from 'express';
import {query} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {input,select,form,table} from '../ui.js';
import {grades} from './rules.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),managers=['super_admin','admin','headteacher'];
const log=(user,action,id)=>query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[user,action,'lms',String(id)]);
const isManager=user=>managers.includes(user.role);
async function teacherFor(req,grade,stream,subject){if(isManager(req.user))return true;if(req.user.role!=='teacher')return false;return (await query(`SELECT 1 FROM teacher_assignments ta JOIN staff st ON st.id=ta.staff_id WHERE st.user_id=$1 AND ta.year=$2 AND ta.grade=$3 AND ta.stream=$4 AND lower(ta.subject)=lower($5) LIMIT 1`,[req.user.id,new Date().getFullYear(),grade,stream,subject])).rowCount>0;}
async function assignmentAccess(user,a){
 if(isManager(user))return true;
 if(user.role==='teacher')return String(a.teacher_id)===String(user.id)||await teacherFor({user},a.grade,a.stream,a.subject||'');
 if(user.role==='student')return (await query(`SELECT 1 FROM students WHERE user_id=$1 AND grade=$2 AND stream=$3 AND status='active'`,[user.id,a.grade,a.stream])).rowCount>0;
 if(user.role==='parent')return (await query(`SELECT 1 FROM students s JOIN student_guardians sg ON sg.student_id=s.id JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE ga.user_id=$1 AND s.grade=$2 AND s.stream=$3 AND s.status='active' LIMIT 1`,[user.id,a.grade,a.stream])).rowCount>0;
 return false;
}
r.get('/learning',auth,permit(...managers,'teacher','student','parent'),safe(async(req,res)=>{
 let list=[];
 if(isManager(req.user))list=(await query('SELECT a.*,u.full_name teacher FROM assignments a LEFT JOIN users u ON u.id=a.teacher_id ORDER BY a.id DESC LIMIT 150')).rows;
 else if(req.user.role==='teacher')list=(await query('SELECT a.*,u.full_name teacher FROM assignments a LEFT JOIN users u ON u.id=a.teacher_id WHERE a.teacher_id=$1 ORDER BY a.id DESC LIMIT 150',[req.user.id])).rows;
 else if(req.user.role==='student')list=(await query(`SELECT a.* FROM assignments a JOIN students s ON s.grade=a.grade AND s.stream=a.stream AND s.user_id=$1 WHERE s.status='active' AND a.published=true ORDER BY a.id DESC LIMIT 150`,[req.user.id])).rows;
 else list=(await query(`SELECT DISTINCT a.* FROM assignments a JOIN students s ON s.grade=a.grade AND s.stream=a.stream JOIN student_guardians sg ON sg.student_id=s.id JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE ga.user_id=$1 AND s.status='active' AND a.published=true ORDER BY a.id DESC LIMIT 150`,[req.user.id])).rows;
 res.locals.render('Learning Center',`<h1>Practice Assignments</h1><p>These marks never enter official CBC reports.</p>${isManager(req.user)||req.user.role==='teacher'?'<a class="btn" href="/lms/create">Create an assignment</a>':''}${table(['Assignment','Grade','Learning area','Deadline','Open'],list.map(a=>[e(a.title),e(a.grade),e(a.subject||'—'),e(a.deadline?new Date(a.deadline).toLocaleDateString('en-KE'):'No deadline'),`<a href="/learning/${a.id}">Details</a>`]))}`);
}));
r.get('/learning/:id',auth,permit(...managers,'teacher','student','parent'),safe(async(req,res)=>{
 const a=(await query('SELECT * FROM assignments WHERE id=$1',[req.params.id])).rows[0];if(!a||!(await assignmentAccess(req.user,a)))return res.sendStatus(404);
 let body=`<h1>${e(a.title)}</h1><p>${e(a.grade)} ${e(a.stream)} · ${e(a.subject||'Practice')}</p><div class="card"><p style="white-space:pre-wrap">${e(a.description)}</p><p>Deadline: ${a.deadline?e(new Date(a.deadline).toLocaleString('en-KE')):'No deadline'}</p></div>`;
 if(req.user.role==='student'){
  const s=(await query('SELECT id FROM students WHERE user_id=$1',[req.user.id])).rows[0];const submission=s?(await query('SELECT * FROM submissions WHERE assignment_id=$1 AND student_id=$2',[a.id,s.id])).rows[0]:null;
  body+=`<h2>Your submission</h2><p><a href="/files/upload">Upload a practice assignment file</a></p><p>${submission?.submitted_at?'Submitted '+e(new Date(submission.submitted_at).toLocaleString('en-KE')):'Not submitted'}</p><p>Practice mark: ${e(submission?.practice_mark??'Not marked')}</p><p>Feedback: ${e(submission?.feedback||'Not yet given')}</p>`;
  if(!a.deadline||new Date(a.deadline)>=new Date())body+=`<div class="formbox">${form('/learning/'+a.id+'/submit',`<label>Written answer<textarea name="answer" required maxlength="10000">${e(submission?.answer||'')}</textarea></label>`,res.locals.csrf,'Submit practice answer')}</div>`;
 }
 if((req.user.role==='teacher'&&String(a.teacher_id)===String(req.user.id))||isManager(req.user)){
  const subs=(await query('SELECT su.*,s.first_name,s.last_name,s.admission_number FROM submissions su JOIN students s ON s.id=su.student_id WHERE su.assignment_id=$1 ORDER BY su.submitted_at DESC NULLS LAST',[a.id])).rows;
  body+='<h2>Submissions</h2>'+table(['Student','Submitted','Mark','Review'],subs.map(s=>[e(s.first_name+' '+s.last_name),e(s.submitted_at?new Date(s.submitted_at).toLocaleDateString('en-KE'):'Draft'),e(s.practice_mark??'—'),`${s.uploaded_file_id?`<a href="/files/${s.uploaded_file_id}">Download file</a> · `:''}<a href="/learning/${a.id}/mark/${s.student_id}">Mark</a>`]));
 }
 res.locals.render('Assignment',body);
}));
r.post('/learning/:id/submit',auth,permit('student'),safe(async(req,res)=>{
 const a=(await query('SELECT * FROM assignments WHERE id=$1',[req.params.id])).rows[0];if(!a||!a.published||!(await assignmentAccess(req.user,a)))return res.sendStatus(404);
 if(a.deadline&&new Date(a.deadline)<new Date())return res.status(409).send('Deadline has passed');const answer=req.body.answer?.trim();if(!answer||answer.length>10000)return res.sendStatus(400);
 const s=(await query('SELECT id FROM students WHERE user_id=$1',[req.user.id])).rows[0];if(!s)return res.sendStatus(403);
 await query(`INSERT INTO submissions(assignment_id,student_id,answer,submitted_at) VALUES($1,$2,$3,now()) ON CONFLICT(assignment_id,student_id) DO UPDATE SET answer=EXCLUDED.answer,submitted_at=now(),practice_mark=NULL,feedback=NULL,marked_by=NULL,marked_at=NULL,updated_at=now()`,[a.id,s.id,answer]);await log(req.user.id,'submit_practice',a.id);res.redirect('/learning/'+a.id);
}));
r.get('/learning/:id/mark/:student',auth,permit(...managers,'teacher'),safe(async(req,res)=>{
 const a=(await query('SELECT * FROM assignments WHERE id=$1',[req.params.id])).rows[0];if(!a||!(await assignmentAccess(req.user,a)))return res.sendStatus(403);
 const sub=(await query('SELECT su.*,s.first_name,s.last_name FROM submissions su JOIN students s ON s.id=su.student_id WHERE assignment_id=$1 AND student_id=$2',[a.id,req.params.student])).rows[0];if(!sub)return res.sendStatus(404);
 res.locals.render('Mark Practice Assignment',`<h1>Review: ${e(sub.first_name)} ${e(sub.last_name)}</h1><div class="card"><p style="white-space:pre-wrap">${e(sub.answer)}</p></div><p>Practice marks cannot enter official CBC scores.</p><div class="formbox">${form(`/learning/${a.id}/mark/${req.params.student}`,input('Practice mark (0–100)','mark','number',sub.practice_mark??'')+`<label>Feedback<textarea name="feedback" maxlength="4000">${e(sub.feedback||'')}</textarea></label>`,res.locals.csrf,'Save feedback')}</div>`);
}));
r.post('/learning/:id/mark/:student',auth,permit(...managers,'teacher'),safe(async(req,res)=>{
 const a=(await query('SELECT * FROM assignments WHERE id=$1',[req.params.id])).rows[0];if(!a||!(await assignmentAccess(req.user,a)))return res.sendStatus(403);
 const mark=Number(req.body.mark),feedback=req.body.feedback||'';if(!Number.isFinite(mark)||mark<0||mark>100||feedback.length>4000)return res.sendStatus(400);
 const result=await query('UPDATE submissions SET practice_mark=$1,feedback=$2,marked_by=$3,marked_at=now(),updated_at=now() WHERE assignment_id=$4 AND student_id=$5 RETURNING id',[mark,feedback,req.user.id,a.id,req.params.student]);if(!result.rowCount)return res.sendStatus(404);await log(req.user.id,'mark_practice',result.rows[0].id);res.redirect('/learning/'+a.id);
}));
r.get('/learning-materials',auth,permit(...managers,'teacher','student','parent'),safe(async(req,res)=>{
 let rows;if(isManager(req.user))rows=(await query('SELECT * FROM learning_materials ORDER BY id DESC LIMIT 120')).rows;
 else if(req.user.role==='teacher')rows=(await query('SELECT * FROM learning_materials WHERE teacher_id=$1 ORDER BY id DESC LIMIT 120',[req.user.id])).rows;
 else if(req.user.role==='student')rows=(await query(`SELECT lm.* FROM learning_materials lm JOIN students s ON s.grade=lm.grade AND s.stream=lm.stream WHERE s.user_id=$1 AND lm.published=true`,[req.user.id])).rows;
 else rows=(await query(`SELECT DISTINCT lm.* FROM learning_materials lm JOIN students s ON s.grade=lm.grade AND s.stream=lm.stream JOIN student_guardians sg ON sg.student_id=s.id JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE ga.user_id=$1 AND lm.published=true`,[req.user.id])).rows;
 const create=isManager(req.user)||req.user.role==='teacher'?`<p><a class="btn" href="/files/upload">Upload private lesson file</a></p><div class="formbox">${form('/learning-materials',input('Title','title','text','',true)+select('Grade','grade',grades)+input('Stream','stream','text','A',true)+input('Learning area','subject','text','',true)+input('Resource HTTPS URL','url','url','',true)+'<label>Description<textarea name="description" maxlength="2000"></textarea></label>',res.locals.csrf,'Add material')}</div>`:'';
 res.locals.render('Learning Materials',`<h1>Learning Materials</h1>${create}${table(['Title','Grade','Subject','Resource'],rows.map(x=>[e(x.title),e(x.grade),e(x.subject),`<a rel="noopener noreferrer" target="_blank" href="${e(x.url)}">Open</a>`]))}`);
}));
r.post('/learning-materials',auth,permit(...managers,'teacher'),safe(async(req,res)=>{
 const {title,grade,stream,subject,url,description}=req.body;
 if(!title?.trim()||title.length>200||!grades.includes(grade)||!stream?.trim()||stream.length>15||!subject?.trim()||subject.length>100||String(description||'').length>2000)return res.sendStatus(400);
 let parsed;try{parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error();}catch{return res.status(400).send('Use a secure HTTPS material URL');}
 if(!(await teacherFor(req,grade,stream,subject)))return res.sendStatus(403);
 await query('INSERT INTO learning_materials(title,grade,stream,subject,url,description,teacher_id,published) VALUES($1,$2,$3,$4,$5,$6,$7,true)',[title.trim(),grade,stream.trim(),subject.trim(),parsed.toString(),description||'',req.user.id]);await log(req.user.id,'publish_material',title);res.redirect('/learning-materials');
}));
export default r;
