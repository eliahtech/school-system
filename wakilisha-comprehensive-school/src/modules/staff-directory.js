import {Router} from 'express';
import {query} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {input,form,table} from '../ui.js';
import {sanitizePublicUrl} from './rules.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
r.get('/our-team',safe(async(req,res)=>{
 const rows=(await query(`SELECT u.full_name,s.department,s.duty,sp.biography,sp.photo_url FROM staff_public_profiles sp JOIN staff s ON s.id=sp.staff_id JOIN users u ON u.id=s.user_id WHERE sp.published=true ORDER BY s.department,u.full_name`)).rows;
 res.locals.render('Teachers and Departments',`<h1>Our Teachers & Departments</h1><p>Meet members of our school team and their public duties.</p><div class="grid">${rows.map(x=>`<article class="card">${x.photo_url?`<img src="${e(x.photo_url)}" alt="Staff profile photograph" loading="lazy" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px">`:''}<h3>${e(x.full_name)}</h3><p><strong>${e(x.department||'School staff')}</strong></p><p>${e(x.duty||'')}</p><p>${e(x.biography)}</p></article>`).join('')||'<p>Staff profiles will be published by the school administration.</p>'}</div>`);
}));
r.get('/staff/directory',auth,permit('super_admin','admin'),safe(async(req,res)=>{
 const rows=(await query(`SELECT s.id,u.full_name,s.department,s.duty,COALESCE(sp.published,false) published FROM staff s JOIN users u ON u.id=s.user_id LEFT JOIN staff_public_profiles sp ON sp.staff_id=s.id ORDER BY u.full_name`)).rows;
 res.locals.render('Staff Public Directory',`<h1>Public Staff Directory</h1><p>Only approved public names, departments and school duties are shown. Private email and phone information are not displayed.</p><div class="formbox">${form('/staff/directory',input('Staff ID','staff_id','number','',true)+input('Public biography','biography','text')+input('Public photo URL (HTTPS)','photo_url','url')+'<label><input type="checkbox" name="published" value="1"> Approve for public listing</label>',res.locals.csrf,'Save public profile')}</div>${table(['Staff ID','Name','Department','School duty','Published'],rows.map(x=>[e(x.id),e(x.full_name),e(x.department||''),e(x.duty||''),e(x.published?'Yes':'No')]))}`);
}));
r.post('/staff/directory',auth,permit('super_admin','admin'),safe(async(req,res)=>{
 const {staff_id,biography,photo_url,published}=req.body;if(!/^\d+$/.test(String(staff_id))||String(biography||'').length>1000)return res.sendStatus(400);
 let url;try{url=sanitizePublicUrl(photo_url);}catch{return res.sendStatus(400);}
 await query(`INSERT INTO staff_public_profiles(staff_id,biography,photo_url,published,approved_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(staff_id) DO UPDATE SET biography=EXCLUDED.biography,photo_url=EXCLUDED.photo_url,published=EXCLUDED.published,approved_by=EXCLUDED.approved_by,updated_at=now()`,[staff_id,biography||'',url,!!published,req.user.id]);
 await query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[req.user.id,'publish_staff_profile','staff',staff_id]);res.redirect('/staff/directory');
}));
r.get('/staff/duties',auth,permit('super_admin','admin','headteacher'),safe(async(req,res)=>{
 const rows=(await query('SELECT d.*,u.full_name FROM staff_duties d JOIN staff s ON s.id=d.staff_id JOIN users u ON u.id=s.user_id ORDER BY d.starts_on DESC LIMIT 150')).rows;
 res.locals.render('Staff School Duties',`<h1>Teacher and Staff Duties</h1><p>Examples: Games Teacher, Club Patron, Examination Coordinator and Class Teacher.</p><div class="formbox">${form('/staff/duties',input('Staff ID','staff_id','number','',true)+input('Duty / Responsibility','title','text','',true)+input('Start date','starts_on','date',new Date().toISOString().slice(0,10),true)+input('End date (optional)','ends_on','date'),res.locals.csrf,'Assign duty')}</div>${table(['Staff','Duty','From','To'],rows.map(x=>[e(x.full_name),e(x.title),e(x.starts_on),e(x.ends_on||'Ongoing')]))}`);
}));
r.post('/staff/duties',auth,permit('super_admin','admin','headteacher'),safe(async(req,res)=>{
 const {staff_id,title,starts_on,ends_on}=req.body;
 if(!/^\d+$/.test(String(staff_id))||!title?.trim()||title.length>150||!/^\d{4}-\d{2}-\d{2}$/.test(starts_on||'')||(ends_on&&!/^\d{4}-\d{2}-\d{2}$/.test(ends_on)))return res.sendStatus(400);
 await query('INSERT INTO staff_duties(staff_id,title,starts_on,ends_on) VALUES($1,$2,$3,$4)',[staff_id,title.trim(),starts_on,ends_on||null]);await query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[req.user.id,'assign_duty','staff',staff_id]);res.redirect('/staff/duties');
}));
export default r;
