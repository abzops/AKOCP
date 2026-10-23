-- Preserve the old creation RPCs and the immutable price rule on existing orders.
-- Clone the installed, hardened creation workflow and set the override at INSERT.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('public.create_order(text,text,text,text,uuid,uuid,text,text,date,uuid,text)'::regprocedure);
  if position('akocp_private.assert_active_user()' in definition)=0 or position('service_row.price, nullif(trim(p_notes)' in definition)=0 then
    raise exception 'Unexpected creation workflow; custom price migration requires review';
  end if;
  definition:=regexp_replace(definition,'public\.create_order\(([^)]*)\)','public.create_order_priced(\1, p_place text DEFAULT NULL, p_age integer DEFAULT NULL, p_source text DEFAULT NULL, p_custom_price numeric DEFAULT NULL)');
  definition:=replace(definition,'begin',E'begin\n  if p_custom_price is not null and (p_custom_price<=0 or p_custom_price>9999999999.99 or p_custom_price<>round(p_custom_price,2)) then raise exception ''Custom price must be positive with at most two decimal places''; end if;\n  if p_age is not null and (p_age<0 or p_age>120) then raise exception ''Age must be between 0 and 120''; end if;\n  if char_length(trim(coalesce(p_place,'''')))>120 then raise exception ''Place must be 120 characters or fewer''; end if;');
  definition:=replace(definition,'service_row.price, nullif(trim(p_notes)','coalesce(p_custom_price,service_row.price), nullif(trim(p_notes)');
  definition:=replace(definition,'order_number_value := public.next_order_number();',E'update public.customers set place=coalesce(nullif(trim(p_place),''''),place),age=coalesce(p_age,age) where id=customer_id_value and (nullif(trim(p_place),'''') is not null or p_age is not null);\n  order_number_value := public.next_order_number();');
  definition:=replace(definition,'return order_id_value;',E'update public.orders set acquisition_source=nullif(p_source,''unknown'') where id=order_id_value;\n  return order_id_value;');
  execute definition;
end;
$migration$;
revoke all on function public.create_order_priced(text,text,text,text,uuid,uuid,text,text,date,uuid,text,text,integer,text,numeric) from public,anon;
grant execute on function public.create_order_priced(text,text,text,text,uuid,uuid,text,text,date,uuid,text,text,integer,text,numeric) to authenticated;
commit;
