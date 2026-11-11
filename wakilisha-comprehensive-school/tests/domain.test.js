import test from 'node:test';
import assert from 'node:assert/strict';
import {cents,moneyString,assessScore,performanceLevel,autoRemark,reportPayload,canBill,isFormerStudent,grades,validTerm,sanitizePublicUrl} from '../src/modules/rules.js';
test('fee money uses exact minor units, not floats',()=>{
 assert.equal(cents('1000.05'),100005);assert.equal(cents('0.01'),1);assert.equal(cents('0',{zero:true}),0);
 for(const value of ['0','-1','1.999','1e3','NaN','10,000','1000000000'])assert.throws(()=>cents(value));
 assert.equal(moneyString(100005),'1000.05');assert.equal(moneyString(-55),'-0.55');
});
test('student lifecycle stops future charges for former students',()=>{
 assert.equal(canBill('active'),true);for(const state of ['graduated','transferred','withdrawn','pending','suspended','on_leave'])assert.equal(canBill(state),false);
 for(const state of ['graduated','transferred','withdrawn'])assert.equal(isFormerStudent(state),true);
});
test('supports PP1, PP2 and Grade 1 to Grade 9',()=>{assert.equal(grades.length,11);assert.ok(grades.includes('Grade 9'));assert.ok(validTerm(1));assert.equal(validTerm(4),false);});
test('assessment is school-configured, rejects outside scores',()=>{
 assert.deepEqual(assessScore({cat:24,exam:56}),{total:80,max:100,percent:80});
 assert.equal(assessScore({cat:10,exam:30,catMax:20,examMax:40}).percent,66.67);
 for(const obj of [{cat:31,exam:40},{cat:10,exam:71},{cat:-2,exam:4},{cat:NaN,exam:50},{cat:10,exam:30,catMax:0,examMax:0}])assert.throws(()=>assessScore(obj));
});
test('school-defined bands and editable remark suggestions',()=>{
 const t=[{code:'EE',minimum:80,maximum:100},{code:'ME',minimum:60,maximum:79.99},{code:'AE',minimum:40,maximum:59.99},{code:'BE',minimum:0,maximum:39.99}];
 for(const [value,expected] of [[90,'EE'],[66,'ME'],[50,'AE'],[22,'BE']])assert.equal(performanceLevel(value,t),expected);
 assert.equal(performanceLevel(80,null),null);assert.match(autoRemark('ME'),/progress/i);
});
test('official report payload has no practice marks',()=>{
 const p=reportPayload({student:{id:8,first_name:'Jane',last_name:'A',grade:'Grade 5'},year:2026,term:1,assessments:[{subject:'Mathematics',cat:24,exam:50}]});
 assert.equal(p.practice_assignments_excluded,true);assert.equal(p.official_assessments.length,1);assert.equal('assignment_marks' in p,false);
});
test('public image URL rejects javascript and unauthenticated remote forms',()=>{
 assert.equal(sanitizePublicUrl('https://school.example/image.webp'),'https://school.example/image.webp');
 for(const url of ['javascript:alert(1)','http://site.example/photo.jpg','https://user:pass@site.example/test','not a url'])assert.throws(()=>sanitizePublicUrl(url));
});
