-- Per-person transaction visibility.
--
-- Design notes for whoever reads this next (including Allison's Claude):
--  * team_members.sees_all_transactions is the office-manager switch — Allison
--    flips it per person in Settings > Team. Everyone else only sees deals
--    they're explicitly assigned to.
--  * transaction_assignees is a plain join table: one row per (transaction,
--    team member) pairing. Assignment happens on the transaction's own page.
--  * This does NOT touch get_shared_transaction() or anon access at all — it
--    only changes what a *signed-in teammate* can query. The client link is
--    unaffected either way.

alter table team_members
  add column sees_all_transactions boolean not null default false;

create table transaction_assignees (
  transaction_id uuid not null references transactions(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  primary key (transaction_id, team_member_id)
);
create index on transaction_assignees (team_member_id);

alter table transaction_assignees enable row level security;

-- transaction_assignees needs to know its transaction's team WITHOUT going
-- through transactions' own RLS. If it queried transactions directly, and
-- transactions' own SELECT policy (below) queries transaction_assignees back,
-- Postgres re-evaluates both policies forever ("infinite recursion detected
-- in policy"). This small security-definer function breaks that cycle, same
-- trick my_team_id() already uses for profiles.
create or replace function transaction_team_id(p_transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from transactions where id = p_transaction_id
$$;

create policy team_rw on transaction_assignees for all to authenticated
  using (transaction_team_id(transaction_assignees.transaction_id) = my_team_id())
  with check (transaction_team_id(transaction_assignees.transaction_id) = my_team_id());

-- Replace the blanket "whole team sees every transaction" policy with:
-- your own team's rows, AND (you see everything OR you're assigned to it).
drop policy if exists team_rw on transactions;

create policy team_select on transactions for select to authenticated
  using (
    team_id = my_team_id()
    and (
      exists (
        select 1 from team_members m
         where m.profile_id = auth.uid() and m.sees_all_transactions
      )
      or exists (
        select 1 from transaction_assignees a
        join team_members m on m.id = a.team_member_id
        where a.transaction_id = transactions.id and m.profile_id = auth.uid()
      )
    )
  );

-- Creating, editing, and archiving stay team-wide — the visibility switch is
-- about who sees a deal day-to-day, not who's allowed to manage the business.
create policy team_insert on transactions for insert to authenticated
  with check (team_id = my_team_id());
create policy team_update on transactions for update to authenticated
  using (team_id = my_team_id()) with check (team_id = my_team_id());
create policy team_delete on transactions for delete to authenticated
  using (team_id = my_team_id());

-- milestones / doc_lines / contacts need no changes: their existing policies
-- check "does a visible row in transactions exist with this id", and that
-- check now runs under the tightened transactions policy above — so a
-- teammate who can't see a transaction can't see its checklist either.
--
-- New column defaults to off for everyone, including whoever just claimed the
-- workspace (claim_workspace predates this column). Flip it on for yourself
-- in Settings > Team after setup — one click, and it's the same switch anyone
-- else on the team uses.
