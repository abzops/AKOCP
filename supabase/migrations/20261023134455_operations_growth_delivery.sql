-- Add operational context. No existing status, amount, date, or ledger row is rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Allow instalments while still preventing duplicate unreviewed proofs.
create unique index if not exists payments_one_pending_per_order on public.payments(order_id) where status='pending';
drop index if exists public.payments_one_open_per_order;
alter table public.orders add column if not exists acquisition_source text;
alter table public.orders add column if not exists final_file_url text;
alter table public.orders add column if not exists delivery_version text;
alter table public.orders add column if not exists revision_notes text;
alter table public.orders add column if not exists revision_requested boolean;
alter table public.expenses add column if not exists acquisition_source text;
alter table public.orders add constraint orders_acquisition_source_check check(acquisition_source is null or acquisition_source in ('unknown','instagram','facebook','whatsapp','referral','repeat','other'));
alter table public.expenses add constraint expenses_acquisition_source_check check(acquisition_source is null or acquisition_source in ('unknown','instagram','facebook','whatsapp','referral','repeat','other'));
alter table public.orders add constraint orders_final_file_url_check check(final_file_url is null or (final_file_url ~ '^https://' and char_length(final_file_url)<=2048));
alter table public.orders add constraint orders_delivery_version_check check(delivery_version is null or char_length(delivery_version)<=80);
alter table public.orders add constraint orders_revision_notes_check check(revision_notes is null or char_length(revision_notes)<=2000);

-- Existing RPC remains available for older clients and AI proposals.
create or replace function public.create_order_with_source(
  p_customer_name text,p_phone text,p_whatsapp text,p_customer_notes text,
  p_service_id uuid,p_inventory_track_id uuid,p_track_name text,p_language text,
  p_due_date date,p_assigned_to uuid,p_notes text,p_place text default null,
  p_age integer default null,p_source text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare created_id uuid;
begin
  if auth.uid() is null or public.current_user_role() is null then raise exception 'Active workspace access required'; end if;
  created_id:=public.create_order_with_customer_details(p_customer_name,p_phone,p_whatsapp,p_customer_notes,p_service_id,p_inventory_track_id,p_track_name,p_language,p_due_date,p_assigned_to,p_notes,p_place,p_age);
  update public.orders set acquisition_source=nullif(p_source,'unknown') where id=created_id;
  return created_id;
end;
$$;
revoke all on function public.create_order_with_source(text,text,text,text,uuid,uuid,text,text,date,uuid,text,text,integer,text) from public,anon;
grant execute on function public.create_order_with_source(text,text,text,text,uuid,uuid,text,text,date,uuid,text,text,integer,text) to authenticated;

-- A second proof must not undo an earlier confirmed receipt or block completed orders.
create or replace function public.on_payment_uploaded()
returns trigger language plpgsql security definer set search_path=public as $$
declare order_number_value text;
begin
  perform set_config('akocp.internal','1',true);
  update public.orders set payment_status=case when payment_status='confirmed' then payment_status else 'proof_uploaded' end where id=new.order_id;
  select order_number into order_number_value from public.orders where id=new.order_id;
  perform public.notify_founders('payment_uploaded','Payment proof uploaded',order_number_value || ' · ₹' || trim(to_char(new.amount,'FM999999990.00')),'order',new.order_id);
  return new;
end;
$$;
revoke all on function public.on_payment_uploaded() from public,anon;
commit;
