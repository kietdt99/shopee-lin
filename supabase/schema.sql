-- Run this file in Supabase SQL Editor before using the app.
create extension if not exists pgcrypto;
create type public.app_role as enum ('admin', 'viewer');
create type public.order_status as enum ('unpaid', 'paid', 'cancelled');
create type public.cycle_status as enum ('open', 'closed');
create type public.ledger_entry_kind as enum ('opening_credit', 'legacy_adjustment', 'refund');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text not null,
  avatar_path text,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create table public.payment_settings (
  singleton boolean primary key default true check (singleton),
  note text not null default 'Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé 😘'
    check (char_length(btrim(note)) between 1 and 300),
  qr_image_path text,
    installment_qr_image_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict
);

create table public.billing_cycles (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  starts_on date not null,
  ends_on date not null,
  status public.cycle_status not null default 'open',
  opening_balance bigint not null default 0,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  billing_cycle_id uuid not null references public.billing_cycles(id) on delete restrict,
  placed_at date not null,
  description text not null constraint orders_description_nonempty check (btrim(description) <> ''),
  amount bigint not null check (amount > 0),
  status public.order_status not null default 'unpaid',
  shopee_order_url text,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  paid_at date not null,
  amount bigint not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount bigint not null check (amount > 0),
  unique (payment_id, order_id)
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_amount bigint not null check (total_amount > 0),
  created_at timestamptz not null default now()
);

create table public.installment_payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.installment_plans(id) on delete restrict,
  paid_at date not null,
  amount bigint not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  billing_cycle_id uuid not null references public.billing_cycles(id) on delete restrict,
  entry_date date not null,
  kind public.ledger_entry_kind not null,
  amount bigint not null check (amount <> 0),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.cycle_closings (
  id uuid primary key default gen_random_uuid(),
  billing_cycle_id uuid not null references public.billing_cycles(id) on delete restrict,
  opening_balance bigint not null,
  purchase_total bigint not null,
  payment_total bigint not null,
  adjustment_total bigint not null,
  closing_balance bigint not null,
  next_opening_before bigint,
  closed_at timestamptz not null default now(),
  closed_by uuid not null references auth.users(id),
  is_current boolean not null default true,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id)
);
create unique index cycle_closings_one_current_per_cycle
  on public.cycle_closings (billing_cycle_id) where is_current;

create or replace function public.reject_app_hard_delete()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Hard deletion is disabled for Shopee Lin records';
end;
$$;

create trigger prevent_hard_delete_profiles before delete on public.profiles
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_profiles before truncate on public.profiles
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_payment_settings before delete on public.payment_settings
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_payment_settings before truncate on public.payment_settings
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_billing_cycles before delete on public.billing_cycles
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_billing_cycles before truncate on public.billing_cycles
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_orders before delete on public.orders
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_orders before truncate on public.orders
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_payments before delete on public.payments
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_payments before truncate on public.payments
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_payment_allocations before delete on public.payment_allocations
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_payment_allocations before truncate on public.payment_allocations
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_installment_plans before delete on public.installment_plans
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_installment_plans before truncate on public.installment_plans
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_installment_payments before delete on public.installment_payments
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_installment_payments before truncate on public.installment_payments
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_ledger_entries before delete on public.ledger_entries
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_ledger_entries before truncate on public.ledger_entries
  for each statement execute function public.reject_app_hard_delete();
create trigger prevent_hard_delete_cycle_closings before delete on public.cycle_closings
  for each row execute function public.reject_app_hard_delete();
create trigger prevent_truncate_cycle_closings before truncate on public.cycle_closings
  for each statement execute function public.reject_app_hard_delete();

-- Acquire one transaction-scoped lock before direct order writes take row
-- locks. Financial RPCs take the same lock before locking cycles/orders.
create or replace function public.serialize_order_write()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(183674, 1);
  return null;
end;
$$;
create trigger serialize_order_write before insert or update on public.orders
  for each statement execute function public.serialize_order_write();

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
create trigger validate_order_cycle_and_description before insert or update on public.orders
  for each row execute function public.validate_order_cycle_and_description();

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
create trigger guard_billing_cycle_date_update before update of starts_on, ends_on on public.billing_cycles
  for each row execute function public.guard_billing_cycle_date_update();

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
create trigger guard_allocated_order_financial_fields before update on public.orders
  for each row execute function public.guard_allocated_order_financial_fields();

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
create trigger guard_installment_payment_insert before insert on public.installment_payments
  for each row execute function public.guard_installment_payment_insert();

