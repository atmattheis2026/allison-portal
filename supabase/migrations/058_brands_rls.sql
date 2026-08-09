-- brands had RLS turned on since day one (migration 001) but never got a
-- policy — meaning no authenticated user could read or write it directly at
-- all. The client-facing pages never noticed because they read brand info
-- through get_shared_transaction()/get_shared_lead(), both security definer
-- functions that bypass RLS entirely. The Branding settings page, which
-- reads/writes the table directly, was silently blocked the whole time.
create policy team_rw on brands for all to authenticated
  using (team_id = my_team_id())
  with check (team_id = my_team_id());
