import {Router} from 'express';import crypto from 'node:crypto';
import {query,transaction} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {grades} from './rules.js';
import {saveFile,loadFile,deleteFile,validateUpload} from '../services/storage.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const leaders=['super_admin','admin','headteacher'];
async function canTeach(user,grade,stream,subject){if(leaders.includes(user.role))return true;if(user.role!=='teacher')return false;return (await query(`SELECT 1 FROM staff st JOIN teacher_assignments ta ON ta.staff_id=st.id WHERE st.user_id=$1 AND ta.grade=$2 AND ta.stream=$3 AND lower(ta.subject)=lower($4) AND ta.year=$5`,[user.id,grade,stream,subject,new Date().getFullYear()])).rowCount>0;}
r.get('/files/upload',auth,permit(...leaders,'teacher','student'),(req,res)=>{
 const teacher=req.user.role!=='student';res.locals.render('Upload School File',`<h1>Secure File Upload</h1><p>Accepted: PDF, JPEG, PNG, WEBP or plain text; maximum 10 MB. Files are private and access controlled.</p><div class="formbox"><form data-secure-upload action="/files/upload" method="post"><input type="hidden" name="_csrf" value="${e(res.locals.csrf)}"><label>File <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" required></label><label>Purpose<select name="kind">${teacher?'<option value="learning_material">Class learning material</option>':'<option value="assignment_submission">Assignment submission</option>'}</select></label>${teacher?`<label>Grade<select name="grade">${grades.map(g=>`<option>${e(g)}</option>`).join('')}</select></label><label>Stream<input name="stream" value="A" required></label><label>Subject<input name="subject" required></label><label>Material title<input name="title" required></label>`:'<label>Assignment ID<input type="number" name="assignment_id" min="1" required></label>'}<button class="btn" type="submit">Upload securely</button><p role="status" data-upload-status></p></form></div>`);
});
r.post('/files/upload',auth,permit(...leaders,'teacher','student'),safe(async(req,res)=>{
 const buffer=req.body,mime=String(req.get('x-file-mime')||''),name=String(req.get('x-file-name')||'upload').replace(/[\\/\x00-\x1f]/g,'_').slice(0,140);
 try{validateUpload(buffer,mime);}catch(err){return res.status(400).json({error:err.message});}
 const kind=String(req.get('x-file-kind')||'');if(!['learning_material','assignment_submission'].includes(kind))return res.sendStatus(400);
 const grade=String(req.get('x-grade')||''),stream=String(req.get('x-stream')||'A'),subject=String(req.get('x-subject')||''),title=String(req.get('x-title')||name).slice(0,200);
 const assignmentId=String(req.get('x-assignment-id')||'');let student=null,assignment=null;
 if(kind==='learning_material'){
  if(!grades.includes(grade)||!stream||stream.length>12||!subject||subject.length>100||!(await canTeach(req.user,grade,stream,subject)))return res.sendStatus(403);
 }else{
  if(req.user.role!=='student'||!/^[1-9]\d*$/.test(assignmentId))return res.sendStatus(403);
  student=(await query('SELECT * FROM students WHERE user_id=$1 AND status=$2',[req.user.id,'active'])).rows[0];
  assignment=(await query('SELECT * FROM assignments WHERE id=$1 AND published=true',[assignmentId])).rows[0];
  if(!student||!assignment||student.grade!==assignment.grade||student.stream!==assignment.stream||assignment.deadline&&new Date(assignment.deadline)<new Date())return res.sendStatus(403);
 }
 const key=crypto.randomUUID();await saveFile(key,buffer,mime);
 try{
  const id=await transaction(async c=>{
   const f=(await c.query('INSERT INTO uploaded_files(id,storage_key,filename,mime_type,byte_size,kind,uploaded_by,student_id,assignment_id,grade,stream,subject) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',[key,key,name,mime,buffer.length,kind,req.user.id,student?.id||null,assignment?.id||null,kind==='learning_material'?grade:null,kind==='learning_material'?stream:null,kind==='learning_material'?subject:null])).rows[0];
   if(kind==='learning_material')await c.query('INSERT INTO learning_materials(title,grade,stream,subject,url,description,teacher_id,published) VALUES($1,$2,$3,$4,$5,$6,$7,true)',[title,grade,stream,subject,`/files/${f.id}`,'School-uploaded material',req.user.id]);
   else await c.query(`INSERT INTO submissions(assignment_id,student_id,answer,submitted_at,uploaded_file_id) VALUES($1,$2,$3,now(),$4) ON CONFLICT(assignment_id,student_id) DO UPDATE SET uploaded_file_id=EXCLUDED.uploaded_file_id,submitted_at=now(),practice_mark=NULL,feedback=NULL,marked_by=NULL,marked_at=NULL`,[assignment.id,student.id,'File submission',f.id]);
   return f.id;
  });await query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[req.user.id,'file_upload','file',id]);res.json({ok:true,location:kind==='learning_material'?'/learning-materials':`/learning/${assignment.id}`});
 }catch(err){await deleteFile(key);throw err;}
}));
r.get('/files/:id',auth,safe(async(req,res)=>{
 if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.sendStatus(404);
 const f=(await query('SELECT * FROM uploaded_files WHERE id=$1',[req.params.id])).rows[0];if(!f)return res.sendStatus(404);
 let granted=leaders.includes(req.user.role)||String(f.uploaded_by)===String(req.user.id);
 if(!granted&&f.kind==='learning_material'){
  if(req.user.role==='teacher')granted=await canTeach(req.user,f.grade,f.stream,f.subject);
  else if(req.user.role==='student')granted=(await query('SELECT 1 FROM students WHERE user_id=$1 AND grade=$2 AND stream=$3',[req.user.id,f.grade,f.stream])).rowCount>0;
  else if(req.user.role==='parent')granted=(await query(`SELECT 1 FROM students s JOIN student_guardians sg ON sg.student_id=s.id JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE ga.user_id=$1 AND s.grade=$2 AND s.stream=$3`,[req.user.id,f.grade,f.stream])).rowCount>0;
 }
 if(!granted&&f.kind==='assignment_submission'){
  if(req.user.role==='parent')granted=(await query(`SELECT 1 FROM student_guardians sg JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE sg.student_id=$1 AND ga.user_id=$2`,[f.student_id,req.user.id])).rowCount>0;
  else if(req.user.role==='teacher')granted=(await query('SELECT 1 FROM assignments WHERE id=$1 AND teacher_id=$2',[f.assignment_id,req.user.id])).rowCount>0;
 }
 if(!granted)return res.sendStatus(403);
 const body=await loadFile(f.storage_key);res.set('Cache-Control','private,no-store');res.set('X-Content-Type-Options','nosniff');res.set('Content-Disposition',`attachment; filename="${f.filename.replace(/["\\]/g,'_')}"`);res.type(f.mime_type).send(body);
}));
export default r;