create or replace function public.reject_installment_payment_update()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Installment payment history is append-only';
end;
$$;
create trigger reject_installment_payment_update before update on public.installment_payments
  for each row execute function public.reject_installment_payment_update();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  email_hash text;
begin
  email_hash := encode(extensions.digest(convert_to(lower(new.email), 'UTF8'), 'sha256'), 'hex');

  insert into public.profiles (id, email, full_name, role)
  select new.id, new.email,
    case email_hash
      when '595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876' then 'Bé Kịt Thần Kỳ'
      when '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967' then 'Tester Quèn'
      when '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d' then 'Bé Lin Tốc Độ Cao'
    end,
    case email_hash
      when '595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876' then 'admin'::public.app_role
      when '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967' then 'viewer'::public.app_role
      when '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d' then 'viewer'::public.app_role
    end
  where email_hash in (
    '595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876',
    '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967',
    '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d'
  )
  on conflict (id) do nothing;

  if not found then
    raise exception 'This email is not allowed to access the application';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace view public.installment_summary with (security_invoker = true) as
select p.id, p.name, p.total_amount, coalesce(sum(ip.amount), 0)::bigint as total_paid
from public.installment_plans p
left join public.installment_payments ip on ip.plan_id = p.id
group by p.id;

alter table public.profiles enable row level security;
alter table public.payment_settings enable row level security;
alter table public.billing_cycles enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.installment_plans enable row level security;
alter table public.installment_payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.cycle_closings enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
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

create or replace function public.record_full_order_payment(p_order_ids uuid[], p_paid_at date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  new_payment_id uuid;
  payment_total bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can record a payment';
  end if;
  perform pg_advisory_xact_lock(183674, 1);

  select coalesce(sum(amount), 0) into payment_total
  from public.orders
  where id = any(p_order_ids) and status = 'unpaid' and deleted_at is null;

  if payment_total <= 0 then
    raise exception 'Select at least one unpaid order';
  end if;

  insert into public.payments (paid_at, amount, note)
  values (p_paid_at, payment_total, p_note)
  returning id into new_payment_id;

  insert into public.payment_allocations (payment_id, order_id, amount)
  select new_payment_id, id, amount
  from public.orders
  where id = any(p_order_ids) and status = 'unpaid' and deleted_at is null;

  update public.orders set status = 'paid', updated_at = now()
  where id = any(p_order_ids) and status = 'unpaid' and deleted_at is null;

  return new_payment_id;
end;
$$;

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
  selected_outstanding bigint;
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

  select coalesce(sum(o.amount - coalesce(allocated.total, 0)), 0)::bigint
  into selected_outstanding
  from public.orders o
  left join (
    select order_id, sum(amount)::bigint as total
    from public.payment_allocations group by order_id
  ) allocated on allocated.order_id = o.id
  where o.id = any(p_order_ids) and o.status = 'unpaid' and o.deleted_at is null;

  if p_amount <> selected_outstanding then
    raise exception 'Payment amount must fully settle every selected order';
  end if;

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
  if remaining_amount <> 0 then raise exception 'Selected orders changed; payment could not settle every order'; end if;
  return new_payment_id;
end;
$$;

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

  select billing_cycle_id into order_cycle_id from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if order_cycle_id is not null then
    select * into cycle_row from public.billing_cycles where id = order_cycle_id for update;
    if not found then raise exception 'Billing cycle not found'; end if;
    if cycle_row.status = 'closed' then raise exception 'Cannot change a closed billing cycle'; end if;
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_cycle_id is distinct from order_cycle_id then raise exception 'Order changed while deletion was processing; retry'; end if;
  if order_row.deleted_at is not null then raise exception 'Order is already deleted'; end if;
  if order_row.status <> 'unpaid' then raise exception 'Only unpaid orders can be deleted'; end if;

  select coalesce(sum(amount), 0)::bigint into allocated_amount from public.payment_allocations where order_id = p_order_id;
  if allocated_amount > 0 then
    raise exception 'An order with payment allocations must be cancelled/refunded, not deleted';
  end if;

  update public.orders set deleted_at = now(), deleted_by = auth.uid(), updated_at = now() where id = p_order_id;
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

  select billing_cycle_id into order_cycle_id from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if order_cycle_id is not null then
    select * into cycle_row from public.billing_cycles where id = order_cycle_id for update;
    if not found then raise exception 'Billing cycle not found'; end if;
    if cycle_row.status = 'closed' then raise exception 'Reopen the billing cycle before restoring this order'; end if;
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_cycle_id is distinct from order_cycle_id then raise exception 'Order changed while restore was processing; retry'; end if;
  if order_row.deleted_at is null then raise exception 'Order is not deleted'; end if;
  if order_row.status <> 'unpaid' then raise exception 'Only deleted unpaid orders can be restored'; end if;

  select coalesce(sum(amount), 0)::bigint into allocated_amount from public.payment_allocations where order_id = p_order_id;
  if allocated_amount > 0 then raise exception 'Cannot restore an order with payment allocations'; end if;

  update public.orders set deleted_at = null, deleted_by = null, updated_at = now() where id = p_order_id;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid,p_refund_amount bigint default 0,p_note text default null)
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
  if order_row.status = 'paid' then raise exception 'Completed Shopee orders cannot be cancelled or refunded'; end if;
  if order_row.status <> 'unpaid' then raise exception 'Only unpaid Shopee orders can be cancelled'; end if;

  select coalesce(sum(amount), 0)::bigint into refunded from public.payment_allocations where order_id = p_order_id;
  if p_refund_amount is null or p_refund_amount < 0 or p_refund_amount > refunded then raise exception 'Refund amount exceeds received allocation'; end if;
  if p_refund_amount > 0 and order_row.billing_cycle_id is null then raise exception 'Cannot record a refund for an order without a billing cycle'; end if;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
  if p_refund_amount>0 then
    insert into public.ledger_entries(billing_cycle_id,entry_date,kind,amount,description)
    values (order_row.billing_cycle_id, current_date, 'refund', p_refund_amount, coalesce(p_note,'Hoàn tiền đơn bị hủy'));
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

