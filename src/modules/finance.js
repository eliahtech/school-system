import {Router} from 'express';
import {query,transaction} from '../db.js';
import {auth,permit,escape as e} from '../security.js';
import {input,form,table} from '../ui.js';
import {cents,moneyString,validYear,validTerm} from './rules.js';
const r=Router(),safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const staff=['super_admin','admin','bursar'];const audit=(actor,action,id,details={})=>query('INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[actor,action,'finance',String(id),JSON.stringify(details)]);
const amount=v=>moneyString(cents(String(v),{zero:true}));
async function allowed(user,studentId){if(staff.includes(user.role))return true;if(user.role==='student')return (await query('SELECT 1 FROM students WHERE id=$1 AND user_id=$2',[studentId,user.id])).rowCount>0;if(user.role==='parent')return (await query('SELECT 1 FROM student_guardians sg JOIN guardian_accounts ga ON ga.guardian_id=sg.guardian_id WHERE sg.student_id=$1 AND ga.user_id=$2',[studentId,user.id])).rowCount>0;return false;}
r.get('/finance/overview',auth,permit(...staff),safe(async(req,res)=>{
 const totals=(await query(`SELECT CASE WHEN s.status='active' THEN 'Active' ELSE 'Inactive' END AS group_name,s.status,
 COALESCE(sum(c.total),0) charges,COALESCE(sum(a.total),0) adjustments,COALESCE(sum(p.total),0) paid,
 COALESCE(sum(c.total),0)+COALESCE(sum(a.total),0)-COALESCE(sum(p.total),0) balance
 FROM students s LEFT JOIN (SELECT student_id,SUM(amount) total FROM fee_charges GROUP BY student_id)c ON c.student_id=s.id
 LEFT JOIN (SELECT student_id,SUM(amount) total FROM fee_adjustments GROUP BY student_id)a ON a.student_id=s.id
 LEFT JOIN (SELECT p.student_id,SUM(p.amount-COALESCE(pr.amount,0)) total FROM payments p LEFT JOIN payment_reversals pr ON pr.payment_id=p.id GROUP BY p.student_id)p ON p.student_id=s.id
 GROUP BY group_name,s.status ORDER BY group_name,s.status`)).rows;
 const rows=totals.map(x=>[e(x.group_name),e(x.status),e(x.charges),e(x.adjustments),e(x.paid),e(x.balance)]);
 res.locals.render('Financial Overview',`<h1>School Financial Overview</h1><p>All students included; no first-200-row limit. Credits may display as negative balances.</p>${table(['Category','Student status','Charges','Adjustments','Payments','Net balance (KES)'],rows)}<p><a class="btn" href="/finance/structures">Fee structures</a> <a class="btn" href="/finance/payments/new">Record payment</a> <a class="btn" href="/finance/adjust">Authorized adjustment</a></p>`);
}));
r.get('/finance/statement/:student',auth,safe(async(req,res)=>{
 const s=(await query('SELECT id,first_name,last_name,admission_number,grade,status FROM students WHERE id=$1',[req.params.student])).rows[0];if(!s)return res.sendStatus(404);if(!(await allowed(req.user,s.id)))return res.sendStatus(403);
 const [charges,payments,adjustments]=(await Promise.all([
  query('SELECT academic_year,term,item,amount FROM fee_charges WHERE student_id=$1 ORDER BY academic_year,term,id',[s.id]),
  query('SELECT p.id,p.amount,p.method,p.reference,p.created_at,pr.amount reversal_amount FROM payments p LEFT JOIN payment_reversals pr ON pr.payment_id=p.id WHERE p.student_id=$1 ORDER BY p.created_at,p.id',[s.id]),
  query('SELECT amount,reason,created_at FROM fee_adjustments WHERE student_id=$1 ORDER BY created_at',[s.id])
 ])).map(r=>r.rows);
 const decimalSum=items=>items.reduce((acc,x)=>acc+Math.round(Number(x.amount)*100),0);
 const balance=decimalSum(charges)+decimalSum(adjustments)-decimalSum(payments.map(p=>({...p,amount:(Number(p.amount)-Number(p.reversal_amount||0)).toFixed(2)}))); 
 const html=`<h1>Fee Statement</h1><h2>${e(s.first_name)} ${e(s.last_name)}</h2><p>${e(s.admission_number)} · ${e(s.grade)} · ${e(s.status)}</p><h3>Termly charges</h3>${table(['Year','Term','Fee item','KES'],charges.map(x=>[e(x.academic_year),e(x.term),e(x.item),e(x.amount)]))}<h3>Payments</h3>${table(['Date','Method','Reference','KES','Receipt'],payments.map(x=>[e(new Date(x.created_at).toLocaleDateString('en-KE')),e(x.method),e(x.reference),e(x.amount),`<a href="/finance/receipt/${x.id}">Receipt</a>`]))}<h3>Adjustments</h3>${table(['Date','Reason','KES'],adjustments.map(x=>[e(new Date(x.created_at).toLocaleDateString('en-KE')),e(x.reason),e(x.amount)]))}<div class="card"><h2>Balance: KSh ${e(moneyString(balance))}</h2><p>${balance<0?'Student account has an advance payment/credit.':'Outstanding amount based on posted charges and confirmed payments.'}</p></div><button data-print>Print / Save PDF</button>`;
 res.set('Cache-Control','private, no-store');res.locals.render('Student Fee Statement',html);
}));
r.get('/finance/receipt/:payment',auth,safe(async(req,res)=>{
 const p=(await query('SELECT p.*,s.first_name,s.last_name,s.admission_number,pr.id reversal_id FROM payments p JOIN students s ON s.id=p.student_id LEFT JOIN payment_reversals pr ON pr.payment_id=p.id WHERE p.id=$1',[req.params.payment])).rows[0];if(!p)return res.sendStatus(404);if(!(await allowed(req.user,p.student_id)))return res.sendStatus(403);
 res.set('Cache-Control','private, no-store');res.locals.render('Official Fee Receipt',`<section class="report"><h1>Wakilisha Comprehensive School</h1><h2>Payment Receipt #${e(p.id)}</h2><p>Receipt reference: ${e(p.reference)}</p><p>Student: ${e(p.first_name)} ${e(p.last_name)} (${e(p.admission_number)})</p><p>Paid: KSh ${e(p.amount)}</p><p>Method: ${e(p.method)}</p>${p.reversal_id?'<p style="color:#a21b1b"><strong>REVERSED - NOT A VALID PAYMENT RECEIPT</strong></p>':''}<p>Recorded: ${e(new Date(p.created_at).toLocaleString('en-KE'))}</p><p>Computer-generated receipt. Verify with school bursar if necessary.</p><button class="no-print" data-print>Print / Save PDF</button></section>`);
}));
r.get('/finance/adjust',auth,permit(...staff),(req,res)=>res.locals.render('Fee Adjustment',`<h1>Authorized Fee Adjustment</h1><p>Positive adjustment adds a charge; negative adjustment reduces amount owed. All adjustments are retained in an audit trail.</p><div class="formbox">${form('/finance/adjust',input('Admission number','admission_number','text','',true)+input('Signed amount KSh (e.g. -1000.00)','amount','text','',true)+input('Reason (required)','reason','text','',true),res.locals.csrf,'Record adjustment')}</div>`));
r.post('/finance/adjust',auth,permit(...staff),safe(async(req,res)=>{
 const {admission_number,amount:raw,reason}=req.body;const amount=Number(raw);
 if(!/^-?(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(String(raw))||!Number.isFinite(amount)||amount===0||!reason?.trim()||reason.length>300)return res.sendStatus(400);
 const s=(await query('SELECT id FROM students WHERE admission_number=$1',[admission_number?.trim()])).rows[0];if(!s)return res.sendStatus(404);
 const rec=await query('INSERT INTO fee_adjustments(student_id,amount,reason,approved_by) VALUES($1,$2,$3,$4) RETURNING id',[s.id,amount.toFixed(2),reason.trim(),req.user.id]);await audit(req.user.id,'post_adjustment',rec.rows[0].id,{student:s.id,amount:amount.toFixed(2),reason});res.redirect('/finance/statement/'+s.id);
}));
r.get('/finance/statement-search',auth,permit(...staff),(req,res)=>res.locals.render('Find Fee Statement',`<h1>Find Student Statement</h1><div class="formbox">${form('/finance/statement-search',input('Student admission number','admission_number','text','',true),res.locals.csrf,'Search')}</div>`));
r.post('/finance/statement-search',auth,permit(...staff),safe(async(req,res)=>{
 const s=(await query('SELECT id FROM students WHERE admission_number=$1',[req.body.admission_number?.trim()])).rows[0];if(!s)return res.sendStatus(404);res.redirect('/finance/statement/'+s.id);
}));
// Apply payments to posted charges, oldest first; the payment itself already exists and is never duplicated.
export async function allocatePayment(client,paymentId){
 const payment=(await client.query('SELECT id,student_id,amount FROM payments WHERE id=$1 FOR UPDATE',[paymentId])).rows[0];if(!payment)throw Error('Payment not found');
 const reversed=(await client.query('SELECT 1 FROM payment_reversals WHERE payment_id=$1',[paymentId])).rowCount>0;if(reversed)throw Error('Cannot allocate a reversed payment');
 const used=(await client.query('SELECT COALESCE(SUM(amount),0) AS amount FROM payment_allocations WHERE payment_id=$1',[paymentId])).rows[0];
 let remaining=Math.round((Number(payment.amount)-Number(used.amount))*100);if(remaining<0)throw Error('Over-allocated payment');
 const charges=(await client.query(`SELECT id,amount FROM fee_charges WHERE student_id=$1 ORDER BY academic_year,term,id FOR UPDATE`,[payment.student_id])).rows;
 for(const charge of charges){if(remaining<=0)break;const used=(await client.query(`SELECT COALESCE(SUM(pa.amount),0) allocated FROM payment_allocations pa LEFT JOIN payment_reversals pr ON pr.payment_id=pa.payment_id WHERE pa.charge_id=$1 AND pr.id IS NULL`,[charge.id])).rows[0];const due=Math.round((Number(charge.amount)-Number(used.allocated))*100);if(due<=0)continue;const v=Math.min(due,remaining);await client.query('INSERT INTO payment_allocations(payment_id,charge_id,amount) VALUES($1,$2,$3) ON CONFLICT(payment_id,charge_id) DO UPDATE SET amount=payment_allocations.amount+EXCLUDED.amount',[payment.id,charge.id,moneyString(v)]);remaining-=v;}
 return remaining;
}
r.post('/finance/reconcile/:payment',auth,permit(...staff),safe(async(req,res)=>{
 const leftover=await transaction(c=>allocatePayment(c,req.params.payment));await audit(req.user.id,'allocate',req.params.payment,{unallocated:moneyString(leftover)});res.redirect('/finance/overview');
}));
r.get('/finance/reverse/:payment',auth,permit('super_admin','bursar'),safe(async(req,res)=>{
 const p=(await query('SELECT * FROM payments WHERE id=$1',[req.params.payment])).rows[0];if(!p)return res.sendStatus(404);
 res.locals.render('Reverse Recorded Payment',`<h1>Reverse Payment</h1><p>Payment reference: ${e(p.reference)}, KSh ${e(p.amount)}. This action creates an immutable reversal entry. Do not use this to reverse Pesapal transactions; use provider-confirmed refunds/reversals.</p><div class="formbox">${form('/finance/reverse/'+p.id,input('Reversal reason','reason','text','',true),res.locals.csrf,'Record reversal')}</div>`);
}));
r.post('/finance/reverse/:payment',auth,permit('super_admin','bursar'),safe(async(req,res)=>{
 const reason=String(req.body.reason||'').trim();if(!reason||reason.length>300)return res.sendStatus(400);
 const info=await transaction(async c=>{
  const p=(await c.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[req.params.payment])).rows[0];if(!p)return null;
  if(p.method==='pesapal')return {error:'Provider-originated payments require provider-confirmed reversal.'};
  const r=await c.query(`INSERT INTO payment_reversals(payment_id,amount,reason,source,recorded_by) VALUES($1,$2,$3,'manual',$4) ON CONFLICT(payment_id) DO NOTHING RETURNING id`,[p.id,p.amount,reason,req.user.id]);
  return {student:p.student_id,created:r.rowCount>0,id:r.rows[0]?.id};
 });if(!info)return res.sendStatus(404);if(info.error)return res.status(403).send(info.error);if(!info.created)return res.status(409).send('Payment already reversed');await audit(req.user.id,'reverse',info.id,{reason});res.redirect('/finance/statement/'+info.student);
}));
export default r;
