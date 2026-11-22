-- Preserve all application rows. Orders use reversible soft-delete metadata,
-- cycle closing snapshots retain each reopen/reclose version, and app roles
-- cannot DELETE/TRUNCATE records through PostgREST or security-definer flows.

alter table public.orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists shopee_order_url text;

alter table public.cycle_closings
  add column if not exists id uuid,
  add column if not exists is_current boolean not null default true,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id);

update public.cycle_closings set id = gen_random_uuid() where id is null;
alter table public.cycle_closings alter column id set default gen_random_uuid();
alter table public.cycle_closings alter column id set not null;
alter table public.cycle_closings drop constraint if exists cycle_closings_pkey;
alter table public.cycle_closings add constraint cycle_closings_pkey primary key (id);
create unique index if not exists cycle_closings_one_current_per_cycle
  on public.cycle_closings (billing_cycle_id) where is_current;

-- Replace destructive or history-detaching FK actions with RESTRICT.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete restrict;

alter table public.orders drop constraint if exists orders_billing_cycle_id_fkey;
alter table public.orders add constraint orders_billing_cycle_id_fkey
  foreign key (billing_cycle_id) references public.billing_cycles(id) on delete restrict;

alter table public.payment_allocations drop constraint if exists payment_allocations_payment_id_fkey;
alter table public.payment_allocations add constraint payment_allocations_payment_id_fkey
  foreign key (payment_id) references public.payments(id) on delete restrict;

alter table public.installment_payments drop constraint if exists installment_payments_plan_id_fkey;
alter table public.installment_payments add constraint installment_payments_plan_id_fkey
  foreign key (plan_id) references public.installment_plans(id) on delete restrict;

alter table public.cycle_closings drop constraint if exists cycle_closings_billing_cycle_id_fkey;
alter table public.cycle_closings add constraint cycle_closings_billing_cycle_id_fkey
  foreign key (billing_cycle_id) references public.billing_cycles(id) on delete restrict;

-- Supabase's broad Admin policies allowed direct DELETEs even without a UI
-- button. Replace them with only the commands the app currently needs.
drop policy if exists "admin manages profiles" on public.profiles;
drop policy if exists "admin manages cycles" on public.billing_cycles;
drop policy if exists "admin manages orders" on public.orders;
drop policy if exists "admin manages payments" on public.payments;
drop policy if exists "admin manages allocations" on public.payment_allocations;
drop policy if exists "admin manages plans" on public.installment_plans;
drop policy if exists "admin manages installment payments" on public.installment_payments;
drop policy if exists "admin manages ledger entries" on public.ledger_entries;
drop policy if exists "admin manages cycle closings" on public.cycle_closings;
drop policy if exists "admin inserts cycles" on public.billing_cycles;
drop policy if exists "admin inserts orders" on public.orders;
drop policy if exists "admin updates active orders" on public.orders;
drop policy if exists "admin inserts plans" on public.installment_plans;
drop policy if exists "admin inserts installment payments" on public.installment_payments;

create policy "admin inserts cycles" on public.billing_cycles
  for insert to authenticated with check (public.is_admin());

create policy "admin inserts orders" on public.orders
  for insert to authenticated with check (public.is_admin() and deleted_at is null and deleted_by is null);
create policy "admin updates active orders" on public.orders
  for update to authenticated
  using (public.is_admin() and deleted_at is null)
  with check (public.is_admin() and deleted_at is null);

create policy "admin inserts plans" on public.installment_plans
  for insert to authenticated with check (public.is_admin());
create policy "admin inserts installment payments" on public.installment_payments
  for insert to authenticated with check (public.is_admin());

-- Remove table-level mutation grants and restore only the narrow direct writes
-- used by the UI. Financial rows and snapshots are written by guarded RPCs.
revoke insert, update, delete, truncate on table
  public.profiles,
  public.billing_cycles,
  public.orders,
  public.payments,
  public.payment_allocations,
  public.installment_plans,
  public.installment_payments,
  public.ledger_entries,
  public.cycle_closings
from public, anon, authenticated;

grant insert (label, starts_on, ends_on) on table public.billing_cycles to authenticated;
grant insert (placed_at, description, amount, billing_cycle_id, notes, shopee_order_url)
  on table public.orders to authenticated;
grant update (placed_at, description, amount, billing_cycle_id, notes, shopee_order_url)
  on table public.orders to authenticated;
grant insert (name, total_amount) on table public.installment_plans to authenticated;

create or replace function public.reject_app_hard_delete()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Hard deletion is disabled for Shopee Lin records';
end;
$$;
revoke all on function public.reject_app_hard_delete() from public, anon, authenticated;

