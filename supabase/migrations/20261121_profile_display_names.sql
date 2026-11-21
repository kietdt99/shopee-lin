-- Set friendly defaults for the three allowlisted identities and add a self-only
-- display-name update RPC. This avoids granting authenticated users table UPDATE,
-- which would let them attempt to change their role.
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

update public.profiles
set full_name = case
  when encode(extensions.digest(convert_to(lower(email), 'UTF8'), 'sha256'), 'hex') = '595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876' then 'Bé Kịt Thần Kỳ'
  when encode(extensions.digest(convert_to(lower(email), 'UTF8'), 'sha256'), 'hex') = '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967' then 'Tester Quèn'
  when encode(extensions.digest(convert_to(lower(email), 'UTF8'), 'sha256'), 'hex') = '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d' then 'Bé Lin Tốc Độ Cao'
end
where encode(extensions.digest(convert_to(lower(email), 'UTF8'), 'sha256'), 'hex') in (
  '595168191cfa3dfafa0ce123e97001de6edb2fea17b3d38fdbdd30aea13c2876',
  '3a205242d161ac36e40f415ee0f53850f27f14c20a7b7c9760ed8d77b425c967',
  '254bb54268f25f0d0c645b64f13a4ce69ddfefad8a8320b98fc7e40113a7fe1d'
);

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
