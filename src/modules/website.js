import {Router} from 'express';
import {query} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {form,input,table} from '../ui.js';
import {sanitizePublicUrl} from './rules.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const allowedSettings=['school_motto','mission','vision','history','contact_address','contact_phone','contact_email','homepage_intro','admissions_notice','reporting_time_note'];
r.get('/website/settings',auth,permit('super_admin'),safe(async(req,res)=>{
 const rows=(await query('SELECT * FROM public_settings ORDER BY key')).rows;
 res.locals.render('Public Website Settings',`<h1>Public Website Settings</h1><p>Super Administrator controls the core pages and branding. News and gallery can be delegated.</p><div class="formbox">${form('/website/settings',`<label>Setting<select name="key">${allowedSettings.map(k=>`<option value="${e(k)}">${e(k.replaceAll('_',' '))}</option>`).join('')}</select></label><label>Text<textarea name="value" required maxlength="5000"></textarea></label>`,res.locals.csrf,'Save setting')}</div>${table(['Setting','Value','Modified'],rows.map(x=>[e(x.key),e(x.value.slice(0,250)),e(new Date(x.updated_at).toLocaleDateString('en-KE'))]))}`);
}));
r.post('/website/settings',auth,permit('super_admin'),safe(async(req,res)=>{
 const {key,value}=req.body;if(!allowedSettings.includes(key)||!value?.trim()||value.length>5000)return res.sendStatus(400);
 await query(`INSERT INTO public_settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`,[key,value.trim(),req.user.id]);
 await query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[req.user.id,'website_setting','public_settings',key]);res.redirect('/website/settings');
}));
r.get('/gallery-consent',auth,permit('super_admin','admin'),(req,res)=>res.locals.render('Gallery Consent',`<h1>Learner Photo Consent</h1><p>Do not publish identifiable learner photos without verifiable guardian authorization. Withdrawal of consent requires taking down published images.</p><div class="formbox">${form('/gallery-consent',input('Student admission number','admission_number','text','',true)+input('Guardian registered email','guardian_email','email','',true)+'<label><input type="checkbox" name="consented" value="1"> Written/photo consent has been verified by the school</label>',res.locals.csrf,'Record consent or withdrawal')}</div>`));
r.post('/gallery-consent',auth,permit('super_admin','admin'),safe(async(req,res)=>{
 const {admission_number,guardian_email,consented}=req.body;
 const linked=(await query(`SELECT s.id student_id,g.id guardian_id FROM students s JOIN student_guardians sg ON sg.student_id=s.id JOIN guardians g ON g.id=sg.guardian_id WHERE s.admission_number=$1 AND lower(g.email)=lower($2)`,[admission_number?.trim(),guardian_email?.trim()])).rows[0];if(!linked)return res.sendStatus(404);
 await query(`INSERT INTO gallery_consents(student_id,guardian_id,scope,consented,recorded_by) VALUES($1,$2,'public_gallery',$3,$4) ON CONFLICT(student_id,guardian_id,scope) DO UPDATE SET consented=EXCLUDED.consented,recorded_by=EXCLUDED.recorded_by,updated_at=now()`,[linked.student_id,linked.guardian_id,!!consented,req.user.id]);
 await query('INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user.id,'consent_change','student',linked.student_id,JSON.stringify({consented:!!consented})]);
 res.locals.render('Consent recorded',`<h1>Consent ${consented?'verified':'withdrawn'}</h1><p>${!consented?'Review and unpublish any previously posted images featuring this learner.':'Only publish images after checking consent for every identifiable learner.'}</p>`);
}));
export default r;
