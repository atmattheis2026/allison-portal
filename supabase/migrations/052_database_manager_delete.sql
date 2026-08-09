-- Deleting a transaction or active-buyer file outright is new — until now
-- there was no UI for it at all. Restricting it to the Database Manager
-- role (not just anyone on the team) since it's the one truly irreversible
-- action in the app; everything else so far only archives or reassigns.
create or replace function is_database_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members m
     where m.profile_id = auth.uid() and 'admin' = any(m.roles)
  )
$$;

drop policy if exists team_delete on transactions;
create policy team_delete on transactions for delete to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and is_database_manager()));

drop policy if exists lead_delete on leads;
create policy lead_delete on leads for delete to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and is_database_manager()));
