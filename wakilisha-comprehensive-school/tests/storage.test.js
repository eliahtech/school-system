import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateUpload,saveFile,loadFile,deleteFile} from '../src/services/storage.js';
import crypto from 'node:crypto';

test('private upload validates common safe file signatures',()=>{
 assert.equal(validateUpload(Buffer.from('%PDF-1.4\n1 0 obj'), 'application/pdf'),true);
 assert.equal(validateUpload(Buffer.from([0xff,0xd8,0xff,0xe0]), 'image/jpeg'),true);
 assert.equal(validateUpload(Buffer.from([137,80,78,71,13,10,26,10]), 'image/png'),true);
 assert.equal(validateUpload(Buffer.from('Hello school'), 'text/plain'),true);
});
test('private upload rejects executable, forged, binary and oversize files',()=>{
 assert.throws(()=>validateUpload(Buffer.from('this is not pdf'),'application/pdf'),/Invalid PDF/);
 assert.throws(()=>validateUpload(Buffer.from('not an image'),'image/jpeg'),/Invalid JPEG/);
 assert.throws(()=>validateUpload(Buffer.from('bad'), 'application/javascript'),/Unsupported file/);
 assert.throws(()=>validateUpload(Buffer.from([0,1,2]),'text/plain'),/binary/);
 assert.throws(()=>validateUpload(Buffer.alloc(0),'text/plain'),/1 byte/);
 assert.throws(()=>validateUpload(Buffer.alloc(10*1024*1024+1),'text/plain'),/10 MB/);
});
test('private local storage stores and retrieves file by opaque key',async()=>{
 const id=crypto.randomUUID(),data=Buffer.from('Private test file only');
 try{await saveFile(id,data,'text/plain');assert.deepEqual(await loadFile(id),data);}
 finally{await deleteFile(id);}
 await assert.rejects(()=>loadFile('../../etc/passwd'),/Unsafe storage key/);
});
