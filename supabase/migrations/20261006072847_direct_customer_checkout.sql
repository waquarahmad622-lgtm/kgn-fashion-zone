begin;
-- Customer-selected delivery policy: goods paid online, courier freight paid separately.
-- Keep disabled until the edge function and frontend have been published.
alter table public.kgn_commerce_settings add column direct_checkout_enabled boolean not null default false;
alter table public.kgn_orders add column checkout_mode text not null default 'manual' check(checkout_mode in('manual','direct'));
alter table public.kgn_orders add column delivery_payment text not null default 'included' check(delivery_payment in('included','courier_collect'));
alter table public.kgn_orders add column checkout_expires_at timestamptz;
alter table public.kgn_orders add column checkout_reconcile_after timestamptz;
create index kgn_checkout_expiry on public.kgn_orders(checkout_expires_at) where checkout_mode='direct' and status='confirmed' and payment_status='unpaid';

create or replace function public.kgn_prepare_checkout(p_buyer jsonb,p_lines jsonb,p_token text,p_policy text,p_expected_subtotal bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.kgn_commerce_settings; oid uuid; prior public.kgn_orders; l jsonb;p public.products;ss text;pack int;pcs int;bundles int;qty int;r numeric;subtotal bigint:=0;snapshot jsonb:='[]';ph text;line_count int; reserved bigint; p_payment text:='online';
begin
 select * into cfg from public.kgn_commerce_settings where id=1;
 if not coalesce(cfg.direct_checkout_enabled,false) then raise exception 'Direct checkout is not enabled'; end if;
 if not coalesce(cfg.orders_enabled,false) then raise exception 'Online ordering is not available yet'; end if;
 if p_policy is distinct from cfg.policy_version then raise exception 'Please review the current order privacy notice'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid secure order key'; end if;
 if (p_payment='online' and not cfg.online_enabled) or (p_payment='cod' and not cfg.cod_enabled) or p_payment not in ('online','cod') then raise exception 'Payment method unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_token,36));
 if p_expected_subtotal is null or p_expected_subtotal not between 1 and 100000000 then raise exception 'Check the item total'; end if;
 ph:=trim(p_buyer->>'phone');
 if ph is null or ph !~ '^[6-9][0-9]{9}$' or length(trim(p_buyer->>'name')) not between 2 and 100 or length(trim(p_buyer->>'address')) not between 10 and 500 or length(trim(p_buyer->>'city')) not between 2 and 100 or (p_buyer->>'pincode') !~ '^[1-9][0-9]{5}$' then raise exception 'Check contact and delivery address'; end if;
 perform pg_advisory_xact_lock(hashtextextended(ph,34));
 select * into prior from public.kgn_orders where tracking_hash=sha256(convert_to(p_token,'UTF8')) limit 1;
 if found then
  if prior.checkout_mode<>'direct' then raise exception 'Use the existing order tracking page'; end if;
  if prior.payment_status<>'paid' and (prior.status='cancelled' or prior.checkout_expires_at<=now()) then raise exception 'Checkout expired. Start a new checkout'; end if;
  if prior.subtotal_paise is distinct from p_expected_subtotal then raise exception 'Order total changed. Review the price'; end if;
  return jsonb_build_object('id',prior.id,'subtotal_paise',prior.subtotal_paise,'status',prior.status);
 end if;
 if (select count(*) from public.kgn_orders where phone=ph and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many requests. Please contact the store'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Choose 1 to 30 items'; end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct (x->>'id',x->>'size',x->>'pack',x->>'pieces')) from jsonb_array_elements(p_lines)x) then raise exception 'Combine duplicate items'; end if;
 for l in select value from jsonb_array_elements(p_lines) order by value->>'id',value->>'size' loop
  select * into p from public.products where id=(l->>'id')::uuid and published=true for update;
  if not found then raise exception 'A product is no longer available'; end if;
  ss:=l->>'size';pack:=(l->>'pack')::int;pcs:=(l->>'pieces')::int;bundles:=(l->>'bundles')::int;
  if p.unit<>'piece' then raise exception 'Contact store for products priced by set or dozen'; end if;
  if ss is null or not coalesce(ss=any(p.size_options),false) or pack is null or not coalesce(pack=any(p.pack_options),false) or pack not in(3,4,5,6) or bundles is null or bundles not between 1 and 999 then raise exception 'Invalid size or bundle'; end if;
  if (ss in('20-30','22-32') and (pack<>6 or pcs<>6)) or (ss in('32-40','28-32') and (pack<>5 or pcs<>5)) or (ss in('0-0','16-18','20-20','20-24','26-30','32-34','32-36','38-40','32-32') and (pack not in(3,6) or pcs not in(3,6) or pcs>pack)) or (ss in('S','M','L','XL','XXL','XXXL','4XL') and (pack not in(3,4,6) or (pack=6 and pcs not in(3,6)) or (pack<>6 and pcs<>pack))) or (ss not in('20-30','22-32','32-40','28-32','0-0','16-18','20-20','20-24','26-30','32-34','32-36','38-40','32-32','S','M','L','XL','XXL','XXXL','4XL') and pcs<>pack) or pcs is null then raise exception 'Invalid piece count for size'; end if;
  qty:=pcs*bundles;r:=(p.size_rates->>ss)::numeric;
  if r is null or r<=0 or r>99999999 or round(r,2)<>r then raise exception 'Price unavailable. Contact the store'; end if;
  if p.stock_qty is not null and p.stock_qty<qty then raise exception 'Requested quantity exceeds current stock'; end if;
  subtotal:=subtotal+(r*100)::bigint*qty;
  if subtotal>100000000 then raise exception 'For orders above ₹10 lakh please contact the store'; end if;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name_en,'name_hi',p.name_hi,'name_ur',p.name_ur,'size',ss,'pack',pack,'pieces',pcs,'bundles',bundles,'quantity',qty,'rate_paise',(r*100)::bigint));
 end loop;
 -- Check combined sizes of the same product too.
 for l in select jsonb_build_object('id',x->>'id','qty',sum((x->>'quantity')::int)) from jsonb_array_elements(snapshot)x group by x->>'id' loop
  select * into p from public.products where id=(l->>'id')::uuid;
  if not found or not p.published or p.stock_qty is null then raise exception 'Stock availability has not been confirmed. Contact the store'; end if;
  select coalesce(sum((x->>'quantity')::int),0) into reserved from public.kgn_orders z cross join lateral jsonb_array_elements(z.items)x where z.status in('confirmed','packed') and x->>'id'=p.id::text;
  if p.stock_qty-reserved<(l->>'qty')::int then raise exception 'Not enough unreserved stock'; end if;
 end loop;
 if subtotal is distinct from p_expected_subtotal then raise exception 'Order total changed. Refresh the catalogue price'; end if;
 insert into public.kgn_orders(shipping_paise,status,checkout_mode,delivery_payment,checkout_expires_at,tracking_hash,buyer_name,phone,address,city,pincode,items,subtotal_paise,payment_method,policy_version)
 values(0,'confirmed','direct','courier_collect',now()+interval '30 minutes',sha256(convert_to(p_token,'UTF8')),trim(p_buyer->>'name'),ph,trim(p_buyer->>'address'),trim(p_buyer->>'city'),p_buyer->>'pincode',snapshot,subtotal,p_payment,p_policy) returning id into oid;
 insert into public.kgn_order_events(order_id,status) values(oid,'confirmed');
 return jsonb_build_object('id',oid,'subtotal_paise',subtotal,'status','confirmed');
