-- Bound installment contributions to the immutable plan total and prevent
-- changes to order financial fields after payment allocation exists.

-- Fail without modifying data if legacy rows violate the now-required order
-- fields. Report the total and a few IDs so an Admin can correct them first.
do $$
declare
  invalid_order_count bigint;
  sample_order_ids text;
begin
  select string_agg(anomaly.id::text, ', ' order by anomaly.id)
  into sample_order_ids
  from (
    select o.id
    from public.orders o
    left join public.billing_cycles c on c.id = o.billing_cycle_id
    where o.billing_cycle_id is null
       or btrim(coalesce(o.description, '')) = ''
       or c.id is null
       or o.placed_at < c.starts_on
       or o.placed_at > c.ends_on
    order by o.id
    limit 10
  ) anomaly;

  select count(*) into invalid_order_count
  from public.orders o
  left join public.billing_cycles c on c.id = o.billing_cycle_id
  where o.billing_cycle_id is null
     or btrim(coalesce(o.description, '')) = ''
     or c.id is null
     or o.placed_at < c.starts_on
     or o.placed_at > c.ends_on;

  if invalid_order_count > 0 then
    raise exception 'Cannot enforce required order fields: % invalid order(s); sample IDs: %',
      invalid_order_count, coalesce(sample_order_ids, '(unavailable)');
  end if;
end;
$$;

alter table public.orders alter column billing_cycle_id set not null;
alter table public.orders drop constraint if exists orders_description_nonempty;
alter table public.orders add constraint orders_description_nonempty
  check (btrim(description) <> '');

-- Serialize direct order edits with all financial/cycle RPCs using the lock
-- acquired by the prior migration's statement-level order trigger.
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
revoke all on function public.guard_allocated_order_financial_fields() from public, anon, authenticated;

create or replace function public.update_order(
  p_order_id uuid,
  p_placed_at date,
  p_description text,
  p_amount bigint,
  p_billing_cycle_id uuid,
  p_notes text default null,
  p_shopee_order_url text default null
)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  original_cycle_id uuid;
  order_row public.orders%rowtype;
  has_allocations boolean;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authenticated admin can update an order';
  end if;
  if p_order_id is null or p_placed_at is null or p_billing_cycle_id is null
     or p_description is null or btrim(p_description) = '' or p_amount is null or p_amount <= 0 then
    raise exception 'Order date, description, amount, and billing cycle are required';
  end if;

  perform pg_advisory_xact_lock(183674, 1);
  select billing_cycle_id into original_cycle_id from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;

  perform c.id
  from public.billing_cycles c
  where c.id in (original_cycle_id, p_billing_cycle_id)
  order by c.starts_on, c.id
  for update of c;
  if exists (
    select 1 from public.billing_cycles c
    where c.id in (original_cycle_id, p_billing_cycle_id) and c.status = 'closed'
  ) then raise exception 'Cannot change an order in a closed billing cycle'; end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_cycle_id is distinct from original_cycle_id then
    raise exception 'Order changed while the update was processing; retry';
  end if;
  if order_row.deleted_at is not null then raise exception 'Restore the order before editing it'; end if;

  select exists (select 1 from public.payment_allocations where order_id = p_order_id)
  into has_allocations;
  if has_allocations and (
    p_placed_at is distinct from order_row.placed_at
    or p_amount is distinct from order_row.amount
    or p_billing_cycle_id is distinct from order_row.billing_cycle_id
  ) then
    raise exception 'Amount, date, and billing cycle cannot change after an order has payment allocations';
  end if;

  update public.orders
  set placed_at = p_placed_at,
      description = p_description,
      amount = p_amount,
      billing_cycle_id = p_billing_cycle_id,
      notes = p_notes,
      shopee_order_url = p_shopee_order_url,
      updated_at = now()
  where id = p_order_id;
end;
$$;
revoke all on function public.update_order(uuid, date, text, bigint, uuid, text, text) from public, anon;
grant execute on function public.update_order(uuid, date, text, bigint, uuid, text, text) to authenticated;

create or replace function public.validate_order_cycle_and_description()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  cycle_start date;
  cycle_end date;
begin
  if new.billing_cycle_id is null then
    raise exception 'An order must belong to a billing cycle';
  end if;
  if new.description is null then
    raise exception 'Order description cannot be empty';
  end if;
  new.description := btrim(new.description);
  if new.description = '' then raise exception 'Order description cannot be empty'; end if;
  select starts_on, ends_on into cycle_start, cycle_end
  from public.billing_cycles where id = new.billing_cycle_id;
  if not found then raise exception 'Billing cycle not found'; end if;
  if new.placed_at < cycle_start or new.placed_at > cycle_end then
    raise exception 'Order date must fall within its billing cycle';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_order_cycle_and_description on public.orders;
