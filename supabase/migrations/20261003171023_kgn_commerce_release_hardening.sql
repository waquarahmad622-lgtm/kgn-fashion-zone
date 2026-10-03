begin;
-- Support private timelines and cascade deletion without scanning every event.
create index if not exists kgn_order_events_order_id_id on public.kgn_order_events(order_id,id);
alter policy kgn_settings_admin on public.kgn_commerce_settings
 using(exists(select 1 from public.admin_users where user_id=(select auth.uid())))
 with check(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
alter policy kgn_orders_admin_read on public.kgn_orders
 using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));
alter policy kgn_events_admin_read on public.kgn_order_events
 using(exists(select 1 from public.admin_users where user_id=(select auth.uid())));

-- Existing stock-function permissions and automatic retention are unchanged.
-- A retention schedule requires explicit approval of the permanent-deletion scope.
commit;
