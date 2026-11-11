// RFC-4180-style CSV parser for verified administrative imports.
export function parseCsv(text,{maxRows=500}={}){
 if(typeof text!=='string'||text.length>2_000_000)throw Error('Invalid CSV input');
 const output=[];let field='',row=[],quoted=false;
 const addField=()=>{row.push(field);field='';};
 const addRow=()=>{addField();if(row.some(x=>x.trim()))output.push(row);row=[];if(output.length>maxRows+1)throw Error('CSV row limit exceeded');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){field+='"';i++;}
   else if(!quoted&&field.trim()==='')quoted=true;
   else if(quoted)quoted=false;
   else throw Error('Unexpected quote in CSV');
  }else if(c===','&&!quoted)addField();
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;addRow();}
  else field+=c;
 }
 if(quoted)throw Error('Unclosed quoted field');if(field.length||row.length)addRow();
 if(!output.length)return [];
 const cols=output.shift().map(h=>h.trim().replace(/^\ufeff/,'').toLowerCase());
 if(new Set(cols).size!==cols.length)throw Error('Duplicate CSV columns');
 const required=['first_name','last_name','admission_number','grade','guardian_name','guardian_phone'];
 if(required.some(x=>!cols.includes(x)))throw Error('Required CSV columns missing: '+required.join(', '));
 return output.map((data,i)=>{
  if(data.length!==cols.length)throw Error(`Wrong number of columns at CSV row ${i+2}`);
  return Object.fromEntries(cols.map((k,j)=>[k,data[j].trim()]));
 });
}
export function csvEscape(value){
 let s=String(value??'');
 if(/^[\s]*[=+@-]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