end $$;

create or replace function public.kgn_track_order(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders; events jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Order ID or secure key is incorrect'; end if;
 select * into o from public.kgn_orders where id=p_id and tracking_hash=sha256(convert_to(p_token,'UTF8'));
 if not found then raise exception 'Order ID or secure key is incorrect'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('status',status,'at',created_at) order by id),'[]') into events from public.kgn_order_events where order_id=o.id;
 return jsonb_build_object('id',o.id,'checkout_mode',o.checkout_mode,'delivery_payment',o.delivery_payment,'checkout_expires_at',o.checkout_expires_at,'payment_link_state',o.payment_link_state,'items',o.items,'subtotal_paise',o.subtotal_paise,'shipping_paise',o.shipping_paise,'status',o.status,'payment_method',o.payment_method,'payment_status',o.payment_status,'payment_url',case when o.status in('confirmed','packed') and o.payment_status='unpaid' and (o.checkout_mode<>'direct' or o.checkout_expires_at>now()) then o.payment_url else null end,'courier',o.courier,'awb',o.awb,'tracking_url',o.tracking_url,'created_at',o.created_at,'events',events);
end $$;

create or replace function public.kgn_claim_payment_link(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders;
begin
 select * into o from public.kgn_orders where id=p_id for update;
 if not found or o.status<>'confirmed' or o.payment_method<>'online' or o.shipping_paise is null or o.payment_status<>'unpaid' then raise exception 'A confirmed unpaid online order is required'; end if;
 if o.checkout_mode='direct' then raise exception 'Use the private customer checkout to open payment'; end if;
 if not exists(select 1 from public.kgn_commerce_settings where id=1 and online_enabled) then raise exception 'Online payments are not enabled'; end if;
 if o.payment_link_state='ready' then return jsonb_build_object('existing',true,'url',o.payment_url); end if;
 if o.payment_link_state<>'none' then raise exception 'Payment link creation is pending reconciliation. Check the gateway before retrying'; end if;
 update public.kgn_orders set payment_link_state='creating' where id=p_id;
 return jsonb_build_object('existing',false,'amount',o.subtotal_paise+o.shipping_paise,'reference',o.id);
end $$;

-- All purchase/payment mutation RPCs below are service-only. The Edge Function
-- validates guest inputs, and existing order access requires the private key.
create or replace function public.kgn_claim_checkout_payment(p_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Order ID or secure key is incorrect'; end if;
 select * into o from public.kgn_orders where id=p_id and tracking_hash=sha256(convert_to(p_token,'UTF8')) for update;
 if not found or o.checkout_mode<>'direct' then raise exception 'Order ID or secure key is incorrect'; end if;
 if o.payment_status='paid' then return jsonb_build_object('paid',true); end if;
 if o.status<>'confirmed' or o.checkout_expires_at<=now() then raise exception 'Checkout expired. Start a new checkout'; end if;
 if not exists(select 1 from public.kgn_commerce_settings where id=1 and orders_enabled and online_enabled and direct_checkout_enabled) then raise exception 'Online checkout is not available'; end if;
 if o.payment_method<>'online' or o.shipping_paise is distinct from 0 or o.delivery_payment<>'courier_collect' then raise exception 'Checkout amount needs store verification'; end if;
 if o.payment_link_state='ready' and o.payment_url is not null then return jsonb_build_object('existing',true,'url',o.payment_url,'amount',o.subtotal_paise); end if;
 if o.payment_link_state<>'none' then raise exception 'Payment setup needs store verification. Keep your Order ID'; end if;
 o.checkout_expires_at:=now()+interval '30 minutes';
 update public.kgn_orders set payment_link_state='creating',checkout_expires_at=o.checkout_expires_at,updated_at=now() where id=o.id;
 return jsonb_build_object('existing',false,'amount',o.subtotal_paise,'reference',o.id,'expire_by',floor(extract(epoch from o.checkout_expires_at))::bigint);
end $$;

create or replace function public.kgn_checkout_expiry_candidates()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with candidates as (
  select id from public.kgn_orders where checkout_mode='direct' and status='confirmed' and payment_status='unpaid'
  and checkout_expires_at<now()-interval '5 minutes' and payment_link_state in('none','ready')
  and (checkout_reconcile_after is null or checkout_reconcile_after<now())
  order by checkout_expires_at limit 5 for update skip locked
 ), leased as (
  update public.kgn_orders o set checkout_reconcile_after=now()+interval '2 minutes' from candidates c where o.id=c.id
  returning o.id,o.payment_link_id,o.payment_link_state,o.subtotal_paise+o.shipping_paise as amount
 ) select coalesce(jsonb_agg(to_jsonb(leased)),'[]'::jsonb) into result from leased;
 return result;
end $$;

create or replace function public.kgn_release_expired_checkout(p_id uuid,p_link text)
returns boolean language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders;
begin
 select * into o from public.kgn_orders where id=p_id for update;
 if not found or o.checkout_mode<>'direct' or o.payment_status<>'unpaid' or o.status<>'confirmed'
 or o.checkout_expires_at>=now()-interval '5 minutes' or o.payment_link_id is distinct from p_link
 or not ((p_link is null and o.payment_link_state='none') or (p_link is not null and o.payment_link_state='ready')) then return false; end if;
 update public.kgn_orders set status='cancelled',updated_at=now() where id=o.id;
 insert into public.kgn_order_events(order_id,status) values(o.id,'cancelled'),(o.id,'checkout_expired');
 return true;
end $$;

revoke all on function public.kgn_prepare_checkout(jsonb,jsonb,text,text,bigint),public.kgn_claim_checkout_payment(uuid,text),public.kgn_checkout_expiry_candidates(),public.kgn_release_expired_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.kgn_prepare_checkout(jsonb,jsonb,text,text,bigint),public.kgn_claim_checkout_payment(uuid,text),public.kgn_checkout_expiry_candidates(),public.kgn_release_expired_checkout(uuid,text) to service_role;
-- Existing private-order RLS, gateway verification and admin allowlist remain enforced.
notify pgrst,'reload schema';
commit;
