// Pesapal API 3.0: no secret values are ever sent to the browser.
const BASES={sandbox:'https://cybqa.pesapal.com/pesapalv3',live:'https://pay.pesapal.com/v3'};
export const pesapalBase=(env=process.env.PESAPAL_ENV||'sandbox')=>{if(!BASES[env])throw Error('Invalid PESAPAL_ENV');return BASES[env]};
export const pesapalConfigured=()=>Boolean(process.env.PESAPAL_CONSUMER_KEY&&process.env.PESAPAL_CONSUMER_SECRET&&process.env.PESAPAL_IPN_ID);
export async function apiRequest(path,{method='GET',body,token,fetcher=fetch}={}){
 const headers={'Accept':'application/json','Content-Type':'application/json'};
 if(token)headers.Authorization=`Bearer ${token}`;
 const response=await fetcher(pesapalBase()+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>{throw Error('Invalid response from payment provider')});
 if(!response.ok||data.error?.code)throw Error(`Pesapal request failed (${response.status})`);
 return data;
}
export async function accessToken(opts={}){
 if(!process.env.PESAPAL_CONSUMER_KEY||!process.env.PESAPAL_CONSUMER_SECRET)throw Error('Pesapal credentials not configured');
 const result=await apiRequest('/api/Auth/RequestToken',{method:'POST',body:{consumer_key:process.env.PESAPAL_CONSUMER_KEY,consumer_secret:process.env.PESAPAL_CONSUMER_SECRET},...opts});
 if(!result.token)throw Error('Pesapal did not provide a token');return result.token;
}
export async function registerIPN(url,opts={}){const token=await accessToken(opts);return apiRequest('/api/URLSetup/RegisterIPN',{method:'POST',token,body:{url,ipn_notification_type:'POST'},...opts});}
export async function submitOrder(order,opts={}){const token=await accessToken(opts);const result=await apiRequest('/api/Transactions/SubmitOrderRequest',{method:'POST',token,body:order,...opts});if(!result.redirect_url||!result.order_tracking_id)throw Error('Incomplete Pesapal checkout response');const redirect=new URL(result.redirect_url);if(redirect.protocol!=='https:'||!(redirect.hostname==='pesapal.com'||redirect.hostname.endsWith('.pesapal.com')))throw Error('Unexpected payment redirect domain');return result;}
export async function transactionStatus(trackingId,opts={}){if(!/^[a-zA-Z0-9-]{8,100}$/.test(trackingId))throw Error('Invalid tracking ID');const token=await accessToken(opts);return apiRequest('/api/Transactions/GetTransactionStatus?orderTrackingId='+encodeURIComponent(trackingId),{token,...opts});}
export function verifiedPayment(status,expected){return String(status.payment_status_description).toUpperCase()==='COMPLETED'&&String(status.merchant_reference)===String(expected.reference)&&String(status.currency).toUpperCase()==='KES'&&Number(status.amount)===Number(expected.amount)&&Boolean(status.confirmation_code)}
