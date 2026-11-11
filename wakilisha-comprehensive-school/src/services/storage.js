import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const localRoot=path.resolve(process.env.STORAGE_DIR||'.uploads');
const storageDriver=()=>process.env.STORAGE_DRIVER||'local';
export function validateUpload(buffer,mime){
 if(!Buffer.isBuffer(buffer)||buffer.length===0||buffer.length>10*1024*1024)throw Error('File must be 1 byte to 10 MB');
 const allowed=['application/pdf','image/jpeg','image/png','image/webp','text/plain'];
 if(!allowed.includes(mime))throw Error('Unsupported file format');
 if(mime==='application/pdf'&&!buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Invalid PDF file');
 if(mime==='image/jpeg'&&!buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))throw Error('Invalid JPEG image');
 if(mime==='image/png'&&!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG image');
 if(mime==='image/webp'&&!(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'))throw Error('Invalid WEBP image');
 if(mime==='text/plain'&&buffer.includes(0))throw Error('Text file contains binary data');
 return true;
}
function supabaseConfig(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bucket=process.env.SUPABASE_PRIVATE_BUCKET||'wakilisha-private';if(!url||!key||!/^[-\w]+$/.test(bucket))throw Error('Supabase private storage configuration missing');return {url:url.replace(/\/$/,''),key,bucket};}
export async function saveFile(key,data,mime){
 if(!/^[0-9a-f-]{36}$/.test(key))throw Error('Unsafe storage key');
 if(storageDriver()==='local'){
  await fs.mkdir(localRoot,{recursive:true,mode:0o700});await fs.writeFile(path.join(localRoot,key),data,{flag:'wx',mode:0o600});return;
 }
 if(storageDriver()==='supabase'){
  const c=supabaseConfig(),endpoint=`${c.url}/storage/v1/object/${c.bucket}/${key}`;
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${c.key}`,apikey:c.key,'Content-Type':mime,'x-upsert':'false'},body:data,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Private storage upload failed: ${response.status}`);return;
 }
 throw Error('Unknown STORAGE_DRIVER');
}
export async function loadFile(key){
 if(!/^[0-9a-f-]{36}$/.test(key))throw Error('Unsafe storage key');
 if(storageDriver()==='local')return fs.readFile(path.join(localRoot,key));
 if(storageDriver()==='supabase'){
  const c=supabaseConfig(),response=await fetch(`${c.url}/storage/v1/object/authenticated/${c.bucket}/${key}`,{headers:{Authorization:`Bearer ${c.key}`,apikey:c.key},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Private storage read failed: ${response.status}`);return Buffer.from(await response.arrayBuffer());
 }
 throw Error('Unknown STORAGE_DRIVER');
}
export async function deleteFile(key){
 if(storageDriver()==='local')return fs.unlink(path.join(localRoot,key)).catch(()=>{});
 if(storageDriver()==='supabase'){
  const c=supabaseConfig();await fetch(`${c.url}/storage/v1/object/${c.bucket}`,{method:'DELETE',headers:{Authorization:`Bearer ${c.key}`,apikey:c.key,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key]})});
 }
}
