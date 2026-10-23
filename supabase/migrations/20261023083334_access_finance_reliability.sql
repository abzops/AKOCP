-- Additive hardening only. Existing profiles, business rows, amounts and IDs are preserved.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Acquire the complete table set without waiting. This avoids holding a subset
-- of policy locks while an existing joined read waits on another table.
lock table public.profiles, public.services, public.customers, public.inventory_tracks,
  public.orders, public.payments, public.expenses, public.withdrawals,
  public.wallet_transactions, public.notifications, public.audit_logs,
  public.ai_settings, public.ai_conversations, public.ai_messages,
  public.ai_action_proposals, public.ai_usage_daily, public.recorded_sales,
  public.monthly_revenue_targets, public.customer_privacy_purge_jobs,
  public.customer_privacy_purge_tombstones, public.order_deletion_jobs,
  public.order_deletion_tombstones, storage.objects
in access exclusive mode nowait;

create schema if not exists akocp_private;
grant usage on schema akocp_private to authenticated;

create or replace function akocp_private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active);
$$;
revoke all on function akocp_private.is_active_user() from public, anon;
grant execute on function akocp_private.is_active_user() to authenticated;

create or replace function akocp_private.assert_active_user()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not akocp_private.is_active_user() then
    raise exception 'Active workspace access is required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function akocp_private.assert_active_user() from public, anon;
grant execute on function akocp_private.assert_active_user() to authenticated;

-- New registrations cannot grant themselves access. No existing profile is changed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, email, role, active)
  values(new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''), 'operations', false)
  on conflict(id) do nothing;
  return new;
end;
$$;

-- Founders can see accounts awaiting approval; pending users can see only themselves.
alter policy "profiles read authenticated" on public.profiles
  using (public.is_founder() or active or id = auth.uid());
drop policy if exists "active workspace profile access" on public.profiles;
create policy "active workspace profile access" on public.profiles as restrictive
for all to authenticated
using ((select akocp_private.is_active_user()) or id = (select auth.uid()))
with check ((select akocp_private.is_active_user()));

-- Restrictive policies intersect existing ownership/Founder policies rather than widening them.
do $policies$
declare t text;
begin
  foreach t in array array['services','customers','inventory_tracks','orders','payments','expenses',
    'withdrawals','wallet_transactions','notifications','audit_logs','ai_settings','ai_conversations',
    'ai_messages','ai_action_proposals','ai_usage_daily','recorded_sales','monthly_revenue_targets',
    'customer_privacy_purge_jobs','customer_privacy_purge_tombstones',
    'order_deletion_jobs','order_deletion_tombstones']
  loop
    if to_regclass('public.' || t) is null then
      raise exception 'Required table % is missing; apply earlier migrations first', t;
    end if;
    execute format('drop policy if exists "active workspace access" on public.%I', t);
    execute format('create policy "active workspace access" on public.%I as restrictive for all to authenticated using ((select akocp_private.is_active_user())) with check ((select akocp_private.is_active_user()))', t);
  end loop;
end;
$policies$;

drop policy if exists "active workspace storage access" on storage.objects;
create policy "active workspace storage access" on storage.objects as restrictive
for all to authenticated
using (bucket_id not in ('payment-proofs','expense-receipts') or (select akocp_private.is_active_user()))
with check (bucket_id not in ('payment-proofs','expense-receipts') or (select akocp_private.is_active_user()));

-- Orders are created through create_order, which snapshots controlled prices and maintains totals.
alter policy "orders insert authenticated" on public.orders with check (false);

