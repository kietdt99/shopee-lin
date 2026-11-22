-- Payment allocation and cancellation both lock billing cycles first, then order
-- rows. This serializes financial writes and avoids a payment/cancel race.
create or replace function public.record_order_payment(p_order_ids uuid[], p_amount bigint, p_paid_at date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  new_payment_id uuid;
  remaining_amount bigint:=p_amount;
  order_row record;
  allocation_amount bigint;
  selected_order_ids uuid[];
  selected_cycle_ids uuid[];
  payment_cycle_ids uuid[];
begin
  if not public.is_admin() then raise exception 'Only an admin can record a payment'; end if;
  if p_amount is null or p_amount<=0 or coalesce(array_length(p_order_ids,1),0)=0 then
    raise exception 'A positive amount and at least one order are required';
  end if;
  if p_paid_at is null then raise exception 'A payment date is required'; end if;

  -- Use deterministic ordering so concurrent payments touching several cycles
  -- acquire the same locks in the same order. Cancellation and cycle close lock
  -- the cycle before locking or updating an order in it.
  select array_agg(o.id order by o.id),array_agg(o.billing_cycle_id order by o.id)
  into selected_order_ids,selected_cycle_ids
  from public.orders o
  where o.id=any(p_order_ids);

  -- Reports include payments by paid_at, independent of the orders' cycles.
  -- Lock every cycle that will count this payment before a close can snapshot it.
  select array_agg(c.id order by c.starts_on,c.id)
  into payment_cycle_ids
  from public.billing_cycles c
  where p_paid_at between c.starts_on and c.ends_on;

  perform c.id
  from public.billing_cycles c
  where c.id in (
    select distinct selected.cycle_id
    from unnest(selected_cycle_ids) as selected(cycle_id)
    where selected.cycle_id is not null
    union
    select distinct payment_cycle.cycle_id
    from unnest(payment_cycle_ids) as payment_cycle(cycle_id)
    where payment_cycle.cycle_id is not null
  )
  order by c.starts_on,c.id
  for update of c;

  if exists(
    select 1 from public.orders o
    join public.billing_cycles c on c.id=o.billing_cycle_id
    where o.id=any(p_order_ids) and c.status='closed'
  ) or exists(
    select 1 from public.billing_cycles c
    where c.id=any(payment_cycle_ids) and c.status='closed'
  ) then
    raise exception 'Cannot allocate a payment to a closed billing cycle';
  end if;

  perform o.id
  from public.orders o
  where o.id=any(p_order_ids)
  order by o.placed_at,o.created_at,o.id
  for update of o;

  if exists(
    select 1
    from unnest(selected_order_ids,selected_cycle_ids) as snapshot(order_id,cycle_id)
    left join public.orders o on o.id=snapshot.order_id
    where o.id is null or o.billing_cycle_id is distinct from snapshot.cycle_id
  ) then
    raise exception 'An order billing cycle changed while recording payment; retry';
  end if;

  insert into public.payments(paid_at,amount,note) values(p_paid_at,p_amount,p_note) returning id into new_payment_id;
  for order_row in
    select o.id,o.amount,coalesce(sum(a.amount),0)::bigint already_paid
    from public.orders o
    left join public.payment_allocations a on a.order_id=o.id
    where o.id=any(p_order_ids) and o.status='unpaid'
    group by o.id
    order by o.placed_at,o.created_at,o.id
  loop
    exit when remaining_amount=0;
    allocation_amount:=least(remaining_amount,order_row.amount-order_row.already_paid);
    if allocation_amount>0 then
      insert into public.payment_allocations(payment_id,order_id,amount) values(new_payment_id,order_row.id,allocation_amount);
      remaining_amount:=remaining_amount-allocation_amount;
      if allocation_amount=order_row.amount-order_row.already_paid then
        update public.orders set status='paid',updated_at=now() where id=order_row.id;
      end if;
    end if;
  end loop;

  if remaining_amount>0 then raise exception 'Selected orders cannot absorb the full payment amount'; end if;
  return new_payment_id;
end; $$;

-- Lock the order before validating cancellation so concurrent/repeated RPC calls
-- cannot append a second refund adjustment after the first call cancels it.
create or replace function public.cancel_order(p_order_id uuid,p_refund_amount bigint default 0,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  order_row public.orders%rowtype;
  cycle_row public.billing_cycles%rowtype;
  order_cycle_id uuid;
  refunded bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can cancel an order'; end if;

  -- Match close_billing_cycle's lock order (cycle, then order) to avoid a
  -- cancellation racing a cycle close or taking locks in the opposite order.
  select billing_cycle_id into order_cycle_id
  from public.orders
  where id=p_order_id;
  if not found then raise exception 'Order not found'; end if;

  if order_cycle_id is not null then
    select * into cycle_row
    from public.billing_cycles
    where id=order_cycle_id
    for update;
    if not found then raise exception 'Billing cycle not found'; end if;
    if cycle_row.status='closed' then raise exception 'Cannot change a closed billing cycle'; end if;
  end if;

  select * into order_row
  from public.orders
  where id=p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_cycle_id is distinct from order_cycle_id then
    raise exception 'Order changed while cancellation was processing';
  end if;
  if order_row.status='cancelled' then raise exception 'Order is already cancelled'; end if;

  select coalesce(sum(amount),0)::bigint into refunded
  from public.payment_allocations
  where order_id=p_order_id;

  if p_refund_amount is null or p_refund_amount<0 or p_refund_amount>refunded then
    raise exception 'Refund amount exceeds received allocation';
  end if;
  if p_refund_amount>0 and order_row.billing_cycle_id is null then
    raise exception 'Cannot record a refund for an order without a billing cycle';
  end if;

  update public.orders
  set status='cancelled',updated_at=now()
  where id=p_order_id;

  if p_refund_amount>0 then
    insert into public.ledger_entries(billing_cycle_id,entry_date,kind,amount,description)
    values(order_row.billing_cycle_id,current_date,'refund',p_refund_amount,coalesce(p_note,'Hoàn tiền đơn bị hủy'));
  end if;
end; $$;
