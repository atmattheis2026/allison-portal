-- Cross-team super-admin, for Allison specifically: "I picture other teams
-- on our bigger team wanting to use this. I need to be able to fix their
-- mistakes." Every table so far is scoped to team_id = my_team_id() — correct
-- for everyone else, including a team's own Transaction Coordinator (who
-- should only ever see their OWN team, per migration 019) — but Allison needs
-- to reach across team boundaries when something needs fixing on a team that
-- isn't hers.
--
-- Deliberately NOT the same mechanism as profiles.role = 'admin' (migration
-- 021) or team_members.roles containing 'admin' (the Database Manager tag,
-- also 021) — both of those are PER-TEAM concepts that every team gets its
-- own copy of. This is a single flag on exactly one profile, checked by
-- email once, here, rather than exposed anywhere in the app for anyone
-- (including Allison) to grant. If a second person genuinely needs this
-- later, it's one SQL statement — not a UI toggle, on purpose.

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

-- ---------------------------------------------------------------- simple team-scoped tables

create or replace function _rebuild_team_rw_policy(p_table text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists team_rw on %I', p_table);
  execute format($f$
    create policy team_rw on %I for all to authenticated
      using (team_id = my_team_id() or is_platform_admin())
      with check (team_id = my_team_id() or is_platform_admin());
  $f$, p_table);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['brands','team_members','saved_lenders',
                           'milestone_templates','doc_line_templates',
                           'contact_templates','saved_contacts']
  loop
    perform _rebuild_team_rw_policy(t);
  end loop;
end $$;

drop function _rebuild_team_rw_policy(text);

drop policy if exists team_read on teams;
create policy team_read on teams for select to authenticated
  using (id = my_team_id() or is_platform_admin());

-- ---------------------------------------------------------------- transactions

drop policy if exists team_select on transactions;
create policy team_select on transactions for select to authenticated
  using (
    is_platform_admin()
    or (
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
    )
  );

drop policy if exists team_insert on transactions;
create policy team_insert on transactions for insert to authenticated
  with check (team_id = my_team_id() or is_platform_admin());
drop policy if exists team_update on transactions;
create policy team_update on transactions for update to authenticated
  using (team_id = my_team_id() or is_platform_admin())
  with check (team_id = my_team_id() or is_platform_admin());
drop policy if exists team_delete on transactions;
create policy team_delete on transactions for delete to authenticated
  using (team_id = my_team_id() or is_platform_admin());

drop policy if exists team_rw on transaction_assignees;
create policy team_rw on transaction_assignees for all to authenticated
  using (transaction_team_id(transaction_assignees.transaction_id) = my_team_id() or is_platform_admin())
  with check (transaction_team_id(transaction_assignees.transaction_id) = my_team_id() or is_platform_admin());

-- ---------------------------------------------------------------- transaction children

do $$
declare t text;
begin
  foreach t in array array['milestones','doc_lines','contacts']
  loop
    execute format('drop policy if exists team_rw on %I', t);
    execute format($f$
      create policy team_rw on %I for all to authenticated
        using (exists (select 1 from transactions x
                        where x.id = %I.transaction_id
                          and (x.team_id = my_team_id() or is_platform_admin())))
        with check (exists (select 1 from transactions x
                        where x.id = %I.transaction_id
                          and (x.team_id = my_team_id() or is_platform_admin())));
    $f$, t, t, t);
  end loop;
end $$;

drop policy if exists team_rw on notes;
create policy team_rw on notes for all to authenticated
  using (exists (
    select 1 from transactions x
     where x.id = notes.transaction_id and (x.team_id = my_team_id() or is_platform_admin())
  ))
  with check (exists (
    select 1 from transactions x
     where x.id = notes.transaction_id and (x.team_id = my_team_id() or is_platform_admin())
  ));

-- ---------------------------------------------------------------- leads

drop policy if exists lead_select on leads;
create policy lead_select on leads for select to authenticated
  using (
    is_platform_admin()
    or (
      team_id = my_team_id()
      and (
        exists (select 1 from team_members m
                 where m.profile_id = auth.uid() and m.sees_all_transactions)
        or exists (select 1 from team_members m
                    where m.id = leads.realtor_member_id and m.profile_id = auth.uid())
      )
    )
  );
drop policy if exists lead_insert on leads;
create policy lead_insert on leads for insert to authenticated
  with check (team_id = my_team_id() or is_platform_admin());
drop policy if exists lead_update on leads;
create policy lead_update on leads for update to authenticated
  using (team_id = my_team_id() or is_platform_admin())
  with check (team_id = my_team_id() or is_platform_admin());
drop policy if exists lead_delete on leads;
create policy lead_delete on leads for delete to authenticated
  using (team_id = my_team_id() or is_platform_admin());

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
                  where m.profile_id = auth.uid() and m.sees_all_transactions)
         or exists (select 1 from team_members m
                     where m.id = l.realtor_member_id and m.profile_id = auth.uid())
       )
  )
