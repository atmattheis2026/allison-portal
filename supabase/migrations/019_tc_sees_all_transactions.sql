-- Transaction coordinators help across the whole book, not just deals
-- they're personally assigned to — so anyone with 'transaction_coordinator'
-- in team_members.roles should see every transaction automatically, the same
-- as the manual sees_all_transactions switch does. This is additive: it
-- doesn't touch sees_all_transactions itself, so an office manager who is
-- also a TC still just sees everything, and a TC who somehow shouldn't see
-- everything can't be carved out by this rule alone (there's no per-person
-- exception mechanism here — if that's ever needed, it'll need its own flag).

drop policy if exists team_select on transactions;

create policy team_select on transactions for select to authenticated
  using (
    team_id = my_team_id()
    and (
      exists (
        select 1 from team_members m
         where m.profile_id = auth.uid()
           and (m.sees_all_transactions or 'transaction_coordinator' = any(m.roles))
      )
      or exists (
        select 1 from transaction_assignees a
        join team_members m on m.id = a.team_member_id
        where a.transaction_id = transactions.id and m.profile_id = auth.uid()
      )
    )
  );
