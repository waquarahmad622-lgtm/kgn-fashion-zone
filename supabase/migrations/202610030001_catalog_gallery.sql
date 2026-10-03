begin;
alter table public.products add column if not exists image_paths text[] not null default '{}';
alter table public.products add column if not exists size_original_rates jsonb not null default '{}'::jsonb;
-- Existing cover images and size selling prices remain valid.
update public.products set image_paths=array[image_path] where cardinality(image_paths)=0 and image_path ~ '^products/[0-9a-f-]{36}\.jpg$';
create or replace function public.kgn_validate_catalog_v34() returns trigger language plpgsql set search_path='' as $$
declare path text; k text; v jsonb; selling numeric;
begin
 if cardinality(new.image_paths)>4 then raise exception 'Maximum 4 catalogue photos'; end if;
 foreach path in array new.image_paths loop
  if path is null or path !~ '^products/[0-9a-f-]{36}\.jpg$' then raise exception 'Invalid catalogue image path'; end if;
 end loop;
 if cardinality(new.image_paths)<>(select count(distinct x) from unnest(new.image_paths) x) then raise exception 'Duplicate catalogue photo'; end if;
 if cardinality(new.image_paths)>0 then new.image_path:=new.image_paths[1]; end if;
 if jsonb_typeof(new.size_original_rates)<>'object' then raise exception 'Invalid original prices'; end if;
 for k,v in select * from jsonb_each(new.size_original_rates) loop
  if jsonb_typeof(v)<>'number' or not (new.size_rates ? k) or not (k=any(new.size_options)) then raise exception 'Original price requires an available size and selling price'; end if;
  selling:=(new.size_rates->>k)::numeric;
  if selling<=0 or (v::text)::numeric<selling or (v::text)::numeric>99999999 or round((v::text)::numeric,2)<>(v::text)::numeric then raise exception 'Original price must be at least selling price, with up to 2 decimals'; end if;
 end loop;
 return new;
end $$;
drop trigger if exists kgn_validate_catalog_v34 on public.products;
create trigger kgn_validate_catalog_v34 before insert or update of image_paths,size_original_rates,size_rates,size_options on public.products for each row execute function public.kgn_validate_catalog_v34();
revoke all on function public.kgn_validate_catalog_v34() from public,anon,authenticated;
-- Product writes still pass through the existing owner/staff RLS policies.
grant select(image_paths,size_original_rates) on public.products to anon,authenticated;
grant insert(image_paths,size_original_rates),update(image_paths,size_original_rates) on public.products to authenticated;
notify pgrst,'reload schema';
commit;
