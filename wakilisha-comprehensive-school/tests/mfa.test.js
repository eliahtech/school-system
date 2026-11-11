import test from 'node:test';import assert from 'node:assert/strict';
import {toBase32,fromBase32,totp,validTotp,encryptSecret,decryptSecret} from '../src/modules/mfa-rules.js';
test('TOTP implementation matches RFC 6238 SHA-1 reference at 59 seconds',()=>{
 const secret=toBase32(Buffer.from('12345678901234567890','utf8'));
 assert.deepEqual(fromBase32(secret),Buffer.from('12345678901234567890','utf8'));
 assert.equal(totp(secret,59000),'287082');
 assert.equal(validTotp(secret,'287082',59000),true);assert.equal(validTotp(secret,'000000',59000),false);
});
test('AES-256-GCM encrypts MFA secrets and rejects tampering',()=>{
 const key=Buffer.alloc(32,4),secret='JBSWY3DPEHPK3PXP';const crypt=encryptSecret(secret,key);
 assert.notEqual(crypt,secret);assert.equal(decryptSecret(crypt,key),secret);
 const bits=crypt.split('.');bits[2]='00'+bits[2].slice(2);assert.throws(()=>decryptSecret(bits.join('.'),key));
});
