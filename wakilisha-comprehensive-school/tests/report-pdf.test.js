import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportPdf,reportSections} from '../src/services/report-pdf.js';
const student={id:14,first_name:'Jane',last_name:'Wanjiku',admission_number:'WCS-2026-001',grade:'Grade 6',stream:'B'};
const report={student,year:2026,term:null,official_assessments:[{term:1,subject:'Math',cat:26,exam:59},{term:2,subject:'Math',cat:27,exam:60},{term:3,subject:'Math',cat:28,exam:65}],competency_observations:[{term:2,subject:'Math',criterion:'Problem solving',level:'ME'}],attendance:[{status:'present',total:165}]};
test('term report produces printable, valid PDF A4 pages',()=>{
 const data=createReportPdf({...report,term:1});assert.equal(data.subarray(0,8).toString(),'%PDF-1.4');assert.match(data.toString('latin1'),/\/Count 5/);
 assert.match(data.toString('latin1'),/%%EOF$/);assert.ok(data.length>1500);
});
test('annual report contains 12-15 pages and valid object offsets',()=>{
 assert.equal(reportSections(report).length,14);
 const pdf=createReportPdf(report,{id:11,version:2}).toString('latin1');
 assert.match(pdf,/\/Count 14/);assert.match(pdf,/xref\n0 \d+/);assert.match(pdf,/\/Type \/Catalog/);
 const start=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(start,start+4),'xref');
 assert.match(pdf,/official/i);
});
test('report does not insert LMS practice marks',()=>{
 const json={...report,practice_marks:[{mark:999}]};
 const document=createReportPdf(json).toString('latin1');assert.doesNotMatch(document,/999/);
});
