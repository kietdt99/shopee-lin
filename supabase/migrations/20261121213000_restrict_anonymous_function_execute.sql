-- Restrict app-owned public functions to the roles that need them.
-- PUBLIC and anon must not execute RPCs; authenticated retains only the
-- helpers and application RPCs used by the app and RLS policies.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.reject_closed_cycle_order_write() from public, anon, authenticated;
-- Supabase's event-trigger helper remains callable by its owner/event trigger;
-- it is optional and needs no client-role EXECUTE grants when present.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- Legacy full-payment RPC is not used by the app. Keep it unavailable to both
-- client roles; retain the service_role grant supplied by project defaults.
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
