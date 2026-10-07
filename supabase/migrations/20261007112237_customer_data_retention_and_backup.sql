begin;
alter table public.kgn_retailers add column proof_deleted_at timestamptz;
alter table public.kgn_commerce_settings add column order_retention_enabled boolean not null default true;
grant update(order_retention_enabled) on public.kgn_commerce_settings to authenticated;
alter table public.kgn_orders add column delivered_at timestamptz;
alter table public.kgn_orders add column closed_at timestamptz;
alter table public.kgn_orders add column retention_hold boolean not null default false;
grant update(retention_hold) on public.kgn_orders to authenticated;
create policy kgn_order_retention_owner on public.kgn_orders for update to authenticated
 using((select private.is_kgn_admin())) with check((select private.is_kgn_admin()));
-- Never use last-modified time for a delivery retention clock.
update public.kgn_orders o set delivered_at=coalesce((select min(e.created_at) from public.kgn_order_events e where e.order_id=o.id and e.status='delivered'),o.updated_at)
 where o.status='delivered';
update public.kgn_orders o set closed_at=coalesce(o.delivered_at,(select min(e.created_at) from public.kgn_order_events e where e.order_id=o.id and e.status='cancelled'),o.updated_at)
 where o.status in ('delivered','cancelled');
create function private.kgn_stamp_order_closure() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='delivered' and old.status is distinct from 'delivered' then new.delivered_at:=now(); end if;
 if new.status in ('delivered','cancelled') and old.status is distinct from new.status then new.closed_at:=now(); end if;
 return new;
end $$;
revoke all on function private.kgn_stamp_order_closure() from public,anon,authenticated;
create trigger kgn_order_closure before update of status on public.kgn_orders for each row execute function private.kgn_stamp_order_closure();
create index kgn_order_retention_due on public.kgn_orders(closed_at) where status in ('delivered','cancelled') and not retention_hold;
-- Small accounting references only: no customer name, address, phone, tracking key,
-- catalogue photos or line items. This is not a replacement for statutory invoices.
create table private.kgn_payment_receipts(
 order_id uuid primary key, created_at timestamptz not null, closed_at timestamptz not null,
 subtotal_paise bigint not null,shipping_paise bigint,payment_method text not null,payment_status text not null,
 payment_link_id text,payment_reference text,archived_at timestamptz not null default now()
);
alter table private.kgn_payment_receipts enable row level security;
revoke all on private.kgn_payment_receipts from public,anon,authenticated;
grant all on private.kgn_payment_receipts to service_role;
create or replace function public.kgn_purge_closed_orders() returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 if not coalesce((select order_retention_enabled from public.kgn_commerce_settings where id=1),false) then return 0; end if;
 -- Lock eligible orders and archive payment references before deleting in the same transaction.
 with eligible as (
  select * from public.kgn_orders where status in ('delivered','cancelled') and not retention_hold
   and closed_at<=now()-interval '1 year' order by closed_at limit 500 for update skip locked
 ), receipts as (
  insert into private.kgn_payment_receipts(order_id,created_at,closed_at,subtotal_paise,shipping_paise,payment_method,payment_status,payment_link_id,payment_reference)
  select id,created_at,closed_at,subtotal_paise,shipping_paise,payment_method,payment_status,payment_link_id,payment_reference from eligible
  where payment_status='paid' or payment_reference is not null
  on conflict(order_id) do nothing
 ) delete from public.kgn_orders where id in (select id from eligible);
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function public.kgn_purge_closed_orders() from public,anon,authenticated;
grant execute on function public.kgn_purge_closed_orders() to service_role;
-- Existing tracking consumers remain compatible; add the expiry clock and hold status.
do $$ declare source text; begin
 select pg_get_functiondef('public.kgn_track_order(uuid,text)'::regprocedure) into source;
 source:=replace(source,'''created_at'',o.created_at', '''delivered_at'',o.delivered_at,''closed_at'',o.closed_at,''retention_hold'',o.retention_hold,''retention_enabled'',(select order_retention_enabled from public.kgn_commerce_settings where id=1),''created_at'',o.created_at');
 execute source;
end $$;
-- Google authorization is opt-in. Store only an encrypted refresh token and the
-- customer's own Drive file ID. The encryption key is an Edge Function secret.
create table private.kgn_drive_connections(
 user_id uuid primary key references auth.users(id) on delete cascade,
 encrypted_token text not null, file_id text, updated_at timestamptz not null default now()
);
alter table private.kgn_drive_connections enable row level security;
revoke all on private.kgn_drive_connections from public,anon,authenticated;
grant all on private.kgn_drive_connections to service_role;
create function public.kgn_drive_connection(p_user uuid,p_action text,p_token text default null,p_file text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_action='set' then
  insert into private.kgn_drive_connections(user_id,encrypted_token,file_id) values(p_user,p_token,p_file)
   on conflict(user_id) do update set encrypted_token=excluded.encrypted_token,file_id=excluded.file_id,updated_at=now();
 elsif p_action='file' then update private.kgn_drive_connections set file_id=p_file,updated_at=now() where user_id=p_user;
 elsif p_action='remove' then delete from private.kgn_drive_connections where user_id=p_user;
 elsif p_action<>'get' then raise exception 'Invalid action'; end if;
 select to_jsonb(t) into result from private.kgn_drive_connections t where user_id=p_user;
 return result;
end $$;
revoke all on function public.kgn_drive_connection(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.kgn_drive_connection(uuid,text,text,text) to service_role;
-- Available on the hosted project; local PGlite tests do not ship this extension.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('kgn-order-retention','15 3 * * *','select public.kgn_purge_closed_orders()');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
  
