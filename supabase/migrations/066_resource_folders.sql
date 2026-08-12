-- Folders inside each Home Page section, with access grantable to specific
-- people — not just Database Managers. This is the first crack in the
-- "Home Page is Database-Manager-only" wall from migration 065, and it's a
-- narrow, deliberate one: a Database Manager can open a SPECIFIC FOLDER to
-- SPECIFIC PEOPLE (Allison's choice 2026-08-13 — by named person, not by
-- role, and those people can add/remove files in a folder they're granted,
-- not just view it). Everything else about Home Page — the unfiled items at
-- the top of each section, creating/deleting folders, managing who has
-- access — stays Database-Manager-only exactly as migration 065 set up.
--
-- Design notes for whoever reads this next (including Allison's Claude):
--
--  * A grant is to a team_member OR a mentor, never both — mentors aren't
--    team_members (see migration 064), so one ACL table has to span both
--    kinds of person. The check constraint on resource_folder_access
--    enforces exactly one is set.
--
--  * can_access_resource_folder() is the single source of truth for "can
--    this signed-in person reach this folder" — Database Manager, platform
--    admin, or an explicit grant. Both resource_folders' select policy and
--    resources' grant-based policy call it, so there's one place to change
--    the rule, not two copies that can drift.
--
--  * A granted person can SELECT/INSERT/UPDATE/DELETE resources inside a
--    folder they're granted — but NOT create/rename/delete the folder
--    itself, and NOT see or change who else has access to it (that's what
--    keeps this from becoming "anyone with any folder can restructure the
--    whole page"). They also can't see unfiled resources (folder_id null)
--    at all — those predate folders and stay exactly as private as before.
--
--  * A granted person CAN read their own rows in resource_folder_access
--    (which folders they personally have access to) — needed so the app can
--    show "Home Page" in the nav only to people who actually have something
--    to see there, without letting them read anyone else's grants.

-- ---------------------------------------------------------------- helpers

create or replace function my_team_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from team_members where profile_id = auth.uid()
$$;

create or replace function my_mentor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from mentors where profile_id = auth.uid()
$$;

-- ---------------------------------------------------------------- tables

create table resource_folders (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  category   text not null check (category in ('agents','transactions','general')),
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on resource_folders (team_id, category, sort_order);

create table resource_folder_access (
  id             uuid primary key default gen_random_uuid(),
  folder_id      uuid not null references resource_folders(id) on delete cascade,
  team_member_id uuid references team_members(id) on delete cascade,
  mentor_id      uuid references mentors(id) on delete cascade,
  created_at     timestamptz not null default now(),
  check (
    (team_member_id is not null and mentor_id is null) or
    (team_member_id is null and mentor_id is not null)
  ),
  unique (folder_id, team_member_id),
  unique (folder_id, mentor_id)
);
create index on resource_folder_access (folder_id);

alter table resources add column folder_id uuid references resource_folders(id) on delete cascade;
create index on resources (folder_id);

-- ---------------------------------------------------------------- access helper

create or replace function resource_folder_team_id(p_folder_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from resource_folders where id = p_folder_id
$$;

create or replace function can_access_resource_folder(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin()
    or exists (
      select 1 from resource_folders f
       where f.id = p_folder_id and f.team_id = my_team_id() and is_database_manager()
    )
    or exists (
      select 1 from resource_folder_access a
       where a.folder_id = p_folder_id
         and (a.team_member_id = my_team_member_id() or a.mentor_id = my_mentor_id())
    )
$$;

-- ---------------------------------------------------------------- RLS: resource_folders

alter table resource_folders enable row level security;

create policy folder_select on resource_folders for select to authenticated
  using (can_access_resource_folder(id));

-- Creating, renaming, reordering, and deleting a folder stays Database
-- Manager-only — a grant lets someone use a folder, not restructure it.
create policy folder_insert on resource_folders for insert to authenticated
  with check (is_platform_admin() or (team_id = my_team_id() and is_database_manager()));
create policy folder_update on resource_folders for update to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and is_database_manager()))
  with check (is_platform_admin() or (team_id = my_team_id() and is_database_manager()));
create policy folder_delete on resource_folders for delete to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and is_database_manager()));

-- ---------------------------------------------------------------- RLS: resource_folder_access

alter table resource_folder_access enable row level security;

-- Only a Database Manager grants or revokes access.
create policy access_dbmanager_rw on resource_folder_access for all to authenticated
  using (is_platform_admin() or (resource_folder_team_id(folder_id) = my_team_id() and is_database_manager()))
  with check (is_platform_admin() or (resource_folder_team_id(folder_id) = my_team_id() and is_database_manager()));

-- Anyone can read their OWN grant rows — which folders they personally have
-- access to — but not the rest of the access list.
create policy access_self_read on resource_folder_access for select to authenticated
  using (team_member_id = my_team_member_id() or mentor_id = my_mentor_id());

-- ---------------------------------------------------------------- RLS: resources (rewritten)

drop policy if exists dbmanager_rw on resources;

create policy resources_dbmanager_rw on resources for all to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and is_database_manager()))
  with check (is_platform_admin() or (team_id = my_team_id() and is_database_manager()));

-- A granted person can add/remove files, but only inside a folder they're
-- granted — unfiled resources (folder_id null) stay Database-Manager-only,
-- same as before this migration.
create policy resources_folder_granted_rw on resources for all to authenticated
  using (folder_id is not null and can_access_resource_folder(folder_id))
  with check (folder_id is not null and can_access_resource_folder(folder_id));