create or replace function public.reject_closed_cycle_order_write()
returns trigger language plpgsql security definer set search_path=pg_catalog, public as $$
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
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create trigger protect_closed_cycle_orders before insert or update or delete on public.orders
for each row execute function public.reject_closed_cycle_order_write();

create policy "read profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "read payment settings" on public.payment_settings for select to authenticated using (true);

create or replace function public.update_payment_settings(p_note text, p_qr_image_path text)
returns void language plpgsql security definer set search_path = pg_catalog, public, storage as $$
declare
  clean_note text := btrim(p_note);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authenticated admin can update payment settings';
  end if;
  if clean_note is null or char_length(clean_note) < 1 or char_length(clean_note) > 300 then
    raise exception 'Payment note must be between 1 and 300 characters';
  end if;
  if p_qr_image_path is not null then
    if p_qr_image_path !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' then
      raise exception 'Payment QR image path is invalid';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'payment-qr' and o.name = p_qr_image_path
    ) then
      raise exception 'Payment QR image upload was not found';
    end if;
  end if;

  insert into public.payment_settings as current_settings (singleton, note, qr_image_path, updated_at, updated_by)
  values (true, clean_note, p_qr_image_path, now(), auth.uid())
  on conflict (singleton) do update
  set note = excluded.note,
      qr_image_path = coalesce(excluded.qr_image_path, current_settings.qr_image_path),
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.update_payment_settings(text, text) from public, anon;
grant execute on function public.update_payment_settings(text, text) to authenticated;

create or replace function public.update_installment_payment_settings(p_qr_image_path text)
returns void language plpgsql security definer set search_path = pg_catalog, public, storage as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an authenticated admin can update installment payment settings';
  end if;
  if p_qr_image_path is null or p_qr_image_path !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' then
    raise exception 'Installment payment QR image path is invalid';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'payment-qr' and o.name = p_qr_image_path
  ) then
    raise exception 'Installment payment QR image upload was not found';
  end if;

  insert into public.payment_settings as current_settings
    (singleton, installment_qr_image_path, updated_at, updated_by)
  values (true, p_qr_image_path, now(), auth.uid())
  on conflict (singleton) do update
  set installment_qr_image_path = excluded.installment_qr_image_path,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.update_installment_payment_settings(text) from public, anon;
grant execute on function public.update_installment_payment_settings(text) to authenticated;

create or replace function public.update_my_profile(p_display_name text, p_avatar_path text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  clean_name text := btrim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if clean_name is null or char_length(clean_name) < 1 or char_length(clean_name) > 50 then
    raise exception 'Display name must be between 1 and 50 characters';
  end if;
  if p_avatar_path is not null then
    if p_avatar_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
      raise exception 'Avatar path is invalid';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'profile-avatars'
        and o.name = p_avatar_path
        and (storage.foldername(o.name))[1] = auth.uid()::text
    ) then
      raise exception 'Avatar upload was not found';
    end if;
  end if;
  update public.profiles set full_name = clean_name, avatar_path = p_avatar_path where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

create or replace function public.update_my_display_name(p_display_name text)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.update_my_profile(p_display_name, (select p.avatar_path from public.profiles p where p.id = auth.uid()));
  return btrim(p_display_name);
