create table if not exists public.payment_settings (
  singleton boolean primary key default true check (singleton),
  note text not null default 'Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé 😘'
    check (char_length(btrim(note)) between 1 and 300),
  qr_image_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict
);

alter table public.payment_settings enable row level security;
drop policy if exists "read payment settings" on public.payment_settings;
create policy "read payment settings" on public.payment_settings
  for select to authenticated using (true);

revoke all on table public.payment_settings from public, anon, authenticated;
grant select on table public.payment_settings to authenticated;

create or replace function public.reject_app_hard_delete()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Hard deletion is disabled for Shopee Lin records';
end;
$$;
revoke all on function public.reject_app_hard_delete() from public, anon, authenticated;
drop trigger if exists prevent_hard_delete_payment_settings on public.payment_settings;
create trigger prevent_hard_delete_payment_settings before delete on public.payment_settings
  for each row execute function public.reject_app_hard_delete();
drop trigger if exists prevent_truncate_payment_settings on public.payment_settings;
create trigger prevent_truncate_payment_settings before truncate on public.payment_settings
  for each statement execute function public.reject_app_hard_delete();

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "authenticated users read payment QR" on storage.objects;
create policy "authenticated users read payment QR" on storage.objects
  for select to authenticated using (bucket_id = 'payment-qr');
drop policy if exists "admins upload payment QR" on storage.objects;
create policy "admins upload payment QR" on storage.objects
  for insert to authenticated with check (bucket_id = 'payment-qr'
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'));
