// Restore a read-only business export into isolated in-memory Postgres.
// Never connects to Supabase. Auth credentials and Storage file bytes are not in this export.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm'

const file=process.argv[2]
if(!file)throw new Error('Usage: node scripts/verify-business-backup.mjs <private-snapshot.json>')
const backup=JSON.parse(await readFile(file,'utf8'))
assert.equal(backup.format,'akocp-business-snapshot-v1')
const db=new PGlite({extensions:{pg_trgm}})
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,owner uuid);
    alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    create publication supabase_realtime;`)
  for(const path of ['supabase/schema.sql',...(await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort().map(n=>`supabase/migrations/${n}`)])await db.exec((await readFile(path,'utf8')).replace('create extension if not exists pgcrypto;',''))
  const publicTables=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename)
  await db.exec('set session_replication_role=replica')
  await db.exec(`truncate ${publicTables.map(n=>`public."${n}"`).join(',')} cascade`)
  const profiles=backup.tables.find(t=>t.table_name==='profiles')?.data??[]
  for(const profile of profiles)await db.query('insert into auth.users(id,email) values($1,$2)',[profile.id,profile.email??'restored@example.test'])
  let restoredTables=0,restoredRows=0
  for(const entry of backup.tables){
    if(!/^[a-z_]+$/.test(entry.table_name)||!publicTables.includes(entry.table_name))continue
    const columns=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 and is_generated='NEVER' order by ordinal_position",[entry.table_name])).rows.map(r=>`"${r.column_name}"`).join(',')
    if(entry.data.length)await db.query(`insert into public."${entry.table_name}" (${columns}) select ${columns} from jsonb_populate_recordset(null::public."${entry.table_name}",$1::jsonb)`,[JSON.stringify(entry.data)])
    const count=Number((await db.query(`select count(*) as n from public."${entry.table_name}"`)).rows[0].n)
    assert.equal(count,Number(entry.row_count),`Row count: ${entry.table_name}`)
    // Compare typed values rather than relying on JSON key order or date rendering.
    const mismatch=Number((await db.query(`with expected as (select ${columns} from jsonb_populate_recordset(null::public."${entry.table_name}",$1::jsonb)) select count(*) as n from ((select ${columns} from public."${entry.table_name}" except all select * from expected) union all (select * from expected except all select ${columns} from public."${entry.table_name}")) differences`,[JSON.stringify(entry.data)])).rows[0].n)
    assert.equal(mismatch,0,`Restored values: ${entry.table_name}`)
    restoredTables++;restoredRows+=count
  }
  await db.exec('set session_replication_role=origin')
  const expectedWallet=(backup.tables.find(t=>t.table_name==='wallet_transactions')?.data??[]).reduce((n,t)=>n+Number(t.amount),0)
  const actualWallet=Number((await db.query('select coalesce(sum(amount),0) as amount from wallet_transactions')).rows[0].amount)
  assert.equal(actualWallet,expectedWallet)
  console.log(JSON.stringify({verified:true,restoredTables,restoredRows,ledgerReconciled:true,scope:'Business rows and schema only; Auth credentials and Storage file contents require separate backups.'}))
}finally{await db.close()}