drop trigger if exists prevent_hard_delete_profiles on public.profiles;
create trigger prevent_hard_delete_profiles before delete on public.profiles
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_profiles on public.profiles;
create trigger prevent_truncate_profiles before truncate on public.profiles
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_billing_cycles on public.billing_cycles;
create trigger prevent_hard_delete_billing_cycles before delete on public.billing_cycles
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_billing_cycles on public.billing_cycles;
create trigger prevent_truncate_billing_cycles before truncate on public.billing_cycles
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_orders on public.orders;
create trigger prevent_hard_delete_orders before delete on public.orders
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_orders on public.orders;
create trigger prevent_truncate_orders before truncate on public.orders
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_payments on public.payments;
create trigger prevent_hard_delete_payments before delete on public.payments
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_payments on public.payments;
create trigger prevent_truncate_payments before truncate on public.payments
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_payment_allocations on public.payment_allocations;
create trigger prevent_hard_delete_payment_allocations before delete on public.payment_allocations
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_payment_allocations on public.payment_allocations;
create trigger prevent_truncate_payment_allocations before truncate on public.payment_allocations
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_installment_plans on public.installment_plans;
create trigger prevent_hard_delete_installment_plans before delete on public.installment_plans
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_installment_plans on public.installment_plans;
create trigger prevent_truncate_installment_plans before truncate on public.installment_plans
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_installment_payments on public.installment_payments;
create trigger prevent_hard_delete_installment_payments before delete on public.installment_payments
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_installment_payments on public.installment_payments;
create trigger prevent_truncate_installment_payments before truncate on public.installment_payments
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_ledger_entries on public.ledger_entries;
create trigger prevent_hard_delete_ledger_entries before delete on public.ledger_entries
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_ledger_entries on public.ledger_entries;
create trigger prevent_truncate_ledger_entries before truncate on public.ledger_entries
  for each statement execute function public.reject_app_hard_delete();
drop trigger if exists prevent_hard_delete_cycle_closings on public.cycle_closings;
create trigger prevent_hard_delete_cycle_closings before delete on public.cycle_closings
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_cycle_closings on public.cycle_closings;
create trigger prevent_truncate_cycle_closings before truncate on public.cycle_closings
  for each statement execute function public.reject_app_hard_delete();

-- Serialize every direct order INSERT/UPDATE before PostgreSQL locks any order
-- rows. Financial RPCs take the same transaction lock before cycle/order locks,
-- so cycle close cannot race writes and lock order stays consistent.
create or replace function public.serialize_order_write()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(183674, 1);
  return null;
end;
$$;
revoke all on function public.serialize_order_write() from public, anon, authenticated;
drop trigger if exists serialize_order_write on public.orders;
create trigger serialize_order_write before insert or update on public.orders
  for each statement execute function public.serialize_order_write();

create or replace function public.guard_allocated_order_financial_fields()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (new.amount is distinct from old.amount
      or new.placed_at is distinct from old.placed_at
      or new.billing_cycle_id is distinct from old.billing_cycle_id)
     and exists (select 1 from public.payment_allocations where order_id = old.id) then
    raise exception 'Amount, date, and billing cycle cannot change after an order has payment allocations';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_allocated_order_financial_fields on public.orders;
create trigger guard_allocated_order_financial_fields before update on public.orders
  for each row execute function public.guard_allocated_order_financial_fields();

create or replace function public.guard_installment_payment_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  plan_total bigint;
  already_paid numeric;
begin
  perform pg_advisory_xact_lock(183674, 1);
  select total_amount into plan_total
  from public.installment_plans where id = new.plan_id for update;
  if not found then raise exception 'Installment plan not found'; end if;

  select coalesce(sum(amount), 0) into already_paid
  from public.installment_payments where plan_id = new.plan_id;
  if new.amount is null or new.amount <= 0 then
    raise exception 'Installment payment amount must be a positive whole VND amount';
  end if;
  if already_paid + new.amount::numeric > plan_total::numeric then
    raise exception 'Installment contributions cannot exceed the plan total';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_installment_payment_insert on public.installment_payments;
create trigger guard_installment_payment_insert before insert on public.installment_payments
  for each row execute function public.guard_installment_payment_insert();

create or replace function public.reject_installment_payment_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Installment payment history is append-only';
end;
$$;
drop trigger if exists reject_installment_payment_update on public.installment_payments;
create trigger reject_installment_payment_update before update on public.installment_payments
  for each row execute function public.reject_installment_payment_update();
revoke all on function public.guard_allocated_order_financial_fields() from public, anon, authenticated;
revoke all on function public.guard_installment_payment_insert() from public, anon, authenticated;
revoke all on function public.reject_installment_payment_update() from public, anon, authenticated;

