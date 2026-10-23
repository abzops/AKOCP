-- Validate the transition into Delivered, while permitting payment updates
-- after delivery. Identity, final-status and payment-workflow guards remain.
begin;
do $fix$
declare definition text;
begin
  select pg_get_functiondef('public.protect_order_invariants()'::regprocedure) into definition;
  if position('new.status is distinct from old.status and old.status <> ''completed''' in definition)=0 then
    if position('new.status = ''delivered'' and old.status <> ''completed'' then' in definition)=0 then
      raise exception 'Unexpected delivery guard definition; manual review required';
    end if;
    definition := replace(definition,
      'new.status = ''delivered'' and old.status <> ''completed'' then',
      'new.status = ''delivered'' and new.status is distinct from old.status and old.status <> ''completed'' then');
    execute definition;
  end if;
end;
$fix$;
commit;
