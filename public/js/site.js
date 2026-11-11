'use strict';
const toggle=document.querySelector('[data-nav-toggle]');
toggle?.addEventListener('click',()=>{const nav=document.querySelector('#navigation');const open=nav?.classList.toggle('open');toggle.setAttribute('aria-expanded',String(Boolean(open)));});
let slideIndex=0;const slides=[...document.querySelectorAll('.slide')];
function changeSlide(delta){if(!slides.length)return;slides[slideIndex].classList.remove('active');slideIndex=(slideIndex+delta+slides.length)%slides.length;slides[slideIndex].classList.add('active');}
document.querySelector('[data-slide-prev]')?.addEventListener('click',()=>changeSlide(-1));
document.querySelector('[data-slide-next]')?.addEventListener('click',()=>changeSlide(1));
if(slides.length>1&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){window.setInterval(()=>{if(!document.hidden)changeSlide(1);},6500);}

document.querySelectorAll('[data-print]').forEach(button=>button.addEventListener('click',()=>window.print()));
const importer=document.querySelector('[data-csv-import]');
importer?.addEventListener('submit',async event=>{
 event.preventDefault();const input=importer.querySelector('input[type=file]');const status=importer.querySelector('[data-import-status]');const file=input?.files?.[0];
 if(!file)return;status.textContent='Validating and importing CSV...';
 try{
  const result=await fetch(importer.action,{method:'POST',headers:{'Content-Type':'text/csv','x-csrf-token':importer.querySelector('input[name=_csrf]').value},body:await file.text(),credentials:'same-origin'});
  if(result.ok){window.location.assign('/students');return;}
  status.textContent='Import not completed: '+(await result.text()).replace(/<[^>]*>/g,'').slice(0,300);
 }catch{status.textContent='Network error. No successful import was confirmed.';}
});
for(const wizard of document.querySelectorAll('[data-wizard]')){
 const steps=[...wizard.querySelectorAll('[data-wizard-step]')];let index=0;
 const next=wizard.querySelector('[data-wizard-next]'),prev=wizard.querySelector('[data-wizard-prev]'),submit=wizard.querySelector('[data-wizard-submit]');
 const update=()=>{steps.forEach((step,i)=>step.hidden=i!==index);const count=wizard.querySelector('[data-wizard-index]');if(count)count.textContent=String(index+1);prev.hidden=index===0;next.hidden=index===steps.length-1;submit.hidden=index!==steps.length-1;};
 next?.addEventListener('click',()=>{const invalid=[...steps[index].querySelectorAll('input,select,textarea')].find(f=>!f.checkValidity());if(invalid){invalid.reportValidity();return;}index=Math.min(steps.length-1,index+1);update();});
 prev?.addEventListener('click',()=>{index=Math.max(0,index-1);update();});update();
}

for(const form of document.querySelectorAll('[data-secure-upload]')){
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const file=form.querySelector('input[type="file"]')?.files?.[0],status=form.querySelector('[data-upload-status]');
  if(!file){status.textContent='Select a file before uploading.';return;}
  status.textContent='Uploading privately…';
  try{
   const fields=new FormData(form),result=await fetch('/files/upload',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/octet-stream','x-csrf-token':String(fields.get('_csrf')||''),'x-file-name':file.name,
     'x-file-mime':file.type||({'pdf':'application/pdf','txt':'text/plain','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp'}[file.name.split('.').pop().toLowerCase()]||'application/octet-stream'),
     'x-file-kind':String(fields.get('kind')||''),'x-grade':String(fields.get('grade')||''),'x-stream':String(fields.get('stream')||''),
     'x-subject':String(fields.get('subject')||''),'x-title':String(fields.get('title')||''),'x-assignment-id':String(fields.get('assignment_id')||'')},
    body:file
   });
   const body=await result.json().catch(()=>({error:'Unexpected response'}));
   if(result.ok&&body.location){window.location.assign(body.location);return;}
   status.textContent='Upload failed: '+String(body.error||'The server refused this file').slice(0,200);
  }catch{status.textContent='Upload connection failed. No successful upload has been confirmed.';}
 });
}
