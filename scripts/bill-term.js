/**
 * Idempotent term fee posting. Run once per school term through an authenticated
 * scheduler / trusted CLI, never from a public unauthenticated web endpoint.
 * Usage: npm run finance:bill-term -- 2027 1
 */
import 'dotenv/config';
import {transaction,pool} from '../src/db.js';
const [yearArg,termArg]=process.argv.slice(2);
const year=Number(yearArg),term=Number(termArg);
if(!Number.isInteger(year)||year<2020||year>2100||![1,2,3].includes(term)){
 console.error('Usage: npm run finance:bill-term -- YYYY TERM_NUMBER (1–3)');process.exitCode=2;
}else{
 try{
  const details=await transaction(async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('wakilisha_term_billing'))");
   const structures=(await client.query('SELECT count(*)::int AS n FROM fee_structures WHERE year=$1 AND term=$2',[year,term])).rows[0].n;
   if(!structures)throw new Error('No fee structures configured for the requested year and term');
   const posted=await client.query(`INSERT INTO fee_charges(student_id,academic_year,term,item,amount)
    SELECT s.id,fs.year,fs.term,fs.item,fs.amount
    FROM fee_structures fs JOIN enrollments en ON en.year=fs.year AND en.grade=fs.grade
    JOIN students s ON s.id=en.student_id
    WHERE fs.year=$1 AND fs.term=$2 AND s.status='active'
    ON CONFLICT(student_id,academic_year,term,item) DO NOTHING RETURNING id`,[year,term]);
   await client.query('INSERT INTO audit_logs(action,entity,entity_id,details) VALUES($1,$2,$3,$4)',
    ['termly_billing_scheduler','fee_charges',`${year}-${term}`,JSON.stringify({posted:posted.rowCount,fee_structures:structures})]);
   return {year,term,fee_structures:structures,new_charges:posted.rowCount};
  });console.log(JSON.stringify(details));
 }catch(e){console.error('Term billing failed:',e.message);process.exitCode=1;}
 finally{await pool.end();}
}
