begin;
-- Leave off until a real SMS provider and mobile-device OTP test are complete.
alter table public.kgn_commerce_settings add column phone_verification_required boolean not null default false;
alter table public.kgn_orders add column phone_verified_at timestamptz;
alter table public.kgn_orders add column phone_user_id uuid references auth.users(id) on delete set null;
create index kgn_orders_phone_user on public.kgn_orders(phone_user_id) where phone_user_id is not null;
create or replace function public.kgn_prepare_phone_checkout(p_buyer jsonb,p_lines jsonb,p_token text,p_policy text,p_expected_subtotal bigint,p_phone_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare phone_verified timestamptz; cfg public.kgn_commerce_settings; oid uuid; prior public.kgn_orders; l jsonb;p public.products;ss text;pack int;pcs int;bundles int;qty int;r numeric;subtotal bigint:=0;snapshot jsonb:='[]';ph text;line_count int; reserved bigint; p_payment text:='online';
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
 if cfg.phone_verification_required and p_phone_user is null then raise exception 'Verify your mobile OTP before payment'; end if;
 if p_phone_user is not null then
  select phone_confirmed_at into phone_verified from auth.users where id=p_phone_user and phone='91'||ph and phone_confirmed_at is not null;
  if phone_verified is null then raise exception 'Mobile verification is invalid for this number'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(ph,34));
 select * into prior from public.kgn_orders where tracking_hash=sha256(convert_to(p_token,'UTF8')) limit 1;
 if found then
  if prior.phone<>ph then raise exception 'Mobile verification does not match this checkout'; end if;
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
 insert into public.kgn_orders(phone_verified_at,phone_user_id,shipping_paise,status,checkout_mode,delivery_payment,checkout_expires_at,tracking_hash,buyer_name,phone,address,city,pincode,items,subtotal_paise,payment_method,policy_version)
 values(phone_verified,p_phone_user,0,'confirmed','direct','courier_collect',now()+interval '30 minutes',sha256(convert_to(p_token,'UTF8')),trim(p_buyer->>'name'),ph,trim(p_buyer->>'address'),trim(p_buyer->>'city'),p_buyer->>'pincode',snapshot,subtotal,p_payment,p_policy) returning id into oid;
 insert into public.kgn_order_events(order_id,status) values(oid,'confirmed');
 return jsonb_build_object('id',oid,'subtotal_paise',subtotal,'status','confirmed');
end $$;

-- Retain the old signature for currently deployed clients, but never allow it
-- to bypass OTP after the feature is enabled.
create or replace function public.kgn_prepare_checkout(p_buyer jsonb,p_lines jsonb,p_token text,p_policy text,p_expected_subtotal bigint)
returns jsonb language sql security definer set search_path='' as $$
 select public.kgn_prepare_phone_checkout(p_buyer,p_lines,p_token,p_policy,p_expected_subtotal,null);
$$;
revoke all on function public.kgn_prepare_phone_checkout(jsonb,jsonb,text,text,bigint,uuid),public.kgn_prepare_checkout(jsonb,jsonb,text,text,bigint) from public,anon,authenticated;
grant execute on function public.kgn_prepare_phone_checkout(jsonb,jsonb,text,text,bigint,uuid),public.kgn_prepare_checkout(jsonb,jsonb,text,text,bigint) to service_role;
-- Legacy/COD callers must also authenticate their matching phone when enabled.
create or replace function public.kgn_place_order(p_buyer jsonb,p_lines jsonb,p_payment text,p_token text,p_policy text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare phone_verified timestamptz; phone_user uuid; cfg public.kgn_commerce_settings; oid uuid; prior public.kgn_orders; l jsonb;p public.products;ss text;pack int;pcs int;bundles int;qty int;r numeric;subtotal bigint:=0;snapshot jsonb:='[]';ph text;line_count int;
begin
 select * into cfg from public.kgn_commerce_settings where id=1;
 if not coalesce(cfg.orders_enabled,false) then raise exception 'Online ordering is not available yet'; end if;
 if p_policy is distinct from cfg.policy_version then raise exception 'Please review the current order privacy notice'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid secure order key'; end if;
 if (p_payment='online' and not cfg.online_enabled) or (p_payment='cod' and not cfg.cod_enabled) or p_payment not in ('online','cod') then raise exception 'Payment method unavailable'; end if;
 ph:=trim(p_buyer->>'phone');
 if ph is null or ph !~ '^[6-9][0-9]{9}$' or length(trim(p_buyer->>'name')) not between 2 and 100 or length(trim(p_buyer->>'address')) not between 10 and 500 or length(trim(p_buyer->>'city')) not between 2 and 100 or (p_buyer->>'pincode') !~ '^[1-9][0-9]{5}$' then raise exception 'Check contact and delivery address'; end if;
 if cfg.phone_verification_required then
  phone_user:=auth.uid();
  select phone_confirmed_at into phone_verified from auth.users where id=phone_user and phone='91'||ph and phone_confirmed_at is not null;
  if phone_verified is null then raise exception 'Verify your mobile OTP before payment'; end if;
 end if;
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
 insert into public.kgn_orders(tracking_hash,buyer_name,phone,address,city,pincode,items,subtotal_paise,payment_method,policy_version,phone_verified_at,phone_user_id)
 values(sha256(convert_to(p_token,'UTF8')),trim(p_buyer->>'name'),ph,trim(p_buyer->>'address'),trim(p_buyer->>'city'),p_buyer->>'pincode',snapshot,subtotal,p_payment,p_policy,phone_verified,phone_user) returning id into oid;
 insert into public.kgn_order_events(order_id,status) values(oid,'requested');
 return jsonb_build_object('id',oid,'subtotal_paise',subtotal,'status','requested');
end $$;

notify pgrst,'reload schema';
commit;
