begin;

create table if not exists public.customer_privacy_purge_tombstones (
  id uuid primary key default gen_random_uuid(),
  purged_by uuid not null references public.profiles(id),
  affected_counts jsonb not null default '{}'::jsonb,
  retained_financial_amount numeric(14,2) not null default 0,
  proof_cleanup_status text not null default 'pending'
    check (proof_cleanup_status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_privacy_purge_jobs (
  purge_id uuid primary key references public.customer_privacy_purge_tombstones(id) on delete cascade,
  proof_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.customer_privacy_purge_tombstones enable row level security;
alter table public.customer_privacy_purge_jobs enable row level security;

drop policy if exists "privacy purge tombstones founder read" on public.customer_privacy_purge_tombstones;
create policy "privacy purge tombstones founder read"
on public.customer_privacy_purge_tombstones for select to authenticated
using (public.is_founder());

drop policy if exists "privacy purge jobs founder read" on public.customer_privacy_purge_jobs;
create policy "privacy purge jobs founder read"
on public.customer_privacy_purge_jobs for select to authenticated
using (public.is_founder());

create or replace function public.preview_customer_privacy_purge(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_row public.customers%rowtype;
  order_ids uuid[];
  payment_ids uuid[];
  recorded_sale_ids uuid[];
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;

  select * into customer_row
  from public.customers
  where id = p_customer_id and deleted_at is null;
  if not found then raise exception 'Customer not found'; end if;

  select coalesce(array_agg(id), '{}') into order_ids
  from public.orders where customer_id = p_customer_id;
  select coalesce(array_agg(id), '{}') into payment_ids
  from public.payments where order_id = any(order_ids);
  select coalesce(array_agg(id), '{}') into recorded_sale_ids
  from public.recorded_sales where phone = customer_row.phone;

  return jsonb_build_object(
    'customerName', customer_row.name,
    'affected', jsonb_build_object(
      'customers', 1,
      'orders', cardinality(order_ids),
      'payments', cardinality(payment_ids),
      'recordedSales', cardinality(recorded_sale_ids),
      'proofs', (select count(*) from public.payments where id = any(payment_ids) and proof_path is not null),
      'notifications', (select count(*) from public.notifications where entity_type = 'order' and entity_id = any(order_ids)),
      'aiProposals', (
        select count(*) from public.ai_action_proposals
        where payload ->> 'customerId' = p_customer_id::text
           or preconditions ->> 'customerId' = p_customer_id::text
      )
    ),
    'retainedFinancialAmount', coalesce((
      select sum(amount) from public.wallet_transactions
      where (reference_type = 'payment' and reference_id = any(payment_ids))
         or (reference_type = 'recorded_sale' and reference_id = any(recorded_sale_ids))
    ), 0)
  );
end;
$$;

create or replace function public.confirm_customer_privacy_purge(
  p_customer_id uuid,
  p_confirmation_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_row public.customers%rowtype;
  order_ids uuid[];
  payment_ids uuid[];
  recorded_sale_ids uuid[];
  proof_paths_value text[];
  affected_value jsonb;
  retained_amount numeric(14,2);
  purge_id_value uuid := gen_random_uuid();
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;

  select * into customer_row
  from public.customers
  where id = p_customer_id and deleted_at is null
  for update;
  if not found then raise exception 'Customer not found or already purged'; end if;
  if trim(p_confirmation_name) <> customer_row.name then
    raise exception 'Type the exact customer name to confirm';
  end if;

  select coalesce(array_agg(id), '{}') into order_ids
  from public.orders where customer_id = p_customer_id;
  select coalesce(array_agg(id), '{}') into payment_ids
  from public.payments where order_id = any(order_ids);
  select coalesce(array_agg(id), '{}') into recorded_sale_ids
  from public.recorded_sales where phone = customer_row.phone;
  select coalesce(array_agg(proof_path), '{}') into proof_paths_value
  from public.payments where id = any(payment_ids) and proof_path is not null;

  affected_value := jsonb_build_object(
    'customers', 1,
    'orders', cardinality(order_ids),
    'payments', cardinality(payment_ids),
    'recordedSales', cardinality(recorded_sale_ids),
    'proofs', cardinality(proof_paths_value),
    'notifications', (select count(*) from public.notifications where entity_type = 'order' and entity_id = any(order_ids)),
    'aiProposals', (
      select count(*) from public.ai_action_proposals
      where payload ->> 'customerId' = p_customer_id::text
         or preconditions ->> 'customerId' = p_customer_id::text
    )
  );

  select coalesce(sum(amount), 0) into retained_amount
  from public.wallet_transactions
  where (reference_type = 'payment' and reference_id = any(payment_ids))
     or (reference_type = 'recorded_sale' and reference_id = any(recorded_sale_ids));

  update public.wallet_transactions
  set reference_type = 'purged_payment',
      description = 'Anonymized customer payment'
  where reference_type = 'payment' and reference_id = any(payment_ids);

  update public.wallet_transactions
  set reference_type = 'purged_recorded_sale',
      description = 'Anonymized owner-verified sale'
  where reference_type = 'recorded_sale' and reference_id = any(recorded_sale_ids);

  delete from public.notifications
  where entity_type = 'order' and entity_id = any(order_ids);

  delete from public.ai_action_proposals
  where payload ->> 'customerId' = p_customer_id::text
     or preconditions ->> 'customerId' = p_customer_id::text;

  update public.ai_messages
  set content = replace(
    replace(content, customer_row.name, '[deleted customer]'),
    customer_row.phone, '[deleted phone]'
  )
  where content like '%' || customer_row.name || '%'
     or content like '%' || customer_row.phone || '%';

  if customer_row.whatsapp is not null and customer_row.whatsapp <> customer_row.phone then
    update public.ai_messages
    set content = replace(content, customer_row.whatsapp, '[deleted phone]')
    where content like '%' || customer_row.whatsapp || '%';
  end if;

  delete from public.recorded_sales where id = any(recorded_sale_ids);
  delete from public.payments where id = any(payment_ids);
  delete from public.orders where id = any(order_ids);
  delete from public.customers where id = p_customer_id;

  delete from public.audit_logs
  where (entity_type = 'customers' and entity_id = p_customer_id)
     or (entity_type = 'orders' and entity_id = any(order_ids))
     or (entity_type = 'payments' and entity_id = any(payment_ids));

  insert into public.customer_privacy_purge_tombstones (
    id, purged_by, affected_counts, retained_financial_amount, proof_cleanup_status
  ) values (
    purge_id_value, auth.uid(), affected_value, retained_amount,
    case when cardinality(proof_paths_value) = 0 then 'completed' else 'pending' end
  );

  insert into public.customer_privacy_purge_jobs (purge_id, proof_paths, status)
  values (
    purge_id_value,
    proof_paths_value,
    case when cardinality(proof_paths_value) = 0 then 'completed' else 'pending' end
  );

  return jsonb_build_object(
    'purgeId', purge_id_value,
    'affected', affected_value,
    'retainedFinancialAmount', retained_amount,
    'proofPaths', to_jsonb(proof_paths_value),
    'proofCleanupStatus', case when cardinality(proof_paths_value) = 0 then 'completed' else 'pending' end
  );
end;
$$;

create or replace function public.inventory_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'totalAssets', count(*),
    'totalRevenue', coalesce(sum(lifetime_revenue), 0),
    'reusedAssets', count(*) filter (where total_orders > 1),
    'topTrack', (
      select to_jsonb(t) from (
        select id, track_name, language, lifetime_revenue
        from public.inventory_tracks
        where deleted_at is null
        order by lifetime_revenue desc, id
        limit 1
      ) t
    ),
    'languages', coalesce((
      select jsonb_agg(language order by language)
      from (select distinct language from public.inventory_tracks where deleted_at is null) l
    ), '[]'::jsonb)
  )
  from public.inventory_tracks
  where deleted_at is null;
$$;

create or replace function public.search_inventory(
  p_query text default '',
  p_language text default null,
  p_sort text default 'orders',
  p_cursor_value text default null,
  p_cursor_id uuid default null,
  p_limit integer default 51
)
returns setof public.inventory_tracks
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 51), 1), 51);
  needle text := trim(coalesce(p_query, ''));
begin
  if p_sort not in ('orders', 'revenue', 'recent', 'name') then
    raise exception 'Unsupported inventory sort';
  end if;

  if p_sort = 'orders' then
    return query
      select t.* from public.inventory_tracks t
      where t.deleted_at is null
        and (p_language is null or p_language = 'all' or t.language = p_language)
        and (needle = '' or t.track_name ilike '%' || needle || '%'
          or t.english_title ilike '%' || needle || '%'
          or t.malayalam_title ilike '%' || needle || '%'
          or t.language ilike '%' || needle || '%'
          or array_to_string(t.tags, ' ') ilike '%' || needle || '%')
        and (p_cursor_id is null or t.total_orders < p_cursor_value::integer
          or (t.total_orders = p_cursor_value::integer and t.id > p_cursor_id))
      order by t.total_orders desc, t.id
      limit safe_limit;
  elsif p_sort = 'revenue' then
    return query
      select t.* from public.inventory_tracks t
      where t.deleted_at is null
        and (p_language is null or p_language = 'all' or t.language = p_language)
        and (needle = '' or t.track_name ilike '%' || needle || '%'
          or t.english_title ilike '%' || needle || '%'
          or t.malayalam_title ilike '%' || needle || '%'
          or t.language ilike '%' || needle || '%'
          or array_to_string(t.tags, ' ') ilike '%' || needle || '%')
        and (p_cursor_id is null or t.lifetime_revenue < p_cursor_value::numeric
          or (t.lifetime_revenue = p_cursor_value::numeric and t.id > p_cursor_id))
      order by t.lifetime_revenue desc, t.id
      limit safe_limit;
  elsif p_sort = 'recent' then
    return query
      select t.* from public.inventory_tracks t
      where t.deleted_at is null
        and (p_language is null or p_language = 'all' or t.language = p_language)
        and (needle = '' or t.track_name ilike '%' || needle || '%'
          or t.english_title ilike '%' || needle || '%'
          or t.malayalam_title ilike '%' || needle || '%'
          or t.language ilike '%' || needle || '%'
          or array_to_string(t.tags, ' ') ilike '%' || needle || '%')
        and (p_cursor_id is null or t.created_at < p_cursor_value::timestamptz
          or (t.created_at = p_cursor_value::timestamptz and t.id > p_cursor_id))
      order by t.created_at desc, t.id
      limit safe_limit;
  else
    return query
      select t.* from public.inventory_tracks t
      where t.deleted_at is null
        and (p_language is null or p_language = 'all' or t.language = p_language)
        and (needle = '' or t.track_name ilike '%' || needle || '%'
          or t.english_title ilike '%' || needle || '%'
          or t.malayalam_title ilike '%' || needle || '%'
          or t.language ilike '%' || needle || '%'
          or array_to_string(t.tags, ' ') ilike '%' || needle || '%')
        and (p_cursor_id is null or lower(t.track_name) > p_cursor_value
          or (lower(t.track_name) = p_cursor_value and t.id > p_cursor_id))
      order by lower(t.track_name), t.id
      limit safe_limit;
  end if;
end;
$$;

grant select on public.customer_privacy_purge_tombstones, public.customer_privacy_purge_jobs to authenticated;
revoke all on function public.preview_customer_privacy_purge(uuid) from public, anon;
revoke all on function public.confirm_customer_privacy_purge(uuid,text) from public, anon;
revoke all on function public.inventory_summary() from public, anon;
revoke all on function public.search_inventory(text,text,text,text,uuid,integer) from public, anon;
grant execute on function public.preview_customer_privacy_purge(uuid) to authenticated;
grant execute on function public.confirm_customer_privacy_purge(uuid,text) to authenticated;
grant execute on function public.inventory_summary() to authenticated;
grant execute on function public.search_inventory(text,text,text,text,uuid,integer) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.customers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.inventory_tracks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.services; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.expenses; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.wallet_transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.recorded_sales; exception when duplicate_object then null; end;
end;
$$;

commit;
