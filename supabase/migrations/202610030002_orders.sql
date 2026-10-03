begin;
create table if not exists public.kgn_commerce_settings (
 id integer primary key check(id=1), orders_enabled boolean not null default false,
 online_enabled boolean not null default false,cod_enabled boolean not null default false,
 policy_version text not null default 'orders-v1-20261003'
);
insert into public.kgn_commerce_settings(id) values(1) on conflict do nothing;
create table if not exists public.kgn_orders (
 id uuid primary key default gen_random_uuid(), tracking_hash bytea not null unique,
 buyer_name text not null check(length(buyer_name) between 2 and 100), phone text not null check(phone ~ '^[6-9][0-9]{9}$'),
 address text not null check(length(address) between 10 and 500),city text not null check(length(city) between 2 and 100),pincode text not null check(pincode ~ '^[1-9][0-9]{5}$'),
 items jsonb not null,subtotal_paise bigint not null check(subtotal_paise>0),shipping_paise bigint check(shipping_paise between 0 and 10000000),
 status text not null default 'requested' check(status in ('requested','confirmed','packed','shipped','out_for_delivery','delivered','cancelled')),
 payment_method text not null check(payment_method in ('online','cod')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid')),
 payment_link_id text unique,payment_url text,payment_reference text,
 courier text not null default '',awb text not null default '',tracking_url text not null default '',
 policy_version text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists kgn_orders_phone_created on public.kgn_orders(phone,created_at);
create index if not exists kgn_orders_status on public.kgn_orders(status);
create table if not exists public.kgn_order_events (
 id bigint generated always as identity primary key,order_id uuid not null references public.kgn_orders(id) on delete cascade,
 status text not null,created_at timestamptz not null default now()
);
alter table public.kgn_commerce_settings enable row level security;
alter table public.kgn_orders enable row level security;
alter table public.kgn_order_events enable row level security;
create policy kgn_settings_read on public.kgn_commerce_settings for select to anon,authenticated using(true);
create policy kgn_settings_admin on public.kgn_commerce_settings for update to authenticated using(exists(select 1 from public.admin_users where user_id=auth.uid())) with check(exists(select 1 from public.admin_users where user_id=auth.uid()));
create policy kgn_orders_admin_read on public.kgn_orders for select to authenticated using(exists(select 1 from public.admin_users where user_id=auth.uid()));
create policy kgn_events_admin_read on public.kgn_order_events for select to authenticated using(exists(select 1 from public.admin_users where user_id=auth.uid()));
revoke all on public.kgn_orders,public.kgn_order_events,public.kgn_commerce_settings from anon,authenticated;
grant select on public.kgn_commerce_settings to anon,authenticated;
grant update(orders_enabled,online_enabled,cod_enabled) on public.kgn_commerce_settings to authenticated;
grant select on public.kgn_orders,public.kgn_order_events to authenticated;
grant all on public.kgn_orders,public.kgn_order_events,public.kgn_commerce_settings to service_role;
grant usage,select on sequence public.kgn_order_events_id_seq to service_role;

create or replace function public.kgn_place_order(p_buyer jsonb,p_lines jsonb,p_payment text,p_token text,p_policy text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.kgn_commerce_settings; oid uuid; prior public.kgn_orders; l jsonb;p public.products;ss text;pack int;pcs int;bundles int;qty int;r numeric;subtotal bigint:=0;snapshot jsonb:='[]';ph text;line_count int;
begin
 select * into cfg from public.kgn_commerce_settings where id=1;
 if not coalesce(cfg.orders_enabled,false) then raise exception 'Online ordering is not available yet'; end if;
 if p_policy is distinct from cfg.policy_version then raise exception 'Please review the current order privacy notice'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid secure order key'; end if;
 if (p_payment='online' and not cfg.online_enabled) or (p_payment='cod' and not cfg.cod_enabled) or p_payment not in ('online','cod') then raise exception 'Payment method unavailable'; end if;
 ph:=trim(p_buyer->>'phone');
 if ph is null or ph !~ '^[6-9][0-9]{9}$' or length(trim(p_buyer->>'name')) not between 2 and 100 or length(trim(p_buyer->>'address')) not between 10 and 500 or length(trim(p_buyer->>'city')) not between 2 and 100 or (p_buyer->>'pincode') !~ '^[1-9][0-9]{5}$' then raise exception 'Check contact and delivery address'; end if;
 perform pg_advisory_xact_lock(hashtextextended(ph,34));
 select * into prior from public.kgn_orders where tracking_hash=sha256(convert_to(p_token,'UTF8')) limit 1;
 if found then return jsonb_build_object('id',prior.id,'subtotal_paise',prior.subtotal_paise,'status',prior.status); end if;
 if (select count(*) from public.kgn_orders where phone=ph and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many requests. Please contact the store'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Choose 1 to 30 items'; end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct (x->>'id',x->>'size',x->>'pack',x->>'pieces')) from jsonb_array_elements(p_lines)x) then raise exception 'Combine duplicate items'; end if;
 for l in select value from jsonb_array_elements(p_lines) order by value->>'id',value->>'size' loop
  select * into p from public.products where id=(l->>'id')::uuid and published=true for share;
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
  if p.stock_qty is not null and p.stock_qty<(l->>'qty')::int then raise exception 'Combined quantity exceeds stock'; end if;
 end loop;
 insert into public.kgn_orders(tracking_hash,buyer_name,phone,address,city,pincode,items,subtotal_paise,payment_method,policy_version)
 values(sha256(convert_to(p_token,'UTF8')),trim(p_buyer->>'name'),ph,trim(p_buyer->>'address'),trim(p_buyer->>'city'),p_buyer->>'pincode',snapshot,subtotal,p_payment,p_policy) returning id into oid;
 insert into public.kgn_order_events(order_id,status) values(oid,'requested');
 return jsonb_build_object('id',oid,'subtotal_paise',subtotal,'status','requested');
end $$;

create or replace function public.kgn_track_order(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders; events jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Order ID or secure key is incorrect'; end if;
 select * into o from public.kgn_orders where id=p_id and tracking_hash=sha256(convert_to(p_token,'UTF8'));
 if not found then raise exception 'Order ID or secure key is incorrect'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('status',status,'at',created_at) order by id),'[]') into events from public.kgn_order_events where order_id=o.id;
 return jsonb_build_object('id',o.id,'items',o.items,'subtotal_paise',o.subtotal_paise,'shipping_paise',o.shipping_paise,'status',o.status,'payment_method',o.payment_method,'payment_status',o.payment_status,'payment_url',case when o.status in('confirmed','packed') and o.payment_status='unpaid' then o.payment_url else null end,'courier',o.courier,'awb',o.awb,'tracking_url',o.tracking_url,'created_at',o.created_at,'events',events);
end $$;

create or replace function public.kgn_manage_order(p_id uuid,p_status text,p_shipping_paise bigint,p_courier text default '',p_awb text default '',p_tracking_url text default '') returns void language plpgsql security definer set search_path='' as $$
declare o public.kgn_orders; l record;p public.products;reserved bigint;path text[]:=array['requested','confirmed','packed','shipped','out_for_delivery','delivered'];
begin
 if not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Admin access required'; end if;
 select * into o from public.kgn_orders where id=p_id for update;if not found then raise exception 'Order not found'; end if;
 if p_status=o.status and p_courier=o.courier and p_awb=o.awb and p_tracking_url=o.tracking_url and p_shipping_paise is not distinct from o.shipping_paise then return; end if;
 if o.status in('cancelled','delivered') then raise exception 'Order is closed'; end if;
 if p_status='cancelled' then
  if o.payment_status='paid' or o.payment_link_id is not null or o.status in('shipped','out_for_delivery') then raise exception 'Cancel the gateway payment link or handle paid/shipped returns with the store before cancelling'; end if;
 elsif array_position(path,p_status) is null or array_position(path,p_status)<>array_position(path,o.status)+1 then raise exception 'Move to the next order stage'; end if;
 if p_status='confirmed' then
  if p_shipping_paise is null or p_shipping_paise not between 0 and 10000000 then raise exception 'Set final shipping charge'; end if;
  -- Product locks serialize confirmation and stock reservations.
  for l in select (x->>'id')::uuid as product_id,sum((x->>'quantity')::int)::int as qty from jsonb_array_elements(o.items)x group by x->>'id' order by x->>'id' loop
   select * into p from public.products where id=l.product_id for update;
   if not found or not p.published or p.stock_qty is null then raise exception 'Verify product availability and opening stock before confirming'; end if;
   select coalesce(sum((x->>'quantity')::int),0) into reserved from public.kgn_orders z cross join lateral jsonb_array_elements(z.items)x where z.status in('confirmed','packed') and z.id<>o.id and x->>'id'=l.product_id::text;
   if p.stock_qty-reserved<l.qty then raise exception 'Not enough unreserved stock'; end if;
  end loop;
 end if;
 if p_status in('packed','shipped','out_for_delivery','delivered') and o.payment_method='online' and o.payment_status<>'paid' then raise exception 'Verified payment is required first'; end if;
 if p_status='shipped' then
  if length(trim(p_courier)) not between 2 and 80 or length(trim(p_awb)) not between 2 and 100 then raise exception 'Enter courier and tracking number'; end if;
  if p_tracking_url<>'' and (p_tracking_url !~ '^https://[A-Za-z0-9.-]+(:443)?(/[^[:space:]]*)?$' or length(p_tracking_url)>500) then raise exception 'Use a valid HTTPS courier tracking URL'; end if;
  for l in select (x->>'id')::uuid as product_id,sum((x->>'quantity')::int)::int as qty from jsonb_array_elements(o.items)x group by x->>'id' order by x->>'id' loop
   perform public.kgn_stock_action(l.product_id,'sale',l.qty,'Order dispatch '||o.id::text);
  end loop;
 end if;
 update public.kgn_orders set status=p_status,shipping_paise=case when p_status='confirmed' then p_shipping_paise else shipping_paise end,courier=case when p_status='shipped' then trim(p_courier) else courier end,awb=case when p_status='shipped' then trim(p_awb) else awb end,tracking_url=case when p_status='shipped' then p_tracking_url else tracking_url end,updated_at=now() where id=o.id;
 insert into public.kgn_order_events(order_id,status) values(o.id,p_status);
end $$;
revoke all on function public.kgn_place_order(jsonb,jsonb,text,text,text),public.kgn_track_order(uuid,text),public.kgn_manage_order(uuid,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.kgn_place_order(jsonb,jsonb,text,text,text),public.kgn_track_order(uuid,text) to anon,authenticated;
grant execute on function public.kgn_manage_order(uuid,text,bigint,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
