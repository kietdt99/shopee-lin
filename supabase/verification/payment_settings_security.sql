-- Run after 20261122180000_admin_payment_settings.sql.
-- Verifies the database privilege boundary without modifying application data.
do $$
declare
  update_function regprocedure := 'public.update_payment_settings(text,text)'::regprocedure;
  qr_bucket storage.buckets%rowtype;
begin
  if not has_table_privilege('authenticated', 'public.payment_settings', 'SELECT') then
    raise exception 'authenticated must be able to read current payment settings';
  end if;
  if has_table_privilege('authenticated', 'public.payment_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.payment_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.payment_settings', 'DELETE')
     or has_table_privilege('authenticated', 'public.payment_settings', 'TRUNCATE') then
    raise exception 'authenticated must not directly mutate payment settings';
  end if;
  if has_table_privilege('anon', 'public.payment_settings', 'SELECT')
     or has_table_privilege('anon', 'public.payment_settings', 'INSERT')
     or has_table_privilege('anon', 'public.payment_settings', 'UPDATE')
     or has_table_privilege('anon', 'public.payment_settings', 'DELETE') then
    raise exception 'anon must not access payment settings';
  end if;
  if has_function_privilege('anon', update_function, 'EXECUTE') then
    raise exception 'payment settings RPC must not be executable by anon or PUBLIC';
  end if;
  if not has_function_privilege('authenticated', update_function, 'EXECUTE') then
    raise exception 'authenticated must be able to call the admin-guarded settings RPC';
  end if;
  select * into qr_bucket from storage.buckets where id = 'payment-qr';
  if not found or qr_bucket.public or qr_bucket.file_size_limit <> 2097152 then
    raise exception 'payment-qr bucket must be private with a 2 MiB size limit';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'admins upload payment QR'
      and cmd = 'INSERT' and coalesce(with_check, '') ilike '%is_admin%'
  ) then
    raise exception 'payment QR upload policy must require Admin role';
  end if;
end;
$$;
