-- Run this file in Supabase SQL Editor before using the app.
create extension if not exists pgcrypto;
create type public.app_role as enum ('admin', 'viewer');
create type public.order_status as enum ('unpaid', 'paid', 'cancelled');
create type public.cycle_status as enum ('open', 'closed');

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

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  select new.id, new.email,
    case encode(digest(lower(new.email), 'sha256'), 'hex')
      when '595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876' then 'Kiet Do'
      when '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967' then 'Kiet Do — Viewer test'
      when '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d' then 'Bé Lin'
    end,
    case encode(digest(lower(new.email), 'sha256'), 'hex')
      when '595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876' then 'admin'::public.app_role
      when '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967' then 'viewer'::public.app_role
      when '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d' then 'viewer'::public.app_role
    end
  where encode(digest(lower(new.email), 'sha256'), 'hex') in ('595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876', '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967', '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d')
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

create policy "read profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

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

-- The first passwordless sign-in automatically creates and assigns the two allowlisted users.
