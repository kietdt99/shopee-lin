alter table public.payment_settings
  add column if not exists installment_qr_image_path text;

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
