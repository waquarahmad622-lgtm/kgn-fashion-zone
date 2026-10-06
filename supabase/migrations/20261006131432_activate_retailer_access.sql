-- Apply after v41 customer/admin assets and reviewed public photos are deployed.
begin;
create policy registration_limits_service_only on private.kgn_registration_limits
 for all to service_role using(true) with check(true);
update public.kgn_commerce_settings set retailer_access_required=true where id=1;
update storage.buckets set public=false where id='product-photos';
commit;
