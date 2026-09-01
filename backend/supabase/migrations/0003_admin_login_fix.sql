-- =====================================================================
-- Phase 2 auth fix
-- Run this AFTER creating the admin@ledgerly.com user in Supabase Auth
-- (Studio -> Authentication -> Users -> Add user, or the Admin API).
-- Safe to re-run.
-- =====================================================================

-- Backfill: if a Supabase Auth user exists without a matching
-- `profiles` row (e.g. created before migration 0001's trigger existed,
-- or the trigger didn't fire for some other reason), create it now so
-- `/api/auth/me` has something to find.
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Promote the designated admin test account. customer_id stays NULL —
-- admins are not linked to a customer record.
update public.profiles
set role = 'admin', customer_id = null
where email = 'admin@ledgerly.com';
