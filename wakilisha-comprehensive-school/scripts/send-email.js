import 'dotenv/config';
import nodemailer from 'nodemailer';
import {pool,transaction} from '../src/db.js';
const required=['SMTP_HOST','SMTP_USER','SMTP_PASS','SMTP_FROM'];
for(const k of required)if(!process.env[k]){console.error(`Missing ${k}. No mail has been sent.`);process.exit(2);}
const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT||587)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
let done=0,failed=0;
try{
 await transport.verify();
 await pool.query("UPDATE email_outbox SET status='retry',next_attempt_at=now() WHERE status='sending' AND processing_started_at < now()-interval '15 minutes'");
 for(let i=0;i<40;i++){
  const msg=await transaction(async c=>{
   const x=(await c.query(`SELECT id,recipient,subject,body,attempts FROM email_outbox WHERE status IN ('pending','retry') AND next_attempt_at<=now() AND attempts<6 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
   if(!x)return null;
   await c.query(`UPDATE email_outbox SET status='sending',attempts=attempts+1,processing_started_at=now() WHERE id=$1`,[x.id]);return x;
  });if(!msg)break;
  try{
   const result=await transport.sendMail({from:process.env.SMTP_FROM,to:msg.recipient,subject:msg.subject,text:msg.body});
   await transaction(async c=>{
    await c.query(`UPDATE email_outbox SET status='sent',sent_at=now(),last_error=NULL WHERE id=$1`,[msg.id]);
    await c.query('INSERT INTO email_delivery_logs(outbox_id,delivered_at) VALUES($1,now())',[msg.id]);
    await c.query('INSERT INTO email_outbox_attempts(outbox_id,outcome) VALUES($1,$2)',[msg.id,'accepted_by_smtp']);
   });done++;
  }catch(err){
   const detail=String(err.message||err).slice(0,500),tries=msg.attempts+1;
   await transaction(async c=>{
    await c.query(`UPDATE email_outbox SET status=$1,last_error=$2,next_attempt_at=now()+($3::int * interval '1 minute') WHERE id=$4`,[tries>=6?'failed':'retry',detail,Math.min(120,2**tries),msg.id]);
    await c.query('INSERT INTO email_outbox_attempts(outbox_id,outcome,reason) VALUES($1,$2,$3)',[msg.id,'error',detail]);
   });failed++;
  }
 }
 console.log(`Email queue processed: ${done} accepted by SMTP, ${failed} failed/retry. SMTP accepted is not guaranteed inbox delivery.`);
}finally{await transport.close();await pool.end();}
