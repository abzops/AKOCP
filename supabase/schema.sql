-- Abhinand Karaokes Operations Control Center (AK OCP) v1
-- Run this entire file once in the Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) >= 2),
  email text not null,
  role text not null default 'operations' check (role in ('founder', 'operations')),
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2}[0-9]{3}$'),
  name text not null,
  description text,
  price numeric(12,2) not null check (price > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  phone text not null unique check (phone ~ '^[0-9]{10,15}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  total_orders integer not null default 0 check (total_orders >= 0),
  lifetime_revenue numeric(14,2) not null default 0 check (lifetime_revenue >= 0),
  notes text,
  last_ordered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.inventory_tracks (
  id uuid primary key default gen_random_uuid(),
  track_name text not null check (char_length(trim(track_name)) >= 2),
  english_title text,
  malayalam_title text,
  language text not null,
  tags text[] not null default '{}',
  file_path text,
  created_from_order_id uuid,
  total_orders integer not null default 0 check (total_orders >= 0),
  lifetime_revenue numeric(14,2) not null default 0 check (lifetime_revenue >= 0),
  last_ordered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers(id),
  service_id uuid not null references public.services(id),
  inventory_track_id uuid references public.inventory_tracks(id),
  track_name text not null check (char_length(trim(track_name)) >= 2),
  language text not null,
  due_date date,
  assigned_to uuid references public.profiles(id),
  status text not null default 'payment_pending' check (status in ('inquiry', 'payment_pending', 'in_progress', 'completed', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'proof_uploaded', 'confirmed', 'refunded')),
  price numeric(12,2) not null check (price > 0),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  delivered_at timestamptz,
  deleted_at timestamptz
);

alter table public.inventory_tracks
  drop constraint if exists inventory_tracks_created_from_order_id_fkey;
alter table public.inventory_tracks
  add constraint inventory_tracks_created_from_order_id_fkey
  foreign key (created_from_order_id) references public.orders(id) on delete set null;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  amount numeric(12,2) not null check (amount > 0),
  proof_path text,
  upi_reference text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  uploaded_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists payments_one_open_per_order
  on public.payments(order_id)
  where status in ('pending', 'confirmed');

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (category in ('meta_ads', 'travel', 'food', 'internet', 'equipment', 'miscellaneous')),
  description text not null check (char_length(trim(description)) >= 2),
  receipt_path text,
  expense_date date not null default current_date,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (reason in ('salary', 'profit_share', 'travel', 'food', 'miscellaneous')),
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('payment', 'expense', 'withdrawal', 'adjustment')),
  amount numeric(12,2) not null check (amount <> 0),
  reference_type text not null,
  reference_id uuid not null,
  description text not null,
  created_at timestamptz not null default now(),
  unique (reference_type, reference_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('new_order', 'payment_uploaded', 'withdrawal_requested', 'order_completed', 'system')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders(created_at desc) where deleted_at is null;
create index if not exists orders_status_idx on public.orders(status, due_date) where deleted_at is null;
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc) where deleted_at is null;
create index if not exists payments_order_idx on public.payments(order_id, created_at desc);
create index if not exists expenses_date_idx on public.expenses(expense_date desc) where deleted_at is null;
create index if not exists withdrawals_status_idx on public.withdrawals(status, created_at desc);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists inventory_track_name_trgm_idx on public.inventory_tracks using gin (track_name gin_trgm_ops);
create index if not exists inventory_english_title_trgm_idx on public.inventory_tracks using gin (english_title gin_trgm_ops);
create index if not exists inventory_malayalam_title_trgm_idx on public.inventory_tracks using gin (malayalam_title gin_trgm_ops);
create index if not exists customers_name_trgm_idx on public.customers using gin (name gin_trgm_ops);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists inventory_tracks_set_updated_at on public.inventory_tracks;
create trigger inventory_tracks_set_updated_at before update on public.inventory_tracks for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();

create or replace function public.protect_order_invariants()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  internal_change boolean := coalesce(current_setting('akocp.internal', true), '') = '1';
begin
  if new.order_number is distinct from old.order_number
     or new.customer_id is distinct from old.customer_id
     or new.service_id is distinct from old.service_id
     or new.track_name is distinct from old.track_name
     or new.language is distinct from old.language
     or new.price is distinct from old.price
     or new.created_by is distinct from old.created_by then
    raise exception 'Order identity and price snapshot are immutable';
  end if;
  if new.payment_status is distinct from old.payment_status and not internal_change then
    raise exception 'Payment status must be changed through the payment workflow';
  end if;
  if new.inventory_track_id is distinct from old.inventory_track_id and not internal_change then
    raise exception 'Inventory linking must use the completion workflow';
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' and not internal_change then
    raise exception 'Use the complete order workflow';
  end if;
  if new.status = 'delivered' and old.status <> 'completed' then
    raise exception 'Only a completed order can be delivered';
  end if;
  if old.status in ('delivered', 'cancelled') and new.status is distinct from old.status then
    raise exception 'Finalized orders cannot change status';
  end if;
  if new.status = 'completed' and new.payment_status <> 'confirmed' then
    raise exception 'Payment must be confirmed before completion';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_protect_invariants on public.orders;
create trigger orders_protect_invariants before update on public.orders for each row execute function public.protect_order_invariants();

create or replace function public.protect_withdrawal_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('akocp.internal', true), '') <> '1' then
    raise exception 'Use the withdrawal review workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists withdrawals_protect_status on public.withdrawals;
