-- Local-only verification. Every attempted write runs in an exception subtransaction,
-- and the outer transaction is rolled back at the end.
begin;

do $$
declare
  admin_id uuid;
  unpaid_order_id uuid;
  paid_order_id uuid;
  unpaid_outstanding bigint;
  paid_cycle_status text;
  payment_count_before bigint;
  allocation_count_before bigint;
  refund_count_before bigint;
  current_error text;
begin
  select id into admin_id from public.profiles where role = 'admin' order by created_at limit 1;
  if admin_id is null then raise exception 'QA requires a seeded local Admin profile'; end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  select o.id, o.amount - coalesce(sum(a.amount), 0)::bigint
  into unpaid_order_id, unpaid_outstanding
  from public.orders o
  left join public.payment_allocations a on a.order_id = o.id
  left join public.billing_cycles c on c.id = o.billing_cycle_id
  where o.status = 'unpaid' and o.deleted_at is null and coalesce(c.status, 'open') = 'open'
  group by o.id, o.amount
  having o.amount - coalesce(sum(a.amount), 0)::bigint > 1
  order by o.placed_at, o.id
  limit 1;
  if unpaid_order_id is null then raise exception 'QA requires an unpaid local order with at least 2 VND outstanding in an open cycle'; end if;

  select count(*) into payment_count_before from public.payments;
  select count(*) into allocation_count_before from public.payment_allocations;
  begin
    perform public.record_order_payment(array[unpaid_order_id], unpaid_outstanding - 1, current_date, 'QA underpayment probe');
    raise exception 'QA_UNDERPAYMENT_GUARD_MISSING';
  exception when others then
    get stacked diagnostics current_error = message_text;
    if current_error = 'QA_UNDERPAYMENT_GUARD_MISSING' then raise; end if;
    if current_error not like '%Payment amount must fully settle every selected order%' then
      raise exception 'Unexpected underpayment RPC rejection: %', current_error;
    end if;
  end;
  if (select count(*) from public.payments) <> payment_count_before
    or (select count(*) from public.payment_allocations) <> allocation_count_before then
    raise exception 'Underpayment probe changed payment history';
  end if;

  select o.id, c.status into paid_order_id, paid_cycle_status
  from public.orders o join public.billing_cycles c on c.id = o.billing_cycle_id
  where o.status = 'paid' and o.deleted_at is null and c.status = 'open'
  order by o.placed_at, o.id limit 1;
  if paid_order_id is not null then
    select count(*) into refund_count_before from public.ledger_entries where kind = 'refund';
    begin
      perform public.cancel_order(paid_order_id, 0, 'QA paid-order cancellation probe');
      raise exception 'QA_PAID_CANCELLATION_GUARD_MISSING';
    exception when others then
      get stacked diagnostics current_error = message_text;
      if current_error = 'QA_PAID_CANCELLATION_GUARD_MISSING' then raise; end if;
      if current_error not like '%Completed Shopee orders cannot be cancelled or refunded%' then
        raise exception 'Unexpected paid-order cancellation rejection: %', current_error;
      end if;
    end;
    if (select status from public.orders where id = paid_order_id) <> 'paid'
      or (select count(*) from public.ledger_entries where kind = 'refund') <> refund_count_before then
      raise exception 'Paid-order cancellation probe changed order or refund history';
    end if;
  end if;
end;
$$;

rollback;
