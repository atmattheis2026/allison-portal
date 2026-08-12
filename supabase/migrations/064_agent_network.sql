-- Agent Network: recruiting/training/mentorship tracking, bolted onto the
-- same app and the same Supabase project rather than a second site — see
-- discussion 2026-08-12. Deliberately its own walled-off area, not just new
-- tables on the existing team, because a mentor is not one of Allison's five
-- office people (team_members) and must NOT get the run of the place the way
-- a regular teammate does today.
--
-- Design notes for whoever reads this next (including Allison's Claude):
--
--  * `mentors` is a separate roster from `team_members`, on purpose. A mentor
--    isn't necessarily on Allison's office team (could be any sponsoring
--    agent), and mixing them into team_members would put them behind every
--    OPEN team-wide policy that table already carries (brands, saved
--    lenders, checklist templates, the whole roster's contact info).
--
--  * profiles.role gets a fourth value, 'mentor'. Every table that used to be
--    flat "anyone on the team can read/write this" (brands, team_members,
--    saved_lenders, milestone_templates, doc_line_templates,
--    contact_templates, saved_contacts, plus profiles itself) gets rewritten
--    to explicitly exclude role = 'mentor'. Existing roles (realtor,
--    loan_officer, admin) keep exactly the access they have today — this
--    only closes a door for the new role. transactions/leads/notes and their
--    children need no changes: a mentor has no team_members row, so the
--    existing "am I assigned / do I see all transactions" checks on those
--    tables already return false for them automatically.
--
--  * A mentor only ever sees the network_agents row(s) where they're the
--    assigned mentor — same spirit as transaction_assignees (migration 005),
--    but simpler: one mentor per agent, not a team of people.
--
--  * Getting a mentor into the workspace at all uses a SEPARATE invite code
--    (teams.mentor_invite_code) and a separate join function
--    (join_as_mentor), not the general staff invite_code/join_team_with_code
--    pair. That's the actual security boundary — the role a new sign-in gets
--    is decided by which code they were given, not by a checkbox they click
--    themselves.

-- ---------------------------------------------------------------- role

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('realtor','loan_officer','admin','mentor'));

create or replace function is_mentor()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'mentor' from profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------- tables

create table mentors (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  profile_id   uuid references profiles(id) on delete set null,
  full_name    text not null,
  email        text,
  phone        text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index on mentors (team_id);

create table network_agents (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references teams(id) on delete cascade,

  full_name       text not null default '',
  email           text,
  phone           text,
  license_number  text,
  license_status  text not null default 'unlicensed'
                  check (license_status in ('unlicensed','in_progress','licensed')),
  source          text,   -- how the referral came in, free text

  status          text not null default 'lead'
                  check (status in ('lead','training','active','inactive')),

  mentor_id       uuid references mentors(id) on delete set null,

  -- Three separate free-type areas rather than one box, so "what's working"
  -- and "what needs work" don't run together in one wall of text.
  strengths_notes text not null default '',
  growth_notes    text not null default '',
  general_notes   text not null default '',

  photo_url       text,
  created_at      timestamptz not null default now(),
  archived_at     timestamptz
);
create index on network_agents (team_id, archived_at);
create index on network_agents (mentor_id);

create table network_checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  label      text not null,
  sort_order int not null default 0
);

-- Checklist items are rows stamped from the template, same reasoning as
-- milestones/milestone_templates (migration 001) — the list will change
-- over time and a new agent should get whatever the template says *today*.
create table network_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references network_agents(id) on delete cascade,
  label        text not null,
  is_complete  boolean not null default false,
  completed_at timestamptz,
  sort_order   int not null default 0
);
create index on network_checklist_items (agent_id, sort_order);

-- ---------------------------------------------------------------- seeding

create or replace function seed_network_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from network_agents where id = p_agent_id;
  if v_team is null then
    raise exception 'network agent % not found', p_agent_id;
  end if;
  if v_team is distinct from my_team_id() then
    raise exception 'not your team';
  end if;

  if exists (select 1 from network_checklist_items where agent_id = p_agent_id) then
    return;
  end if;

  insert into network_checklist_items (agent_id, label, sort_order)
  select p_agent_id, t.label, t.sort_order
    from network_checklist_templates t
   where t.team_id = v_team
   order by t.sort_order;
end;
$$;

revoke all on function seed_network_agent(uuid) from public;
grant execute on function seed_network_agent(uuid) to authenticated;

-- Starter checklist for every existing team, so the feature is usable the
-- moment this migration runs rather than starting completely blank. She can
-- rename/reorder/delete every line in Settings > Agent Network.
insert into network_checklist_templates (team_id, label, sort_order)
select t.id, v.label, v.sort_order
  from teams t
  cross join (values
    ('Signed agreement / paperwork on file', 10),
    ('Onboarded to office systems & tools',  20),
    ('Shadowed a listing or buyer appointment', 30),
    ('Reviewed scripts & lead follow-up process', 40),
    ('Completed first appointment on their own', 50),
    ('First contract written', 60),
    ('First closing', 70),
    ('30-day check-in complete', 80),
    ('90-day check-in complete', 90)
  ) as v(label, sort_order)
 where not exists (
   select 1 from network_checklist_templates c where c.team_id = t.id
 );

-- ---------------------------------------------------------------- mentor invites

-- A second, separate code from the general staff invite_code (migration
-- 016). This is what actually decides the role a new sign-in gets — see the
-- file header. Sharing the staff code never grants 'mentor', and sharing
-- this code never grants staff-wide access.
alter table teams add column if not exists mentor_invite_code text unique;

update teams set mentor_invite_code = upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))
 where mentor_invite_code is null;

alter table teams alter column mentor_invite_code set default
  upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));

