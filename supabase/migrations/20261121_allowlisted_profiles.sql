-- Apply this one-time migration because the initial schema was already run.
-- First passwordless login creates only the two approved profiles with their role.
create extension if not exists pgcrypto;
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
