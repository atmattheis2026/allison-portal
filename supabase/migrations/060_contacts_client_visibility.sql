-- Gap: contacts' team_rw policy only checked team_id, not whether the
-- signed-in person is actually attached to that transaction (assigned, on
-- the sees-all list, or a transaction coordinator) — the same rule
-- transactions.team_select already enforces on the transaction itself.
-- That meant any team member could read a Buyers/Sellers contact's name,
-- phone, and email for a deal they have nothing to do with, just by
-- querying contacts directly (which the Rolodex page does).
--
-- Professional/vendor contacts (agents, lenders, title, utilities, etc.)
-- are meant to stay visible to the whole team regardless of assignment —
-- useful to reference no matter who's on the deal — so this splits the one
-- policy into two: a client-only one gated by transaction_visible(), and an
-- unchanged team-wide one for everything else.

create or replace function transaction_visible(p_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin() or is_database_manager() or exists (
    select 1 from transactions x
     where x.id = p_transaction_id
       and x.team_id = my_team_id()
       and (
         exists (
           select 1 from team_members m
            where m.profile_id = auth.uid()
              and (m.sees_all_transactions or 'transaction_coordinator' = any(m.roles))
         )
         or exists (
           select 1 from transaction_assignees a
           join team_members m on m.id = a.team_member_id
           where a.transaction_id = p_transaction_id and m.profile_id = auth.uid()
         )
       )
  )
$$;

drop policy if exists team_rw on contacts;

create policy team_rw_professional on contacts for all to authenticated
  using (
    role_label not in ('Buyers', 'Sellers')
    and exists (select 1 from transactions x
                 where x.id = contacts.transaction_id
                   and (x.team_id = my_team_id() or is_platform_admin()))
  )
  with check (
    role_label not in ('Buyers', 'Sellers')
    and exists (select 1 from transactions x
                 where x.id = contacts.transaction_id
                   and (x.team_id = my_team_id() or is_platform_admin()))
  );

create policy team_rw_client on contacts for all to authenticated
  using (role_label in ('Buyers', 'Sellers') and transaction_visible(contacts.transaction_id))
  with check (role_label in ('Buyers', 'Sellers') and transaction_visible(contacts.transaction_id));
