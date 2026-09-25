-- K.G.N. Fashion Zone V11. Run once in Supabase > SQL Editor as project owner.
-- IMPORTANT: Never run this using a browser publishable key.
create schema if not exists private;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null default '' check (char_length(sku) <= 40),
  category text not null check (category in ('ladies','gents','kids')),
  name_hi text not null check (char_length(name_hi) between 1 and 100),
  name_en text not null check (char_length(name_en) between 1 and 100),
  name_ur text not null check (char_length(name_ur) between 1 and 100),
  desc_hi text not null default '' check (char_length(desc_hi) <= 300),
  desc_en text not null default '' check (char_length(desc_en) <= 300),
  desc_ur text not null default '' check (char_length(desc_ur) <= 300),
  image_path text not null default '' check (
    image_path = '' or image_path ~ '^products/[0-9a-f-]{36}\.jpg$'
  ),
  rate numeric(10,2) check (rate is null or rate >= 0),
  sale_rate numeric(10,2) check (sale_rate is null or sale_rate >= 0),
  moq integer check (moq is null or moq between 1 and 100000),
  unit text not null default 'piece' check (unit in ('piece','set','dozen')),
  stock_qty integer check (stock_qty is null or stock_qty between 0 and 10000000),
  is_new boolean not null default false,
  is_featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_sale check (sale_rate is null or (rate is not null and sale_rate < rate)),
  constraint real_photo_for_published check (not published or image_path <> '')
);
create index if not exists idx_kgn_products_published_updated on public.products (published,updated_at desc);
create index if not exists idx_kgn_products_category on public.products (category);

create table if not exists public.store_settings (
  id integer primary key check (id = 1),
  festive_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id, festive_enabled) values (1,true) on conflict (id) do nothing;

-- Private, fixed-search-path security definer: only SQL Editor can grant administrator status.
create or replace function private.is_kgn_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_kgn_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_kgn_admin() to authenticated;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.store_settings enable row level security;

-- Explicit least-privilege table grants; no browser may grant itself admin membership.
revoke all on public.admin_users from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.store_settings from anon, authenticated;
grant select on public.admin_users to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.store_settings to anon, authenticated;
grant insert, update on public.store_settings to authenticated;

-- Read own membership only. No user-facing INSERT/UPDATE/DELETE policies exist.
create policy "kgn_admin_self_read" on public.admin_users
for select to authenticated using (user_id = (select auth.uid()));

-- Published products are public. Drafts are visible only to allowlisted admins.
create policy "kgn_product_public_read" on public.products
for select to anon, authenticated using (published = true);
create policy "kgn_product_admin_read" on public.products
for select to authenticated using ((select private.is_kgn_admin()));
create policy "kgn_product_admin_insert" on public.products
for insert to authenticated with check ((select private.is_kgn_admin()));
create policy "kgn_product_admin_update" on public.products
for update to authenticated using ((select private.is_kgn_admin()))
with check ((select private.is_kgn_admin()));
create policy "kgn_product_admin_delete" on public.products
for delete to authenticated using ((select private.is_kgn_admin()));

create policy "kgn_settings_public_read" on public.store_settings
for select to anon, authenticated using (true);
create policy "kgn_settings_admin_insert" on public.store_settings
for insert to authenticated with check ((select private.is_kgn_admin()) and id = 1);
create policy "kgn_settings_admin_update" on public.store_settings
for update to authenticated using ((select private.is_kgn_admin()))
with check ((select private.is_kgn_admin()) and id = 1);

-- Photos are intended for public display. Uploads remain admin-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "kgn_photo_admin_upload" on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-photos' and (select private.is_kgn_admin())
  and name ~ '^products/[0-9a-f-]{36}\.jpg$'
);
create policy "kgn_photo_admin_list" on storage.objects
for select to authenticated using (
  bucket_id = 'product-photos' and (select private.is_kgn_admin())
);
create policy "kgn_photo_admin_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'product-photos' and (select private.is_kgn_admin())
);
-- Do not create a public upload, database write, or admin role grant policy.
