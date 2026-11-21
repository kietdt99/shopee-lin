-- Read-only ACL check for app-owned public functions.
-- Run with: supabase db query --remote=<project-ref> --read-only --file supabase/verification/function_execute_acl.sql
-- Expected result: zero rows. Any returned row is a missing/unexpected function
-- or an EXECUTE grant that differs from the intended anon/authenticated matrix.
with expected(signature, authenticated_allowed) as (
  values
    ('cancel_order(uuid,bigint,text)', true),
    ('close_billing_cycle(uuid)', true),
    ('handle_new_user()', false),
    ('is_admin()', true),
    ('record_full_order_payment(uuid[],date,text)', false),
    ('record_order_payment(uuid[],bigint,date,text)', true),
    ('reject_closed_cycle_order_write()', false),
    ('rls_auto_enable()', false),
    ('reopen_billing_cycle(uuid)', true),
    ('update_my_display_name(text)', true)
), actual as (
  select p.oid::regprocedure::text as signature,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_allowed,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_allowed,
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) as public_allowed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
)
select coalesce(e.signature, a.signature) as signature,
  a.anon_allowed,
  a.public_allowed,
  a.authenticated_allowed,
  e.authenticated_allowed as expected_authenticated_allowed
from expected e
full outer join actual a using (signature)
where e.signature is null
   or a.signature is null
   or a.anon_allowed
   or a.public_allowed
   or a.authenticated_allowed is distinct from e.authenticated_allowed
order by 1;
