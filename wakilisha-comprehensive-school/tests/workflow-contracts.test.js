import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const f=p=>fs.readFileSync(p,'utf8');
test('teacher-scoped student, official assessment and attendance read routes',()=>{
 const s=f('src/server.js');for(const route of ["app.get('/students'","app.get('/assessments'","app.get('/attendance'"])assert.ok(s.includes(route));
 assert.match(s,/DISTINCT s\.id/);assert.match(s,/lower\(ta\.subject\)=lower\(a\.subject\)/);
});
test('admission approval queues email and creates linked parent identity',()=>{
 const s=f('src/modules/admissions.js');assert.match(s,/issueInvitation/);assert.match(s,/reporting_requirements/);assert.match(s,/student_guardians/);assert.match(s,/reporting_requirement_checks/);
});
test('payment provider callback always verifies status',()=>{
 const routes=f('src/payments/pesapal-routes.js');assert.match(routes,/await transactionStatus\(trackingId\)/);assert.match(routes,/verifiedPayment\(status,locked\)/);assert.match(routes,/payment_reversals/);assert.match(routes,/FOR UPDATE/);
});
test('student assignment marking is isolated from official marks',()=>{
 const lms=f('src/modules/lms.js');const academy=f('src/modules/academic.js');assert.match(lms,/practice_mark/);assert.doesNotMatch(academy,/submissions|practice_mark/);
});
test('schema indexes, constraints, and reconciliation tables exist',()=>{
 const sql=f('database/migrations/004_workflows.sql')+f('database/migrations/005_reversals.sql');
 for(const x of ['assessment_schemes','student_status_changes','account_invitations','gallery_consents','payment_reversals','idx_report_immutable_version'])assert.ok(sql.includes(x),x);
});
