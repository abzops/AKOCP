-- READ ONLY. Export results privately before deployment and repeat after.
-- Includes every public business table, storage metadata, and installed public functions/policies.
-- Excludes auth credentials and storage file bytes. Never commit the exported results.
select 'ai_action_proposals' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.ai_action_proposals t
union all
select 'ai_conversations' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.ai_conversations t
union all
select 'ai_messages' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.ai_messages t
union all
select 'ai_settings' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.ai_settings t
union all
select 'ai_usage_daily' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.ai_usage_daily t
union all
select 'audit_logs' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.audit_logs t
union all
select 'customer_privacy_purge_jobs' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.customer_privacy_purge_jobs t
union all
select 'customer_privacy_purge_tombstones' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.customer_privacy_purge_tombstones t
union all
select 'customers' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.customers t
union all
select 'expenses' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.expenses t
union all
select 'inventory_tracks' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.inventory_tracks t
union all
select 'monthly_revenue_targets' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.monthly_revenue_targets t
union all
select 'notifications' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.notifications t
union all
select 'order_deletion_jobs' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.order_deletion_jobs t
union all
select 'order_deletion_tombstones' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.order_deletion_tombstones t
union all
select 'orders' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.orders t
union all
select 'payments' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.payments t
union all
select 'profiles' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.profiles t
union all
select 'recorded_sales' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.recorded_sales t
union all
select 'services' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.services t
union all
select 'wallet_transactions' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.wallet_transactions t
union all
select 'withdrawals' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.withdrawals t
union all
select 'storage.objects' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from storage.objects t
union all
select 'storage.buckets' as table_name, count(*) as row_count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as fingerprint, coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from storage.buckets t
union all
select 'schema.functions',count(*),md5(jsonb_agg(pg_get_functiondef(p.oid) order by p.oid)::text),jsonb_agg(pg_get_functiondef(p.oid) order by p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
union all
select 'schema.policies',count(*),md5(jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname)::text),jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p where p.schemaname in ('public','storage');
