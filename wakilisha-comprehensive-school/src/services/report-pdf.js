// Dependency-free PDF writer for confidential, versioned school report snapshots.
// Designed for Latin-1-safe text. No external HTML renderer or persistent storage.
const clean=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e\n]/g,' ').replace(/[\\()]/g,ch=>'\\'+ch);
const wrap=(text,width=87)=>{
 const out=[];for(const line of String(text??'').split(/\r?\n/)){
  let part='';for(const word of line.split(/\s+/)){
   if((part+' '+word).trim().length>width&&part){out.push(part);part='';}
   if(word.length>width){for(let k=0;k<word.length;k+=width){if(part){out.push(part);part='';}out.push(word.slice(k,k+width));}}
   else part=part?`${part} ${word}`:word;
  }out.push(part);
 }return out;
};
const fmt=x=>x===null||x===undefined?'Not recorded':String(x);
const sub=(items,missing='No approved information recorded.')=>items.length?items:[missing];
const formatMark=x=>`${x.subject}: CAT ${fmt(x.cat)}, Exam ${fmt(x.exam)}${x.level?` | School level ${x.level}`:''} | ${fmt(x.remark||x.suggested_remark||'No teacher remark')}`;
const formatObservation=x=>`${x.subject} / ${x.criterion}: ${x.level}`;
const headerText=p=>`${p.student.first_name} ${p.student.last_name} | ${p.student.admission_number} | ${p.year}`;
const isAnnual=payload=>payload.term===null;
export function reportSections(payload){
 const s=payload.student;
 const introduction=[`School: Wakilisha Comprehensive School`,`Student: ${s.first_name} ${s.last_name}`,`Admission number: ${s.admission_number}`,`Grade and stream: ${s.grade} ${s.stream}`,`Academic year: ${payload.year}`,`Report period: ${isAnnual(payload)?'Annual, Terms 1 to 3':'Term '+payload.term}`,`IMPORTANT: Only approved official academic assessments are included.`,`LMS practice marks and assignment scores are excluded.`];
 const scores=payload.official_assessments||[],obs=payload.competency_observations||[],att=payload.attendance||[];
 const title=isAnnual(payload)?'ANNUAL CBC PROGRESS REPORT BOOK':'TERM CBC PROGRESS REPORT';
 const sections=[{title,lines:introduction},{title:'Learner and Academic Profile',lines:introduction},{title:'Official Assessment Results',lines:sub(scores.map(formatMark))}];
 if(!isAnnual(payload)){
  sections.push({title:'Competency Observations & Attendance',lines:[...sub(obs.map(formatObservation)),...att.map(x=>`${x.status}: ${x.total} days`)]});
  sections.push({title:'Review and Approval',lines:['This report is a snapshot of the approved academic records.','Any correction must create an audited newer version.','School Headteacher / Authorized Approver: electronically approved.']});
  return sections;
 }
 sections.push({title:'Assessment Framework',lines:['Internal school assessments follow configured marks maxima and grade-specific school evaluation policy.','Rubric assessments reflect recorded competency criteria.','EE, ME, AE and BE numerical thresholds are configurable school-defined levels, not asserted national thresholds.']});
 for(const term of [1,2,3])sections.push({title:`Term ${term} Approved Results`,lines:sub(scores.filter(x=>Number(x.term)===term).map(formatMark))});
 sections.push({title:'Annual Learning Area Overview',lines:sub([...new Set(scores.map(x=>x.subject))].map(subj=>`${subj}: ${scores.filter(x=>x.subject===subj).map(a=>`T${a.term} ${Number(a.cat||0)+Number(a.exam||0)}`).join(' | ')}`))});
 sections.push({title:'Core Competencies and Observations',lines:sub(obs.map(formatObservation))});
 sections.push({title:'Attendance and Participation',lines:sub(att.map(x=>`${x.status}: ${x.total} days`))});
 sections.push({title:'Strengths and Achievements',lines:sub(scores.filter(x=>x.remark).map(x=>`${x.subject}: ${x.remark}`),'Individual teacher remarks and achievements will be recorded by authorized teachers.')});
 sections.push({title:'Areas for Improvement',lines:['Identify focus areas from the recorded competency criteria and teacher feedback.',...sub(obs.filter(x=>['AE','BE'].includes(x.level)).map(x=>`${x.subject}: ${x.criterion} (${x.level})`),'No low-level competency observations were recorded.') ]});
 sections.push({title:'Term-to-Term Progress',lines:sub([...new Set(scores.map(x=>x.subject))].map(subject=>`${subject} | ${scores.filter(x=>x.subject===subject).sort((a,b)=>a.term-b.term).map(x=>`Term ${x.term}: ${Number(x.cat||0)+Number(x.exam||0)}`).join(', ')}`))});
 sections.push({title:'Approval and Next Year Guidance',lines:['Report contains school-recorded, approved official results only.','Suggested next-year learning priorities should be reviewed by the class teacher and headteacher.','Authorized headteacher approval is recorded in the immutable report version.','Do not alter an approved version; publish a new audited correction instead.']});
 return sections;
}
const textAt=(x,y,value,size=10)=>`BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${clean(value)}) Tj ET\n`;
const pageStream=(section,index,total,payload)=>{
 let stream='0.08 0.19 0.31 rg\n';stream+='40 797 515 3 re f\n';
 stream+='0.07 0.19 0.31 rg\n';stream+=textAt(41,814,'WAKILISHA COMPREHENSIVE SCHOOL',12);
 stream+=textAt(41,783,section.title.toUpperCase().slice(0,67),14);
 stream+='0.3 0.39 0.46 rg\n';stream+=textAt(41,764,headerText(payload),9);
 let y=735;stream+='0.12 0.18 0.27 rg\n';
 for(const line of section.lines){for(const piece of wrap(line,89)){
  if(y<62){stream+=textAt(42,y,'[Further detail available in approved school records.]',9);y=-100;break;}
  stream+=textAt(42,y,piece,10);y-=17;
 }y-=8;if(y<0)break;}
 stream+='0.35 0.43 0.5 rg\n';stream+='40 43 515 1 re f\n';stream+=textAt(41,29,`Approved report snapshot | Page ${index+1} of ${total} | Wakilisha Comprehensive School`,8);
 return stream;
};
function createPagesPdf(pages,payload,{id=0,version=1}={}){
 const objects=[];const append=(v)=>{objects.push(v);return objects.length;};
 const catalog=append(''),root=append(''),font=append('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const kids=[];
 for(let i=0;i<pages.length;i++){
  const stream=pageStream(pages[i],i,pages.length,payload)+'\n';
  const data=Buffer.from(stream,'latin1');
  const content=append(`<< /Length ${data.length} >>\nstream\n${stream}endstream`);
  const page=append(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
  kids.push(`${page} 0 R`);
 }
 objects[root-1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
 objects[catalog-1]=`<< /Type /Catalog /Pages ${root} 0 R >>`;
 let result='%PDF-1.4\n%WCSREPORT\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(result,'latin1'));result+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const at=Buffer.byteLength(result,'latin1');
 result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)result+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 result+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R /Info << /Title (Wakilisha School CBC Report) /Author (Wakilisha Comprehensive School) /Subject (Approved report ${Number(id)} version ${Number(version)}) >> >>\nstartxref\n${at}\n%%EOF`;
 return Buffer.from(result,'latin1');
}

export function createReportPdf(payload,meta={}){
 if(!payload||!payload.student||!payload.year)throw Error('Invalid report payload');
 return createPagesPdf(reportSections(payload),payload,meta);
}
export function createAdmissionPdf(application,requirements=[]){
 if(!application?.admission_number||!application?.academic_year)throw Error('Approved admission details required');
 const s={first_name:application.first_name,last_name:application.last_name,admission_number:application.admission_number,grade:application.grade,stream:'A'};
 const sections=[
  {title:'Official Admission Letter',lines:[
   'WAKILISHA COMPREHENSIVE SCHOOL',`Dear ${application.guardian_name||'Parent/Guardian'},`,
   `We are pleased to confirm admission for ${s.first_name} ${s.last_name}.`,
   `Admission number: ${s.admission_number}`,`Class: ${s.grade}`,`Academic year: ${application.academic_year}`,
   `Reporting date: ${application.reporting_date||'Contact school'}`,`Reporting time: ${application.reporting_time||'Contact school'}`,
   'Present this letter and the requested documents to the admissions office.',
   'The school will confirm reporting and student registration after verification.',
   `Contact: ${application.school_contact||'School Administration'}`
  ]},
  {title:'Reporting Materials and Required Documents',lines:requirements.length?requirements.map((r,i)=>`${i+1}. [${r.kind}] ${r.item}`):['Please contact the school admissions office for the current materials checklist.']},
  {title:'Reporting Day and Guardian Guidance',lines:[
   'Bring the admission letter or admission number when reporting.',
   'Provide documents and materials required for the learner class.',
   'Staff will verify attendance and each checklist item before activation.',
   'Never share student account credentials with unauthorized persons.',
   application.admin_note||'Contact the school office if you need clarification.'
  ]}
 ];
 return createPagesPdf(sections,{student:s,year:application.academic_year},{id:application.id||0,version:1});
}