create or replace function join_as_mentor(p_code text, p_full_name text)
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
  v_mentor_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join.';
  end if;

  if exists (select 1 from profiles where id = v_uid and team_id is not null) then
    return jsonb_build_object('joined', false, 'message', 'This account is already set up.');
  end if;

  select id into v_team from teams where mentor_invite_code = upper(trim(p_code));
  if v_team is null then
    raise exception 'That mentor invite code doesn''t match any team.';
  end if;

  select email into v_email from profiles where id = v_uid;

  update profiles
     set team_id = v_team, role = 'mentor', full_name = coalesce(v_name, full_name)
   where id = v_uid;

  -- Claim a roster row Allison already made for them (matched by email), or
  -- make a new one if she hasn't added them yet — same pattern as
  -- join_team_with_code (migration 016).
  select id into v_mentor_id from mentors
   where team_id = v_team and profile_id is null
     and email is not null and lower(email) = lower(v_email)
   limit 1;

  if v_mentor_id is not null then
    update mentors set profile_id = v_uid, full_name = coalesce(v_name, full_name)
     where id = v_mentor_id;
  else
    insert into mentors (team_id, profile_id, full_name, email, sort_order)
    values (v_team, v_uid, coalesce(v_name, v_email, 'Mentor'), v_email, 999);
  end if;

  return jsonb_build_object('joined', true, 'team_id', v_team);
end;
$$;

revoke all on function join_as_mentor(text, text) from public;
grant execute on function join_as_mentor(text, text) to authenticated;

-- ---------------------------------------------------------------- RLS: wall mentors off from the existing app

-- These tables have used one flat "team_id = my_team_id()" policy since
-- migration 001/021 — fine for realtors/loan officers/TCs, but it would also
-- let a mentor read the whole staff roster, saved lenders, and every
-- checklist template the moment they're on the team. Excluding is_mentor()
-- here is the whole fix; nothing else about these tables changes.
do $$
declare t text;
begin
  foreach t in array array['brands','team_members','saved_lenders',
                           'milestone_templates','doc_line_templates',
                           'contact_templates','saved_contacts']
  loop
    execute format('drop policy if exists team_rw on %I', t);
    execute format($f$
      create policy team_rw on %I for all to authenticated
        using ((team_id = my_team_id() and not is_mentor()) or is_platform_admin())
        with check ((team_id = my_team_id() and not is_mentor()) or is_platform_admin());
    $f$, t);
  end loop;
end $$;

-- profiles: a mentor can still read/write their own row (self_rw, untouched)
-- but shouldn't see the rest of the staff directory.
drop policy if exists teammates_read on profiles;
create policy teammates_read on profiles for select to authenticated
  using (team_id = my_team_id() and not is_mentor());

-- ---------------------------------------------------------------- RLS: the new tables themselves

alter table mentors                    enable row level security;
alter table network_agents             enable row level security;
alter table network_checklist_templates enable row level security;
alter table network_checklist_items    enable row level security;

-- mentors: staff (not mentors) manage the roster team-wide; a mentor can
-- only ever see/edit their own row (their own phone/email), never the whole
-- list of other mentors.
create policy staff_rw on mentors for all to authenticated
  using ((team_id = my_team_id() and not is_mentor()) or is_platform_admin())
  with check ((team_id = my_team_id() and not is_mentor()) or is_platform_admin());
create policy mentor_self on mentors for select to authenticated
  using (profile_id = auth.uid());
create policy mentor_self_update on mentors for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- network_agents: staff manage the whole pipeline team-wide (create, assign
-- a mentor, archive). A mentor sees/updates only the agents assigned to
-- them — can't create or delete, can't see anyone else's mentees.
create policy staff_rw on network_agents for all to authenticated
  using ((team_id = my_team_id() and not is_mentor()) or is_platform_admin())
  with check ((team_id = my_team_id() and not is_mentor()) or is_platform_admin());
create policy mentor_select on network_agents for select to authenticated
  using (exists (select 1 from mentors mm where mm.id = network_agents.mentor_id and mm.profile_id = auth.uid()));
create policy mentor_update on network_agents for update to authenticated
  using (exists (select 1 from mentors mm where mm.id = network_agents.mentor_id and mm.profile_id = auth.uid()))
  with check (exists (select 1 from mentors mm where mm.id = network_agents.mentor_id and mm.profile_id = auth.uid()));

-- network_checklist_templates: staff only. Mentors never query this table
-- directly — they see the items already stamped onto their agent.
create policy staff_rw on network_checklist_templates for all to authenticated
  using ((team_id = my_team_id() and not is_mentor()) or is_platform_admin())
  with check ((team_id = my_team_id() and not is_mentor()) or is_platform_admin());

-- network_checklist_items: reachable only through a network_agent you can
-- see — security-definer helpers to avoid the same RLS-recursion trap
-- transaction_team_id()/lead_visible() exist for (migrations 005, 018).
create or replace function network_agent_team_id(p_agent_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from network_agents where id = p_agent_id
$$;

create or replace function network_agent_mentor_uid(p_agent_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select mm.profile_id from network_agents na
    join mentors mm on mm.id = na.mentor_id
   where na.id = p_agent_id
$$;

create policy staff_rw on network_checklist_items for all to authenticated
  using ((network_agent_team_id(agent_id) = my_team_id() and not is_mentor()) or is_platform_admin())
  with check ((network_agent_team_id(agent_id) = my_team_id() and not is_mentor()) or is_platform_admin());
create policy mentor_rw on network_checklist_items for all to authenticated
  using (network_agent_mentor_uid(agent_id) = auth.uid())
  with check (network_agent_mentor_uid(agent_id) = auth.uid());
