begin;

create table if not exists public.order_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  deleted_by uuid not null references public.profiles(id),
  affected_counts jsonb not null default '{}'::jsonb,
  removed_financial_amount numeric(14,2) not null default 0,
  proof_cleanup_status text not null default 'pending'
    check (proof_cleanup_status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_deletion_jobs (
  deletion_id uuid primary key references public.order_deletion_tombstones(id) on delete cascade,
  proof_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.order_deletion_tombstones enable row level security;
alter table public.order_deletion_jobs enable row level security;

drop policy if exists "order deletion tombstones founder read" on public.order_deletion_tombstones;
create policy "order deletion tombstones founder read"
on public.order_deletion_tombstones for select to authenticated
using (public.is_founder());

drop policy if exists "order deletion jobs founder read" on public.order_deletion_jobs;
create policy "order deletion jobs founder read"
on public.order_deletion_jobs for select to authenticated
using (public.is_founder());

drop policy if exists "founder deletes payment proofs" on storage.objects;
create policy "founder deletes payment proofs"
on storage.objects for delete to authenticated
using (bucket_id = 'payment-proofs' and public.is_founder());

-- Privacy operations remove their detailed source audit rows and leave only a
-- content-free tombstone. This switch prevents the generic trigger from
-- recreating PII-bearing DELETE audit payloads inside those transactions.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
  before_value jsonb;
  after_value jsonb;
  row_value jsonb;
begin
  if coalesce(current_setting('akocp.suppress_audit', true), '') = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    before_value := null;
    after_value := to_jsonb(new);
    row_value := after_value;
  elsif tg_op = 'UPDATE' then
    before_value := to_jsonb(old);
    after_value := to_jsonb(new);
    row_value := after_value;
  else
    before_value := to_jsonb(old);
    after_value := null;
    row_value := before_value;
  end if;

  row_id := nullif(row_value ->> 'id', '')::uuid;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), lower(tg_op), tg_table_name, row_id, before_value, after_value);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.preview_order_deletion(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  payment_ids uuid[];
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;

  select * into order_row
  from public.orders
  where id = p_order_id and deleted_at is null;
  if not found then raise exception 'Order not found'; end if;

  select coalesce(array_agg(id), '{}') into payment_ids
  from public.payments where order_id = p_order_id;

  return jsonb_build_object(
    'orderNumber', order_row.order_number,
    'affected', jsonb_build_object(
      'orders', 1,
      'payments', cardinality(payment_ids),
      'confirmedPayments', (select count(*) from public.payments where id = any(payment_ids) and status = 'confirmed'),
      'proofs', (select count(*) from public.payments where id = any(payment_ids) and proof_path is not null),
      'walletTransactions', (select count(*) from public.wallet_transactions where reference_type = 'payment' and reference_id = any(payment_ids)),
      'notifications', (select count(*) from public.notifications where (entity_type = 'order' and entity_id = p_order_id) or (entity_type = 'payment' and entity_id = any(payment_ids))),
      'aiProposals', (
        select count(*) from public.ai_action_proposals proposal
        where proposal.payload::text like '%' || p_order_id::text || '%'
           or proposal.preconditions::text like '%' || p_order_id::text || '%'
           or exists (
             select 1 from unnest(payment_ids) payment_id
             where proposal.payload::text like '%' || payment_id::text || '%'
                or proposal.preconditions::text like '%' || payment_id::text || '%'
           )
      ),
      'auditLogs', (
        select count(*) from public.audit_logs
        where (entity_type = 'orders' and entity_id = p_order_id)
           or (entity_type = 'payments' and entity_id = any(payment_ids))
      )
    ),
    'removedFinancialAmount', coalesce((
      select sum(amount) from public.wallet_transactions
      where reference_type = 'payment' and reference_id = any(payment_ids)
    ), 0)
  );
end;
$$;

create or replace function public.confirm_order_deletion(
  p_order_id uuid,
  p_confirmation_order_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  payment_ids uuid[];
  proof_paths_value text[];
  affected_value jsonb;
  removed_amount numeric(14,2);
  deletion_id_value uuid := gen_random_uuid();
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;

  select * into order_row
  from public.orders
  where id = p_order_id and deleted_at is null
  for update;
  if not found then raise exception 'Order not found or already deleted'; end if;
  if trim(p_confirmation_order_number) <> order_row.order_number then
    raise exception 'Type the exact order number to confirm';
  end if;

  select coalesce(array_agg(id), '{}') into payment_ids
  from public.payments where order_id = p_order_id;
  select coalesce(array_agg(proof_path), '{}') into proof_paths_value
  from public.payments where id = any(payment_ids) and proof_path is not null;

  affected_value := jsonb_build_object(
    'orders', 1,
    'payments', cardinality(payment_ids),
    'confirmedPayments', (select count(*) from public.payments where id = any(payment_ids) and status = 'confirmed'),
    'proofs', cardinality(proof_paths_value),
    'walletTransactions', (select count(*) from public.wallet_transactions where reference_type = 'payment' and reference_id = any(payment_ids)),
    'notifications', (select count(*) from public.notifications where (entity_type = 'order' and entity_id = p_order_id) or (entity_type = 'payment' and entity_id = any(payment_ids))),
    'aiProposals', (
      select count(*) from public.ai_action_proposals proposal
      where proposal.payload::text like '%' || p_order_id::text || '%'
         or proposal.preconditions::text like '%' || p_order_id::text || '%'
         or exists (
           select 1 from unnest(payment_ids) payment_id
           where proposal.payload::text like '%' || payment_id::text || '%'
              or proposal.preconditions::text like '%' || payment_id::text || '%'
         )
    ),
    'auditLogs', (
      select count(*) from public.audit_logs
      where (entity_type = 'orders' and entity_id = p_order_id)
         or (entity_type = 'payments' and entity_id = any(payment_ids))
    )
  );

  select coalesce(sum(amount), 0) into removed_amount
  from public.wallet_transactions
  where reference_type = 'payment' and reference_id = any(payment_ids);

  perform set_config('akocp.internal', '1', true);
  perform set_config('akocp.suppress_audit', '1', true);

  delete from public.notifications
  where (entity_type = 'order' and entity_id = p_order_id)
     or (entity_type = 'payment' and entity_id = any(payment_ids));

  delete from public.ai_action_proposals proposal
  where proposal.payload::text like '%' || p_order_id::text || '%'
     or proposal.preconditions::text like '%' || p_order_id::text || '%'
     or exists (
       select 1 from unnest(payment_ids) payment_id
       where proposal.payload::text like '%' || payment_id::text || '%'
          or proposal.preconditions::text like '%' || payment_id::text || '%'
     );

  update public.ai_messages
  set content = replace(content, order_row.order_number, '[deleted order]')
  where content like '%' || order_row.order_number || '%';

  delete from public.wallet_transactions
  where reference_type = 'payment' and reference_id = any(payment_ids);

  delete from public.payments where id = any(payment_ids);
  delete from public.orders where id = p_order_id;

  update public.customers customer
  set total_orders = (
        select count(*) from public.orders remaining
        where remaining.customer_id = customer.id and remaining.deleted_at is null
      ),
      lifetime_revenue = coalesce((
        select sum(payment.amount)
        from public.orders remaining
        join public.payments payment on payment.order_id = remaining.id and payment.status = 'confirmed'
        where remaining.customer_id = customer.id and remaining.deleted_at is null
      ), 0),
      last_ordered_at = (
        select max(remaining.created_at) from public.orders remaining
        where remaining.customer_id = customer.id and remaining.deleted_at is null
      )
  where customer.id = order_row.customer_id;

  if order_row.inventory_track_id is not null then
    update public.inventory_tracks track
    set total_orders = (
          select count(*) from public.orders remaining
          where remaining.inventory_track_id = track.id and remaining.deleted_at is null
        ),
        lifetime_revenue = coalesce((
          select sum(payment.amount)
          from public.orders remaining
          join public.payments payment on payment.order_id = remaining.id and payment.status = 'confirmed'
          where remaining.inventory_track_id = track.id and remaining.deleted_at is null
        ), 0),
        last_ordered_at = (
          select max(remaining.created_at) from public.orders remaining
          where remaining.inventory_track_id = track.id and remaining.deleted_at is null
        )
    where track.id = order_row.inventory_track_id;
  end if;

  delete from public.audit_logs
  where (entity_type = 'orders' and entity_id = p_order_id)
     or (entity_type = 'payments' and entity_id = any(payment_ids));

  insert into public.order_deletion_tombstones (
    id, deleted_by, affected_counts, removed_financial_amount, proof_cleanup_status
  ) values (
    deletion_id_value, auth.uid(), affected_value, removed_amount,
    case when cardinality(proof_paths_value) = 0 then 'completed' else 'pending' end
  );

  insert into public.order_deletion_jobs (deletion_id, proof_paths, status)
  values (
    deletion_id_value,
    proof_paths_value,
    case when cardinality(proof_paths_value) = 0 then 'completed' else 'pending' end
  );

  return jsonb_build_object(
    'deletionId', deletion_id_value,
    'affected', affected_value,
    'removedFinancialAmount', removed_amount,
    'proofPaths', to_jsonb(proof_paths_value),
    'proofCleanupStatus', case when cardinality(proof_paths_value) = 0 then 'completed' else 'pending' end
  );
end;
$$;

create or replace function public.record_order_deletion_cleanup(
  p_deletion_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;

  update public.order_deletion_jobs
  set status = case when p_success then 'completed' else 'failed' end,
      proof_paths = case when p_success then '{}'::text[] else proof_paths end,
      attempts = attempts + 1,
      last_error = case when p_success then null else left(coalesce(p_error, 'Storage cleanup failed'), 500) end,
      updated_at = now()
  where deletion_id = p_deletion_id;

  update public.order_deletion_tombstones
  set proof_cleanup_status = case when p_success then 'completed' else 'failed' end
  where id = p_deletion_id;
end;
$$;

revoke all on public.order_deletion_tombstones, public.order_deletion_jobs from anon, authenticated;
grant select on public.order_deletion_tombstones, public.order_deletion_jobs to authenticated;
revoke all on function public.preview_order_deletion(uuid) from public;
revoke all on function public.confirm_order_deletion(uuid, text) from public;
revoke all on function public.record_order_deletion_cleanup(uuid, boolean, text) from public;
grant execute on function public.preview_order_deletion(uuid) to authenticated;
grant execute on function public.confirm_order_deletion(uuid, text) to authenticated;
grant execute on function public.record_order_deletion_cleanup(uuid, boolean, text) to authenticated;

commit;
