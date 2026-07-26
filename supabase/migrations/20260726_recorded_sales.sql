begin;

do $$
begin
  if to_regclass('public.recorded_sales') is null
     and to_regclass('public.legacy_orders') is not null then
    alter table public.legacy_orders rename to recorded_sales;
  end if;
end;
$$;

alter table public.recorded_sales
  add column if not exists verified boolean not null default false;
alter table public.recorded_sales
  add column if not exists verified_at timestamptz;

drop index if exists public.legacy_orders_date_idx;
drop index if exists public.legacy_orders_phone_idx;
create index if not exists recorded_sales_date_idx
  on public.recorded_sales(record_date desc);
create index if not exists recorded_sales_phone_idx
  on public.recorded_sales(phone);

alter table public.recorded_sales enable row level security;
drop policy if exists "legacy orders read authenticated" on public.recorded_sales;
drop policy if exists "recorded sales read authenticated" on public.recorded_sales;
create policy "recorded sales read authenticated" on public.recorded_sales
for select to authenticated using (true);
drop policy if exists "legacy orders founder manage" on public.recorded_sales;
drop policy if exists "recorded sales founder manage" on public.recorded_sales;
create policy "recorded sales founder manage" on public.recorded_sales
for all to authenticated using (public.is_founder()) with check (public.is_founder());

grant select on public.recorded_sales to authenticated;
grant insert, update, delete on public.recorded_sales to authenticated;
revoke all on public.recorded_sales from anon;

update public.recorded_sales
set
  verified = true,
  verified_at = coalesce(verified_at, now())
where source_ref like 'owner-2026-07-%';

insert into public.wallet_transactions (
  type, amount, reference_type, reference_id, description, created_at
)
select
  'payment',
  quoted_amount,
  'recorded_sale',
  id,
  concat(
    'Owner-verified recorded sale',
    case
      when coalesce(track_title, raw_note, contact_name, phone) is null then ''
      else concat(' · ', coalesce(track_title, raw_note, contact_name, phone))
    end
  ),
  record_date::timestamp + interval '12 hours'
from public.recorded_sales
where verified
on conflict (reference_type, reference_id) do update set
  amount = excluded.amount,
  description = excluded.description;

create or replace function public.ai_business_summary(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  summary jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Invalid date range'; end if;
  if p_to - p_from > 366 then raise exception 'Date range cannot exceed 366 days'; end if;

  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'confirmedRevenue', coalesce((
      select sum(amount) from public.wallet_transactions
      where type = 'payment' and created_at::date between p_from and p_to
    ), 0),
    'expenses', abs(coalesce((
      select sum(amount) from public.wallet_transactions
      where type = 'expense' and created_at::date between p_from and p_to
    ), 0)),
    'withdrawals', abs(coalesce((
      select sum(amount) from public.wallet_transactions
      where type = 'withdrawal' and created_at::date between p_from and p_to
    ), 0)),
    'netWalletMovement', coalesce((
      select sum(amount) from public.wallet_transactions
      where created_at::date between p_from and p_to
    ), 0),
    'ordersCreated', (
      select count(*) from public.orders
      where deleted_at is null and created_at::date between p_from and p_to
    ),
    'ordersCompleted', (
      select count(*) from public.orders
      where deleted_at is null and completed_at::date between p_from and p_to
    ),
    'recordedSalesCount', (
      select count(*) from public.recorded_sales
      where verified and record_date between p_from and p_to
    ),
    'recordedSalesAmount', coalesce((
      select sum(quoted_amount) from public.recorded_sales
      where verified and record_date between p_from and p_to
    ), 0),
    'recordedSalesNote',
      'Owner-verified imported sales are included in confirmed revenue and wallet totals through the immutable wallet ledger.'
  ) into summary;

  return summary;
end;
$$;

commit;

select
  to_regclass('public.recorded_sales')::text as table_name,
  count(*)::integer as verified_sales,
  sum(quoted_amount)::numeric(12,2) as sales_total,
  (
    select count(*)::integer
    from public.wallet_transactions
    where type = 'payment' and reference_type = 'recorded_sale'
  ) as ledger_entries,
  (
    select sum(amount)::numeric(12,2)
    from public.wallet_transactions
    where type = 'payment'
  ) as total_revenue
from public.recorded_sales
where verified;