end;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
revoke all on function public.update_my_display_name(text) from public, anon;
grant execute on function public.update_my_display_name(text) to authenticated;

create policy "read cycles" on public.billing_cycles for select to authenticated using (true);
create policy "admin inserts cycles" on public.billing_cycles for insert to authenticated with check (public.is_admin());
create policy "read orders" on public.orders for select to authenticated using (true);
create policy "admin inserts orders" on public.orders for insert to authenticated with check (public.is_admin() and deleted_at is null and deleted_by is null);
create policy "read payments" on public.payments for select to authenticated using (true);
create policy "read allocations" on public.payment_allocations for select to authenticated using (true);
create policy "read plans" on public.installment_plans for select to authenticated using (true);
create policy "admin inserts plans" on public.installment_plans for insert to authenticated with check (public.is_admin());
create policy "read installment payments" on public.installment_payments for select to authenticated using (true);
create policy "read ledger entries" on public.ledger_entries for select to authenticated using (true);
create policy "read cycle closings" on public.cycle_closings for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "profile avatar owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile avatar owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'));

revoke insert, update, delete, truncate on table public.profiles, public.payment_settings, public.billing_cycles, public.orders,
  public.payments, public.payment_allocations, public.installment_plans, public.installment_payments,
  public.ledger_entries, public.cycle_closings from public, anon, authenticated;
revoke all on table public.payment_settings from public, anon, authenticated;
grant select on table public.payment_settings to authenticated;
grant insert (label, starts_on, ends_on) on table public.billing_cycles to authenticated;
grant insert (placed_at, description, amount, billing_cycle_id, notes, shopee_order_url)
  on table public.orders to authenticated;
grant insert (name, total_amount) on table public.installment_plans to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "authenticated users read payment QR" on storage.objects for select to authenticated
  using (bucket_id = 'payment-qr');
create policy "admins upload payment QR" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr'
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'));

-- Keep application RPCs private to the signed-in app roles. PostgreSQL grants
-- EXECUTE to PUBLIC by default, and removing PUBLIC alone does not remove the
-- explicit grants that Supabase's default privileges give anon/authenticated.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.reject_closed_cycle_order_write() from public, anon, authenticated;
revoke all on function public.reject_app_hard_delete() from public, anon, authenticated;
revoke all on function public.serialize_order_write() from public, anon, authenticated;
revoke all on function public.guard_allocated_order_financial_fields() from public, anon, authenticated;
revoke all on function public.update_order(uuid, date, text, bigint, uuid, text, text) from public, anon, authenticated;
revoke all on function public.validate_order_cycle_and_description() from public, anon, authenticated;
revoke all on function public.guard_billing_cycle_date_update() from public, anon, authenticated;
revoke all on function public.guard_installment_payment_insert() from public, anon, authenticated;
revoke all on function public.reject_installment_payment_update() from public, anon, authenticated;
-- Supabase's event-trigger helper needs no client-role EXECUTE grants.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
revoke all on function public.record_full_order_payment(uuid[], date, text) from public, anon, authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.record_order_payment(uuid[], bigint, date, text) from public, anon;
grant execute on function public.record_order_payment(uuid[], bigint, date, text) to authenticated;
revoke all on function public.soft_delete_order(uuid) from public, anon;
grant execute on function public.soft_delete_order(uuid) to authenticated;
revoke all on function public.restore_deleted_order(uuid) from public, anon;
grant execute on function public.restore_deleted_order(uuid) to authenticated;
revoke all on function public.update_order(uuid, date, text, bigint, uuid, text, text) from public, anon;
grant execute on function public.update_order(uuid, date, text, bigint, uuid, text, text) to authenticated;
revoke all on function public.record_installment_payment(uuid, date, bigint, text) from public, anon;
grant execute on function public.record_installment_payment(uuid, date, bigint, text) to authenticated;
revoke all on function public.cancel_order(uuid, bigint, text) from public, anon;
grant execute on function public.cancel_order(uuid, bigint, text) to authenticated;
revoke all on function public.close_billing_cycle(uuid) from public, anon;
grant execute on function public.close_billing_cycle(uuid) to authenticated;
revoke all on function public.reopen_billing_cycle(uuid) from public, anon;
grant execute on function public.reopen_billing_cycle(uuid) to authenticated;
revoke all on function public.update_my_display_name(text) from public, anon;
grant execute on function public.update_my_display_name(text) to authenticated;
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
revoke all on function public.update_payment_settings(text, text) from public, anon;
grant execute on function public.update_payment_settings(text, text) to authenticated;

-- The first passwordless sign-in automatically creates and assigns the two allowlisted users.
