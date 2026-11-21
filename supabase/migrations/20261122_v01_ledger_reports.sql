-- Upgrade an existing Shopee Lin schema for ledger credits, refunds, cycle snapshots,
-- partial allocations, and closed-cycle write protection.
do $$ begin
  create type public.ledger_entry_kind as enum ('opening_credit','legacy_adjustment','refund');
exception when duplicate_object then null; end $$;

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  billing_cycle_id uuid not null references public.billing_cycles(id) on delete restrict,
  entry_date date not null,
  kind public.ledger_entry_kind not null,
  amount bigint not null check (amount <> 0),
  description text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.cycle_closings (
  billing_cycle_id uuid primary key references public.billing_cycles(id) on delete cascade,
  opening_balance bigint not null,
  purchase_total bigint not null,
  payment_total bigint not null,
  adjustment_total bigint not null,
  closing_balance bigint not null,
  closed_at timestamptz not null default now(),
  closed_by uuid not null references auth.users(id)
);
alter table public.ledger_entries enable row level security;
alter table public.cycle_closings enable row level security;
drop policy if exists "read ledger entries" on public.ledger_entries;
drop policy if exists "admin manages ledger entries" on public.ledger_entries;
drop policy if exists "read cycle closings" on public.cycle_closings;
drop policy if exists "admin manages cycle closings" on public.cycle_closings;
create policy "read ledger entries" on public.ledger_entries for select to authenticated using (true);
create policy "admin manages ledger entries" on public.ledger_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read cycle closings" on public.cycle_closings for select to authenticated using (true);
create policy "admin manages cycle closings" on public.cycle_closings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.record_order_payment(p_order_ids uuid[], p_amount bigint, p_paid_at date default current_date, p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_payment_id uuid; remaining_amount bigint:=p_amount; order_row record; allocation_amount bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can record a payment'; end if;
  if p_amount<=0 or coalesce(array_length(p_order_ids,1),0)=0 then raise exception 'A positive amount and at least one order are required'; end if;
  if exists(select 1 from public.orders o join public.billing_cycles c on c.id=o.billing_cycle_id where o.id=any(p_order_ids) and c.status='closed') then raise exception 'Cannot allocate a payment to a closed billing cycle'; end if;
  insert into public.payments(paid_at,amount,note) values(p_paid_at,p_amount,p_note) returning id into new_payment_id;
  for order_row in select o.id,o.amount,coalesce(sum(a.amount),0)::bigint already_paid from public.orders o left join public.payment_allocations a on a.order_id=o.id where o.id=any(p_order_ids) and o.status='unpaid' group by o.id order by o.placed_at,o.created_at loop
    exit when remaining_amount=0;
    allocation_amount:=least(remaining_amount,order_row.amount-order_row.already_paid);
    if allocation_amount>0 then
      insert into public.payment_allocations(payment_id,order_id,amount) values(new_payment_id,order_row.id,allocation_amount);
      remaining_amount:=remaining_amount-allocation_amount;
      if allocation_amount=order_row.amount-order_row.already_paid then update public.orders set status='paid',updated_at=now() where id=order_row.id; end if;
    end if;
  end loop;
  if remaining_amount>0 then raise exception 'Selected orders cannot absorb the full payment amount'; end if;
  return new_payment_id;
end; $$;

create or replace function public.cancel_order(p_order_id uuid,p_refund_amount bigint default 0,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare refunded bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can cancel an order'; end if;
  if exists(select 1 from public.orders o join public.billing_cycles c on c.id=o.billing_cycle_id where o.id=p_order_id and c.status='closed') then raise exception 'Cannot change a closed billing cycle'; end if;
  select coalesce(sum(amount),0)::bigint into refunded from public.payment_allocations where order_id=p_order_id;
  if p_refund_amount<0 or p_refund_amount>refunded then raise exception 'Refund amount exceeds received allocation'; end if;
  update public.orders set status='cancelled',updated_at=now() where id=p_order_id and status<>'cancelled';
  if p_refund_amount>0 then insert into public.ledger_entries(billing_cycle_id,entry_date,kind,amount,description) select billing_cycle_id,current_date,'refund',p_refund_amount,coalesce(p_note,'Hoàn tiền đơn bị hủy') from public.orders where id=p_order_id; end if;
end; $$;

create or replace function public.close_billing_cycle(p_cycle_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c public.billing_cycles; opening bigint; purchases bigint; payments bigint; adjustments bigint; closing bigint;
begin
  if not public.is_admin() then raise exception 'Only an admin can close a cycle'; end if;
  select * into c from public.billing_cycles where id=p_cycle_id for update;
  if not found or c.status='closed' then raise exception 'Billing cycle is not open'; end if;
  if c.ends_on>current_date then raise exception 'A billing cycle can only be closed on or after its end date'; end if;
  select coalesce(sum(amount),0)::bigint into purchases from public.orders where billing_cycle_id=p_cycle_id and status<>'cancelled';
  select coalesce(sum(amount),0)::bigint into payments from public.payments where paid_at between c.starts_on and c.ends_on;
  select coalesce(sum(amount),0)::bigint into adjustments from public.ledger_entries where billing_cycle_id=p_cycle_id;
  opening:=c.opening_balance; closing:=opening+purchases-payments+adjustments;
  insert into public.cycle_closings values(p_cycle_id,opening,purchases,payments,adjustments,closing,now(),auth.uid());
  update public.billing_cycles set status='closed' where id=p_cycle_id;
  update public.billing_cycles set opening_balance=closing where starts_on=c.ends_on+1;
end; $$;

create or replace function public.reopen_billing_cycle(p_cycle_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c public.billing_cycles;
begin
  if not public.is_admin() then raise exception 'Only an admin can reopen a cycle'; end if;
  select * into c from public.billing_cycles where id=p_cycle_id for update;
  if not found or c.status<>'closed' then raise exception 'Billing cycle is not closed'; end if;
  update public.billing_cycles set status='open' where id=p_cycle_id;
  update public.billing_cycles set opening_balance=0 where starts_on=c.ends_on+1;
  delete from public.cycle_closings where billing_cycle_id=p_cycle_id;
end; $$;

create or replace function public.reject_closed_cycle_order_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change orders'; end if;
  if tg_op in ('UPDATE','DELETE') and old.billing_cycle_id is not null and exists(select 1 from public.billing_cycles where id=old.billing_cycle_id and status='closed') then raise exception 'Cannot change an order in a closed billing cycle'; end if;
  if tg_op in ('INSERT','UPDATE') and new.billing_cycle_id is not null and exists(select 1 from public.billing_cycles where id=new.billing_cycle_id and status='closed') then raise exception 'Cannot add or move an order into a closed billing cycle'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists protect_closed_cycle_orders on public.orders;
create trigger protect_closed_cycle_orders before insert or update or delete on public.orders for each row execute function public.reject_closed_cycle_order_write();
