-- AFTER creating the owner user in Supabase > Authentication > Users.
-- Replace the quoted email below with the exact email of YOUR admin account.
-- Run this SQL only in the Supabase SQL Editor as project owner.
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('REPLACE_WITH_YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do nothing;

-- Confirm that exactly your intended owner appears here:
select u.id, u.email, a.created_at
from public.admin_users a join auth.users u on u.id = a.user_id;
