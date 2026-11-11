import test from 'node:test';
import assert from 'node:assert/strict';
import {pesapalBase,verifiedPayment,apiRequest} from '../src/payments/pesapal-client.js';
test('sandbox and live endpoints are fixed',()=>{assert.match(pesapalBase('sandbox'),/cybqa/);assert.match(pesapalBase('live'),/pay.pesapal.com/);assert.throws(()=>pesapalBase('malicious'));});
test('completed payment requires matching reference, currency, amount and confirmation',()=>{
 const expected={reference:'WCS-abc',amount:'1500.00'};
 const valid={payment_status_description:'COMPLETED',merchant_reference:'WCS-abc',amount:1500,currency:'KES',confirmation_code:'ABC123'};
 assert.equal(verifiedPayment(valid,expected),true);
 for(const change of [{amount:1501},{currency:'USD'},{merchant_reference:'wrong'},{payment_status_description:'PENDING'},{confirmation_code:''}])assert.equal(verifiedPayment({...valid,...change},expected),false);
});
test('API handles unsuccessful responses without leaking credentials',async()=>{
 await assert.rejects(apiRequest('/api/test',{fetcher:async()=>({ok:false,status:401,json:async()=>({error:{code:'bad',message:'secret'}})})}),/401/);
});
