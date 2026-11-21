-- Run this file in Supabase SQL Editor before using the app.
create extension if not exists pgcrypto;
create type public.app_role as enum ('admin', 'viewer');
create type public.order_status as enum ('unpaid', 'paid', 'cancelled');
create type public.cycle_status as enum ('open', 'closed');
create type public.ledger_entry_kind as enum ('opening_credit', 'legacy_adjustment', 'refund');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
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
  billing_cycle_id uuid references public.billing_cycles(id) on delete set null,
  placed_at date not null,
  description text not null,
  amount bigint not null check (amount > 0),
  status public.order_status not null default 'unpaid',
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
  payment_id uuid not null references public.payments(id) on delete cascade,
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
  plan_id uuid not null references public.installment_plans(id) on delete cascade,
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
  billing_cycle_id uuid primary key references public.billing_cycles(id) on delete cascade,
  opening_balance bigint not null,
  purchase_total bigint not null,
  payment_total bigint not null,
  adjustment_total bigint not null,
  closing_balance bigint not null,
  next_opening_before bigint,
  closed_at timestamptz not null default now(),
  closed_by uuid not null references auth.users(id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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
alter table public.billing_cycles enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.installment_plans enable row level security;
alter table public.installment_payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.cycle_closings enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.record_full_order_payment(p_order_ids uuid[], p_paid_at date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_payment_id uuid;
  payment_total bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can record a payment';
  end if;

  select coalesce(sum(amount), 0) into payment_total
  from public.orders
  where id = any(p_order_ids) and status = 'unpaid';

  if payment_total <= 0 then
    raise exception 'Select at least one unpaid order';
  end if;

  insert into public.payments (paid_at, amount, note)
  values (p_paid_at, payment_total, p_note)
  returning id into new_payment_id;

  insert into public.payment_allocations (payment_id, order_id, amount)
  select new_payment_id, id, amount
  from public.orders
  where id = any(p_order_ids) and status = 'unpaid';

  update public.orders set status = 'paid', updated_at = now()
  where id = any(p_order_ids) and status = 'unpaid';

  return new_payment_id;
end;
$$;

create or replace function public.record_order_payment(p_order_ids uuid[], p_amount bigint, p_paid_at date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_payment_id uuid;
  remaining_amount bigint := p_amount;
  order_row record;
  allocation_amount bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can record a payment'; end if;
  if p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;
  if coalesce(array_length(p_order_ids,1),0) = 0 then raise exception 'Select at least one unpaid order'; end if;
  if exists (select 1 from public.orders o join public.billing_cycles c on c.id=o.billing_cycle_id where o.id=any(p_order_ids) and c.status='closed') then
    raise exception 'Cannot allocate a payment to a closed billing cycle';
  end if;
  insert into public.payments(paid_at,amount,note) values (p_paid_at,p_amount,p_note) returning id into new_payment_id;
  for order_row in select o.id,o.amount,coalesce(sum(a.amount),0)::bigint already_paid from public.orders o left join public.payment_allocations a on a.order_id=o.id where o.id=any(p_order_ids) and o.status='unpaid' group by o.id order by o.placed_at,o.created_at loop
    exit when remaining_amount=0;
    allocation_amount := least(remaining_amount, order_row.amount-order_row.already_paid);
    if allocation_amount>0 then
      insert into public.payment_allocations(payment_id,order_id,amount) values(new_payment_id,order_row.id,allocation_amount);
      remaining_amount := remaining_amount-allocation_amount;
      if allocation_amount=order_row.amount-order_row.already_paid then update public.orders set status='paid',updated_at=now() where id=order_row.id; end if;
    end if;
  end loop;
  if remaining_amount>0 then raise exception 'Selected orders cannot absorb the full payment amount'; end if;
  return new_payment_id;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid,p_refund_amount bigint default 0,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare refunded bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can cancel an order'; end if;
  if exists(select 1 from public.orders o join public.billing_cycles c on c.id=o.billing_cycle_id where o.id=p_order_id and c.status='closed') then raise exception 'Cannot change a closed billing cycle'; end if;
  select coalesce(sum(a.amount),0)::bigint into refunded from public.payment_allocations a where a.order_id=p_order_id;
  if p_refund_amount<0 or p_refund_amount>refunded then raise exception 'Refund amount exceeds received allocation'; end if;
  update public.orders set status='cancelled',updated_at=now() where id=p_order_id and status<>'cancelled';
  if p_refund_amount>0 then
    insert into public.ledger_entries(billing_cycle_id,entry_date,kind,amount,description)
    select billing_cycle_id,current_date,'refund',p_refund_amount,coalesce(p_note,'Hoàn tiền đơn bị hủy') from public.orders where id=p_order_id;
  end if;
end;
$$;

create or replace function public.close_billing_cycle(p_cycle_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare cycle_row public.billing_cycles; opening bigint; purchases bigint; payments bigint; adjustments bigint; closing bigint; prior_next_opening bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can close a cycle'; end if;
  select * into cycle_row from public.billing_cycles where id=p_cycle_id for update;
  if not found or cycle_row.status='closed' then raise exception 'Billing cycle is not open'; end if;
  if cycle_row.ends_on > current_date then raise exception 'A billing cycle can only be closed on or after its end date'; end if;
  select coalesce(sum(amount),0)::bigint into purchases from public.orders where billing_cycle_id=p_cycle_id and status<>'cancelled';
  select coalesce(sum(p.amount),0)::bigint into payments from public.payments p where p.paid_at between cycle_row.starts_on and cycle_row.ends_on;
  select coalesce(sum(amount),0)::bigint into adjustments from public.ledger_entries where billing_cycle_id=p_cycle_id;
  opening := cycle_row.opening_balance;
  closing := opening+purchases-payments+adjustments;
  select opening_balance into prior_next_opening from public.billing_cycles where starts_on=cycle_row.ends_on+1;
  insert into public.cycle_closings(billing_cycle_id,opening_balance,purchase_total,payment_total,adjustment_total,closing_balance,next_opening_before,closed_by) values(p_cycle_id,opening,purchases,payments,adjustments,closing,prior_next_opening,auth.uid());
  update public.billing_cycles set status='closed' where id=p_cycle_id;
  update public.billing_cycles set opening_balance=closing where starts_on=cycle_row.ends_on+1;
end;
$$;

create or replace function public.reopen_billing_cycle(p_cycle_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare cycle_row public.billing_cycles;
begin
  if not public.is_admin() then raise exception 'Only an admin can reopen a cycle'; end if;
  select * into cycle_row from public.billing_cycles where id=p_cycle_id for update;
  if not found or cycle_row.status<>'closed' then raise exception 'Billing cycle is not closed'; end if;
  update public.billing_cycles set status='open' where id=p_cycle_id;
  update public.billing_cycles c set opening_balance=cc.next_opening_before from public.cycle_closings cc where cc.billing_cycle_id=p_cycle_id and c.starts_on=cycle_row.ends_on+1;
  delete from public.cycle_closings where billing_cycle_id=p_cycle_id;
end;
$$;

create or replace function public.reject_closed_cycle_order_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change orders'; end if;
  if tg_op in ('UPDATE','DELETE') and old.billing_cycle_id is not null and exists(select 1 from public.billing_cycles where id=old.billing_cycle_id and status='closed') then
    raise exception 'Cannot change an order in a closed billing cycle';
  end if;
  if tg_op in ('INSERT','UPDATE') and new.billing_cycle_id is not null and exists(select 1 from public.billing_cycles where id=new.billing_cycle_id and status='closed') then
    raise exception 'Cannot add or move an order into a closed billing cycle';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create trigger protect_closed_cycle_orders before insert or update or delete on public.orders
for each row execute function public.reject_closed_cycle_order_write();

create policy "read profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.update_my_display_name(p_display_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  clean_name text := btrim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if clean_name is null or char_length(clean_name) < 1 or char_length(clean_name) > 50 then
    raise exception 'Display name must be between 1 and 50 characters';
  end if;
  update public.profiles set full_name = clean_name where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;
  return clean_name;
end;
$$;
revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.update_my_display_name(text) to authenticated;

create policy "read cycles" on public.billing_cycles for select to authenticated using (true);
create policy "admin manages cycles" on public.billing_cycles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read orders" on public.orders for select to authenticated using (true);
create policy "admin manages orders" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read payments" on public.payments for select to authenticated using (true);
create policy "admin manages payments" on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read allocations" on public.payment_allocations for select to authenticated using (true);
create policy "admin manages allocations" on public.payment_allocations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read plans" on public.installment_plans for select to authenticated using (true);
create policy "admin manages plans" on public.installment_plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read installment payments" on public.installment_payments for select to authenticated using (true);
create policy "admin manages installment payments" on public.installment_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read ledger entries" on public.ledger_entries for select to authenticated using (true);
create policy "admin manages ledger entries" on public.ledger_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read cycle closings" on public.cycle_closings for select to authenticated using (true);
create policy "admin manages cycle closings" on public.cycle_closings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Keep application RPCs private to the signed-in app roles. PostgreSQL grants
-- EXECUTE to PUBLIC by default, and removing PUBLIC alone does not remove the
-- explicit grants that Supabase's default privileges give anon/authenticated.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.reject_closed_cycle_order_write() from public, anon, authenticated;
-- Supabase's event-trigger helper needs no client-role EXECUTE grants.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.record_full_order_payment(uuid[], date, text) from public, anon, authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.record_order_payment(uuid[], bigint, date, text) from public, anon;
grant execute on function public.record_order_payment(uuid[], bigint, date, text) to authenticated;
revoke all on function public.cancel_order(uuid, bigint, text) from public, anon;
grant execute on function public.cancel_order(uuid, bigint, text) to authenticated;
revoke all on function public.close_billing_cycle(uuid) from public, anon;
grant execute on function public.close_billing_cycle(uuid) to authenticated;
revoke all on function public.reopen_billing_cycle(uuid) from public, anon;
grant execute on function public.reopen_billing_cycle(uuid) to authenticated;
revoke all on function public.update_my_display_name(text) from public, anon;
grant execute on function public.update_my_display_name(text) to authenticated;

-- The first passwordless sign-in automatically creates and assigns the two allowlisted users.
