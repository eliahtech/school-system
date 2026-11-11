import {Router} from 'express';
import {query,transaction} from '../db.js';
import {auth,permit,escape as e,hash,token,digest,startSession,availableRoles} from '../security.js';
import {form,input,table} from '../ui.js';
import {config} from '../config.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const admins=['super_admin','admin'];
const audit=(user,action,entity,id)=>query('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[user,action,entity,String(id)]);
async function issueInvitation(client,userId,email){
 const plain=token();
 await client.query(`UPDATE account_invitations SET expires_at=now() WHERE user_id=$1 AND accepted_at IS NULL`,[userId]);
 await client.query(`INSERT INTO account_invitations(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '48 hours')`,[userId,digest(plain)]);
 await client.query('INSERT INTO email_outbox(recipient,subject,body) VALUES($1,$2,$3)',[email,'Activate your Wakilisha school account',`Welcome to Wakilisha Comprehensive School. Activate your account using this one-time link within 48 hours:\n${config.base}/activate/${plain}\nIf you did not expect this invitation, contact the school.`]);
 return true;
}
export {issueInvitation};
r.get('/activate/:token',safe(async(req,res)=>{
 if(!/^[0-9a-f]{64}$/.test(req.params.token))return res.sendStatus(404);
 const i=(await query(`SELECT i.id,u.full_name,u.role FROM account_invitations i JOIN users u ON u.id=i.user_id WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.expires_at>now() AND u.active=true`,[digest(req.params.token)])).rows[0];
 if(!i)return res.status(410).send('Invitation expired or already used. Request a new invitation from the school.');
 res.set('Cache-Control','no-store');res.locals.render('Activate Account',`<h1>Welcome, ${e(i.full_name)}</h1><p>Set a secure ${i.role==='student'?'student PIN or password':'password'} for your Wakilisha account.</p><div class="formbox">${form('/activate/'+req.params.token,input('Password / PIN (at least 10 characters)','password','password','',true)+input('Confirm password / PIN','confirm','password','',true),res.locals.csrf,'Activate account')}</div>`);
}));
r.post('/activate/:token',safe(async(req,res)=>{
 if(!/^[0-9a-f]{64}$/.test(req.params.token))return res.sendStatus(404);
 const pwd=req.body.password||'';if(pwd.length<10||pwd.length>128||pwd!==req.body.confirm)return res.status(400).send('Passwords must match and contain at least 10 characters.');
 const id=await transaction(async c=>{
  const i=(await c.query(`SELECT i.*,u.active FROM account_invitations i JOIN users u ON u.id=i.user_id WHERE token_hash=$1 FOR UPDATE OF i`,[digest(req.params.token)])).rows[0];
  if(!i||i.accepted_at||new Date(i.expires_at)<new Date()||!i.active)return null;
  await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await hash(pwd),i.user_id]);
  await c.query('UPDATE account_invitations SET accepted_at=now() WHERE id=$1',[i.id]);return i.user_id;
 });if(!id)return res.status(410).send('Invitation invalid or expired.');await startSession(res,id);res.redirect('/dashboard');
}));
r.get('/accounts/invite',auth,permit(...admins),safe(async(req,res)=>{
 res.locals.render('Invite School Account',`<h1>Account Invitations</h1><p>School-issued links are used to set passwords. Permanent passwords are never emailed.</p><div class="formbox">${form('/accounts/invite',input('Existing account email','email','email','',true),res.locals.csrf,'Send new activation link')}</div>`);
}));
r.post('/accounts/invite',auth,permit(...admins),safe(async(req,res)=>{
 const address=String(req.body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))return res.sendStatus(400);
 const user=(await query('SELECT id FROM users WHERE lower(email)=$1 AND active=true',[address])).rows[0];if(!user)return res.sendStatus(404);
 await transaction(c=>issueInvitation(c,user.id,address));await audit(req.user.id,'invite','user',user.id);res.locals.render('Invitation Queued','<h1>Invitation created</h1><p>The notification is queued. It will be delivered when the school email worker is configured and running.</p>');
}));
r.get('/accounts/students/new',auth,permit(...admins),(req,res)=>res.locals.render('Student Account Setup',`<h1>Activate a Student Portal</h1><p>A student signs in using first name, admission number and a secure secret. Setup link is sent to the registered guardian.</p><div class="formbox">${form('/accounts/students',input('Student admission number','admission_number','text','',true),res.locals.csrf,'Create student login and invite guardian')}</div>`));
r.post('/accounts/students',auth,permit(...admins),safe(async(req,res)=>{
 const admission=String(req.body.admission_number||'').trim();if(!admission)return res.sendStatus(400);
 const result=await transaction(async c=>{
  const s=(await c.query(`SELECT s.id,s.first_name,s.last_name,s.user_id,g.email FROM students s JOIN guardians g ON g.id=s.guardian_id WHERE s.admission_number=$1 FOR UPDATE OF s`,[admission])).rows[0];if(!s)return null;
  if(!s.email)return {error:'A guardian email is required for secure activation.'};
  let id=s.user_id;
  if(!id){const u=await c.query(`INSERT INTO users(full_name,email,role,password_hash) VALUES($1,NULL,'student',$2) RETURNING id`,[`${s.first_name} ${s.last_name}`,await hash(token())]);id=u.rows[0].id;await c.query('UPDATE students SET user_id=$1 WHERE id=$2',[id,s.id]);}
  await issueInvitation(c,id,s.email);return {id};
 });if(!result)return res.sendStatus(404);if(result.error)return res.status(400).send(e(result.error));await audit(req.user.id,'activate_student','student',result.id);res.locals.render('Student Account','<h1>Student portal invitation queued</h1><p>The guardian will receive a secure activation link when the mail worker sends it.</p>');
}));
r.get('/accounts/parents/new',auth,permit(...admins),(req,res)=>res.locals.render('Guardian Portal Setup',`<h1>Guardian Account Invitation</h1><p>Find a guardian by linked learner. Accounts can see only their connected children.</p><div class="formbox">${form('/accounts/parents',input('Student admission number','admission_number','text','',true),res.locals.csrf,'Invite guardian')}</div>`));
r.post('/accounts/parents',auth,permit(...admins),safe(async(req,res)=>{
 const admission=String(req.body.admission_number||'').trim();if(!admission)return res.sendStatus(400);
 const result=await transaction(async c=>{
  const sg=(await c.query(`SELECT g.* FROM students s JOIN student_guardians sg ON sg.student_id=s.id JOIN guardians g ON g.id=sg.guardian_id WHERE s.admission_number=$1 ORDER BY g.id LIMIT 1`,[admission])).rows[0];if(!sg)return null;
  if(!sg.email)return {error:'Guardian email is required.'};
  const email=sg.email.trim().toLowerCase();let u=(await c.query('SELECT id FROM users WHERE lower(email)=$1',[email])).rows[0];
  if(!u){u=(await c.query(`INSERT INTO users(full_name,email,role,password_hash) VALUES($1,$2,'parent',$3) RETURNING id`,[sg.full_name,email,await hash(token())])).rows[0];}
  await c.query('INSERT INTO guardian_accounts(guardian_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[sg.id,u.id]);
  await c.query(`INSERT INTO user_role_memberships(user_id,role_id) SELECT $1,id FROM school_roles WHERE name='parent' ON CONFLICT DO NOTHING`,[u.id]);
  await issueInvitation(c,u.id,email);return {id:u.id};
 });if(!result)return res.sendStatus(404);if(result.error)return res.status(400).send(e(result.error));await audit(req.user.id,'invite_parent','user',result.id);res.locals.render('Guardian Invitation','<h1>Guardian invitation queued</h1><p>It will be sent by the configured email worker.</p>');
}));
r.get('/account/roles',auth,safe(async(req,res)=>{
 const roles=await availableRoles(req.user.id);res.locals.render('Switch Account Role',`<h1>Choose your school role</h1><p>Only roles granted by school administration appear below.</p>${roles.map(role=>form('/account/roles',`<input type="hidden" name="role" value="${e(role)}">`,res.locals.csrf,`Switch to ${role.replaceAll('_',' ')}`)).join('')}`);
}));
r.post('/account/roles',auth,safe(async(req,res)=>{
 const roles=await availableRoles(req.user.id);if(!roles.includes(req.body.role))return res.sendStatus(403);
 await query('UPDATE sessions SET active_role=$1 WHERE id=$2 AND user_id=$3',[req.body.role,req.user.session_id,req.user.id]);res.redirect('/dashboard');
}));
export default r;
// Placeholder to keep account route file self-contained.
