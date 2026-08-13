begin;

alter table public.profiles
  add column if not exists can_submit_expenses boolean not null default false;

alter table public.expenses
  add column if not exists status text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

update public.expenses set status = 'approved' where status is null;
alter table public.expenses alter column status set default 'pending';
alter table public.expenses alter column status set not null;
alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add constraint expenses_status_check check (status in ('pending', 'approved', 'rejected'));

create table if not exists public.monthly_revenue_targets (
  month_start date primary key,
  target_amount numeric(14,2) not null check (target_amount > 0),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (month_start = date_trunc('month', month_start)::date)
);

drop trigger if exists monthly_revenue_targets_audit on public.monthly_revenue_targets;
create trigger monthly_revenue_targets_audit after insert or update or delete on public.monthly_revenue_targets
for each row execute function public.write_audit_log();

create or replace function public.can_submit_expense()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and (role = 'founder' or can_submit_expenses)
  );
$$;

drop trigger if exists expenses_before_insert on public.expenses;
drop function if exists public.on_expense_created();

create or replace function public.protect_expense_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('akocp.internal', true), '') <> '1' then
    raise exception 'Use the expense review workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_protect_status on public.expenses;
create trigger expenses_protect_status before update on public.expenses
for each row execute function public.protect_expense_status();

create or replace function public.on_expense_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare submitter_name text;
begin
  select full_name into submitter_name from public.profiles where id = new.added_by;
  perform public.notify_founders(
    'system', 'Expense awaiting approval',
    submitter_name || ' submitted ₹' || trim(to_char(new.amount, 'FM999999990.00')) || ' for ' || new.description,
    'expense', new.id
  );
  return new;
end;
$$;

drop trigger if exists expenses_after_insert on public.expenses;
create trigger expenses_after_insert after insert on public.expenses
for each row execute function public.on_expense_submitted();

create or replace function public.review_expense(p_expense_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare expense_row public.expenses%rowtype;
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
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

create or replace function public.set_expense_permission(p_profile_id uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  update public.profiles set can_submit_expenses = p_allowed where id = p_profile_id and active;
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

create or replace function public.upsert_monthly_revenue_target(p_month_start date, p_target_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_month_start <> date_trunc('month', p_month_start)::date then raise exception 'Month must start on day one'; end if;
  if p_target_amount <= 0 then raise exception 'Target must be greater than zero'; end if;
  insert into public.monthly_revenue_targets (month_start, target_amount, updated_by)
  values (p_month_start, p_target_amount, auth.uid())
  on conflict (month_start) do update
    set target_amount = excluded.target_amount, updated_by = auth.uid(), updated_at = now();
end;
$$;

alter table public.monthly_revenue_targets enable row level security;

drop policy if exists "expenses read authenticated" on public.expenses;
drop policy if exists "expenses founder insert" on public.expenses;
drop policy if exists "expenses founder update" on public.expenses;
drop policy if exists "expenses read permitted" on public.expenses;
create policy "expenses read permitted" on public.expenses for select to authenticated
  using (deleted_at is null and (public.is_founder() or added_by = auth.uid()));
drop policy if exists "expenses submit permitted" on public.expenses;
create policy "expenses submit permitted" on public.expenses for insert to authenticated
  with check (
    added_by = auth.uid() and status = 'pending' and reviewed_by is null
    and reviewed_at is null and deleted_at is null and public.can_submit_expense()
  );

drop policy if exists "monthly targets read authenticated" on public.monthly_revenue_targets;
create policy "monthly targets read authenticated" on public.monthly_revenue_targets for select to authenticated using (true);

drop policy if exists "expense receipt read permitted" on storage.objects;
drop policy if exists "expense receipt upload permitted" on storage.objects;
drop policy if exists "expense receipt read founder" on storage.objects;
drop policy if exists "expense receipt upload founder" on storage.objects;
create policy "expense receipt read permitted" on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and (public.is_founder() or (storage.foldername(name))[1] = auth.uid()::text));
create policy "expense receipt upload permitted" on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and public.can_submit_expense() and (storage.foldername(name))[1] = auth.uid()::text);

grant select on public.monthly_revenue_targets to authenticated;
grant execute on function public.can_submit_expense() to authenticated;
grant execute on function public.review_expense(uuid,text) to authenticated;
grant execute on function public.set_expense_permission(uuid,boolean) to authenticated;
grant execute on function public.upsert_monthly_revenue_target(date,numeric) to authenticated;
revoke all on public.monthly_revenue_targets from anon;

do $$ begin
  alter publication supabase_realtime add table public.monthly_revenue_targets;
exception when duplicate_object then null; end $$;

commit;
