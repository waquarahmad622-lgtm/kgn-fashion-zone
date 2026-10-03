begin;
create or replace function public.kgn_purge_closed_orders() returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 delete from public.kgn_orders where status in('cancelled','delivered') and updated_at<now()-interval '1 year';
 get diagnostics removed=row_count;return removed;
end $$;
revoke all on function public.kgn_purge_closed_orders() from public,anon,authenticated;
grant execute on function public.kgn_purge_closed_orders() to service_role;
-- Schedule daily in Supabase Cron before enabling order requests:
-- select cron.schedule('kgn-order-retention','15 3 * * *','select public.kgn_purge_closed_orders()');
commit;
