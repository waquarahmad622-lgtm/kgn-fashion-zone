begin;
-- Expand first. Activate only after the compatible customer/admin release is live.
alter table public.kgn_commerce_settings add column retailer_access_required boolean not null default false;
alter table public.products add column public_image_paths text[] not null default '{}'
  check(cardinality(public_image_paths)<=4);
grant select(public_image_paths),update(public_image_paths) on public.products to authenticated;
create table public.kgn_retailers(
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null unique check(phone ~ '^[6-9][0-9]{9}$'),
 shop_name text not null check(length(shop_name) between 2 and 100),
 contact_name text not null check(length(contact_name) between 2 and 100),
 address text not null check(length(address) between 10 and 500),
 city text not null check(length(city) between 2 and 100),
 gst text not null default '' check(length(gst) in (0,15)),
 proof_path text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','blocked')),
 review_note text not null default '' check(length(review_note)<=500),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.kgn_retailers enable row level security;
revoke all on public.kgn_retailers from anon,authenticated;
grant select on public.kgn_retailers to authenticated;
grant update(status,review_note,reviewed_by,reviewed_at) on public.kgn_retailers to authenticated;
grant all on public.kgn_retailers to service_role;
create policy retailer_self_read on public.kgn_retailers for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_kgn_admin()));
create policy retailer_owner_review on public.kgn_retailers for update to authenticated
 using((select private.is_kgn_admin())) with check((select private.is_kgn_admin()));
create index kgn_retailer_review_queue on public.kgn_retailers(status,created_at desc);

create or replace function private.kgn_retailer_allowed() returns boolean
 language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_kgn_admin() or exists(
  select 1 from public.kgn_retailers where user_id=auth.uid() and status='approved'));
$$;
revoke all on function private.kgn_retailer_allowed() from public,anon;
grant execute on function private.kgn_retailer_allowed() to authenticated;
create or replace function private.kgn_catalog_access() returns boolean
 language sql stable security definer set search_path='' as $$
 select not coalesce((select retailer_access_required from public.kgn_commerce_settings where id=1),true)
   or private.kgn_retailer_allowed();
$$;
revoke all on function private.kgn_catalog_access() from public;
grant execute on function private.kgn_catalog_access() to anon,authenticated;
-- A restrictive policy also covers any previously installed permissive read policy.
create policy kgn_price_access_boundary on public.products as restrictive for select to anon,authenticated
 using((select private.kgn_catalog_access()));
create policy kgn_approved_catalog_read on public.products for select to authenticated
 using(published and (select private.kgn_retailer_allowed()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('public-catalogue','public-catalogue',true,4194304,array['image/jpeg','image/png','image/webp']),
 ('retailer-documents','retailer-documents',false,2097152,array['image/jpeg'])
 on conflict(id) do nothing;
create policy public_catalogue_owner_upload on storage.objects for insert to authenticated
 with check(bucket_id='public-catalogue' and (select private.is_kgn_admin()) and name ~ '^products/[0-9a-f-]{36}\.(jpg|png|webp)$');
create policy public_catalogue_owner_manage on storage.objects for select to authenticated
 using(bucket_id='public-catalogue' and (select private.is_kgn_admin()));
create policy public_catalogue_owner_delete on storage.objects for delete to authenticated
 using(bucket_id='public-catalogue' and (select private.is_kgn_admin()));
create policy retailer_document_read on storage.objects for select to authenticated
 using(bucket_id='retailer-documents' and ((select private.is_kgn_admin()) or split_part(name,'/',1)=(select auth.uid())::text));
create policy approved_original_photos on storage.objects for select to authenticated
 using(bucket_id='product-photos' and (select private.kgn_retailer_allowed())
 and exists(select 1 from public.products p where p.published and (name=p.image_path or name=any(p.image_paths))));

create table private.kgn_registration_limits(key text primary key,started_at timestamptz not null,hits int not null);
alter table private.kgn_registration_limits enable row level security;
revoke all on private.kgn_registration_limits from public,anon,authenticated;
grant select,insert,update,delete on private.kgn_registration_limits to service_role;
create or replace function public.kgn_registration_limit(p_key text,p_limit int) returns boolean
 language plpgsql security invoker set search_path='' as $$
 declare n int;
 begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 100 then raise exception 'Invalid limit'; end if;
  delete from private.kgn_registration_limits where started_at<now()-interval '2 days';
  insert into private.kgn_registration_limits as t values(p_key,now(),1)
  on conflict(key) do update set hits=case when t.started_at<now()-interval '1 hour' then 1 else t.hits+1 end,
   started_at=case when t.started_at<now()-interval '1 hour' then now() else t.started_at end returning hits into n;
  return n<=p_limit;
 end;
$$;
revoke all on function public.kgn_registration_limit(text,int) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.kgn_registration_limit(text,int) to service_role;

alter table public.kgn_orders add column retailer_user_id uuid references auth.users(id) on delete set null;
create index kgn_orders_retailer on public.kgn_orders(retailer_user_id) where retailer_user_id is not null;
create or replace function public.kgn_prepare_retailer_checkout(p_buyer jsonb,p_lines jsonb,p_token text,p_policy text,p_expected_subtotal bigint,p_phone_user uuid,p_retailer uuid) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare result jsonb; prior uuid;
 begin
  if p_retailer is null or not exists(select 1 from public.kgn_retailers where user_id=p_retailer and status='approved') then
   raise exception 'Retailer approval required';
  end if;
  select retailer_user_id into prior from public.kgn_orders where tracking_hash=sha256(convert_to(p_token,'UTF8'));
  if found and prior is distinct from p_retailer then raise exception 'Checkout belongs to another account'; end if;
  result:=public.kgn_prepare_phone_checkout(p_buyer,p_lines,p_token,p_policy,p_expected_subtotal,p_phone_user);
  update public.kgn_orders set retailer_user_id=p_retailer where id=(result->>'id')::uuid;
  return result;
 end;
$$;
revoke all on function public.kgn_prepare_retailer_checkout(jsonb,jsonb,text,text,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kgn_prepare_retailer_checkout(jsonb,jsonb,text,text,bigint,uuid,uuid) to service_role;
-- Keep the original order implementation intact; add the account check at its entry.
do $$ declare source text; begin
 select pg_get_functiondef('public.kgn_place_order(jsonb,jsonb,text,text,text)'::regprocedure) into source;
 source:=replace(source,E'begin\n',E'begin\n if not private.kgn_catalog_access() then raise exception ''Retailer approval required''; end if;\n');
 execute source;
end $$;
commit;