create trigger validate_order_cycle_and_description before insert or update on public.orders
  for each row execute function public.validate_order_cycle_and_description();
revoke all on function public.validate_order_cycle_and_description() from public, anon, authenticated;

create or replace function public.guard_billing_cycle_date_update()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on)
     and exists (select 1 from public.orders o where o.billing_cycle_id = old.id
       and (o.placed_at < new.starts_on or o.placed_at > new.ends_on)) then
    raise exception 'Billing cycle dates cannot exclude existing orders';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_billing_cycle_date_update on public.billing_cycles;
create trigger guard_billing_cycle_date_update before update of starts_on, ends_on on public.billing_cycles
  for each row execute function public.guard_billing_cycle_date_update();
revoke all on function public.guard_billing_cycle_date_update() from public, anon, authenticated;

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
revoke all on function public.guard_installment_payment_insert() from public, anon, authenticated;

create or replace function public.reject_installment_payment_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Installment payment history is append-only';
end;
$$;
drop trigger if exists reject_installment_payment_update on public.installment_payments;
create trigger reject_installment_payment_update before update on public.installment_payments
  for each row execute function public.reject_installment_payment_update();
revoke all on function public.reject_installment_payment_update() from public, anon, authenticated;

-- Revoke both table- and column-level grants left by the previous migration.
drop policy if exists "admin inserts installment payments" on public.installment_payments;
drop policy if exists "admin updates active orders" on public.orders;
revoke insert, update on table public.installment_payments from public, anon, authenticated;
revoke insert (plan_id, paid_at, amount, note) on table public.installment_payments from public, anon, authenticated;
revoke update (plan_id, paid_at, amount, note) on table public.installment_payments from public, anon, authenticated;

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
revoke all on function public.record_installment_payment(uuid, date, bigint, text) from public, anon;
grant execute on function public.record_installment_payment(uuid, date, bigint, text) to authenticated;

-- All order updates now pass through the Admin RPC so allocation checks use a
-- fresh transaction snapshot after the shared advisory lock is acquired.
revoke update on table public.orders from public, anon, authenticated;
revoke update (placed_at, description, amount, billing_cycle_id, notes, shopee_order_url)
  on table public.orders from public, anon, authenticated;

create or replace function public.reject_closed_cycle_order_write()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  locked_cycle_status public.cycle_status;
begin
  if not public.is_admin() then raise exception 'Only an admin can change orders'; end if;
  if tg_op in ('UPDATE', 'DELETE') and old.billing_cycle_id is not null then
    select c.status into locked_cycle_status
    from public.billing_cycles c where c.id = old.billing_cycle_id for update;
    if locked_cycle_status = 'closed' then
      raise exception 'Cannot change an order in a closed billing cycle';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.billing_cycle_id is not null then
    select c.status into locked_cycle_status
    from public.billing_cycles c where c.id = new.billing_cycle_id for update;
    if locked_cycle_status = 'closed' then
      raise exception 'Cannot add or move an order into a closed billing cycle';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
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

  if exists (
    select 1
    from public.billing_cycles downstream
    where downstream.starts_on > cycle_row.starts_on
      and downstream.status = 'closed'
  ) then
    raise exception 'Reopen later closed billing cycles first to avoid invalidating their snapshots';
  end if;

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
revoke all on function public.reopen_billing_cycle(uuid) from public, anon;
grant execute on function public.reopen_billing_cycle(uuid) to authenticated;

-- Harden existing SECURITY DEFINER functions whose bodies are already schema
-- qualified. The rest of the app schema is intentionally not in the path.
alter function public.handle_new_user() set search_path = pg_catalog, public;
alter function public.is_admin() set search_path = pg_catalog, public;
alter function public.record_full_order_payment(uuid[], date, text) set search_path = pg_catalog, public;
alter function public.record_order_payment(uuid[], bigint, date, text) set search_path = pg_catalog, public;
alter function public.soft_delete_order(uuid) set search_path = pg_catalog, public;
alter function public.restore_deleted_order(uuid) set search_path = pg_catalog, public;
alter function public.record_installment_payment(uuid, date, bigint, text) set search_path = pg_catalog, public;
alter function public.update_order(uuid, date, text, bigint, uuid, text, text) set search_path = pg_catalog, public;
alter function public.cancel_order(uuid, bigint, text) set search_path = pg_catalog, public;
alter function public.close_billing_cycle(uuid) set search_path = pg_catalog, public;
alter function public.reopen_billing_cycle(uuid) set search_path = pg_catalog, public;
alter function public.reject_closed_cycle_order_write() set search_path = pg_catalog, public;
alter function public.update_my_display_name(text) set search_path = pg_catalog, public;
do $$
begin
  if to_regprocedure('public.update_my_profile(text,text)') is not null then
    execute 'alter function public.update_my_profile(text, text) set search_path = pg_catalog, public';
  end if;
end;
$$;