-- Remove any previously granted table- or column-level direct inserts. All
-- contribution creation must pass through the bounded Admin-only RPC.
revoke insert on table public.installment_payments from public, anon, authenticated;
revoke insert (plan_id, paid_at, amount, note) on table public.installment_payments from public, anon, authenticated;

create or replace function public.soft_delete_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  order_cycle_id uuid;
  order_row public.orders%rowtype;
  cycle_row public.billing_cycles%rowtype;
  allocated_amount bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can delete an order'; end if;
  perform pg_advisory_xact_lock(183674, 1);

  select billing_cycle_id into order_cycle_id
  from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;

  if order_cycle_id is not null then
    select * into cycle_row from public.billing_cycles where id = order_cycle_id for update;
    if not found then raise exception 'Billing cycle not found'; end if;
    if cycle_row.status = 'closed' then raise exception 'Cannot change a closed billing cycle'; end if;
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_cycle_id is distinct from order_cycle_id then
    raise exception 'Order changed while deletion was processing; retry';
  end if;
  if order_row.deleted_at is not null then raise exception 'Order is already deleted'; end if;
  if order_row.status <> 'unpaid' then raise exception 'Only unpaid orders can be deleted'; end if;

  select coalesce(sum(amount), 0)::bigint into allocated_amount
  from public.payment_allocations where order_id = p_order_id;
  if allocated_amount > 0 then
    raise exception 'An order with payment allocations must be cancelled/refunded, not deleted';
  end if;

  update public.orders
  set deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.record_installment_payment(
  p_plan_id uuid,
  p_paid_at date,
  p_amount bigint,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  plan_total bigint;
  already_paid numeric;
  new_payment_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authenticated admin can record an installment payment';
  end if;
  if p_plan_id is null or p_paid_at is null or p_amount is null or p_amount <= 0 then
    raise exception 'A plan, date, and positive whole VND amount are required';
  end if;

  perform pg_advisory_xact_lock(183674, 1);
  select total_amount into plan_total
  from public.installment_plans where id = p_plan_id for update;
  if not found then raise exception 'Installment plan not found'; end if;

  select coalesce(sum(amount), 0) into already_paid
  from public.installment_payments where plan_id = p_plan_id;
  if already_paid + p_amount::numeric > plan_total::numeric then
    raise exception 'Installment contributions cannot exceed the plan total';
  end if;

  insert into public.installment_payments(plan_id, paid_at, amount, note)
  values (p_plan_id, p_paid_at, p_amount, p_note)
  returning id into new_payment_id;
  return new_payment_id;
end;
$$;

create or replace function public.restore_deleted_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  order_cycle_id uuid;
  order_row public.orders%rowtype;
  cycle_row public.billing_cycles%rowtype;
  allocated_amount bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can restore an order'; end if;
  perform pg_advisory_xact_lock(183674, 1);

  select billing_cycle_id into order_cycle_id
  from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;

  if order_cycle_id is not null then
    select * into cycle_row from public.billing_cycles where id = order_cycle_id for update;
    if not found then raise exception 'Billing cycle not found'; end if;
    if cycle_row.status = 'closed' then raise exception 'Reopen the billing cycle before restoring this order'; end if;
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_cycle_id is distinct from order_cycle_id then
    raise exception 'Order changed while restore was processing; retry';
  end if;
  if order_row.deleted_at is null then raise exception 'Order is not deleted'; end if;
  if order_row.status <> 'unpaid' then raise exception 'Only deleted unpaid orders can be restored'; end if;

  select coalesce(sum(amount), 0)::bigint into allocated_amount
  from public.payment_allocations where order_id = p_order_id;
  if allocated_amount > 0 then
    raise exception 'Cannot restore an order with payment allocations';
  end if;

  update public.orders
  set deleted_at = null, deleted_by = null, updated_at = now()
  where id = p_order_id;
end;
$$;

-- Payment allocation locks cycles before orders, then verifies the soft-delete
-- state after both locks are held so it cannot race with delete/restore/close.
create or replace function public.record_order_payment(p_order_ids uuid[], p_amount bigint, p_paid_at date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  new_payment_id uuid;
  remaining_amount bigint := p_amount;
  order_row record;
  allocation_amount bigint;
  selected_order_ids uuid[];
  selected_cycle_ids uuid[];
  payment_cycle_ids uuid[];
begin
  if not public.is_admin() then raise exception 'Only an admin can record a payment'; end if;
  if p_amount is null or p_amount <= 0 or coalesce(array_length(p_order_ids, 1), 0) = 0 then
    raise exception 'A positive amount and at least one order are required';
  end if;
  if p_paid_at is null then raise exception 'A payment date is required'; end if;
  perform pg_advisory_xact_lock(183674, 1);
  if exists (
    select 1 from unnest(p_order_ids) requested(id)
    where not exists (select 1 from public.orders o where o.id = requested.id)
  ) then raise exception 'One or more selected orders do not exist'; end if;

  select array_agg(o.id order by o.id), array_agg(o.billing_cycle_id order by o.id)
  into selected_order_ids, selected_cycle_ids
  from public.orders o where o.id = any(p_order_ids);

  select array_agg(c.id order by c.starts_on, c.id)
  into payment_cycle_ids
  from public.billing_cycles c where p_paid_at between c.starts_on and c.ends_on;

  perform c.id
  from public.billing_cycles c
  where c.id in (
    select distinct selected.cycle_id from unnest(selected_cycle_ids) selected(cycle_id) where selected.cycle_id is not null
    union
    select distinct payment_cycle.cycle_id from unnest(payment_cycle_ids) payment_cycle(cycle_id) where payment_cycle.cycle_id is not null
  )
  order by c.starts_on, c.id for update of c;

  if exists (
    select 1 from public.orders o join public.billing_cycles c on c.id = o.billing_cycle_id
    where o.id = any(p_order_ids) and c.status = 'closed'
  ) or exists (
    select 1 from public.billing_cycles c where c.id = any(payment_cycle_ids) and c.status = 'closed'
  ) then raise exception 'Cannot allocate a payment to a closed billing cycle'; end if;

  perform o.id from public.orders o where o.id = any(p_order_ids)
  order by o.placed_at, o.created_at, o.id for update of o;

  if exists (
    select 1
    from unnest(selected_order_ids, selected_cycle_ids) snapshot(order_id, cycle_id)
    left join public.orders o on o.id = snapshot.order_id
    where o.id is null or o.billing_cycle_id is distinct from snapshot.cycle_id
  ) then raise exception 'An order billing cycle changed while recording payment; retry'; end if;

  if exists (
    select 1 from public.orders o where o.id = any(p_order_ids)
      and (o.deleted_at is not null or o.status <> 'unpaid')
  ) then raise exception 'Only active unpaid orders can receive a payment'; end if;

  insert into public.payments(paid_at, amount, note) values (p_paid_at, p_amount, p_note) returning id into new_payment_id;
  for order_row in
    select o.id, o.amount, coalesce(sum(a.amount), 0)::bigint already_paid
    from public.orders o
    left join public.payment_allocations a on a.order_id = o.id
    where o.id = any(p_order_ids) and o.status = 'unpaid' and o.deleted_at is null
    group by o.id order by o.placed_at, o.created_at, o.id
  loop
    exit when remaining_amount = 0;
    allocation_amount := least(remaining_amount, order_row.amount - order_row.already_paid);
    if allocation_amount > 0 then
      insert into public.payment_allocations(payment_id, order_id, amount)
      values (new_payment_id, order_row.id, allocation_amount);
      remaining_amount := remaining_amount - allocation_amount;
      if allocation_amount = order_row.amount - order_row.already_paid then
        update public.orders set status = 'paid', updated_at = now() where id = order_row.id;
      end if;
    end if;
  end loop;

  if remaining_amount > 0 then raise exception 'Selected orders cannot absorb the full payment amount'; end if;
  return new_payment_id;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_refund_amount bigint default 0, p_note text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  order_row public.orders%rowtype;
  cycle_row public.billing_cycles%rowtype;
  order_cycle_id uuid;
  refunded bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can cancel an order'; end if;
  perform pg_advisory_xact_lock(183674, 1);

  select billing_cycle_id into order_cycle_id from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if order_cycle_id is not null then
    select * into cycle_row from public.billing_cycles where id = order_cycle_id for update;
    if not found then raise exception 'Billing cycle not found'; end if;
    if cycle_row.status = 'closed' then raise exception 'Cannot change a closed billing cycle'; end if;
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_cycle_id is distinct from order_cycle_id then raise exception 'Order changed while cancellation was processing'; end if;
  if order_row.deleted_at is not null then raise exception 'Restore the order before cancelling it'; end if;
  if order_row.status = 'cancelled' then raise exception 'Order is already cancelled'; end if;

  select coalesce(sum(amount), 0)::bigint into refunded
  from public.payment_allocations where order_id = p_order_id;
  if p_refund_amount is null or p_refund_amount < 0 or p_refund_amount > refunded then
    raise exception 'Refund amount exceeds received allocation';
  end if;
  if p_refund_amount > 0 and order_row.billing_cycle_id is null then
    raise exception 'Cannot record a refund for an order without a billing cycle';
  end if;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
  if p_refund_amount > 0 then
    insert into public.ledger_entries(billing_cycle_id, entry_date, kind, amount, description)
    values (order_row.billing_cycle_id, current_date, 'refund', p_refund_amount, coalesce(p_note, 'Hoàn tiền đơn bị hủy'));
  end if;
end;
$$;

create or replace function public.close_billing_cycle(p_cycle_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  cycle_row public.billing_cycles%rowtype;
  opening bigint;
  purchases bigint;
  payments bigint;
  adjustments bigint;
  closing bigint;
  prior_next_opening bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can close a cycle'; end if;
  perform pg_advisory_xact_lock(183674, 1);
  select * into cycle_row from public.billing_cycles where id = p_cycle_id for update;
  if not found or cycle_row.status = 'closed' then raise exception 'Billing cycle is not open'; end if;
  if cycle_row.ends_on > current_date then raise exception 'A billing cycle can only be closed on or after its end date'; end if;
  if exists (select 1 from public.cycle_closings where billing_cycle_id = p_cycle_id and is_current) then
    raise exception 'A current closing snapshot already exists for this cycle';
  end if;

  select coalesce(sum(amount), 0)::bigint into purchases
  from public.orders where billing_cycle_id = p_cycle_id and status <> 'cancelled' and deleted_at is null;
  select coalesce(sum(p.amount), 0)::bigint into payments
  from public.payments p where p.paid_at between cycle_row.starts_on and cycle_row.ends_on;
  select coalesce(sum(amount), 0)::bigint into adjustments
  from public.ledger_entries where billing_cycle_id = p_cycle_id;

  opening := cycle_row.opening_balance;
  closing := opening + purchases - payments + adjustments;
  select opening_balance into prior_next_opening
  from public.billing_cycles where starts_on = cycle_row.ends_on + 1;

  insert into public.cycle_closings(
    billing_cycle_id, opening_balance, purchase_total, payment_total, adjustment_total,
    closing_balance, next_opening_before, closed_by, is_current
  ) values (
    p_cycle_id, opening, purchases, payments, adjustments, closing,
    prior_next_opening, auth.uid(), true
  );
  update public.billing_cycles set status = 'closed' where id = p_cycle_id;
  update public.billing_cycles set opening_balance = closing where starts_on = cycle_row.ends_on + 1;
end;
$$;

create or replace function public.reopen_billing_cycle(p_cycle_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  cycle_row public.billing_cycles%rowtype;
  closing_row public.cycle_closings%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an admin can reopen a cycle'; end if;
  perform pg_advisory_xact_lock(183674, 1);
  select * into cycle_row from public.billing_cycles where id = p_cycle_id for update;
  if not found or cycle_row.status <> 'closed' then raise exception 'Billing cycle is not closed'; end if;

  select * into closing_row from public.cycle_closings
  where billing_cycle_id = p_cycle_id and is_current for update;
  if not found then raise exception 'Current closing snapshot not found'; end if;

  update public.billing_cycles set status = 'open' where id = p_cycle_id;
  update public.billing_cycles next_cycle
  set opening_balance = closing_row.next_opening_before
  where next_cycle.starts_on = cycle_row.ends_on + 1
    and closing_row.next_opening_before is not null;
  update public.cycle_closings
  set is_current = false, reopened_at = now(), reopened_by = auth.uid()
  where id = closing_row.id;
end;
$$;

revoke all on function public.soft_delete_order(uuid) from public, anon;
grant execute on function public.soft_delete_order(uuid) to authenticated;
revoke all on function public.record_installment_payment(uuid, date, bigint, text) from public, anon;
grant execute on function public.record_installment_payment(uuid, date, bigint, text) to authenticated;
revoke all on function public.restore_deleted_order(uuid) from public, anon;
grant execute on function public.restore_deleted_order(uuid) to authenticated;
revoke all on function public.record_order_payment(uuid[], bigint, date, text) from public, anon;
grant execute on function public.record_order_payment(uuid[], bigint, date, text) to authenticated;
revoke all on function public.cancel_order(uuid, bigint, text) from public, anon;
grant execute on function public.cancel_order(uuid, bigint, text) to authenticated;
revoke all on function public.close_billing_cycle(uuid) from public, anon;
grant execute on function public.close_billing_cycle(uuid) to authenticated;
revoke all on function public.reopen_billing_cycle(uuid) from public, anon;
grant execute on function public.reopen_billing_cycle(uuid) to authenticated;
