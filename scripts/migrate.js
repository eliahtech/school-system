// Checksum-based migration runner with transactional advisory lock.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pool} from '../src/db.js';
const root=path.resolve('database/migrations');
let completed=0;
try{
 const client=await pool.connect();
 try{
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(filename TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for(const file of fs.readdirSync(root).filter(x=>/^\d+_.*\.sql$/.test(x)).sort()){
   const sql=fs.readFileSync(path.join(root,file),'utf8');const hash=crypto.createHash('sha256').update(sql).digest('hex');
   await client.query('BEGIN');
   try{
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('wakilisha_schema_migrations'))`);
    const old=(await client.query('SELECT sha256 FROM schema_migrations WHERE filename=$1',[file])).rows[0];
    if(old){if(old.sha256!==hash)throw new Error(`Previously applied migration ${file} was edited. Create a new migration rather than changing existing migrations.`);await client.query('COMMIT');console.log(`Already applied: ${file}`);continue;}
    await client.query(sql);await client.query('INSERT INTO schema_migrations(filename,sha256) VALUES($1,$2)',[file,hash]);await client.query('COMMIT');completed++;console.log(`Applied: ${file}`);
   }catch(e){await client.query('ROLLBACK');throw e;}
  }
 }finally{client.release();}
 console.log(`Database migrations complete. Newly applied: ${completed}`);
}catch(e){console.error('Database migration failed:',e.message);process.exitCode=1;
}finally{await pool.end();}
