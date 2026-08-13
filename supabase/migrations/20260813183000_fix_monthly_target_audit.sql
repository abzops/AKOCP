begin;

-- Some audited tables, such as monthly_revenue_targets, use a natural key
-- instead of an `id` UUID. Read the UUID defensively from the JSON row so the
-- audit trigger works for both shapes; natural-key records retain their full
-- identifying values in before_data/after_data.
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

commit;