create trigger withdrawals_protect_status before update on public.withdrawals for each row execute function public.protect_withdrawal_status();

create or replace function public.protect_computed_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('akocp.internal', true), '') <> '1' then
    if tg_table_name = 'customers'
       and (new.total_orders is distinct from old.total_orders or new.lifetime_revenue is distinct from old.lifetime_revenue) then
      raise exception 'Customer totals are maintained by order and payment workflows';
    end if;
    if tg_table_name = 'inventory_tracks'
       and (new.total_orders is distinct from old.total_orders or new.lifetime_revenue is distinct from old.lifetime_revenue) then
      raise exception 'Track totals are maintained by order and payment workflows';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_protect_totals on public.customers;
create trigger customers_protect_totals before update on public.customers for each row execute function public.protect_computed_totals();
drop trigger if exists inventory_tracks_protect_totals on public.inventory_tracks;
create trigger inventory_tracks_protect_totals before update on public.inventory_tracks for each row execute function public.protect_computed_totals();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_founder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'founder', false);
$$;

create or replace function public.wallet_balance()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric from public.wallet_transactions;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
begin
  perform pg_advisory_xact_lock(hashtext('akocp-founder-bootstrap'));
  if exists (select 1 from public.profiles where role = 'founder') then
    assigned_role := 'operations';
  else
    assigned_role := 'founder';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    assigned_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill accounts if Auth users existed before this schema was run.
with ranked_users as (
  select id, email, raw_user_meta_data, row_number() over (order by created_at, id) as row_number
  from auth.users
)
insert into public.profiles (id, full_name, email, role)
select
  id,
  coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), split_part(email, '@', 1)),
  coalesce(email, ''),
  case when row_number = 1 and not exists (select 1 from public.profiles where role = 'founder') then 'founder' else 'operations' end