create or replace function public.set_profile_access(p_profile_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  if p_profile_id = auth.uid() then raise exception 'You cannot change your own access'; end if;
  update public.profiles set active = p_active where id = p_profile_id;
  if not found then raise exception 'Profile not found'; end if;
end;
$$;
revoke all on function public.set_profile_access(uuid,boolean) from public, anon;
grant execute on function public.set_profile_access(uuid,boolean) to authenticated;


create or replace function public.review_withdrawal(p_withdrawal_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  withdrawal_row public.withdrawals%rowtype;
  requester_name text;
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  -- One shared transaction lock serializes both outflow approval paths.
  perform pg_advisory_xact_lock(hashtext('akocp-wallet-outflow'));
  select * into withdrawal_row from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if withdrawal_row.status <> 'pending' then raise exception 'Withdrawal has already been reviewed'; end if;
  if p_decision = 'approved' and withdrawal_row.amount > public.wallet_balance() then raise exception 'Withdrawal exceeds available wallet balance'; end if;

  perform set_config('akocp.internal', '1', true);
  update public.withdrawals set status = p_decision, approved_by = auth.uid(), reviewed_at = now() where id = p_withdrawal_id;
  if p_decision = 'approved' then
    select full_name into requester_name from public.profiles where id = withdrawal_row.requested_by;
    insert into public.wallet_transactions (type, amount, reference_type, reference_id, description)
    values ('withdrawal', -withdrawal_row.amount, 'withdrawal', withdrawal_row.id, 'Approved withdrawal for ' || requester_name);
  end if;
end;
$$;

create or replace function public.review_expense(p_expense_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare expense_row public.expenses%rowtype;
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  -- One shared transaction lock serializes both outflow approval paths.
  perform pg_advisory_xact_lock(hashtext('akocp-wallet-outflow'));
  select * into expense_row from public.expenses where id = p_expense_id and deleted_at is null for update;
  if not found then raise exception 'Expense not found'; end if;
  if expense_row.status <> 'pending' then raise exception 'Expense has already been reviewed'; end if;
  if p_decision = 'approved' and expense_row.amount > public.wallet_balance() then
    raise exception 'Expense exceeds the available wallet balance';
  end if;
  perform set_config('akocp.internal', '1', true);
  update public.expenses
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_expense_id;
  if p_decision = 'approved' then
    insert into public.wallet_transactions (type, amount, reference_type, reference_id, description)
    values ('expense', -expense_row.amount, 'expense', expense_row.id, expense_row.description)
    on conflict (reference_type, reference_id) do nothing;
  end if;
  insert into public.notifications (recipient_id, type, title, message, entity_type, entity_id)
  values (
    expense_row.added_by, 'system', 'Expense ' || p_decision,
    'Your ₹' || trim(to_char(expense_row.amount, 'FM999999990.00')) || ' expense was ' || p_decision || '.',
    'expense', expense_row.id
  );
end;
$$;


-- Guard existing SECURITY DEFINER entry points using their installed definitions.
-- This preserves changes introduced by earlier migrations and never rewrites business rows.
do $guards$
declare f record; definition text;
begin
  for f in
    select p.oid, p.proname, p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and l.lanname = 'plpgsql'
      and p.proname = any(array['create_order','complete_order','claim_ai_action_proposal',
        'finish_ai_action_proposal','cancel_ai_action_proposal','consume_ai_request',
        'record_ai_usage_tokens','inventory_summary','search_inventory','upsert_monthly_revenue_target',
        'delete_ai_conversation'])
  loop
    definition := pg_get_functiondef(f.oid);
    if position('perform akocp_private.assert_active_user()' in definition) = 0 then
      definition := regexp_replace(definition, '\mbegin\M',
        E'begin\n  perform akocp_private.assert_active_user();', 'i');
      execute definition;
    end if;
    execute format('revoke all on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated', f.signature);
  end loop;
end;
$guards$;

-- Wallet helper is not an anonymous endpoint. Triggers and owner-run SQL retain access.
create or replace function public.wallet_balance()
returns numeric language plpgsql stable security definer set search_path = '' as $$
begin
  perform akocp_private.assert_active_user();
  return (select coalesce(sum(amount), 0)::numeric from public.wallet_transactions);
end;
$$;
revoke all on function public.wallet_balance() from public, anon;
grant execute on function public.wallet_balance() to authenticated;

revoke all on function public.next_order_number() from public, anon, authenticated;
revoke all on function public.notify_founders(text,text,text,text,uuid) from public, anon, authenticated;

-- Prevent direct status edits from bypassing ledger creation, and protect settled amounts.
create or replace function akocp_private.protect_payment_workflow()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'confirmed' and
     (new.amount is distinct from old.amount or new.order_id is distinct from old.order_id) then
    raise exception 'Confirmed payment identity and amount are immutable';
  end if;
  if (new.status is distinct from old.status or new.confirmed_by is distinct from old.confirmed_by
      or new.confirmed_at is distinct from old.confirmed_at)
      and coalesce(current_setting('akocp.internal', true), '') <> '1' then
    raise exception 'Use the payment confirmation workflow';
  end if;
  return new;
end;
$$;
drop trigger if exists payments_protect_workflow on public.payments;
create trigger payments_protect_workflow before update on public.payments
for each row execute function akocp_private.protect_payment_workflow();

commit;
