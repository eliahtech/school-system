import test from 'node:test';import assert from 'node:assert/strict';
import {parseCsv,csvEscape} from '../src/modules/csv.js';
const header='first_name,last_name,admission_number,grade,guardian_name,guardian_phone';
test('CSV parser supports quoted names, CRLF and escaped quotation marks',()=>{
 const rows=parseCsv(`${header}\r\nJane,Wanjiku,WCS-101,Grade 5,"Mary, Guardian",0700000000\r\n"Jo""hn",Otieno,WCS-102,PP2,Peter,0711111111\r\n`);
 assert.equal(rows.length,2);assert.equal(rows[0].guardian_name,'Mary, Guardian');assert.equal(rows[1].first_name,'Jo"hn');
});
test('CSV parser rejects malformed rows and unbalanced quotes',()=>{
 assert.throws(()=>parseCsv(header+'\nAlice,OnlyTwo'));assert.throws(()=>parseCsv(header+'\n"Jane,Wanjiku,WCS,PP1,A,071'));assert.throws(()=>parseCsv('first_name,first_name\nJane,Jane'));
});
test('CSV export escapes spreadsheet formula injection',()=>{
 assert.equal(csvEscape('=HYPERLINK("x")'),`"'=HYPERLINK(""x"")"`);assert.equal(csvEscape('Jane'),'"Jane"');
});
