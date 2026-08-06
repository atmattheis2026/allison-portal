-- Fixes a real bug found while testing: creating a transaction immediately
-- failed with "new row violates row-level security policy for table
-- transactions". Postgres checks SELECT policies on the row an INSERT hands
-- back (INSERT ... RETURNING), and a fresh workspace has nobody with
-- sees_all_transactions on yet and no assignment on the brand-new row either.
--
-- Fix: whoever sets up the workspace starts as an office-manager type by
-- default. That matches reality — the person bootstrapping the account is the
-- one running the business, not a single assigned deal.

update team_members set sees_all_transactions = true where sort_order = 0;

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

  v_team := bootstrap_team(p_team_name);
  perform seed_seller_templates(v_team);

  update profiles
     set team_id   = v_team,
         role      = 'admin',
         full_name = coalesce(nullif(p_your_name, ''), full_name)
   where id = v_uid;

  insert into team_members (team_id, profile_id, full_name, email, sort_order, sees_all_transactions)
  select v_team, v_uid,
         coalesce(nullif(p_your_name, ''), nullif(p.full_name, ''), 'Me'),
         p.email, 0, true
    from profiles p where p.id = v_uid;

  return jsonb_build_object('team_id', v_team, 'created', true,
                            'message', 'Workspace ready.');
end;
$$;
