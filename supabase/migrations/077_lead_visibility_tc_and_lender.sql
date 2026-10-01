-- Who can see a client file (leads), matching who can see a deal.
--
-- Allison, 2026-10-01: "If you are a TC you can see every file. Otherwise
-- you see the files you're assigned to." Deals already work that way
-- (migration 019/023: sees_all_transactions OR the transaction_coordinator
-- role OR assigned). Client files were narrower: only sees_all_transactions
-- or the assigned agent. That left out two people:
--   * a transaction coordinator, who couldn't see every client file;
--   * the assigned lender (leads.lender_member_id), who couldn't see the
--     file they're assigned to.
--
-- This adds exactly those two. Everything else is as 023 left it: still
-- locked to her team, platform admin still sees all, and insert/update/
-- delete are unchanged. lead_visible() is the same rule for every lead_*
-- child table (appointments, homes, notes, documents, ...), so it changes too.

create or replace function lead_visible(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin() or exists (
    select 1 from leads l
     where l.id = p_lead_id
       and l.team_id = my_team_id()
       and (
         exists (select 1 from team_members m
                  where m.profile_id = auth.uid()
                    and (m.sees_all_transactions or 'transaction_coordinator' = any(m.roles)))
         or exists (select 1 from team_members m
                     where m.id in (l.realtor_member_id, l.lender_member_id)
                       and m.profile_id = auth.uid())
       )
  )
$$;

drop policy if exists lead_select on leads;
create policy lead_select on leads for select to authenticated
  using (
    is_platform_admin()
    or (
      team_id = my_team_id()
      and (
        exists (select 1 from team_members m
                 where m.profile_id = auth.uid()
                   and (m.sees_all_transactions or 'transaction_coordinator' = any(m.roles)))
        or exists (select 1 from team_members m
                    where m.id in (leads.realtor_member_id, leads.lender_member_id)
                      and m.profile_id = auth.uid())
      )
    )
  );
