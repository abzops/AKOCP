-- Distinguish the current ledger balance from movement within a date range.
begin;
do $summary$
declare definition text;
begin
  select pg_get_functiondef('public.ai_business_summary(date,date)'::regprocedure) into definition;
  if position('currentWalletBalance' in definition)=0 then
    if position('return summary;' in definition)=0 then raise exception 'Unexpected summary definition'; end if;
    definition:=replace(definition,'return summary;', $replacement$
  return summary || jsonb_build_object(
    'currentWalletBalance', public.wallet_balance(),
    'deliveredPaidOrdersAllTime', (select count(*) from public.orders where deleted_at is null and status='delivered' and payment_status='confirmed'),
    'deliveredPaidOrdersInPeriod', (select count(*) from public.orders where deleted_at is null and status='delivered' and payment_status='confirmed' and (delivered_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'metricDefinitions', jsonb_build_object(
      'currentWalletBalance','Current all-time ledger balance; use this when asked for the wallet balance.',
      'netWalletMovement','Change during the selected dates only; never label this as current wallet balance.',
      'ordersCompleted','Production completions, including orders not yet delivered; not a delivered-and-paid count.',
      'confirmedRevenue','Ledger payment credits during the period, including payments for orders and owner-verified recorded sales.',
      'recordedSalesAmount','Owner-verified recorded sales only; separate from live order payment totals.'
    )
  );
$replacement$);
    execute definition;
  end if;
end;
$summary$;
commit;
