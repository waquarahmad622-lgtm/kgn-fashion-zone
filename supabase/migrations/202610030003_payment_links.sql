begin;
alter table public.kgn_orders add column if not exists payment_link_state text not null default 'none' check(payment_link_state in('none','creating','ready','uncertain'));
create or replace function public.kgn_claim_payment_link(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders;
begin
 select * into o from public.kgn_orders where id=p_id for update;
 if not found or o.status<>'confirmed' or o.payment_method<>'online' or o.shipping_paise is null or o.payment_status<>'unpaid' then raise exception 'A confirmed unpaid online order is required'; end if;
 if not exists(select 1 from public.kgn_commerce_settings where id=1 and online_enabled) then raise exception 'Online payments are not enabled'; end if;
 if o.payment_link_state='ready' then return jsonb_build_object('existing',true,'url',o.payment_url); end if;
 if o.payment_link_state<>'none' then raise exception 'Payment link creation is pending reconciliation. Check the gateway before retrying'; end if;
 update public.kgn_orders set payment_link_state='creating' where id=p_id;
 return jsonb_build_object('existing',false,'amount',o.subtotal_paise+o.shipping_paise,'reference',o.id);
end $$;
create or replace function public.kgn_verify_payment(p_id uuid,p_link text,p_reference text,p_amount bigint,p_currency text) returns void language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders;
begin
 select * into o from public.kgn_orders where id=p_id for update;
 if not found or o.payment_link_id is distinct from p_link or p_currency is distinct from 'INR' or p_amount is distinct from o.subtotal_paise+o.shipping_paise or o.shipping_paise is null or o.payment_method<>'online' or o.status not in('confirmed','packed','shipped','out_for_delivery','delivered') then raise exception 'Payment does not match this order'; end if;
 if o.payment_status='paid' then
  if o.payment_reference is distinct from p_reference then raise exception 'Payment reference mismatch'; end if;return;
 end if;
 update public.kgn_orders set payment_status='paid',payment_reference=p_reference,updated_at=now() where id=p_id;
 insert into public.kgn_order_events(order_id,status) values(p_id,'payment_verified');
end $$;
revoke all on function public.kgn_claim_payment_link(uuid),public.kgn_verify_payment(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.kgn_claim_payment_link(uuid),public.kgn_verify_payment(uuid,text,text,bigint,text) to service_role;
notify pgrst,'reload schema';
commit;
