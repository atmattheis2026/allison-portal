-- Lets Allison's teammates actually sign in and edit, instead of just
-- existing as roster entries she picks from. Uses the same passwordless
-- magic-link sign-in the app already has — no new email template, no admin
-- API, nothing that needs configuring beyond what's already running.
--
-- Flow: she shares her team's invite code (shown in Settings > Team). A
-- teammate signs in with their own email (existing /login page), lands on
-- "Set up your workspace" like anyone new would, but picks "I have an invite
-- code" instead of creating a new one. If she'd already added them by name
-- in Settings > Team with their email, that roster row gets claimed and
-- linked to their login — their roles and "sees every transaction" setting
-- carry over untouched. If not, a fresh roster row is created for them.

alter table teams add column if not exists invite_code text unique;

update teams set invite_code = upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))
 where invite_code is null;

alter table teams alter column invite_code set default
  upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));

create or replace function join_team_with_code(p_code text, p_full_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_team  uuid;
  v_email text;
  v_name  text := nullif(trim(p_full_name), '');
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join a workspace.';
  end if;

  if exists (select 1 from profiles where id = v_uid and team_id is not null) then
    return jsonb_build_object('joined', false, 'message', 'This account is already set up.');
  end if;

  select id into v_team from teams where invite_code = upper(trim(p_code));
  if v_team is null then
    raise exception 'That invite code doesn''t match any team.';
  end if;

  select email into v_email from profiles where id = v_uid;

  update profiles
     set team_id = v_team, full_name = coalesce(v_name, full_name)
   where id = v_uid;

  -- Claim a roster row she already made for them (matched by email), or
  -- make a new one if she hasn't added them yet.
  select id into v_member_id from team_members
   where team_id = v_team and profile_id is null
     and email is not null and lower(email) = lower(v_email)
   limit 1;

  if v_member_id is not null then
    update team_members
       set profile_id = v_uid, full_name = coalesce(v_name, full_name)
     where id = v_member_id;
  else
    insert into team_members (team_id, profile_id, full_name, email, sort_order)
    values (v_team, v_uid, coalesce(v_name, v_email, 'Team member'), v_email, 999);
  end if;

  return jsonb_build_object('joined', true, 'team_id', v_team);
end;
$$;

revoke all on function join_team_with_code(text, text) from public;
grant execute on function join_team_with_code(text, text) to authenticated;
