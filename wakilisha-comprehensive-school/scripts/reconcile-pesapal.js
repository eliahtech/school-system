import 'dotenv/config';
import {pool,query} from '../src/db.js';
import {reconcilePesapal} from '../src/payments/pesapal-routes.js';
import {pesapalConfigured} from '../src/payments/pesapal-client.js';
if(!pesapalConfigured()){console.error('Pesapal credentials/IPN ID not configured.');process.exit(2);}
let completed=0,failed=0;
try{
 // Review pending and recently completed orders for provider-reported reversals.
 const orders=(await query(`SELECT merchant_reference,order_tracking_id FROM pesapal_orders WHERE order_tracking_id IS NOT NULL AND ((status IN ('pending','created','review') AND created_at>now()-interval '30 days') OR (status='completed' AND completed_at>now()-interval '30 days')) ORDER BY created_at DESC LIMIT 80`)).rows;
 for(const o of orders){try{const result=await reconcilePesapal(o.merchant_reference,o.order_tracking_id);console.log(o.merchant_reference, result.status);completed++;}catch(err){failed++;console.error(`Could not reconcile ${o.merchant_reference}: ${err.message}`);}}
 console.log(`Reconciled ${completed} provider orders; failures ${failed}.`);
 if(failed)process.exitCode=1;
}finally{await pool.end();}
