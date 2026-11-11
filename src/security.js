import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {query} from './db.js';
export const hash=async v=>bcrypt.hash(v,12);
export const verify=async(v,h)=>bcrypt.compare(v,h);
export const token=()=>crypto.randomBytes(32).toString('hex');
export const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
export const escape=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export async function loadUser(req,res,next){try{const t=req.cookies?.sid;if(t){const r=await query('SELECT u.id,u.full_name,COALESCE(s.active_role,u.role) role,u.role primary_role,s.mfa_verified,u.active,s.id session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[digest(t)]);req.user=r.rows[0]||null;}next();}catch(nextErr){next(nextErr);}}
export function auth(req,res,next){if(!req.user)return res.redirect('/login');if(['super_admin','admin','headteacher','bursar'].some(role=>role===req.user.role||role===req.user.primary_role)&&!req.user.mfa_verified)return res.redirect('/mfa');next();}
export function permit(...roles){return(req,res,next)=>req.user&&roles.includes(req.user.role)?next():res.status(403).send('Access denied');}
export async function startSession(res,userId){const t=token();await query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[userId,digest(t)]);res.cookie('sid',t,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:86400000});}
export function csrf(req,res,next){if(['GET','HEAD','OPTIONS'].includes(req.method))return next();const cookie=req.cookies?.csrf;const field=req.body?._csrf||req.get('x-csrf-token');if(!cookie||!field||cookie!==field)return res.status(403).send('Invalid security token. Reload and retry.');next();}
export function csrfField(req,res,next){let t=req.cookies?.csrf;if(!t){t=token();res.cookie('csrf',t,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production'});}res.locals.csrf=t;next();}

export async function availableRoles(userId){const rows=await query('SELECT r.name FROM user_role_memberships ur JOIN school_roles r ON r.id=ur.role_id WHERE ur.user_id=$1 ORDER BY r.name',[userId]);return rows.rows.map(r=>r.name);}
