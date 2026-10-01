-- Restore the platform-admin bypass on who can see a deal.
--
-- 2026-10-01: Allison (is_platform_admin = true) saw 0 deals while seeing
-- every client file. Her live database still had migration 019's version of
-- transactions.team_select, without 023's `is_platform_admin() or ...`
-- (043 records that 023 was only partly pasted in originally). Her deal
-- access had silently depended on a Settings › Team entry with "sees every
-- transaction"; when that roster entry was removed during duplicate cleanup,
-- every deal disappeared from her list. Nothing was deleted.
--
-- This is exactly 023's policy. Same rule as before for everyone else.

drop policy if exists team_select on transactions;
create policy team_select on transactions for select to authenticated
  using (
    is_platform_admin()
    or (
      team_id = my_team_id()
      and (
        exists (select 1 from team_members m
                 where m.profile_id = auth.uid()
                   and (m.sees_all_transactions or 'transaction_coordinator' = any(m.roles)))
        or exists (select 1 from transaction_assignees a
                   join team_members m on m.id = a.team_member_id
                   where a.transaction_id = transactions.id and m.profile_id = auth.uid())
      )
    )
  );
