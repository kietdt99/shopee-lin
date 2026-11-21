-- Private, user-owned profile avatars. Old objects are retained; no Storage DELETE policy is created.
alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile avatar owner reads" on storage.objects;
create policy "profile avatar owner reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile avatar owner uploads" on storage.objects;
create policy "profile avatar owner uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
  );

create or replace function public.update_my_profile(p_display_name text, p_avatar_path text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_name text := btrim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(clean_name) < 1 or length(clean_name) > 50 then
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

  update public.profiles
  set full_name = clean_name,
      avatar_path = p_avatar_path
  where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

-- Keep the existing name-only RPC compatible while preserving the current avatar.
create or replace function public.update_my_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.update_my_profile(
    p_display_name,
    (select p.avatar_path from public.profiles p where p.id = auth.uid())
  );
  return btrim(p_display_name);
end;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
revoke all on function public.update_my_display_name(text) from public, anon;
grant execute on function public.update_my_display_name(text) to authenticated;
