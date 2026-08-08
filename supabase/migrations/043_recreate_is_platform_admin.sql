-- is_platform_admin() went missing somehow (probably an incomplete paste of
-- migration 023 originally) — every RLS policy that references it silently
-- works fine as long as it's never the deciding clause, but any function
-- that calls it directly (convert_lead_to_transaction, seed_transaction,
-- get_shared_lead) throws "function is_platform_admin() does not exist" the
-- moment it runs. Recreating this is safe to run even if parts of 023 did
-- already succeed — every statement here is idempotent.
alter table profiles add column if not exists is_platform_admin boolean not null default false;

update profiles set is_platform_admin = true
 where email = 'allisonsellsflorida@gmail.com';

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false)
$$;