$$;

-- ---------------------------------------------------------------- cross-team RPC guards

-- seed_transaction/apply_rail_steps and convert_lead_to_transaction each have
-- their own explicit "is this your team" check (not RLS), so the bypass
-- above doesn't reach them on its own — add it here too.
create or replace function seed_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_deal text;
  v_grp  record;
  i      int;
begin
  select team_id, deal_type into v_team, v_deal
    from transactions where id = p_transaction_id;

  if v_team is null then
    raise exception 'transaction % not found', p_transaction_id;
  end if;
  if v_team is distinct from my_team_id() and not is_platform_admin() then
    raise exception 'not your transaction';
  end if;

  if exists (select 1 from milestones where transaction_id = p_transaction_id) then
    return;
  end if;

  insert into milestones (transaction_id, side, label, has_date, sort_order)
  select p_transaction_id, t.side, t.label, t.has_date, t.sort_order
    from milestone_templates t
   where t.team_id = v_team and t.deal_type = v_deal
   order by t.side, t.sort_order;

  for v_grp in
    select group_key, blank_count from doc_line_templates where team_id = v_team
  loop
    for i in 1 .. v_grp.blank_count loop
      insert into doc_lines (transaction_id, group_key, text, sort_order)
      values (p_transaction_id, v_grp.group_key, '', i);
    end loop;
  end loop;

  insert into contacts (transaction_id, group_key, role_label, sort_order)
  select p_transaction_id, c.group_key, c.role_label, c.sort_order
    from contact_templates c
   where c.team_id = v_team
   order by c.group_key, c.sort_order;
end;
$$;

create or replace function convert_lead_to_transaction(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads;
  v_tx_id uuid;
begin
  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'lead % not found', p_lead_id;
  end if;
  if v_lead.team_id is distinct from my_team_id() and not is_platform_admin() then
    raise exception 'not your lead';
  end if;
  if v_lead.converted_transaction_id is not null then
    return v_lead.converted_transaction_id;
  end if;

  insert into transactions (team_id, deal_type, realtor_member_id)
  values (v_lead.team_id, 'buy', v_lead.realtor_member_id)
  returning id into v_tx_id;

  perform seed_transaction(v_tx_id);
  perform apply_rail_steps(v_tx_id);

  update contacts
     set name = nullif(v_lead.full_name, ''), phone = v_lead.phone, email = v_lead.email
   where transaction_id = v_tx_id and role_label = 'Buyers';

  if v_lead.realtor_member_id is not null then
    insert into transaction_assignees (transaction_id, team_member_id)
    values (v_tx_id, v_lead.realtor_member_id)
    on conflict do nothing;
  end if;

  update leads set converted_transaction_id = v_tx_id, archived_at = now()
   where id = p_lead_id;

  return v_tx_id;
end;
$$;
