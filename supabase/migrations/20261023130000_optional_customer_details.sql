-- Add optional customer details without changing existing customer rows.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.customers add column if not exists place text;
alter table public.customers add column if not exists age smallint;
alter table public.customers drop constraint if exists customers_place_length;
alter table public.customers add constraint customers_place_length check(place is null or char_length(place)<=120);
alter table public.customers drop constraint if exists customers_age_range;
alter table public.customers add constraint customers_age_range check(age is null or age between 0 and 120);

-- Keep the original create_order RPC compatible with existing apps and AI actions.
-- The new UI saves the order and optional profile details in one transaction.
create or replace function public.create_order_with_customer_details(
  p_customer_name text, p_phone text, p_whatsapp text, p_customer_notes text,
  p_service_id uuid, p_inventory_track_id uuid, p_track_name text, p_language text,
  p_due_date date, p_assigned_to uuid, p_notes text,
  p_place text default null, p_age integer default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare order_id_value uuid;
begin
  if auth.uid() is null or public.current_user_role() is null then raise exception 'Active workspace access required'; end if;
  if p_age is not null and (p_age<0 or p_age>120) then raise exception 'Age must be between 0 and 120'; end if;
  if char_length(trim(coalesce(p_place,'')))>120 then raise exception 'Place must be 120 characters or fewer'; end if;
  order_id_value:=public.create_order(p_customer_name,p_phone,p_whatsapp,p_customer_notes,
    p_service_id,p_inventory_track_id,p_track_name,p_language,p_due_date,p_assigned_to,p_notes);
  update public.customers c set
    place=coalesce(nullif(trim(p_place),''),c.place), age=coalesce(p_age,c.age)
  where c.id=(select customer_id from public.orders where id=order_id_value)
    and (nullif(trim(p_place),'') is not null or p_age is not null);
  return order_id_value;
end;
$$;
revoke all on function public.create_order_with_customer_details(text,text,text,text,uuid,uuid,text,text,date,uuid,text,text,integer) from public,anon;
grant execute on function public.create_order_with_customer_details(text,text,text,text,uuid,uuid,text,text,date,uuid,text,text,integer) to authenticated;
commit;
