import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

// An isolated Postgres engine. No network access or production credentials are used.
const db = new PGlite({ extensions: { pg_trgm } })
const founder = '00000000-0000-4000-8000-000000000001'
const operations = '00000000-0000-4000-8000-000000000002'
const pending = '00000000-0000-4000-8000-000000000003'
let checks = 0
const check = (label, test) => { test(); checks++; console.log(`PASS ${label}`) }
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
const asUser = async (id, action) => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec('set role authenticated')
  try { return await action() } finally { await db.exec('reset role') }
}
const apply = async (path) => {
  const sql = (await readFile(path, 'utf8')).replace('create extension if not exists pgcrypto;', '')
  try { await db.exec(sql) } catch (error) {
    throw new Error(`${path}: ${error.message}`, { cause: error })
  }
}
const snapshot = async () => {
  const tables = (await db.query("select tablename from pg_tables where schemaname = 'public' order by tablename")).rows
  const result = {}
  for (const { tablename } of tables) {
    result[tablename] = await scalar(`select coalesce(jsonb_agg(row_data order by row_data::text), '[]'::jsonb) from (select to_jsonb(t) row_data from public."${tablename}" t) s`)
  }
  return result
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, storage to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create publication supabase_realtime;
  `)
  await apply('supabase/schema.sql')
  const migrations = (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  const hardening = migrations.find((name) => name.endsWith('_access_finance_reliability.sql'))
  assert(hardening)
  for (const name of migrations.filter((name) => name < hardening)) await apply(`supabase/migrations/${name}`)
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,'founder@example.test','{\"full_name\":\"Test Founder\"}'), ($2,'operations@example.test','{\"full_name\":\"Test Operator\"}')", [founder, operations])
  await db.exec("insert into wallet_transactions(type,amount,reference_type,reference_id,description) values('adjustment',1000,'test',gen_random_uuid(),'Isolated test funding')")
  const before = await snapshot()
  await apply(`supabase/migrations/${hardening}`)
  const after = await snapshot()
  check('migration preserves all existing public rows', () => assert.deepEqual(after, before))
  await apply(`supabase/migrations/${hardening}`)
  const reapplied = await snapshot()
  check('migration can be reapplied without data changes', () => assert.deepEqual(reapplied, before))
  const titleAliases = migrations.find((name) => name.endsWith('_inventory_title_aliases.sql'))
  for (const name of migrations.filter((name) => name > hardening && name !== titleAliases)) await apply(`supabase/migrations/${name}`)
  const configured = await snapshot()
  const { ai_settings: oldSettings, ...oldBusiness } = reapplied
  const { ai_settings: newSettings, ...newBusiness } = configured
  check('model configuration preserves every business row', () => assert.deepEqual(newBusiness, oldBusiness))
  check('agent uses the supported NVIDIA model', () => assert.equal(newSettings[0].primary_model, 'nvidia/nemotron-3.5-lightning-30b-a3b'))
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,'pending@example.test','{\"full_name\":\"Pending User\"}')", [pending])
  const profile = (await db.query('select role, active from profiles where id = $1', [pending])).rows[0]
  check('new registration is inactive Operations', () => assert.deepEqual(profile, { role: 'operations', active: false }))
  await asUser(pending, async () => {
    check('pending account cannot read wallet', () => {})
    assert.equal(await scalar('select count(*)::int from wallet_transactions'), 0)
    assert.equal(await scalar('select count(*)::int from profiles'), 1)
    await assert.rejects(() => db.query('select wallet_balance()'), /Active workspace access/)
    await assert.rejects(() => db.query("select public.upsert_monthly_revenue_target('2026-10-01',1000)"), /Active workspace access/)
  })
  await asUser(founder, async () => {
    assert.equal(await scalar('select count(*)::int from profiles'), 3)
    await db.query('select set_profile_access($1, true)', [pending])
  })
  await asUser(pending, async () => assert.ok(await scalar('select count(*)::int from wallet_transactions') > 0))
  check('Founder can approve pending accounts', () => {})
  await asUser(founder, () => db.query('select set_profile_access($1, false)', [pending]))
  await asUser(pending, async () => {
    assert.equal(await scalar('select count(*)::int from wallet_transactions'), 0)
    await assert.rejects(() => db.query("select create_order('Pending customer','9999999999',null,null,(select id from services limit 1),null,'Test track','Malayalam',null,null,null)"), /Active workspace access/)
  })
  check('deactivation blocks reads and privileged RPCs with an existing JWT', () => {})
  let orderId, paymentId
  await asUser(operations, async () => {
    orderId = await scalar("select create_order('Test Customer','9999999999',null,null,(select id from services where code='AU150'),null,'Test track','Malayalam',null,null,null)")
    paymentId = await scalar("insert into payments(order_id,amount,uploaded_by) values($1,1000,$2) returning id", [orderId, operations])
    await assert.rejects(() => db.query('select confirm_payment($1)', [paymentId]), /Founder permission/)
  })
  await asUser(founder, async () => {
    await assert.rejects(() => db.query("update payments set status='confirmed' where id=$1", [paymentId]), /payment confirmation workflow/)
    await db.query('select confirm_payment($1)', [paymentId])
    await db.query('select confirm_payment($1)', [paymentId])
    await assert.rejects(() => db.query('update payments set amount=500 where id=$1', [paymentId]), /immutable/)
  })
  assert.equal(await scalar("select count(*)::int from wallet_transactions where reference_type='payment' and reference_id=$1", [paymentId]), 1)
  check('payment confirmation is Founder-only, idempotent, and amount immutable', () => {})
  let historicalOrder, historicalPayment
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[founder])
  historicalOrder = await scalar("insert into orders(order_number,customer_id,service_id,track_name,language,status,price,created_by) select 'HISTORICAL-DELIVERED',customer_id,service_id,'Historical delivered track','Malayalam','delivered',150,$1 from orders where id=$2 returning id",[founder,orderId])
  await asUser(founder, async () => {
    historicalPayment = await scalar('insert into payments(order_id,amount,uploaded_by) values($1,150,$2) returning id',[historicalOrder,founder])
    await db.query('select confirm_payment($1)',[historicalPayment])
    await db.query('select confirm_payment($1)',[historicalPayment])
    await assert.rejects(() => db.query("update orders set status='in_progress' where id=$1",[historicalOrder]), /Finalized orders/)
    const uncompleted = await scalar("select create_order('Transition Test','9999999998',null,null,(select id from services where code='AU150'),null,'Uncompleted track','Malayalam',null,null,null)")
    await assert.rejects(() => db.query("update orders set status='delivered' where id=$1",[uncompleted]), /Only a completed order/)
  })
  assert.equal(await scalar('select status from orders where id=$1',[historicalOrder]),'delivered')
  assert.equal(await scalar('select payment_status from orders where id=$1',[historicalOrder]),'confirmed')
  assert.equal(await scalar("select count(*)::int from wallet_transactions where reference_type='payment' and reference_id=$1",[historicalPayment]),1)
  check('delivered orders accept idempotent payment confirmation while final-status guards remain', () => {})
  await asUser(founder, async () => {
    const summary = await scalar("select ai_business_summary('2000-01-01','2000-01-02')")
    assert.equal(Number(summary.currentWalletBalance),Number(await scalar('select wallet_balance()')))
    assert.equal(Number(summary.netWalletMovement),0)
    assert.equal(Number(summary.deliveredPaidOrdersAllTime),1)
    assert.equal(Number(summary.deliveredPaidOrdersInPeriod),0)
  })
  check('AI summary distinguishes current balance, period movement, and delivered paid counts', () => {})
  await db.query("insert into inventory_tracks(id,track_name,malayalam_title,language,tags) values('07ea6c07-c0b3-44e1-834d-7e70b335b2f7','മൻമത റാസ','മൻമത റാസ','Malayalam',array['original-tag'])")
  assert(titleAliases)
  await apply(`supabase/migrations/${titleAliases}`)
  await apply(`supabase/migrations/${titleAliases}`)
  await asUser(founder, async () => {
    for (const query of ['manmatha rasa','manmadha rasa','മൻമത റാസ']) {
      const matches = (await db.query('select * from search_inventory($1)',[query])).rows
      assert.equal(matches.length,1)
      assert.equal(matches[0].track_name,'മൻമത റാസ')
      assert.ok(matches[0].tags.includes('original-tag'))
    }
  })
  check('Malayalam-only title is found through English and spelling aliases without replacing original metadata', () => {})
  await asUser(operations, async () => {
    const call = "select create_order_with_customer_details('Optional Details','9999999997',null,null,(select id from services where code='AU150'),null,'Quick order track','Malayalam',null,null,null,$1,$2)"
    await db.query(call,['Kochi',32])
    let customer=(await db.query("select place,age,total_orders from customers where phone='9999999997'")).rows[0]
    assert.deepEqual(customer,{place:'Kochi',age:32,total_orders:1})
    await db.query(call,[null,null])
    customer=(await db.query("select place,age,total_orders from customers where phone='9999999997'")).rows[0]
    assert.deepEqual(customer,{place:'Kochi',age:32,total_orders:2})
    await assert.rejects(()=>db.query(call,['Kochi',121]), /Age must be/)
    await assert.rejects(()=>db.query(call,['x'.repeat(121),25]), /Place must be/)
    assert.equal(await scalar("select total_orders from customers where phone='9999999997'"),2)
    await db.query(call,['Kochi',0])
    assert.equal(await scalar("select age from customers where phone='9999999997'"),0)
  })
  await asUser(pending, async () => {
    await assert.rejects(()=>db.query("select create_order_with_customer_details('Blocked','9999999996',null,null,(select id from services where code='AU150'),null,'Blocked track','Malayalam',null,null,null,null,null)"), /Active workspace/)
  })
  check('optional customer place and age save atomically, preserve omitted details, validate bounds and require active access', () => {})
  const balance = Number(await scalar('select sum(amount) from wallet_transactions'))
  let expenseId, withdrawalId
  await asUser(founder, async () => {
    expenseId = await scalar("insert into expenses(amount,category,description,added_by) values($1,'internet','Test expense',$2) returning id", [balance, founder])
    withdrawalId = await scalar("insert into withdrawals(amount,reason,requested_by) values(1,'salary',$1) returning id", [founder])
    await db.query("select review_expense($1,'approved')", [expenseId])
    await assert.rejects(() => db.query("select review_withdrawal($1,'approved')", [withdrawalId]), /exceeds available wallet/)
  })
  check('approved expenses prevent later withdrawals from overspending', () => {})
  for (const name of ['review_expense', 'review_withdrawal']) {
    const definition = await scalar("select pg_get_functiondef(oid) from pg_proc where proname=$1", [name])
    assert.ok(definition.includes("pg_advisory_xact_lock(hashtext('akocp-wallet-outflow'))"))
  }
  check('both approval paths acquire the same transaction lock', () => {})
  await asUser(operations, async () => {
    await assert.rejects(() => db.query("insert into orders(order_number,customer_id,service_id,track_name,language,price,created_by) select 'forged',customer_id,service_id,'Forged','Malayalam',1,$1 from orders limit 1", [operations]), /row-level security/)
    await assert.rejects(() => db.query('select set_profile_access($1,true)', [pending]), /Founder permission/)
  })
  check('direct order inserts and Operations access approvals are blocked', () => {})
  const exported = await db.query(await readFile('supabase/checks/data-snapshot.sql', 'utf8'))
  check('read-only snapshot includes every business table and storage metadata', () => {
    assert.equal(exported.rows.length, 26)
    assert.ok(exported.rows.some((row) => row.table_name === 'withdrawals'))
    assert.ok(exported.rows.some((row) => row.table_name === 'schema.functions'))
  })
  console.log(`${checks} database checks passed (isolated Postgres; no production connection).`)
} finally {
  await db.close()
}
