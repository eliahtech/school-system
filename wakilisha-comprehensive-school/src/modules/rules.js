// Domain rules are pure, deterministic and executable without network/database dependencies.
export const grades=['PP1','PP2',...Array.from({length:9},(_,i)=>`Grade ${i+1}`)];
export const statuses=['pending','active','on_leave','suspended','graduated','transferred','withdrawn'];
export const validYear=v=>/^20\d{2}$/.test(String(v))&&Number(v)<2200;
export const validTerm=v=>['1','2','3'].includes(String(v));
export function cents(value,{zero=false}={}){
 const s=String(value??'').trim();
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(s))throw new Error('Invalid money amount');
 const [whole,decimal='']=s.split('.');const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||(!zero&&n<=0))throw new Error('Invalid money amount');return n;
}
export const moneyString=minor=>(minor/100).toFixed(2);
export const sumCents=rows=>rows.reduce((sum,r)=>sum+cents(r.amount,{zero:true}),0);
export const canBill=status=>status==='active';
export const isFormerStudent=status=>['graduated','transferred','withdrawn'].includes(status);
export function assessScore({cat,exam,catMax=30,examMax=70}){
 const catValue=Number(cat),examValue=Number(exam);
 if(![catValue,examValue,catMax,examMax].every(Number.isFinite)||catValue<0||examValue<0||catValue>catMax||examValue>examMax||catMax+examMax<=0)throw Error('Assessment score outside configured scheme');
 return {total:catValue+examValue,max:catMax+examMax,percent:Number(((catValue+examValue)*100/(catMax+examMax)).toFixed(2))};
}
export function performanceLevel(percent,thresholds){
 if(!Array.isArray(thresholds)||!Number.isFinite(percent)||percent<0||percent>100)return null;
 return thresholds.find(t=>percent>=Number(t.minimum)&&percent<=Number(t.maximum))?.code||null;
}
export function autoRemark(level){return ({EE:'Excellent progress; continue extending learning through challenging activities.',ME:'Good progress; continue practising to strengthen confidence.',AE:'Developing the expected competencies; regular guided practice will help.',BE:'Additional individualized support and guided practice are recommended.'})[level]||'Learning progress is being reviewed.';}
export function maySeeStudent(role){return ['super_admin','admin','headteacher','bursar','teacher','student','parent'].includes(role);}
export function sanitizePublicUrl(value){if(!value)return null;let u;try{u=new URL(value);}catch{throw Error('Invalid image URL');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Use an HTTPS public image URL');return u.toString();}
export function reportPayload({student,year,term,assessments=[],observations=[],attendance=[],remarks={}}){
 if(!student?.id||!validYear(year)||(term!==null&&!validTerm(term)))throw Error('Invalid report parameters');
 return {school:'Wakilisha Comprehensive School',student:{id:student.id,admission_number:student.admission_number,first_name:student.first_name,last_name:student.last_name,grade:student.grade,stream:student.stream||'A'},year:Number(year),term:term===null?null:Number(term),official_assessments:assessments,competency_observations:observations,attendance,remarks,practice_assignments_excluded:true};
}
