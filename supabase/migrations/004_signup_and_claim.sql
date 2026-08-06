-- First-run setup: turn a brand-new Supabase project into a working workspace.
--
-- Without this, signing in produces an auth user with no `profiles` row, so
-- my_team_id() returns null and every RLS policy denies everything. The app
-- would look broken in a way that's very hard for a non-technical person to
-- diagnose ("it just says no transactions").

-- ---------------------------------------------------------------- profile on signup

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Anyone who signed up before this trigger existed.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
 left join public.profiles p on p.id = u.id
 where p.id is null;

-- ---------------------------------------------------------------- claim workspace

-- Run once by the first user. Creates the team, both brands, and every template
-- (buyer + seller), then attaches the caller to it as the first team member.
--
-- Guarded: it refuses if the caller already belongs to a team, so it can't be
-- replayed to spawn duplicates or used to jump into someone else's workspace.
create or replace function claim_workspace(p_team_name text, p_your_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_team uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to set up a workspace.';
  end if;

  select team_id into v_team from profiles where id = v_uid;
  if v_team is not null then
    return jsonb_build_object('team_id', v_team, 'created', false,
                              'message', 'This account is already set up.');
  end if;

  v_team := bootstrap_team(p_team_name);   -- team, brands, buyer templates,
                                           -- doc lines, contact rows
  perform seed_seller_templates(v_team);   -- her listing checklist

  update profiles
     set team_id   = v_team,
         role      = 'admin',
         full_name = coalesce(nullif(p_your_name, ''), full_name)
   where id = v_uid;

  insert into team_members (team_id, profile_id, full_name, email, sort_order)
  select v_team, v_uid,
         coalesce(nullif(p_your_name, ''), nullif(p.full_name, ''), 'Me'),
         p.email, 0
    from profiles p where p.id = v_uid;

  return jsonb_build_object('team_id', v_team, 'created', true,
                            'message', 'Workspace ready.');
end;
$$;

revoke all on function claim_workspace(text, text) from public;
grant execute on function claim_workspace(text, text) to authenticated;

-- ---------------------------------------------------------------- seeding helpers

-- seed_transaction and apply_rail_steps are called from the app right after a
-- transaction is inserted. They're SECURITY DEFINER, so lock them to signed-in
-- users and make them refuse to touch a transaction outside the caller's team.
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
  if v_team is distinct from my_team_id() then
    raise exception 'not your transaction';
  end if;

  -- Idempotent: re-running must not double the checklist.
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

revoke all on function seed_transaction(uuid) from public;
revoke all on function apply_rail_steps(uuid) from public;
grant execute on function seed_transaction(uuid)  to authenticated;
grant execute on function apply_rail_steps(uuid) to authenticated;

-- bootstrap_team and seed_seller_templates are only ever reached through
-- claim_workspace, which does its own guarding. Nothing else may call them.
revoke all on function bootstrap_team(text) from public, anon, authenticated;
revoke all on function seed_seller_templates(uuid) from public, anon, authenticated;