from ranked_users
on conflict (id) do nothing;

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
begin
  if tg_op = 'INSERT' then
    row_id := new.id;
    before_value := null;
    after_value := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    row_id := new.id;
    before_value := to_jsonb(old);
    after_value := to_jsonb(new);
  else
    row_id := old.id;
    before_value := to_jsonb(old);
    after_value := null;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    row_id,
    before_value,
    after_value
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles','services','customers','inventory_tracks','orders','payments','expenses','withdrawals']
  loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.notify_founders(
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (recipient_id, type, title, message, entity_type, entity_id)
  select id, p_type, p_title, p_message, p_entity_type, p_entity_id
  from public.profiles
  where role = 'founder' and active = true;
$$;

create or replace function public.next_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  day_prefix text := 'AK-' || to_char(timezone('Asia/Kolkata', now()), 'YYMMDD') || '-';
  next_value integer;
begin
  perform pg_advisory_xact_lock(hashtext(day_prefix));
  select coalesce(max(right(order_number, 3)::integer), 0) + 1
  into next_value
  from public.orders
  where order_number like day_prefix || '%';
  return day_prefix || lpad(next_value::text, 3, '0');
end;
$$;

create or replace function public.create_order(
  p_customer_name text,
  p_phone text,
  p_whatsapp text,
  p_customer_notes text,
  p_service_id uuid,
  p_inventory_track_id uuid,
  p_track_name text,
  p_language text,
  p_due_date date,
  p_assigned_to uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  service_row public.services%rowtype;
  customer_id_value uuid;
  order_id_value uuid;
  order_number_value text;
  normalized_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  normalized_whatsapp text := regexp_replace(coalesce(p_whatsapp, p_phone, ''), '[^0-9]', '', 'g');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform set_config('akocp.internal', '1', true);
  if char_length(normalized_phone) < 10 then raise exception 'A valid phone number is required'; end if;

  select * into service_row from public.services where id = p_service_id and active = true;
  if not found then raise exception 'Select an active service'; end if;
  if p_inventory_track_id is not null and service_row.code <> 'EX250' then raise exception 'Existing inventory must use EX250'; end if;
  if p_inventory_track_id is null and service_row.code = 'EX250' then raise exception 'EX250 requires an inventory track'; end if;

  insert into public.customers (name, phone, whatsapp, notes, last_ordered_at)
  values (trim(p_customer_name), normalized_phone, nullif(normalized_whatsapp, ''), nullif(trim(p_customer_notes), ''), now())
  on conflict (phone) do update set
    name = excluded.name,
    whatsapp = coalesce(excluded.whatsapp, public.customers.whatsapp),
    notes = coalesce(excluded.notes, public.customers.notes),
    last_ordered_at = now(),
    deleted_at = null
  returning id into customer_id_value;

  order_number_value := public.next_order_number();
  insert into public.orders (
    order_number, customer_id, service_id, inventory_track_id, track_name, language,
    due_date, assigned_to, status, payment_status, price, notes, created_by
  ) values (
    order_number_value, customer_id_value, service_row.id, p_inventory_track_id, trim(p_track_name), p_language,
    p_due_date, coalesce(p_assigned_to, auth.uid()), 'payment_pending', 'unpaid', service_row.price, nullif(trim(p_notes), ''), auth.uid()
  ) returning id into order_id_value;

  update public.customers set total_orders = total_orders + 1, last_ordered_at = now() where id = customer_id_value;
  if p_inventory_track_id is not null then
    update public.inventory_tracks
      set total_orders = total_orders + 1, last_ordered_at = now()
      where id = p_inventory_track_id and deleted_at is null;
    if not found then raise exception 'Inventory track not found'; end if;
  end if;

  perform public.notify_founders('new_order', 'New order', order_number_value || ' · ' || trim(p_track_name), 'order', order_id_value);
  return order_id_value;
end;
$$;

create or replace function public.on_payment_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_number_value text;
begin
  perform set_config('akocp.internal', '1', true);
  update public.orders set payment_status = 'proof_uploaded' where id = new.order_id;
  select order_number into order_number_value from public.orders where id = new.order_id;
  perform public.notify_founders('payment_uploaded', 'Payment proof uploaded', order_number_value || ' · ₹' || trim(to_char(new.amount, 'FM999999990.00')), 'order', new.order_id);
  return new;
end;
$$;

drop trigger if exists payments_after_insert on public.payments;
create trigger payments_after_insert after insert on public.payments for each row execute function public.on_payment_uploaded();

create or replace function public.confirm_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  order_row public.orders%rowtype;
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if payment_row.status = 'confirmed' then return; end if;
  if payment_row.status <> 'pending' then raise exception 'Only pending payments can be confirmed'; end if;

  select * into order_row from public.orders where id = payment_row.order_id for update;
  perform set_config('akocp.internal', '1', true);
  update public.payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_payment_id;
  update public.orders
    set payment_status = 'confirmed', status = case when status in ('inquiry', 'payment_pending') then 'in_progress' else status end
    where id = order_row.id;
  insert into public.wallet_transactions (type, amount, reference_type, reference_id, description)
  values ('payment', payment_row.amount, 'payment', payment_row.id, 'Payment for ' || order_row.order_number)
  on conflict (reference_type, reference_id) do nothing;
  update public.customers set lifetime_revenue = lifetime_revenue + payment_row.amount where id = order_row.customer_id;
  if order_row.inventory_track_id is not null then
    update public.inventory_tracks set lifetime_revenue = lifetime_revenue + payment_row.amount where id = order_row.inventory_track_id;
  end if;
end;
$$;

create or replace function public.complete_order(
  p_order_id uuid,
  p_add_to_inventory boolean,
  p_english_title text,
  p_malayalam_title text,
  p_tags text[],
  p_file_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  new_track_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into order_row from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.payment_status <> 'confirmed' then raise exception 'Confirm payment before completing the order'; end if;
  if order_row.status in ('cancelled', 'delivered') then raise exception 'This order cannot be completed'; end if;
  if order_row.status = 'completed' then return order_row.inventory_track_id; end if;

  new_track_id := order_row.inventory_track_id;
  if coalesce(p_add_to_inventory, false) and new_track_id is null then
    insert into public.inventory_tracks (
      track_name, english_title, malayalam_title, language, tags, file_path,
      created_from_order_id, total_orders, lifetime_revenue, last_ordered_at
    ) values (
      order_row.track_name, coalesce(nullif(trim(p_english_title), ''), order_row.track_name),
      nullif(trim(p_malayalam_title), ''), order_row.language, coalesce(p_tags, '{}'), nullif(trim(p_file_path), ''),
      order_row.id, 1, order_row.price, now()
    ) returning id into new_track_id;
  end if;

  perform set_config('akocp.internal', '1', true);
  update public.orders
    set status = 'completed', completed_at = now(), inventory_track_id = new_track_id
    where id = order_row.id;
  perform public.notify_founders('order_completed', 'Order completed', order_row.order_number || ' · ' || order_row.track_name, 'order', order_row.id);
  return new_track_id;
end;
$$;

create or replace function public.on_expense_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount > public.wallet_balance() then raise exception 'Expense exceeds the available wallet balance'; end if;
  insert into public.wallet_transactions (type, amount, reference_type, reference_id, description)
  values ('expense', -new.amount, 'expense', new.id, new.description);
  return new;
end;
$$;

drop trigger if exists expenses_before_insert on public.expenses;
create trigger expenses_before_insert before insert on public.expenses for each row execute function public.on_expense_created();

create or replace function public.on_withdrawal_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_name text;
begin
  select full_name into requester_name from public.profiles where id = new.requested_by;
  perform public.notify_founders('withdrawal_requested', 'Withdrawal requested', requester_name || ' requested ₹' || trim(to_char(new.amount, 'FM999999990.00')), 'withdrawal', new.id);
  return new;
end;
$$;

drop trigger if exists withdrawals_after_insert on public.withdrawals;
create trigger withdrawals_after_insert after insert on public.withdrawals for each row execute function public.on_withdrawal_requested();

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

create or replace function public.set_profile_role(p_profile_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  if p_role not in ('founder', 'operations') then raise exception 'Invalid role'; end if;
  if p_profile_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  update public.profiles set role = p_role where id = p_profile_id;
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

insert into public.services (code, name, description, price, active, sort_order)
values
  ('AU150', 'Audio Karaoke (Without Lyrics)', 'Clean instrumental audio karaoke without on-screen lyrics.', 150, true, 1),
  ('EX250', 'Ready-Made Karaoke Video', 'An existing karaoke track from the reusable inventory.', 250, true, 2),
  ('ML350', 'Custom Malayalam Karaoke Video', 'A new custom karaoke video for a Malayalam song.', 350, true, 3),
  ('OL450', 'Custom Other Language Karaoke Video', 'A new custom karaoke video in any non-Malayalam language.', 450, true, 4)
on conflict (code) do nothing;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.inventory_tracks enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.withdrawals enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles read authenticated" on public.profiles;
create policy "profiles read authenticated" on public.profiles for select to authenticated using (active = true or id = auth.uid());
drop policy if exists "profiles founder update" on public.profiles;
create policy "profiles founder update" on public.profiles for update to authenticated using (public.is_founder()) with check (public.is_founder());

drop policy if exists "services read authenticated" on public.services;
create policy "services read authenticated" on public.services for select to authenticated using (true);
drop policy if exists "services founder update" on public.services;
create policy "services founder update" on public.services for update to authenticated using (public.is_founder()) with check (public.is_founder());

drop policy if exists "customers read authenticated" on public.customers;
create policy "customers read authenticated" on public.customers for select to authenticated using (deleted_at is null);
drop policy if exists "customers insert authenticated" on public.customers;
create policy "customers insert authenticated" on public.customers for insert to authenticated with check (true);
drop policy if exists "customers update authenticated" on public.customers;
create policy "customers update authenticated" on public.customers for update to authenticated using (deleted_at is null) with check (true);

drop policy if exists "inventory read authenticated" on public.inventory_tracks;
create policy "inventory read authenticated" on public.inventory_tracks for select to authenticated using (deleted_at is null);
drop policy if exists "inventory insert authenticated" on public.inventory_tracks;
create policy "inventory insert authenticated" on public.inventory_tracks for insert to authenticated with check (true);
drop policy if exists "inventory update authenticated" on public.inventory_tracks;
create policy "inventory update authenticated" on public.inventory_tracks for update to authenticated using (deleted_at is null) with check (true);

drop policy if exists "orders read authenticated" on public.orders;
create policy "orders read authenticated" on public.orders for select to authenticated using (deleted_at is null);
drop policy if exists "orders insert authenticated" on public.orders;
create policy "orders insert authenticated" on public.orders for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "orders update authenticated" on public.orders;
create policy "orders update authenticated" on public.orders for update to authenticated using (deleted_at is null) with check (deleted_at is null);

drop policy if exists "payments read authenticated" on public.payments;
create policy "payments read authenticated" on public.payments for select to authenticated using (true);
drop policy if exists "payments upload authenticated" on public.payments;
create policy "payments upload authenticated" on public.payments for insert to authenticated with check (uploaded_by = auth.uid() and status = 'pending');
drop policy if exists "payments founder update" on public.payments;
create policy "payments founder update" on public.payments for update to authenticated using (public.is_founder()) with check (public.is_founder());

drop policy if exists "expenses read authenticated" on public.expenses;
create policy "expenses read authenticated" on public.expenses for select to authenticated using (deleted_at is null);
drop policy if exists "expenses founder insert" on public.expenses;
create policy "expenses founder insert" on public.expenses for insert to authenticated with check (public.is_founder() and added_by = auth.uid());
drop policy if exists "expenses founder update" on public.expenses;
create policy "expenses founder update" on public.expenses for update to authenticated using (public.is_founder() and deleted_at is null) with check (public.is_founder());

drop policy if exists "withdrawals read own or founder" on public.withdrawals;
create policy "withdrawals read own or founder" on public.withdrawals for select to authenticated using (requested_by = auth.uid() or public.is_founder());
drop policy if exists "withdrawals request authenticated" on public.withdrawals;
create policy "withdrawals request authenticated" on public.withdrawals for insert to authenticated with check (requested_by = auth.uid() and status = 'pending');
drop policy if exists "withdrawals founder update" on public.withdrawals;
create policy "withdrawals founder update" on public.withdrawals for update to authenticated using (public.is_founder()) with check (public.is_founder());

drop policy if exists "wallet read authenticated" on public.wallet_transactions;
create policy "wallet read authenticated" on public.wallet_transactions for select to authenticated using (true);

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "audit founder read" on public.audit_logs;
create policy "audit founder read" on public.audit_logs for select to authenticated using (public.is_founder());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png','image/jpeg','image/webp']),
  ('expense-receipts', 'expense-receipts', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment proof read authenticated" on storage.objects;
create policy "payment proof read authenticated" on storage.objects for select to authenticated using (bucket_id = 'payment-proofs');
drop policy if exists "payment proof upload own folder" on storage.objects;
create policy "payment proof upload own folder" on storage.objects for insert to authenticated with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "expense receipt read founder" on storage.objects;
create policy "expense receipt read founder" on storage.objects for select to authenticated using (bucket_id = 'expense-receipts' and public.is_founder());
drop policy if exists "expense receipt upload founder" on storage.objects;
create policy "expense receipt upload founder" on storage.objects for insert to authenticated with check (bucket_id = 'expense-receipts' and public.is_founder() and (storage.foldername(name))[1] = auth.uid()::text);

grant usage on schema public to authenticated;
grant select on public.profiles, public.services, public.customers, public.inventory_tracks, public.orders, public.payments, public.expenses, public.withdrawals, public.wallet_transactions, public.notifications, public.audit_logs to authenticated;
grant insert, update on public.customers, public.inventory_tracks, public.orders, public.payments, public.expenses, public.withdrawals, public.notifications to authenticated;
grant update on public.services, public.profiles to authenticated;
grant execute on function public.create_order(text,text,text,text,uuid,uuid,text,text,date,uuid,text) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.complete_order(uuid,boolean,text,text,text[],text) to authenticated;
grant execute on function public.review_withdrawal(uuid,text) to authenticated;
grant execute on function public.set_profile_role(uuid,text) to authenticated;
revoke all on public.wallet_transactions, public.audit_logs from anon;
revoke insert, update, delete on public.wallet_transactions, public.audit_logs from authenticated;

-- Hosted-free AI copilot. The model can read through the caller's RLS policies and
-- draft proposals, but business mutations still use the existing application
-- workflows after a human confirms them.
create table if not exists public.ai_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  primary_model text not null default 'qwen/qwen3.6-27b'
    check (primary_model in ('qwen/qwen3.6-27b', 'openai/gpt-oss-20b')),
  fallback_model text not null default 'openai/gpt-oss-20b'
    check (fallback_model in ('qwen/qwen3.6-27b', 'openai/gpt-oss-20b')),
  daily_request_limit integer not null default 40 check (daily_request_limit between 1 and 1000),
  max_output_tokens integer not null default 800 check (max_output_tokens between 64 and 1200),
  provider_status text not null default 'not_checked'
    check (provider_status in ('not_checked', 'available', 'degraded', 'unavailable')),
  provider_checked_at timestamptz,
  provider_error text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  sender text not null check (sender in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  model text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_action_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  assistant_message_id uuid references public.ai_messages(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in (
    'create_order',
    'update_order_status',
    'open_payment_proof',
    'confirm_payment',
    'complete_order',
    'deliver_order',
    'create_inventory_track',
    'update_customer',
    'create_expense',
    'request_withdrawal',
    'review_withdrawal',
    'update_service',
    'update_team_role'
  )),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  preconditions jsonb not null default '{}'::jsonb check (jsonb_typeof(preconditions) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'executing', 'confirmed', 'failed', 'expired', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  execution_result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

-- Historical entries supplied by the owner. These are deliberately separate
-- from confirmed orders, payments, and wallet transactions because the source
-- does not establish a service, payment confirmation, or delivery state.
create table if not exists public.legacy_orders (
  id uuid primary key default gen_random_uuid(),
  source_ref text not null unique,
  record_date date not null,
  contact_name text,
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  quoted_amount numeric(12,2) not null check (quoted_amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  fulfillment_hint text not null
    check (fulfillment_hint in ('audio', 'missing_track', 'named_track', 'unspecified')),
  track_title text,
  raw_note text,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_owner_updated_idx
  on public.ai_conversations(owner_id, updated_at desc);
create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages(conversation_id, created_at);
create index if not exists ai_proposals_requester_status_idx
  on public.ai_action_proposals(requested_by, status, expires_at);
create index if not exists legacy_orders_date_idx
  on public.legacy_orders(record_date desc);
create index if not exists legacy_orders_phone_idx
  on public.legacy_orders(phone);

drop trigger if exists ai_settings_set_updated_at on public.ai_settings;
create trigger ai_settings_set_updated_at before update on public.ai_settings
for each row execute function public.set_updated_at();
drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at before update on public.ai_conversations
for each row execute function public.set_updated_at();

create or replace function public.touch_ai_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists ai_messages_touch_conversation on public.ai_messages;
create trigger ai_messages_touch_conversation after insert on public.ai_messages
for each row execute function public.touch_ai_conversation();

create or replace function public.delete_ai_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.ai_conversations%rowtype;
  message_count integer;
  proposal_count integer;
begin
  select * into conversation_row
  from public.ai_conversations
  where id = p_conversation_id
  for update;

  if not found then raise exception 'Conversation not found'; end if;
  if conversation_row.owner_id <> auth.uid() and not public.is_founder() then
    raise exception 'You cannot delete this conversation';
  end if;

  select count(*) into message_count from public.ai_messages where conversation_id = p_conversation_id;
  select count(*) into proposal_count from public.ai_action_proposals where conversation_id = p_conversation_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    auth.uid(),
    'deleted',
    'ai_conversation',
    p_conversation_id,
    jsonb_build_object(
      'owner_id', conversation_row.owner_id,
      'created_at', conversation_row.created_at,
      'message_count', message_count,
      'proposal_count', proposal_count
    ),
    jsonb_build_object('content_removed', true)
  );

  delete from public.ai_conversations where id = p_conversation_id;
end;
$$;

create or replace function public.claim_ai_action_proposal(p_proposal_id uuid)
returns public.ai_action_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_row public.ai_action_proposals%rowtype;
begin
  select * into proposal_row
  from public.ai_action_proposals
  where id = p_proposal_id
  for update;

  if not found then raise exception 'Proposal not found'; end if;
  if proposal_row.requested_by <> auth.uid() then raise exception 'This proposal belongs to another user'; end if;
  if proposal_row.status <> 'pending' then raise exception 'Proposal has already been used'; end if;

  if proposal_row.expires_at <= now() then
    update public.ai_action_proposals
    set status = 'expired'
    where id = p_proposal_id
    returning * into proposal_row;
    return proposal_row;
  end if;

  update public.ai_action_proposals
  set status = 'executing', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_proposal_id
  returning * into proposal_row;

  return proposal_row;
end;
$$;

create or replace function public.finish_ai_action_proposal(
  p_proposal_id uuid,
  p_success boolean,
  p_result jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_action_proposals
  set
    status = case when p_success then 'confirmed' else 'failed' end,
    execution_result = coalesce(p_result, '{}'::jsonb)
  where id = p_proposal_id
    and requested_by = auth.uid()
    and confirmed_by = auth.uid()
    and status = 'executing';

  if not found then raise exception 'Proposal is not awaiting an execution result'; end if;
end;
$$;

create or replace function public.cancel_ai_action_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_action_proposals
  set status = case when expires_at <= now() then 'expired' else 'cancelled' end
  where id = p_proposal_id
    and requested_by = auth.uid()
    and status = 'pending';

  if not found then raise exception 'Proposal is not available to cancel'; end if;
end;
$$;

create or replace function public.update_ai_settings(
  p_enabled boolean,
  p_primary_model text,
  p_fallback_model text,
  p_daily_request_limit integer,
  p_max_output_tokens integer
)
returns public.ai_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.ai_settings%rowtype;
begin
  if not public.is_founder() then raise exception 'Founder permission is required'; end if;
  if p_primary_model not in ('qwen/qwen3.6-27b', 'openai/gpt-oss-20b') then raise exception 'Primary model is not allowed'; end if;
  if p_fallback_model not in ('qwen/qwen3.6-27b', 'openai/gpt-oss-20b') then raise exception 'Fallback model is not allowed'; end if;
  if p_daily_request_limit not between 1 and 1000 then raise exception 'Daily request limit is out of range'; end if;
  if p_max_output_tokens not between 64 and 1200 then raise exception 'Output token limit is out of range'; end if;

  update public.ai_settings
  set
    enabled = p_enabled,
    primary_model = p_primary_model,
    fallback_model = p_fallback_model,
    daily_request_limit = p_daily_request_limit,
    max_output_tokens = p_max_output_tokens,
    updated_by = auth.uid()
  where id = 1
  returning * into settings_row;

  return settings_row;
end;
$$;

create or replace function public.consume_ai_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.ai_settings%rowtype;
  usage_row public.ai_usage_daily%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;

  select * into settings_row from public.ai_settings where id = 1;
  if not settings_row.enabled then raise exception 'AI copilot is disabled'; end if;

  insert into public.ai_usage_daily (user_id, usage_date, request_count)
  values (auth.uid(), current_date, 0)
  on conflict (user_id, usage_date) do nothing;

  select * into usage_row
  from public.ai_usage_daily
  where user_id = auth.uid() and usage_date = current_date
  for update;

  if usage_row.request_count >= settings_row.daily_request_limit then
    raise exception 'Daily AI request limit reached';
  end if;

  update public.ai_usage_daily
  set request_count = request_count + 1, updated_at = now()
  where user_id = auth.uid() and usage_date = current_date
  returning * into usage_row;

  return jsonb_build_object(
    'requestCount', usage_row.request_count,
    'dailyLimit', settings_row.daily_request_limit,
    'remaining', greatest(settings_row.daily_request_limit - usage_row.request_count, 0),
    'inputTokens', usage_row.input_tokens,
    'outputTokens', usage_row.output_tokens
  );
end;
$$;

create or replace function public.record_ai_usage_tokens(
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_input_tokens < 0 or p_output_tokens < 0 then raise exception 'Token counts cannot be negative'; end if;

  update public.ai_usage_daily
  set
    input_tokens = input_tokens + least(p_input_tokens, 1000000),
    output_tokens = output_tokens + least(p_output_tokens, 1000000),
    updated_at = now()
  where user_id = auth.uid() and usage_date = current_date;
end;
$$;

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
    'legacyQuotedCount', (
      select count(*) from public.legacy_orders
      where record_date between p_from and p_to
    ),
    'legacyQuotedAmount', coalesce((
      select sum(quoted_amount) from public.legacy_orders
      where record_date between p_from and p_to
    ), 0),
    'legacyFinanceWarning',
      'Legacy quoted amounts are unverified and are excluded from confirmed revenue and wallet totals.'
  ) into summary;

  return summary;
end;
$$;

alter table public.ai_settings enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_action_proposals enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.legacy_orders enable row level security;

drop policy if exists "ai settings read authenticated" on public.ai_settings;
create policy "ai settings read authenticated" on public.ai_settings
for select to authenticated using (true);

drop policy if exists "ai conversations read own or founder" on public.ai_conversations;
create policy "ai conversations read own or founder" on public.ai_conversations
for select to authenticated using (owner_id = auth.uid() or public.is_founder());
drop policy if exists "ai conversations create own" on public.ai_conversations;
create policy "ai conversations create own" on public.ai_conversations
for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "ai conversations update own" on public.ai_conversations;
create policy "ai conversations update own" on public.ai_conversations
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "ai messages read conversation" on public.ai_messages;
create policy "ai messages read conversation" on public.ai_messages
for select to authenticated using (
  exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and (c.owner_id = auth.uid() or public.is_founder())
  )
);
drop policy if exists "ai messages create own conversation" on public.ai_messages;
create policy "ai messages create own conversation" on public.ai_messages
for insert to authenticated with check (
  exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "ai proposals read own or founder" on public.ai_action_proposals;
create policy "ai proposals read own or founder" on public.ai_action_proposals
for select to authenticated using (requested_by = auth.uid() or public.is_founder());
drop policy if exists "ai proposals create own" on public.ai_action_proposals;
create policy "ai proposals create own" on public.ai_action_proposals
for insert to authenticated with check (
  requested_by = auth.uid()
  and status = 'pending'
  and expires_at <= now() + interval '15 minutes'
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "ai usage read own or founder" on public.ai_usage_daily;
create policy "ai usage read own or founder" on public.ai_usage_daily
for select to authenticated using (user_id = auth.uid() or public.is_founder());
drop policy if exists "ai usage create own" on public.ai_usage_daily;
create policy "ai usage create own" on public.ai_usage_daily
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "ai usage update own" on public.ai_usage_daily;
create policy "ai usage update own" on public.ai_usage_daily
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "legacy orders read authenticated" on public.legacy_orders;
create policy "legacy orders read authenticated" on public.legacy_orders
for select to authenticated using (true);
drop policy if exists "legacy orders founder manage" on public.legacy_orders;
create policy "legacy orders founder manage" on public.legacy_orders
for all to authenticated using (public.is_founder()) with check (public.is_founder());

insert into public.legacy_orders (
  source_ref, record_date, contact_name, phone, quoted_amount,
  fulfillment_hint, track_title, raw_note
)
values
  ('owner-2026-07-06-01', '2026-07-06', null, '9037922963', 150, 'audio', null, 'audio'),
  ('owner-2026-07-06-02', '2026-07-06', null, '9946417172', 150, 'audio', null, 'audio'),
  ('owner-2026-07-07-01', '2026-07-07', null, '8943091910', 150, 'unspecified', null, null),
  ('owner-2026-07-07-02', '2026-07-07', null, '97477699104', 1000, 'named_track', 'soniyee hiriyee', 'soniyee hiriyee'),
  ('owner-2026-07-07-03', '2026-07-07', null, '9048707303', 350, 'missing_track', null, 'empty'),
  ('owner-2026-07-07-04', '2026-07-07', null, '9656335848', 800, 'named_track', 'dil ka jo hai', 'dil ka jo hai'),
  ('owner-2026-07-08-01', '2026-07-08', null, '966571035149', 450, 'missing_track', null, 'empty'),
  ('owner-2026-07-08-02', '2026-07-08', null, '9447486846', 350, 'audio', null, 'audio'),
  ('owner-2026-07-08-03', '2026-07-08', null, '7736322504', 200, 'audio', null, 'audio'),
  ('owner-2026-07-08-04', '2026-07-08', null, '97471746305', 400, 'missing_track', null, 'empty'),
  ('owner-2026-07-09-01', '2026-07-09', 'Abdul Saleem', null, 1000, 'unspecified', null, null),
  ('owner-2026-07-09-02', '2026-07-09', 'jaya kumar', null, 350, 'unspecified', null, null),
  ('owner-2026-07-14-01', '2026-07-14', null, '9645058184', 300, 'named_track', 'hrudayeswari', 'hrudayeswari'),
  ('owner-2026-07-14-02', '2026-07-14', null, '966506781974', 500, 'missing_track', null, 'empty'),
  ('owner-2026-07-25-01', '2026-07-25', null, '9037922963', 150, 'audio', null, 'audio'),
  ('owner-2026-07-25-02', '2026-07-25', null, '8714136008', 300, 'named_track', 'sahiba', 'sahiba'),
  ('owner-2026-07-25-03', '2026-07-25', null, '8714136008', 300, 'audio', null, 'audio')
on conflict (source_ref) do update set
  record_date = excluded.record_date,
  contact_name = excluded.contact_name,
  phone = excluded.phone,
  quoted_amount = excluded.quoted_amount,
  fulfillment_hint = excluded.fulfillment_hint,
  track_title = excluded.track_title,
  raw_note = excluded.raw_note;

grant select on public.ai_settings, public.ai_conversations, public.ai_messages,
  public.ai_action_proposals, public.ai_usage_daily, public.legacy_orders to authenticated;
grant insert, update on public.ai_conversations, public.ai_messages,
  public.ai_action_proposals, public.ai_usage_daily to authenticated;
grant insert, update, delete on public.legacy_orders to authenticated;
grant execute on function public.delete_ai_conversation(uuid) to authenticated;
grant execute on function public.claim_ai_action_proposal(uuid) to authenticated;
grant execute on function public.finish_ai_action_proposal(uuid,boolean,jsonb) to authenticated;
grant execute on function public.cancel_ai_action_proposal(uuid) to authenticated;
grant execute on function public.update_ai_settings(boolean,text,text,integer,integer) to authenticated;
grant execute on function public.consume_ai_request() to authenticated;
grant execute on function public.record_ai_usage_tokens(integer,integer) to authenticated;
grant execute on function public.ai_business_summary(date,date) to authenticated;
revoke all on public.ai_settings, public.ai_conversations, public.ai_messages,
  public.ai_action_proposals, public.ai_usage_daily, public.legacy_orders from anon;
revoke delete on public.ai_conversations, public.ai_messages,
  public.ai_action_proposals, public.ai_usage_daily from authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.payments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.withdrawals; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ai_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ai_action_proposals; exception when duplicate_object then null; end;
end;
$$;

commit;
