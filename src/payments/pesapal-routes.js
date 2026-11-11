import {Router} from 'express';
import crypto from 'node:crypto';
import {query,transaction} from '../db.js';
import {auth,permit,escape} from '../security.js';
import {submitOrder,transactionStatus,pesapalConfigured,verifiedPayment} from './pesapal-client.js';
import {config} from '../config.js';
const router=Router();
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const isMoney=v=>/^\d+(?:\.\d{1,2})?$/.test(String(v))&&Number(v)>0&&Number(v)<=1000000;
const form=(csrf,students)=>`<h1>Pay School Fees via Pesapal</h1><p>Payments are credited only after confirmation from Pesapal.</p><form method="post" action="/payments/pesapal/start"><input type="hidden" name="_csrf" value="${escape(csrf)}"><label>Learner<select name="student_id" required>${students.map(s=>`<option value="${s.id}">${escape(s.first_name+' '+s.last_name+' — '+s.admission_number)}</option>`).join('')}</select></label><label>Amount (KES)<input type="number" name="amount" min="1" max="1000000" step="0.01" required></label><button type="submit">Continue to secure payment</button></form>`;
router.get('/payments/pesapal',auth,permit('parent','super_admin','admin','bursar'),safe(async(req,res)=>{
 const rows=(await query(req.user.role==='parent'?`SELECT DISTINCT s.id,s.first_name,s.last_name,s.admission_number FROM students s JOIN student_guardians sg ON sg.student_id=s.id JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE ga.user_id=$1 ORDER BY s.first_name`:`SELECT id,first_name,last_name,admission_number FROM students ORDER BY first_name LIMIT 300`,req.user.role==='parent'?[req.user.id]:[])).rows;
 res.locals.render('Pay Fees',form(res.locals.csrf,rows));
}));
router.post('/payments/pesapal/start',auth,permit('parent','super_admin','admin','bursar'),safe(async(req,res)=>{
 if(!pesapalConfigured())return res.status(503).send('Online payments are not yet configured.');
 const {student_id,amount}=req.body;if(!/^\d+$/.test(String(student_id))||!isMoney(amount))return res.sendStatus(400);
 const student=(await query(req.user.role==='parent'?`SELECT s.id,s.first_name,s.last_name,g.email,g.phone FROM students s JOIN student_guardians sg ON sg.student_id=s.id JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id JOIN guardians g ON g.id=sg.guardian_id WHERE s.id=$1 AND ga.user_id=$2 LIMIT 1`:`SELECT s.id,s.first_name,s.last_name,g.email,g.phone FROM students s LEFT JOIN guardians g ON g.id=s.guardian_id WHERE s.id=$1 LIMIT 1`,req.user.role==='parent'?[student_id,req.user.id]:[student_id])).rows[0];
 if(!student)return res.sendStatus(403);
 const reference='WCS-'+crypto.randomUUID();
 await query('INSERT INTO pesapal_orders(merchant_reference,student_id,initiated_by,amount) VALUES($1,$2,$3,$4)',[reference,student.id,req.user.id,amount]);
 try{
  const result=await submitOrder({id:reference,currency:'KES',amount:Number(amount),description:'Wakilisha Comprehensive School fees',callback_url:config.base+'/payments/pesapal/callback',notification_id:process.env.PESAPAL_IPN_ID,billing_address:{email_address:student.email||config.email,phone_number:student.phone||'',first_name:student.first_name,last_name:student.last_name,country_code:'KE'}});
  await query("UPDATE pesapal_orders SET order_tracking_id=$1,status='pending',updated_at=now() WHERE merchant_reference=$2",[result.order_tracking_id,reference]);
  res.redirect(303,result.redirect_url);
 }catch(err){await query("UPDATE pesapal_orders SET status='failed',updated_at=now() WHERE merchant_reference=$1",[reference]);throw err;}
}));
// Callback and IPN are NOT proof of payment. Always verify via authenticated status lookup.
export async function reconcilePesapal(reference,trackingId){
 const order=(await query('SELECT * FROM pesapal_orders WHERE merchant_reference=$1',[reference])).rows[0];
 if(!order||!trackingId||order.order_tracking_id!==trackingId)return {status:'not_found'};
 const status=await transactionStatus(trackingId);
 return transaction(async client=>{
  const locked=(await client.query('SELECT * FROM pesapal_orders WHERE id=$1 FOR UPDATE',[order.id])).rows[0];
  const valid=verifiedPayment(status,locked);
  // A later provider reversal must reverse the ledger payment, never erase it.
  const reported=String(status.payment_status_description||'').toUpperCase();
  const matches=String(status.merchant_reference)===String(locked.merchant_reference)&&String(status.currency).toUpperCase()==='KES'&&Number(status.amount)===Number(locked.amount);
  if(reported==='REVERSED' && matches){
   const existing=(await client.query('SELECT id,amount FROM payments WHERE reference=$1',[locked.merchant_reference])).rows[0];
   if(existing)await client.query(`INSERT INTO payment_reversals(payment_id,amount,reason,source) VALUES($1,$2,$3,'pesapal') ON CONFLICT(payment_id) DO NOTHING`,[existing.id,existing.amount,'Provider reported reversed transaction']);
   await client.query("UPDATE pesapal_orders SET status='reversed',provider_status=$1,updated_at=now() WHERE id=$2",[JSON.stringify(status),locked.id]);
   return {status:'reversed'};
  }
  if(locked.status==='reversed')return {status:'reversed'};
  if(locked.status==='completed'){
   if(reported!=='COMPLETED'||!valid)await client.query("UPDATE pesapal_orders SET status='review',provider_status=$1,updated_at=now() WHERE id=$2",[JSON.stringify(status),locked.id]);
   return {status:reported==='COMPLETED'&&valid?'completed':'review'};
  }
  if(valid){
   // Unique merchant reference and row lock prevent callback/IPN double-credit.
   const payment=await client.query("INSERT INTO payments(student_id,amount,method,reference,recorded_by) VALUES($1,$2,'pesapal',$3,NULL) ON CONFLICT(reference) DO NOTHING RETURNING id",[locked.student_id,locked.amount,locked.merchant_reference]);
   await client.query("UPDATE pesapal_orders SET status='completed',provider_confirmation=$1,provider_status=$2,completed_at=now(),updated_at=now() WHERE id=$3",[status.confirmation_code,JSON.stringify(status),locked.id]);
   if(payment.rowCount){
    const g=(await client.query(`SELECT g.email FROM students s JOIN guardians g ON g.id=s.guardian_id WHERE s.id=$1`,[locked.student_id])).rows[0];
    if(g?.email)await client.query('INSERT INTO email_outbox(recipient,subject,body) VALUES($1,$2,$3)',[g.email,'Wakilisha School - Payment Confirmed',`Your school fee payment of KSh ${locked.amount} was confirmed by Pesapal. Receipt reference: ${locked.merchant_reference}. Thank you.`]);
   }

   await client.query('INSERT INTO audit_logs(action,entity,entity_id,details) VALUES($1,$2,$3,$4)',['pesapal_verified','payment',String(payment.rows[0]?.id||locked.id),JSON.stringify({merchant_reference:reference,tracking_id:trackingId})]);
   return {status:'completed'};
  }
  const next=reported==='FAILED'||reported==='INVALID'?'failed':reported==='REVERSED'?'reversed':reported==='COMPLETED'?'review':'pending';
  await client.query('UPDATE pesapal_orders SET status=$1,provider_status=$2,updated_at=now() WHERE id=$3',[next,JSON.stringify(status),locked.id]);
  return {status:next};
 });
}
const params=req=>({reference:req.query.OrderMerchantReference||req.body?.OrderMerchantReference,tracking:req.query.OrderTrackingId||req.body?.OrderTrackingId});
router.get('/payments/pesapal/callback',safe(async(req,res)=>{
 const {reference,tracking}=params(req);const order=(await query('SELECT initiated_by FROM pesapal_orders WHERE merchant_reference=$1',[reference||''])).rows[0];if(!req.user||(!['super_admin','admin','bursar'].includes(req.user.role)&&String(order?.initiated_by)!==String(req.user.id)))return res.status(403).send('Sign in to view your payment status');const outcome=await reconcilePesapal(reference,tracking);
 res.locals.render('Payment Status',`<h1>Payment ${escape(outcome.status.replaceAll('_',' '))}</h1><p>Reference: ${escape(reference||'')}</p><p>If pending, contact the bursar with your payment reference. Do not pay again before checking.</p><a href="/dashboard">Back to dashboard</a>`);
}));
export const pesapalIPN=Router();
const ipn=safe(async(req,res)=>{
 const {reference,tracking}=params(req);
 if(!reference||!tracking)return res.status(400).json({status:400});
 const outcome=await reconcilePesapal(reference,tracking);
 if(outcome.status==='not_found')return res.status(404).json({status:404});
 res.json({orderNotificationType:'IPNCHANGE',orderTrackingId:tracking,orderMerchantReference:reference,status:200});
});
pesapalIPN.post('/payments/pesapal/ipn',ipn);
pesapalIPN.get('/payments/pesapal/ipn',ipn);
export default router;
